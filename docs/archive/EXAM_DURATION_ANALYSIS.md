# 시험 시간(Exam Time) 설정 로직 분석 요약

## 1. 데이터 스키마

### 데이터베이스 스키마 (Prisma)

```42:42:prisma/schema.prisma
  duration             Int
```

- **변수명**: `duration`
- **데이터 타입**: `Int` (정수)
- **단위**: **분(minutes)**
- **저장 위치**: `exams` 테이블의 `duration` 컬럼
- **제약 조건**: 스키마 레벨에서는 최소/최대값 제약 없음

---

## 2. UI 컴포넌트 구조

### 시험 시간 설정 컴포넌트

**파일**: `components/instructor/ExamInfoForm.tsx`

#### 슬라이더 설정

```122:130:components/instructor/ExamInfoForm.tsx
              <input
                type="range"
                min="15"
                max="480"
                step="15"
                value={duration}
                onChange={(e) => onDurationChange(parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
```

- **최소값**: 15분
- **최대값**: 480분 (8시간)
- **증가 단위**: 15분
- **onChange 핸들러**: `onDurationChange(parseInt(e.target.value))`

#### 빠른 선택 버튼

```132:145:components/instructor/ExamInfoForm.tsx
            <div className="flex gap-2 flex-wrap">
              {[30, 60, 90, 120, 180, 240].map((time) => (
                <Button
                  key={time}
                  type="button"
                  variant={duration === time ? "default" : "outline"}
                  size="sm"
                  onClick={() => onDurationChange(time)}
                  className="text-xs"
                >
                  {time}분
                </Button>
              ))}
            </div>
```

- **버튼 옵션**: 30분, 60분, 90분, 120분, 180분, 240분
- **onClick 핸들러**: `onDurationChange(time)` - 직접 숫자 값 전달

#### 상태 관리 흐름

1. **시험 생성 페이지** (`app/instructor/new/page.tsx`):

   ```43:43:app/instructor/new/page.tsx
     duration: 60,
   ```

   - 초기값: 60분
   - 상태 업데이트: `setExamData((prev) => ({ ...prev, duration: value }))`

2. **시험 수정 페이지** (`app/instructor/[examId]/edit/page.tsx`):
   ```69:69:app/instructor/[examId]/edit/page.tsx
           duration: exam.duration || 60,
   ```
   - 기존 값 로드: `exam.duration || 60` (fallback: 60분)
   - 상태 업데이트: 동일한 패턴

---

## 3. 유효성 검사(Validation)

### 현재 구현 상태

#### ✅ UI 레벨 검증

- 슬라이더의 `min="15"`, `max="480"` 속성으로 HTML5 네이티브 검증
- 사용자가 직접 0분이나 음수 값을 입력할 수 없음 (슬라이더만 사용)

#### ❌ 서버/제출 시 검증 부재

**시험 생성 시** (`app/instructor/new/page.tsx`):

```502:523:app/instructor/new/page.tsx
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 비활성화된 버튼 클릭 시 이유 안내
    if (!examData.title) {
      toast.error("시험 제목을 입력해주세요.");
      return;
    }
    if (!examData.code) {
      toast.error("시험 코드를 생성해주세요.");
      return;
    }
    if (!questions[0]?.text || questions[0].text.trim() === "") {
      toast.error("문제를 입력해주세요.");
      return;
    }
    if (!canAddMoreFiles) {
      toast.error("파일 용량이 50MB를 초과했습니다. 일부 파일을 삭제해주세요.");
      return;
    }

    if (!examData.title || !examData.code || questions.length === 0) return;
```

- **duration에 대한 명시적 검증 없음**
- `examData.duration`이 0이거나 음수여도 제출 가능

**시험 수정 시** (`app/instructor/[examId]/edit/page.tsx`):

```379:397:app/instructor/[examId]/edit/page.tsx
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!examData.title) {
      toast.error("시험 제목을 입력해주세요.");
      return;
    }
    if (!examData.code) {
      toast.error("시험 코드를 생성해주세요.");
      return;
    }
    if (questions.length === 0) {
      toast.error("최소 1개 이상의 문제를 추가해주세요.");
      return;
    }
    if (!canAddMoreFiles) {
      toast.error("파일 용량이 50MB를 초과했습니다. 일부 파일을 삭제해주세요.");
      return;
    }
```

- 동일하게 **duration 검증 없음**

#### ❌ API 레벨 검증 부재

**서버 API** (`app/api/supa/route.ts`):

```180:194:app/api/supa/route.ts
    const examData = {
      title: data.title,
      code: data.code,
      description: null, // description 필드는 nullable이므로 null로 설정
      duration: data.duration,
      questions: sanitizedQuestions,
      materials: data.materials || [],
      materials_text: data.materials_text || [], // 추출된 텍스트 저장
      rubric: data.rubric || [],
      rubric_public: data.rubric_public || false,
      status: data.status,
      instructor_id: user.id, // Clerk user ID (e.g., "user_31ihNg56wMaE27ft10H4eApjc1J")
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
```

- `duration: data.duration` 그대로 저장
- **최소/최대값 체크 없음**
- **0 또는 음수 값도 그대로 저장 가능**

---

## 4. 서버 통신 로직

### TanStack Query Mutation 위치

#### 시험 생성

**파일**: `app/instructor/new/page.tsx`

```461:500:app/instructor/new/page.tsx
  const createExamMutation = useMutation({
    mutationFn: async (examDataForDB: {
      title: string;
      code: string;
      duration: number;
      questions: Question[];
      rubric: RubricItem[];
      rubric_public: boolean;
      materials: string[];
      status: string;
      created_at: string;
      updated_at: string;
    }) => {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create_exam",
          data: examDataForDB,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = extractErrorMessage(
          errorData,
          "시험 생성에 실패했습니다",
          response.status
        );
        throw new Error(errorMessage);
      }

      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.instructor.exams() });
    },
  });
```

**전송 데이터 형식**:

```783:795:app/instructor/new/page.tsx
      const examDataForDB = {
        title: examData.title,
        code: examData.code,
        duration: examData.duration,
        questions: questions,
        rubric: rubric, // 루브릭 데이터 추가
        rubric_public: isRubricPublic, // 루브릭 공개 여부
        materials: materialUrls, // Array of file URLs
        materials_text: materialsText, // 추출된 텍스트 배열
        status: "draft", // Start as draft
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
```

- **API 엔드포인트**: `/api/supa`
- **액션**: `"create_exam"`
- **duration 전송**: `duration: examData.duration` (number 타입, 분 단위)

#### 시험 수정

**파일**: `app/instructor/[examId]/edit/page.tsx`

```515:540:app/instructor/[examId]/edit/page.tsx
      // 시험 데이터 업데이트
      const updateData = {
        title: examData.title,
        code: examData.code,
        duration: examData.duration,
        questions: questions,
        rubric: rubric,
        rubric_public: isRubricPublic,
        materials: materialUrls,
        updated_at: new Date().toISOString(),
      };

      // Update exam in Supabase
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update_exam",
          data: {
            id: resolvedParams.examId,
            update: updateData,
          },
        }),
      });
```

- **API 엔드포인트**: `/api/supa`
- **액션**: `"update_exam"`
- **duration 전송**: `duration: examData.duration` (number 타입, 분 단위)

---

## 5. 타이머 로직

### 학생 응시 화면 타이머 컴포넌트

**파일**: `components/ExamHeader.tsx`

#### Duration 사용 위치

```32:52:components/ExamHeader.tsx
export function ExamHeader({
  examCode,
  duration,
  currentStep,
  user,
  sessionStartTime,
  timeRemaining: initialTimeRemaining,
  onTimeExpired,
  onExit,
}: ExamHeaderProps) {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [hasExpired, setHasExpired] = useState(false);
  const [showExpiredDialog, setShowExpiredDialog] = useState(false);

  // Initialize timer - 세션 시작 시간 기반으로 계산
  useEffect(() => {
    if (sessionStartTime) {
      // 서버에서 받은 세션 시작 시간 사용
      const startTime = new Date(sessionStartTime).getTime();
      const now = Date.now();
      const totalSeconds = duration * 60;
      const elapsed = Math.floor((now - startTime) / 1000);
      const remaining = Math.max(0, totalSeconds - elapsed);
```

- **duration 사용**: `duration * 60` (분 → 초 변환)
- **계산 로직**: `totalSeconds = duration * 60`, `remaining = Math.max(0, totalSeconds - elapsed)`

#### Duration이 0일 때 처리

**학생 응시 페이지** (`app/exam/[code]/page.tsx`):

```1178:1178:app/exam/[code]/page.tsx
          duration={exam?.duration || 60}
```

```1251:1251:app/exam/[code]/page.tsx
            duration={exam?.duration || 60}
```

- **Fallback 값**: `exam?.duration || 60` → duration이 없거나 0이면 **60분으로 대체**
- **문제점**: duration이 0일 때도 60분으로 처리되어, 실제로는 무제한 시간처럼 동작할 수 있음

**서버 API에서 시간 계산** (`app/api/supa/route.ts`):

```984:986:app/api/supa/route.ts
      const sessionStartTime = new Date(existingSession.created_at).getTime();
      const examDurationMs = exam.duration * 60 * 1000; // 분을 밀리초로 변환
      const sessionEndTime = sessionStartTime + examDurationMs;
```

```1097:1099:app/api/supa/route.ts
    const sessionStartTime = new Date(session.created_at).getTime();
    const examDurationMs = exam.duration * 60 * 1000;
    const sessionEndTime = sessionStartTime + examDurationMs;
```

- **duration이 0이면**: `examDurationMs = 0`, `sessionEndTime = sessionStartTime`
- **결과**: 세션 시작 즉시 시간 종료로 처리됨 (`timeRemaining <= 0`)

**타이머 표시 로직** (`components/ExamHeader.tsx`):

```128:153:components/ExamHeader.tsx
              {timeRemaining !== null && (
                <div
                  className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    hasExpired || timeRemaining <= 0
                      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                      : isTimeCritical(timeRemaining)
                      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:blue-300"
                  }`}
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {hasExpired || timeRemaining <= 0 ? "00:00" : formatTime(timeRemaining)}
                </div>
              )}
```

- **timeRemaining이 0 이하**: "00:00" 표시 및 즉시 `onTimeExpired()` 콜백 호출

---

## 요약 및 개선 포인트

### 현재 문제점

1. **유효성 검사 부재**

   - 제출 시 duration 값 검증 없음
   - API 레벨에서도 검증 없음
   - duration이 0이거나 음수여도 저장 가능

2. **Duration 0 처리 불일치**

   - 클라이언트: `exam?.duration || 60` → 60분으로 대체
   - 서버: `duration * 60 * 1000` → 0ms로 계산되어 즉시 종료
   - **불일치 발생 가능**

3. **에지 케이스 미처리**
   - duration이 null/undefined일 때 처리 로직 불명확
   - 매우 큰 값(예: 10000분)도 저장 가능

### 개선 제안

1. **클라이언트 검증 추가**

   - `handleSubmit`에서 `duration >= 15 && duration <= 480` 검증
   - 에러 메시지: "시험 시간은 15분 이상 480분 이하여야 합니다."

2. **서버 검증 추가**

   - `/api/supa`의 `createExam`, `updateExam` 함수에서 duration 검증
   - 최소값: 15분, 최대값: 480분

3. **Duration 0 처리 통일**

   - 클라이언트와 서버 모두 동일한 로직 적용
   - 옵션 A: 0을 허용하지 않고 최소 15분 강제
   - 옵션 B: 0을 "무제한"으로 처리하고 명시적으로 표시

4. **타입 안정성 강화**
   - Prisma 스키마에 `@db.SmallInt` 또는 CHECK 제약 조건 추가
   - TypeScript에서 duration 타입을 `15 | 30 | 45 | ... | 480` 같은 유니온 타입으로 제한 (선택사항)

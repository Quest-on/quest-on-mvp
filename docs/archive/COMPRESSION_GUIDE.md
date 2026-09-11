# 시험 데이터 압축 저장 기능 가이드

## 개요

학생이 시험을 볼 때 작성한 채팅, 인공지능의 답변, 최종 답안, 피드백 답변을 LZ 압축을 이용해서 데이터베이스에 저장하는 기능입니다.

## 데이터베이스 스키마

### 압축 컬럼 추가

```sql
-- sessions 테이블에 압축 컬럼 추가
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS compressed_session_data TEXT,
ADD COLUMN IF NOT EXISTS compression_metadata JSONB DEFAULT '{}';

-- submissions 테이블에 압축 컬럼 추가
ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS compressed_answer_data TEXT,
ADD COLUMN IF NOT EXISTS compressed_feedback_data TEXT,
ADD COLUMN IF NOT EXISTS compression_metadata JSONB DEFAULT '{}';

-- messages 테이블에 압축 컬럼 추가
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS compressed_content TEXT,
ADD COLUMN IF NOT EXISTS compression_metadata JSONB DEFAULT '{}';
```

### 압축 메타데이터 구조

```json
{
  "algorithm": "lz-string",
  "version": "1.0.0",
  "originalSize": 1024,
  "compressedSize": 256,
  "compressionRatio": 0.25,
  "timestamp": "2024-01-20T10:30:00.000Z"
}
```

## API 엔드포인트

### 1. 시험 제출 시 압축 저장

**POST** `/api/supa`

```json
{
  "action": "submit_exam",
  "data": {
    "examId": "uuid",
    "studentId": "string",
    "sessionId": "uuid",
    "answers": [
      {
        "text": "학생 답안"
      }
    ],
    "chatHistory": [
      {
        "type": "student",
        "content": "질문 내용",
        "timestamp": "2024-01-20T10:30:00.000Z"
      }
    ],
    "feedback": "AI 피드백",
    "feedbackResponses": ["학생 응답"]
  }
}
```

### 2. 채팅 메시지 압축 저장

**POST** `/api/chat`

```json
{
  "message": "학생 질문",
  "sessionId": "uuid",
  "questionId": "string"
}
```

### 3. 개별 세션 조회 (압축 해제)

**GET** `/api/session/[sessionId]`

응답:

```json
{
  "session": {
    "id": "uuid",
    "student_id": "string",
    "submitted_at": "2024-01-20T10:30:00.000Z",
    "decompressed": {
      "chatHistory": [...],
      "answers": [...],
      "feedback": "...",
      "feedbackResponses": [...]
    },
    "compression_metadata": {...}
  },
  "submissions": [...],
  "messages": [...],
  "compressionStats": {
    "totalOriginalSize": 1024,
    "totalCompressedSize": 256,
    "totalSpaceSaved": 768
  }
}
```

### 4. 시험별 모든 세션 조회 (압축 해제)

**GET** `/api/exam/[examId]/sessions`

응답:

```json
{
  "exam": {
    "id": "uuid",
    "title": "시험 제목"
  },
  "sessions": [
    {
      "id": "uuid",
      "student_id": "string",
      "decompressed": {...},
      "submissions": [...],
      "messages": [...],
      "compressionStats": {...}
    }
  ],
  "compressionStats": {
    "totalSessions": 10,
    "totalOriginalSize": 10240,
    "totalCompressedSize": 2560,
    "totalSpaceSaved": 7680
  }
}
```

### 5. 압축 테스트 API

**POST** `/api/compression-test`

```json
{
  "action": "compress",
  "data": "테스트할 데이터"
}
```

사용 가능한 액션:

- `compress`: 일반 데이터 압축
- `decompress`: 압축 해제
- `compress-session-data`: 세션 데이터 압축
- `compress-message`: 메시지 압축

## 압축 효과

### 예상 압축률

- **일반 텍스트**: 60-80% 압축률
- **반복적인 패턴이 많은 데이터**: 80-90% 압축률
- **JSON 데이터**: 70-85% 압축률
- **채팅 히스토리**: 75-85% 압축률

### 저장 공간 절약 예시

```
원본 데이터 크기: 10MB
압축 후 크기: 2.5MB
절약된 공간: 7.5MB (75% 절약)
```

## 사용 방법

### 1. 데이터베이스 스키마 업데이트

```bash
# Supabase SQL Editor에서 실행
psql -f database/add_compressed_data_columns.sql
```

### 2. 압축 기능 테스트

```bash
curl -X POST http://localhost:3000/api/compression-test \
  -H "Content-Type: application/json" \
  -d '{
    "action": "compress",
    "data": "Hello, this is a test string for compression!"
  }'
```

### 3. 시험 제출 시 자동 압축

학생이 시험을 제출하면 자동으로 압축되어 저장됩니다:

1. **세션 데이터 압축**: 전체 채팅 히스토리, 답안, 피드백을 하나로 압축
2. **개별 제출물 압축**: 각 문제별 답안과 피드백을 개별 압축
3. **메시지 압축**: 각 채팅 메시지를 개별 압축

### 4. 교수 채점 시 압축 해제

교수가 채점할 때는 자동으로 압축 해제됩니다:

```typescript
// 개별 세션 조회
const response = await fetch(`/api/session/${sessionId}`);
const data = await response.json();

// 압축 해제된 데이터 사용
const chatHistory = data.session.decompressed.chatHistory;
const answers = data.session.decompressed.answers;
```

## 보안 및 권한

- **학생**: 자신의 세션만 조회 가능
- **교수**: 자신이 만든 시험의 세션만 조회 가능
- **관리자**: 모든 세션 조회 가능

## 모니터링

### 압축 성능 모니터링

```typescript
// 압축 통계 확인
const stats = data.compressionStats;
console.log(`압축률: ${(1 - stats.compressionRatio) * 100}%`);
console.log(`절약된 공간: ${stats.totalSpaceSaved} bytes`);
```

### 로그 확인

```bash
# 압축 성능 로그 확인
grep "compressed and stored" logs/app.log
```

## 문제 해결

### 1. 압축 실패

```typescript
try {
  const compressed = compressData(data);
} catch (error) {
  console.error("압축 실패:", error);
  // 원본 데이터로 저장
}
```

### 2. 압축 해제 실패

```typescript
try {
  const decompressed = decompressData(compressedData);
} catch (error) {
  console.error("압축 해제 실패:", error);
  // 원본 데이터 사용
}
```

### 3. 성능 최적화

- 큰 데이터는 청크 단위로 압축
- 자주 사용되는 데이터는 캐시에 저장
- 압축 메타데이터를 인덱스로 활용

## 마이그레이션

### 기존 데이터 압축

```sql
-- 기존 데이터를 압축하여 저장
UPDATE sessions
SET compressed_session_data = compress_data(session_data),
    compression_metadata = compression_metadata
WHERE compressed_session_data IS NULL;
```

### 압축 해제 후 원본 데이터 삭제

```sql
-- 압축된 데이터가 안정적으로 저장된 후 원본 데이터 삭제
-- (주의: 이 작업은 되돌릴 수 없습니다)
ALTER TABLE sessions DROP COLUMN session_data;
```

## 참고사항

- 압축은 CPU 집약적 작업이므로 배치 처리 권장
- 압축된 데이터는 바이너리 형태로 저장
- 압축 메타데이터는 압축 성능 모니터링에 활용
- 기존 데이터와의 호환성을 위해 원본 데이터도 함께 저장

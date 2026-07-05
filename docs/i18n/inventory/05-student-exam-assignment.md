# i18n Inventory — 05 학생 응시/과제/퀴즈

## 요약
- 스캔 파일 수: 38
- 텍스트 보유 파일 수: 33
- 총 추출 문자열 수: 247
- 특이사항 개수: 14

---

## 파일별 상세

### app/(app)/exam/[code]/page.tsx
파일 요약: 시험 응시 메인 페이지. 로딩·인증·Preflight·대기실·제출 완료 상태 분기 처리.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 321 | `사용자 인증 중...` | body | !isLoaded 조건 분기 |
| 321 | `시험을 불러오는 중...` | body | examLoading 조건 분기 |
| 323 | `잠시만 기다려주세요` | body | 로딩 안내 |
| 338 | `로그인이 필요합니다` | heading | CardTitle |
| 339 | `시험을 보려면 먼저 로그인해주세요.` | body | CardDescription |
| 346 | `로그인하기` | button | Link 버튼 |
| 362 | `시험을 찾을 수 없습니다` | heading | CardTitle |
| 363 | `시험 코드를 확인해주세요.` | body | CardDescription |
| 366 | `다시 시도하기` | button | |
| 407 | `알 수 없는 오류` | toast-error | errorData fallback 값 |
| 409 | `시험 입장 확인에 실패했습니다: ${errorData.details \|\| errorData.message \|\| errorData.error \|\| "알 수 없는 오류"}` | toast-error | dynamic: 서버 오류 메시지 보간 |
| 412 | `시험 입장 확인 중 오류가 발생했습니다. 다시 시도해주세요.` | toast-error | |
| 463 | `시험을 취소하시겠습니까?` | heading | AlertDialogTitle |
| 464 | `시험 입장을 취소하면 학생 대시보드로 이동합니다. 나중에 다시 시험 코드를 입력하여 입장할 수 있습니다.` | body | AlertDialogDescription |
| 468 | `시험에 계속 참여하기` | button | AlertDialogCancel |
| 469 | `시험 입장 취소` | button | AlertDialogAction(destructive) |
| 552 | `네트워크 연결이 끊어졌습니다. 연결이 복원되면 답안이 자동 저장됩니다.` | toast-error | WifiOff 배너 |
| 735 | `답안이 성공적으로 제출되었습니다!` | heading | CardTitle(green) |
| 736 | `수고하셨습니다. 시험이 종료되었습니다.` | body | CardDescription |
| 741 | `제출이 완료되었습니다. AI가 답안을 채점하고 있으며, 보통 1~2분 내에 완료됩니다.` | body | |
| 744 | `${countdown}초 뒤 대시보드로 이동합니다.` | dynamic | countdown 보간, 초 단수/복수 무관 |

---

### app/(app)/assignment/[code]/page.tsx
파일 요약: 과제 응시 메인 페이지. 로딩·에러·제출·마감 자동제출 처리.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 121 | `마감 시간이 지났습니다. 자동 제출합니다.` | toast-error | icon "⏰" |
| 133 | `과제가 자동 제출되었습니다.` | toast-error | toast.success |
| 148 | `최종답안을 먼저 작성해주세요.` | toast-error | toast.error |
| 163 | `최종답안 저장에 실패했습니다. 다시 시도해주세요.` | toast-error | throw Error |
| 187 | `최종답안을 먼저 작성해주세요.` | toast-error | 서버 final_answer_missing 분기 |
| 189 | `제출에 실패했습니다.` | toast-error | errData.message fallback |
| 194 | `타임어택 퀴즈로 이동합니다.` | toast-error | toast.success |
| 198 | `제출 중 오류가 발생했습니다.` | toast-error | catch fallback |
| 210 | `과제를 불러오는 중...` | body | 로딩 상태 |
| 224 | `과제에 입장할 수 없습니다` | heading | CardTitle |
| 229 | `돌아가기` | button | |
| 245 | `과제를 찾을 수 없습니다` | heading | CardTitle |
| 246 | `과제 코드를 확인하거나 강사에게 문의해주세요.` | body | CardDescription |
| 249 | `돌아가기` | button | |

---

### app/(app)/assignment/[code]/review/page.tsx
파일 요약: 마감 후 과제 열람 전용 페이지. 채팅·최종답안·퀴즈 결과 표시.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 88 | `이 과제는 열람할 수 없습니다.` | toast-error | 400 에러 |
| 91 | `과제 기록을 찾을 수 없습니다.` | toast-error | 403/404 에러 |
| 93 | `과제 기록을 불러오는 중 오류가 발생했습니다.` | toast-error | 기타 에러 |
| 129 | `과제 기록을 불러올 수 없습니다` | heading | errorMessage 없을 때 fallback |
| 132 | `학생 대시보드로 돌아가기` | button | ArrowLeft 아이콘 포함 |
| 149 | `대시보드` | label | 브레드크럼 |
| 155 | `열람` | label | 브레드크럼 현재 위치 |
| 166 | `열람 전용 · 마감됨` | label | Badge |
| 169 | `제출 기한: ${new Date(deadline).toLocaleString("ko-KR")}` | format | dynamic: ko-KR 날짜 포맷 |
| 175 | `제출 기한이 지나 작성한 기록을 읽기 전용으로 보여드립니다. 더 이상 수정이나 제출은 할 수 없습니다.` | body | |
| 181 | `대시보드` | button | ArrowLeft 포함 |
| 192 | `이 과제에 대한 응시 기록이 없습니다.` | empty-state | |
| 204 | `과제 안내` | label | CardTitle |
| 225 | `과제 문제` | label | CardTitle |
| 232 | `문제 ${i + 1}` | dynamic | 문제 번호 보간 |
| 246 | `내 리서치 채팅` | label | CardTitle |
| 252 | `채팅 기록이 없습니다.` | empty-state | |
| 269 | `${new Date(msg.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` | format | 시각 포맷, ko-KR |
| 294 | `내 최종답안` | label | CardTitle |
| 306 | `타임어택 퀴즈 결과` | label | 섹션 주석(비노출 — 확인필요) |

---

### app/(app)/student/page.tsx
파일 요약: 학생 대시보드 진입점. dynamic import 로딩 메시지만 존재.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 12 | `학생 대시보드를 불러오는 중...` | body | DashboardPageFallback title |
| 13 | `세션 목록과 통계를 순차적으로 준비하고 있습니다.` | body | DashboardPageFallback description |

---

### app/(app)/student/session/[sessionId]/quiz/page.tsx
파일 요약: 타임어택 이해도 퀴즈 페이지. 타이머·다중선택·자동제출.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 59 | `퀴즈를 불러오지 못했습니다.` | toast-error | queryFn throw |
| 89 | `퀴즈 제출에 실패했습니다.` | toast-error | 서버 오류 fallback |
| 96 | `퀴즈가 제출되었습니다.` | toast-error | toast.success |
| 100 | `퀴즈 제출에 실패했습니다.` | toast-error | onError fallback |
| 136 | `타임어택 퀴즈를 준비하는 중...` | body | 로딩 상태 |
| 151 | `대시보드로 돌아가기` | button | ArrowLeft 포함 |
| 155 | `퀴즈를 불러올 수 없습니다` | heading | CardTitle |
| 158 | `잠시 후 다시 시도하거나 과제 목록에서 이어서 진행해주세요.` | body | |
| 175 | `이미 완료된 퀴즈입니다` | heading | CardTitle |
| 179 | `리포트로 이동` | button | |
| 199 | `타임어택 이해도 퀴즈` | heading | h1 |
| 209 | `${remainingSeconds ?? 0}초` | timer | dynamic: 남은 초 보간 |
| 212 | `${answeredCount}/{quiz.totalQuestions} 응답` | dynamic | 응답 수 / 총 문항 보간 |
| 225 | `제출 전 AI와 나눈 대화와 리서치 내용을 실제로 이해했는지 확인합니다. 시간이 끝나면 현재 선택한 답으로 자동 제출됩니다.` | body | |
| 269 | `미응답 문항은 오답 처리됩니다.` | body | 하단 안내 |
| 280 | `최종 제출 중...` | button | isPending 상태 |
| 284 | `퀴즈 제출하고 최종 제출` | button | |

---

### components/exam/AnswerPanel.tsx
파일 요약: 서술형 답안 작성 패널. 자동저장 상태 표시기 포함.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 40 | `답안 작성` | label | Label 텍스트 |
| 55 | `여기에 상세한 답안을 작성하세요...\n\n• 문제의 핵심을 파악하여 답변하세요\n• 풀이 과정을 단계별로 명확히 작성하세요\n• AI와의 대화를 통해 필요한 정보를 얻을 수 있습니다` | placeholder | 멀티라인 placeholder |
| 85 | `저장 실패 — 네트워크를 확인하세요` | toast-error | saveError 상태 |
| 89 | `으로 재시도` | body | saveShortcut 뒤에 오는 텍스트, 어순 보간 필요 |
| 99 | `저장 중...` | label | isSaving 상태 |
| 117 | `저장됨` | label | lastSaved 상태(green) |
| 134 | `자동 저장` | label | 기본 상태 |

---

### components/exam/CopyProtector.tsx
파일 요약: 클립보드 복사 시 내부 마커 삽입. UI 노출 문자열 없음.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| — | (없음) | — | 화면 노출 문자열 없음 |

---

### components/exam/ExamCenterToolbar.tsx
파일 요약: 시험 상단 툴바. 제목·타이머·문제 접기·제출 버튼.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 51 | `문제 접기` | aria | aria-label(isQuestionVisible=true) |
| 51 | `문제 보기` | aria | aria-label(isQuestionVisible=false) |
| 55 | `문제 접기` | button | span 텍스트 |
| 55 | `문제 보기` | button | span 텍스트 |
| 81 | `시험 제출하기` | aria | aria-label |
| 88 | `제출 중...` | button | isSubmitting 상태 |
| 90 | `시험 제출하기` | button | 기본 상태 |

---

### components/exam/ExamChatSidebar.tsx
파일 요약: 우측 AI 채팅 사이드바. 빈 상태·입력·에러 표시.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 84 | `AI 도우미` | label | 뱃지 텍스트 |
| 87 | `문제 ${currentQuestion + 1} 관련 대화` | dynamic | 문제 번호 보간 |
| 97 | `채팅 사이드바 닫기` | aria | Button aria-label |
| 109 | `채팅 메시지` | aria | aria-label |
| 119 | `AI와 대화를 시작하세요` | heading | 빈 상태 h3 |
| 123 | `AI를 활용하여 문제를 분석하고 풀이 방향을 탐색해보세요.` | body | 빈 상태 안내 |
| 173 | `세션 연결에 문제가 있습니다.` | toast-error | ErrorAlert message |
| 187 | `AI에게 질문하기...` | placeholder | InputGroupTextarea |
| 197 | `AI에게 질문 입력` | aria | aria-label |
| 203 | `전송` | label | Kbd 힌트 |
| 210 | `줄바꿈` | label | Kbd 힌트 |
| 218 | `연결 오류` | label | sessionError 상태 |
| 223 | `${chatMessage.length}자` | dynamic | 글자 수 표시 |
| 234 | `메시지 전송` | aria | InputGroupButton aria-label |
| 235 | `전송` | aria | sr-only |

---

### components/exam/ExamDialogs.tsx
파일 요약: 시험 내 각종 다이얼로그 (나가기·미작성·자동/수동 제출 실패).

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 100 | `시험을 그만두시겠습니까?` | heading | AlertDialogTitle |
| 102 | `진행한 내용은 저장됩니다. 시험을 종료하고 학생 대시보드로 이동합니다.` | body | AlertDialogDescription |
| 106 | `계속 응시` | button | AlertDialogCancel |
| 110 | `그만두기` | button | AlertDialogAction(destructive) |
| 121 | `미작성 문제가 있습니다` | heading | AlertDialogTitle |
| 123 | `${unansweredDialog.indices.length}개의 문제에 답안이 작성되지 않았습니다. 해당 문제로 이동하거나, 현재 상태로 제출할 수 있습니다.` | dynamic | 미작성 문항 수 보간 |
| 140 | `문제 ${displayNumber(idx)}` | dynamic | 문제 번호 보간 버튼 |
| 145 | `돌아가기` | button | AlertDialogCancel |
| 155 | `미작성 상태로 제출하기 ({unansweredSubmitRemainingSeconds}초)` | dynamic | 쿨다운 중 — 초 보간 |
| 162 | `미작성 상태로 제출하기` | button | 쿨다운 해제 후 |
| 174 | `자동 제출 실패` | heading | AlertDialogTitle(destructive) |
| 177 | `시간 만료로 인한 자동 제출에 실패했습니다. 아래 버튼을 눌러 수동으로 제출해주세요. 답안은 이미 저장되어 있습니다.` | body | |
| 181 | `저장 후 나가기` | button | AlertDialogCancel |
| 185 | `수동 제출` | button | AlertDialogAction |
| 195 | `답안 제출 실패` | heading | AlertDialogTitle(destructive) |
| 200 | `답안 제출에 실패했습니다. 네트워크 연결을 확인하고 다시 시도해주세요.` | body | submitErrorMessage fallback |
| 204 | `닫기` | button | AlertDialogCancel |
| 206 | `다시 제출` | button | AlertDialogAction |

---

### components/exam/ExamLoading.tsx
파일 요약: 채팅 로딩 인디케이터 & 제출 오버레이. 순환 메시지 배열 포함.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 16 | `AI가 질문을 분석하고 있습니다...` | body | 로딩 메시지[0] |
| 17 | `답변을 작성하고 있습니다...` | body | 로딩 메시지[1] |
| 18 | `내용을 검토하고 있습니다...` | body | 로딩 메시지[2] |
| 19 | `답변을 마무리하고 있습니다...` | body | 로딩 메시지[3] |
| 68 | `답변 생성이 지연되고 있습니다. 잠시만 더 기다려주세요...` | body | 30초 초과 시 |
| 82 | `네트워크 상태에 따라 시간이 소요될 수 있습니다.` | body | AlertCircle 힌트 |
| 99 | `답안을 안전하게 저장하고 있습니다...` | body | 제출 오버레이 메시지[0] |
| 100 | `AI가 채점을 준비하고 있습니다...` | body | 제출 오버레이 메시지[1] |
| 101 | `최종 데이터를 전송하고 있습니다...` | body | 제출 오버레이 메시지[2] |
| 102 | `제출을 마무리하고 있습니다...` | body | 제출 오버레이 메시지[3] |
| 147 | `답안 제출 중` | heading | 오버레이 h3 |
| 150 | `제출이 지연되고 있습니다. 잠시만 더 기다려주세요...` | body | 60초 초과 시 |
| 165 | `제출이 완료될 때까지 창을 닫거나 이동하지 마세요.` | body | 경고 배너 |

---

### components/exam/ExamQuestionNav.tsx
파일 요약: 좌측 세로 문항 네비게이션. 유형 배지·진행 상황 표시.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 24 | `MCQ` | label | multiple-choice 배지 |
| 25 | `O/X` | label | true-false 배지 |
| 26 | `CASE` | label | essay 배지 |
| 27 | `SHORT` | label | short-answer 배지 |
| 55 | `문항 진행 상황` | aria | nav aria-label |
| 77 | `시험 나가기` | aria | Button aria-label |
| 79 | `나가기` | button | 데스크톱 span |
| 87 | `문항 진행 상황` | aria | 모바일 nav aria-label |
| 107 | `나가기` | button | 모바일 Button |
| 146 | `문제 ${index + 1}${typeBadge ? \` (\${typeBadge})\` : ""}${isCurrent ? " (현재)" : ""}${hasAnswer ? " (작성됨)" : " (미작성)"}${hasChat ? " (채팅 있음)" : ""}` | aria | QuestionPill aria-label 복합 동적 문자열 |

---

### components/exam/ExamTimer.tsx
파일 요약: 시험 타이머. 남은 시간·만료 다이얼로그.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 73 | `남은 시간 ${formatExamTime(displaySeconds)}` | timer | aria-label, formatExamTime 보간 |
| 88 | `시험 시간이 종료되었습니다` | heading | AlertDialogTitle(destructive) |
| 90 | `시험 시간이 종료되어 답안이 자동으로 제출되었습니다.` | body | AlertDialogDescription |
| 94 | `확인` | button | AlertDialogAction |

---

### components/exam/FloatingChatButton.tsx
파일 요약: AI 채팅 사이드바 열기 플로팅 버튼.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 19 | `AI 채팅 열기` | aria | Button aria-label |
| 22 | `AI` | label | 버튼 텍스트 |

---

### components/exam/LateEntryWaiting.tsx
파일 요약: 지각 입장 승인 대기 화면. 거부 시 별도 상태 표시.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 97 | `입장이 거부되었습니다` | heading | CardTitle |
| 99 | `강사가 귀하의 입장을 허가하지 않았습니다.` | body | CardDescription |
| 106 | `지각으로 인해 시험 입장이 거부되었습니다. 강사에게 문의하세요.` | body | AlertDescription |
| 110 | `학생 대시보드로 돌아가기` | button | |
| 130 | `입장 승인 대기 중` | heading | CardTitle |
| 132 | `강사가 귀하의 입장을 승인하면 시험이 시작됩니다.` | body | CardDescription |
| 140 | `시험 정보` | label | h3 |
| 142 | `시험명:` | label | span.font-medium |
| 144 | `시험 코드:` | label | span.font-medium |
| 147 | `시험 시간:` | label | span.font-medium |
| 148 | `${examDuration}분` | dynamic | 시험 시간 보간 |
| 150 | `문제 수:` | label | span.font-medium |
| 151 | `${questionCount}문제` | dynamic | 문제 수 보간 |
| 163 | `지각 입장 승인 대기 중` | label | amber 색 강조 |
| 164 | `시험이 이미 시작되었습니다. 강사의 승인이 필요합니다.\n승인 시 남은 시험 시간으로 응시하게 됩니다.` | body | |
| 168 | `이 페이지를 닫지 마세요.` | body | |
| 178 | `강사 승인 대기 중...` | body | Loader2 옆 |
| 181 | `대기 시간: ${Math.floor(elapsedSeconds / 60)}분 ${(elapsedSeconds % 60).toString().padStart(2, "0")}초` | timer | dynamic: 분·초 보간, 어순 주의 |

---

### components/exam/MainContentWrapper.tsx
파일 요약: 사이드바 오픈 상태에 따른 콘텐츠 래퍼. 노출 문자열 없음.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| — | (없음) | — | 화면 노출 문자열 없음 |

---

### components/exam/ObjectiveAnswerPanel.tsx
파일 요약: 객관식/OX 선택지 위젯. 선택지·안내 문구·저장 안내.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 55 | `참 / 거짓을 선택하세요` | label | true-false 안내 |
| 55 | `정답을 선택하세요` | label | 객관식 안내 |
| 75 | `선택지가 없는 문제입니다. 시험 출제자에게 문의하세요.` | empty-state | |
| 101 | `선택한 답안은 자동으로 저장됩니다.` | body | 안내 문구 |
| 122 | `답안 선택지` | aria | OptionGrid radiogroup aria-label |
| 152 | `답안 선택지` | aria | OptionRow radiogroup aria-label |
| 182 | `답안 선택지` | aria | OptionList radiogroup aria-label |

---

### components/exam/ObjectiveNavBar.tsx
파일 요약: 객관식·CASE 하단 진행 바.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 47 | `이전 문제` | aria | Button aria-label |
| 53 | `이전` | button | span 텍스트 |
| 64 | `다음 문제` | aria | Button aria-label |
| 70 | `다음` | button | span 텍스트 |
| 57 | `${currentIndex + 1} / ${total}` | dynamic | 문항 진행 위치 보간 |

---

### components/exam/PreflightModal.tsx
파일 요약: 시험 시작 전 안내사항 모달. 규칙·AI 정책·체크박스.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 59 | `시험 시작 전 안내사항` | heading | DialogTitle |
| 62 | `시험을 시작하기 전에 다음 사항을 확인해주세요.` | body | DialogDescription |
| 72 | `시간 제한 없음 (과제형) · 답안은 30초마다 자동 저장` | body | examDuration===0 |
| 72 | `시간 종료 시 자동 제출 · 답안은 30초마다 자동 저장` | body | examDuration>0 |
| 77 | `플랫폼 내 AI만 사용 가능 · 외부 도구 사용 금지` | body | examHasEssay=true |
| 83 | `모든 AI 대화 및 활동이 기록되어 평가에 활용됩니다` | body | examHasEssay=true |
| 93 | `시험 정보` | label | h3 |
| 98 | `시험명:` | label | |
| 101 | `시험 시간:` | label | |
| 102 | `${examDuration}분` | dynamic | 시험 시간 보간 |
| 106 | `시험 시간:` | label | examDuration===0 |
| 107 | `무제한 (과제형)` | label | |
| 111 | `설명:` | label | |
| 122 | `세부 시험 규칙 보기` | label | CollapsibleTrigger |
| 130 | `시간 정책` | label | h3 |
| 135 | `시간 제한이 없는 과제형 시험입니다. 자유롭게 작성하세요.` | body | duration===0 |
| 140 | `답안은 자동으로 저장되며, 수동 저장도 가능합니다 (Ctrl+S / Cmd+S).` | body | |
| 145 | `작성이 완료되면 "시험 제출하기" 버튼을 클릭해주세요.` | body | duration===0 |
| 152 | `시험 시간은 강사가 "시험 시작" 버튼을 클릭하는 순간부터 시작됩니다.` | body | duration>0 |
| 156 | `시험 시간이 종료되면 자동으로 제출되며, 이후 답안 수정이 불가능합니다.` | body | |
| 160 | `답안은 자동으로 저장되며, 수동 저장도 가능합니다 (Ctrl+S / Cmd+S).` | body | duration>0 |
| 170 | `시험 규칙` | label | h3 |
| 174 | `시험 중 다른 브라우저 탭이나 프로그램을 사용할 수 없습니다.` | body | |
| 178 | `답안 복사/붙여넣기는 감지되며, 부정행위로 간주될 수 있습니다.` | body | |
| 182 | `AI 채팅 기능을 사용할 수 있으나, 모든 대화 내용이 기록됩니다.` | body | examHasEssay |
| 187 | `시험 중 페이지를 닫아도 답안은 자동 저장됩니다. 같은 시험 코드로 다시 입장할 수 있습니다.` | body | |
| 199 | `AI 사용 정책` | label | h3 |
| 206 | `플랫폼 내 AI 자유 활용` | label | blue 카드 |
| 207 | `Quest-ON 내 AI Assistant를 자유롭게 사용하세요.` | body | |
| 212 | `외부 AI/도구 사용 금지` | label | red 카드 |
| 213 | `ChatGPT, Claude 등 외부 도구 사용 시 평가가 무효 처리될 수 있습니다.` | body | |
| 219 | `사고 과정 중심 평가` | label | |
| 220 | `논리적 사고력, AI 활용 능력, 비판적 분석이 핵심 평가 기준입니다.` | body | |
| 236 | `AI 채팅 로그 기록 안내` | label | Alert 내 font-semibold |
| 238 | `시험 중 AI와 나눈 모든 대화 내용은 자동으로 기록되며, 시험 평가에 활용될 수 있습니다.` | body | |
| 262 | `위의 시간 정책 및 시험 규칙을 모두 확인하고 준수하겠습니다.` | label | checkbox label |
| 280 | `AI 채팅 로그가 기록됨을 확인하고, AI의 도움을 받은 내용은 정직하게 표시하겠습니다.` | label | checkbox label(examHasEssay) |
| 289 | `취소` | button | |
| 296 | `확인 및 입장` | button | |

---

### components/exam/QuestionPanel.tsx
파일 요약: 문제 표시 패널. 문제 번호·유형·배점·스크롤 힌트.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 22 | `서술형 문제` | label | essay |
| 23 | `단답형 문제` | label | short-answer |
| 24 | `객관식 문제` | label | multiple-choice |
| 25 | `O/X 문제` | label | true-false |
| 26 | `문제` | label | 기본 fallback |
| 60 | `문제 ${questionNumber}` | dynamic | 문제 번호 보간 |
| 66 | `배점: ${question.points}점` | dynamic | 배점 보간 |
| 103 | `더 읽기` | aria | Button aria-label |

---

### components/exam/SubmitConfirmDialog.tsx
파일 요약: 제출 확인 다이얼로그. 쿨다운 카운트다운 포함.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 65 | `시험 제출 확인` | heading | AlertDialogTitle |
| 68 | `정말로 시험을 제출하시겠습니까?` | body | |
| 71 | `제출 후에는 답안을 수정할 수 없습니다.` | body | font-semibold |
| 76 | `취소` | button | AlertDialogCancel |
| 86 | `제출하기 ({remainingSeconds}초)` | dynamic | 쿨다운 중 초 보간 |
| 90 | `제출하기` | button | 쿨다운 해제 후 |

---

### components/exam/WaitingRoom.tsx
파일 요약: 대기실 화면. 시험 정보·시작 대기 안내·경과 시간.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 185 | `대기실` | heading | CardTitle |
| 187 | `강사가 시험을 시작하기를 기다리고 있습니다.` | body | CardDescription |
| 195 | `시험 정보` | label | h3 |
| 200 | `시험명:` | label | |
| 203 | `시험 코드:` | label | |
| 207 | `시험 시간:` | label | |
| 208 | `${examDuration}분` | dynamic | |
| 213 | `시험 시간:` | label | examDuration===0 |
| 215 | `무제한 (과제형)` | label | |
| 218 | `문제 수:` | label | |
| 219 | `${questionCount}문제` | dynamic | |
| 233 | `시험 시작 대기 중` | label | Alert 내 font-semibold |
| 235 | `강사가 "시험 시작" 버튼을 클릭하면 시험이 시작됩니다. 이 페이지를 닫지 마세요.` | body | |
| 240 | `시험이 시작되기 전까지 답안 작성이나 AI 채팅이 불가능합니다.` | body | examHasEssay=true 분기 |
| 241 | `시험이 시작되기 전까지 답안 작성이 불가능합니다.` | body | examHasEssay=false 분기 |
| 253 | `참고:` | label | font-semibold |
| 254 | `대기 중에도 답안 초안을 작성할 수 있습니다. 시험이 시작되면 자동으로 저장됩니다.` | body | allowDraftInWaiting=true |
| 265 | `시험 시작 신호 대기 중...` | body | Loader2 옆 |
| 268 | `대기 시간: ${Math.floor(elapsedSeconds / 60)}분 ${(elapsedSeconds % 60).toString().padStart(2, "0")}초` | timer | dynamic: 분·초 보간, 어순 주의 |

---

### components/assignment/AssignmentCanvas.tsx
파일 요약: TipTap 기반 과제 문서 편집기. 툴바·테이블 조작·PDF 다운로드.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 148 | `AI와 대화하거나 직접 문서를 작성하세요...` | placeholder | TipTap placeholder |
| 197 | `${title \|\| "과제"}.pdf` | format | PDF 저장 파일명 보간 |
| 205 | `에디터 로딩 중...` | body | 로딩 상태 |
| 222 | `과제 문서` | label | 헤더 span |
| 259 | `굵게 (Ctrl+B)` | aria | title 속성 |
| 269 | `기울임 (Ctrl+I)` | aria | title 속성 |
| 284 | `제목 1` | aria | title 속성 |
| 295 | `제목 2` | aria | title 속성 |
| 308 | `글머리 기호 목록` | aria | title 속성 |
| 318 | `번호 매기기 목록` | aria | title 속성 |
| 332 | `왼쪽 정렬` | aria | title 속성 |
| 342 | `가운데 정렬` | aria | title 속성 |
| 353 | `오른쪽 정렬` | aria | title 속성 |
| 371 | `코드 블록` | aria | title 속성 |
| 373 | `코드` | button | span 텍스트 |
| 403 | `테이블 삽입` | aria | title 속성 |
| 405 | `테이블` | button | span 텍스트 |
| 418 | `표 편집` | label | 서브툴바 span |
| 425 | `열 추가` | aria | title 속성 |
| 427 | `열` | button | span 텍스트(추가) |
| 432 | `행 추가` | aria | title 속성 |
| 434 | `행` | button | span 텍스트(추가) |
| 448 | `열 삭제` | aria | title 속성 |
| 450 | `열` | button | span 텍스트(삭제) |
| 455 | `행 삭제` | aria | title 속성 |
| 457 | `행` | button | span 텍스트(삭제) |
| 470 | `테이블 삭제` | aria | title 속성 |
| 472 | `삭제` | button | span 텍스트 |

---

### components/assignment/AssignmentChatPanel.tsx
파일 요약: 과제 AI 채팅 패널. 과제 안내·문제 렌더링·입력창·참고 출처.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 71 | `과제 안내` | label | 채팅 도입 버블 라벨 |
| 83 | `문제 ${i + 1}` | dynamic | 문제 번호 보간 |
| 145 | `참고 출처` | label | 인용 섹션 |
| 179 | `과제에 대해 질문하거나 도움을 요청하세요...` | placeholder | Textarea |
| 184 | `제출 후 대화/리서치 기반 타임어택 퀴즈가 진행됩니다.` | body | 메시지 있을 때 |
| 185 | `AI와 대화하며 리서치 내용을 정리하세요.` | body | 메시지 없을 때 |

---

### components/assignment/AssignmentHeader.tsx
파일 요약: 과제 헤더. 제목·마감 타이머·제출 버튼.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 41 | `마감됨` | label | 마감 후 timeLeft |
| 56 | `${days}일 ${hours}시간 남음` | timer | dynamic: 일·시간 보간 |
| 59 | `${hours}시간 ${minutes}분 남음` | timer | dynamic: 시간·분 보간 |
| 62 | `${minutes}분 ${seconds}초 남음` | timer | dynamic: 분·초 보간 |
| 64 | `${seconds}초 남음` | timer | dynamic: 초 보간 |
| 84 | `제출 완료` | label | Badge(green) |
| 104 | `제출 중...` | button | isSubmitting 상태 |
| 105 | `제출하기` | button | 기본 상태 |

---

### components/assignment/AssignmentSubmitDialog.tsx
파일 요약: 과제 제출 확인 다이얼로그. 최종답안 미리보기 포함.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 43 | `과제를 제출하시겠습니까?` | heading | DialogTitle |
| 46 | `제출하면 대화가 종료되고, 바로 타임어택 퀴즈가 시작됩니다. 퀴즈까지 완료해야 최종 제출됩니다.` | body | DialogDescription |
| 52 | `최종답안 미리보기` | label | |
| 64 | `수정하기` | button | onEditFinalAnswer 버튼 |
| 77 | `취소` | button | |
| 82 | `제출 중...` | button | isSubmitting 상태 |
| 83 | `제출하기` | button | 기본 상태 |

---

### components/assignment/FinalAnswerButton.tsx
파일 요약: 최종답안 작성 플로팅 버튼.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 39 | `최종답안 수정` | aria | hasContent=true aria-label |
| 39 | `최종답안 작성하기` | aria | hasContent=false aria-label |
| 55 | `최종답안 작성됨` | button | hasContent=true 텍스트 |
| 55 | `최종답안 작성하기` | button | hasContent=false 텍스트 |

---

### components/assignment/FinalAnswerSheet.tsx
파일 요약: 우측 슬라이드 최종답안 작성 Sheet.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 88 | `최종답안 작성` | heading | SheetTitle |
| 90 | `리서치 내용을 자신의 언어로 정리하세요. 채팅 기록과 함께 채점에 사용됩니다.` | body | SheetDescription |
| 100 | `여기에 최종답안을 작성하세요...` | placeholder | Textarea |
| 103 | `최종답안` | aria | aria-label |
| 115 | `${value.length.toLocaleString()} / ${MAX_LENGTH.toLocaleString()}자` | format | 글자 수 표시, toLocaleString 숫자 포맷 |
| 121 | `제출됨 — 수정 불가` | label | disabled 상태 |
| 125 | `저장 중...` | label | isSaving 상태 |
| 129 | (error 문자열 — props로 전달) | toast-error | 확인필요: error prop이 이 파일에서 렌더됨 |
| 132 | `마지막 저장: ${formatTime(lastSavedAt)}` | format | dynamic: HH:MM:SS 시각 보간 |
| 135 | `저장되지 않음` | label | dirty=true 상태 |
| 137 | `변경사항 없음` | label | 기본 상태 |
| 149 | `닫기` | button | |

---

### components/chat/AIMessageRenderer.tsx
파일 요약: AI 메시지 마크다운·수식 렌더러. bubble/plain 두 가지 variant.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 255 | `AI 답변` | label | bubble variant 하단 레이블 |
| 268 | `LaTeX 수식 포함됨` | label | hasMathSyntax=true 시 표시 |

---

### components/chat/CopyMessageButton.tsx
파일 요약: 메시지 복사 버튼. 성공/실패 토스트.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 26 | `복사되었습니다.` | toast-error | toast.success |
| 29 | `복사에 실패했습니다.` | toast-error | toast.error |
| 39 | `메시지 복사` | aria | Button aria-label |

---

### components/canvas/CodeEditor.tsx
파일 요약: Monaco 에디터 래퍼. 영문 로딩 텍스트 1건.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 11 | `Loading editor...` | body | 영문 로딩 폴백 (확인필요: 영문 하드코딩) |

---

### components/canvas/ErdCanvas.tsx
파일 요약: ERD 캔버스. 테이블 추가/삭제 버튼.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 162 | `테이블 추가` | button | |
| 166 | `선택 삭제` | button | |

---

### components/canvas/HybridWorkspace.tsx
파일 요약: 코드+ERD 복합 워크스페이스. 언어 선택기·패널 레이블.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 82 | `Code (${workspaceState.language})` | label | 영문 레이블, 언어명 보간 (확인필요) |
| 122 | `ERD Diagram` | label | 영문 레이블 (확인필요) |
| 139 | `Code (${workspaceState.language})` | label | 영문 레이블 반복 |
| 175 | `ERD Diagram` | label | 영문 레이블 반복 |

---

### components/canvas/TableNode.tsx
파일 요약: ERD 테이블 노드. 컬럼 없을 때 영문 메시지.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 29 | `PK` | label | title="Primary Key" (영문 약어, 확인필요) |
| 31 | `FK` | label | title="Foreign Key" (영문 약어, 확인필요) |
| 39 | `No columns defined` | empty-state | 영문 빈 상태 텍스트 (확인필요) |

---

### components/student/StudentDashboardClient.tsx
파일 요약: 학생 대시보드 전체 UI. 통계·기록 목록·필터·검색·무한스크롤.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 106 | `좋은 아침이에요, ${name}님 ☀️` | dynamic | 오전 인삿말, 이름 보간 |
| 107 | `오후도 열심히, ${name}님 💪` | dynamic | 오후 인삿말 |
| 108 | `오늘 하루 수고했어요, ${name}님 🌙` | dynamic | 저녁 인삿말 |
| 421 | `대시보드` | label | 사이드바 nav 항목 |
| 422 | `새 시험 시작` | label | 사이드바 nav 항목 |
| 491 | `프로필 확인 중...` | body | 로딩 상태 |
| 602 | `로그인이 필요합니다` | heading | CardTitle |
| 603 | `학생 페이지에 접근하려면 로그인해주세요` | body | |
| 610 | `학생으로 로그인` | button | |
| 654 | `학생 대시보드` | heading | header h1 |
| 715 | `전체 시험` | label | 통계 카드 |
| 731 | `완료율 ${completionRate}%` | dynamic | 완료율 보간 |
| 735 | `· 이번 달 ${thisMonthSessions}개` | dynamic | 이번 달 시험 수 보간 |
| 741 | `${displayCompletedCount}개 완료, ${displayInProgressCount}개 진행 중` | dynamic | 복수형 보간 |
| 750 | `ToDo` | label | 통계 카드 (영문, 확인필요) |
| 763 | `미제출 과제 ${displayTodoCount}개` | dynamic | |
| 770 | `평균 점수` | label | 통계 카드 |
| 787 | `평가 대기` | label | overallAverageScore===null |
| 790 | `${overallStats?.completedSessions \|\| displayCompletedCount}개 시험 기준` | dynamic | |
| 800 | `완료한 시험` | label | 통계 카드 |
| 815 | `${displayInProgressCount}개 진행 중` | dynamic | displayInProgressCount>0 |
| 818 | `모든 시험 완료` | label | displayInProgressCount===0 |
| 831 | `기록` | heading | 섹션 h3 |
| 836 | `시험에서의 성과 및 진행 상황` | body | 섹션 설명 |
| 847 | `${filteredSessions.length}개 표시됨 / 총 ${displayTotalCount}개` | dynamic | 검색/필터 적용 시 |
| 848 | `총 ${displayTotalCount}개의 시험` | dynamic | 전체 표시 시 |
| 863 | `전체` | button | 필터 버튼 |
| 864 | `전체 필터` | aria | aria-label |
| 869 | `평가 완료` | button | 필터 버튼 |
| 870 | `평가 완료 필터` | aria | |
| 875 | `평가 대기중` | button | 필터 버튼 |
| 876 | `평가 대기중 필터` | aria | |
| 881 | `진행 중` | button | 필터 버튼 |
| 882 | `진행 중 필터` | aria | |
| 888 | `미제출` | button | 필터 버튼 |
| 889 | `미제출 필터` | aria | |
| 908 | `시험 제목 또는 코드로 검색...` | placeholder | Input |
| 912 | `시험 검색` | aria | Input aria-label |
| 921 | `필터 및 검색 초기화` | aria | button title & aria-label |
| 939 | `그리드 뷰` | aria | button aria-label |
| 952 | `리스트 뷰` | aria | button aria-label |
| 985 | `아직 치른 시험이 없습니다` | empty-state | h3 |
| 988 | `첫 번째 시험을 시작하여 학습 성과를 추적해보세요.` | body | |
| 993 | `첫 번째 시험 시작하기` | button | |
| 1004 | `검색 결과가 없습니다` | empty-state | h3 |
| 1007 | `다른 검색어나 필터를 시도해보세요.` | body | |
| 1018 | `검색 초기화` | button | |
| 1041 | `상태: ${session.status === "completed" ? "완료" : session.status === "quiz-pending" ? "퀴즈 대기" : "진행 중"}` | aria | Badge aria-label, 3분기 동적 |
| 1047 | `완료` | label | status="completed" |
| 1051 | `퀴즈 대기` | label | status="quiz-pending" |
| 1052 | `진행 중` | label | status="in-progress" |
| 1080 | `과제` | label | duration===0 Badge |
| 1083 | `${session.duration}분` | dynamic | 시험 시간 보간 |
| 1122 | `상태: ...` (위와 동일) | aria | 리스트뷰 Badge aria-label |
| 1155 | `과제` | label | duration===0 Badge(list) |
| 1157 | `${session.duration}분` | dynamic | 리스트뷰 시간 보간 |
| 1173 | `${session.submissionCount}개 문제 제출됨` | dynamic | |
| 1188 | `평균 점수: ${session.averageScore}%` | aria | aria-label |
| 1195 | `${session.score}/${session.maxScore}점` | dynamic | 점수 보간 |
| 1220 | `기록 보기` | button | 마감 후 열람 |
| 1227 | `계속하기` | button | in-progress |
| 1232 | `퀴즈 풀기` | button | quiz-pending |
| 1236 | `답안 확인` | button | gradesReleased=false |
| 1241 | `리포트 보기` | button | isGraded=true |
| 1243 | `평가 대기중` | label | Badge(yellow) |
| 1222 | `더 불러오는 중...` | body | 무한스크롤 isFetchingNextPage |
| 1228 | `스크롤해서 더 보기` | body | |
| 1238 | `모든 시험을 불러왔습니다.` | body | hasNextPage=false |

---

## 특이사항

1. **보간 문자열 어순 주의**: `대기 시간: N분 NN초`(LateEntryWaiting L181, WaitingRoom L268), `${days}일 ${hours}시간 남음`(AssignmentHeader) 등 한국어 복합 시간 포맷은 영어 번역 시 단위 어순이 역전됨.
2. **복수형 없는 한국어 → 영어 복수형 필요**: `N개 완료`, `N개 진행 중`, `N개 문제`, `N개 시험 기준` 등 수량 보간 문자열 다수 — 영어 변환 시 단수/복수 처리 필요.
3. **영문 하드코딩(확인필요)**: `Loading editor...`(CodeEditor), `Code ({language})`·`ERD Diagram`(HybridWorkspace), `No columns defined`(TableNode) — 현재 영문으로 이미 하드코딩되어 있으나 한국어 UI에서 노출됨.
4. **ko-KR 날짜/시각 포맷**: `toLocaleString("ko-KR")`, `toLocaleTimeString("ko-KR", ...)` 호출 다수(review/page.tsx, ExamChatSidebar, AIMessageRenderer) — i18n 후 로케일 동적 주입 필요.
5. **이모지 포함 문자열**: 인삿말 3개(StudentDashboardClient L106-108) — 이모지 제거/유지 정책 결정 필요.
6. **`쿨다운 중 초 보간`**: `제출하기 ({remainingSeconds}초)`, `미작성 상태로 제출하기 ({unansweredSubmitRemainingSeconds}초)` — 괄호 안 초 단위 어순이 영어와 다름.
7. **`알 수 없는 오류` 하드코딩 fallback**: exam/page.tsx L407, L409 — 번역 키 필요.
8. **`ToLocaleString` 숫자 포맷**: FinalAnswerSheet L115의 `value.length.toLocaleString()` — 로케일 기반 천 단위 구분자 처리.
9. **`HybridWorkspace` 언어 선택기 옵션값**: SQL, Python, JavaScript 등 프로그래밍 언어명은 고유명사로 번역 대상 아님.
10. **`ChatGPT, Claude` 상품명 언급**: PreflightModal L213 — 번역 시 고유명사 유지.
11. **`PDF` 파일명 보간**: AssignmentCanvas L197 `${title || "과제"}.pdf` — "과제" fallback 문자열 번역 필요.
12. **`TodoCard`의 `ToDo` 영문 라벨**: StudentDashboardClient L750 — 번역 대상 여부 결정 필요.
13. **`formatExamTime` 유틸 함수**: ExamTimer L73의 aria-label에서 사용. 해당 함수의 출력 포맷(`MM:SS`)은 별도 파일(`hooks/useExamTimer.ts`)에 있어 이번 스캔 외.
14. **`PK` / `FK` 약어**: TableNode L29, L31 — title 속성으로 영문 전체 명칭 존재. 번역 정책 필요.

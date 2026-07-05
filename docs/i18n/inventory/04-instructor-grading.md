# i18n Inventory — 04 강사 채점

## 요약
- 스캔 파일 수: 19
- 텍스트 보유 파일 수: 19
- 총 추출 문자열 수: 244
- 특이사항 개수: 12
- ai-prompt 문자열 수: 0

> **특이사항 목록**
> 1. `GradeHeader` — `{studentName} 학생 채점`, `총점: {overallScore}점`, `제출일:`, `학번:`, `학교:` 모두 보간 포함 (format/dynamic)
> 2. `app/…/grade/page.tsx` — `{done}/{total} 문제 완료`, `실패 {gp.failed}` 등 채점 진행률 보간 다수
> 3. `app/…/assignment/grade/page.tsx` — `{studentName} 학생 채점`, `제출일:`, `학번:`, `학교:`, `전체 점수: {overallScore}점` 보간 포함
> 4. `BulkGradingPanel` — `{gradeNoun} AI 가채점` 패턴: gradeNoun이 "과제"|"CASE"로 동적 치환. 영문화 시 단수/복수 처리 필요
> 5. `BulkGradingPanel` — `${result.total}명 전체 ${gradeNoun} 가채점을 시작했습니다.` 인원 수 보간 포함
> 6. `BulkGradingPanel` — `${progress.failed}명 채점에 실패했습니다. 성공한 제안 점수만 확정하시겠습니까?` — window.confirm 내 문자열 (toast-error 아닌 별도 처리 필요)
> 7. `BulkGradingPanel` — `${result.gradedCount}개 채점이 확정되었습니다.` 보간
> 8. `LateEntryPanel` — `{waitingMin}분 {waitingSec}초 대기 중` 동적 시간 포맷 (format)
> 9. `SessionQuizResultsCard` — `new Date(...).toLocaleString("ko-KR", {...})` 한국어 로케일 하드코딩
> 10. `StudentProgressCard` — `toLocaleDateString("ko-KR")` 한국어 로케일 하드코딩
> 11. `StudentProgressCard.ElapsedTime` — `{diffDays}일 {diffHours%24}시간`, `{diffHours}시간 {diffMinutes%60}분`, `{diffMinutes}분`, `방금 전` 한국어 시간 단위 조합 (format)
> 12. `LiveMonitoringCard` / `StudentLiveMonitoring` — `date-fns` `formatDistanceToNow` with `locale: ko` 하드코딩

---

## 파일별 상세

### app/(app)/instructor/[examId]/grade/[studentId]/page.tsx
파일 요약: 시험 개별 학생 채점 페이지 — 문항 탐색, AI 채점 상태 배너, 오류 처리 UI 포함

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 211 | `채점 데이터 로드 실패 (${response.status})` | toast-error | 보간: HTTP 상태코드 |
| 273 | `이미 채점이 완료되어 있습니다.` | toast-error | |
| 280 | `AI 재채점 요청을 큐에 등록했습니다. 완료되면 자동으로 결과가 표시됩니다.` | toast-error | |
| 289 | `AI 재채점에 실패했습니다` | toast-error | 기본 fallback |
| 290 | `AI 재채점 중 오류가 발생했습니다` | toast-error | |
| 333 | `채점 데이터를 불러오는 중 오류가 발생했습니다` | heading | 에러 화면 h2 |
| 334 | `제출물을 찾을 수 없습니다` | heading | 에러 화면 h2 |
| 343 | `다시 시도` | button | RefreshCw 버튼 |
| 347 | `돌아가기` | button | Link 버튼 |
| 421 | `사지선다 정답 확인` | heading | objectiveTitle 변수 (multiple-choice 분기) |
| 421 | `O/X 정답 확인` | heading | objectiveTitle 변수 (true-false 분기) |
| 495 | `이 화면은 ${objectiveQuestionType === "multiple-choice" ? "사지선다" : "O/X"} 문제의 학생 선택과 정답만 표시합니다.` | body | 보간: 문항 유형명 |
| 503 | `표시할 문제가 없습니다.` | empty-state | |
| 528 | `AI 컨텍스트:` | label | |
| 560 | `강제 종료로 자동 제출된 세션` | heading | 배너 p.font-medium |
| 563 | `이 세션은 시험 강제 종료로 자동 제출되었습니다. 자동 저장된 답변만 표시됩니다.` | body | 배너 설명 |
| 595 | `AI 채점이 진행 중입니다` | heading | 진행중 배너 |
| 599 | `${done}/${total} 문제 완료` | dynamic | 보간: 완료/전체 수 |
| 599 | `채점 대기 중` | body | total=0일 때 |
| 601 | `(실패 ${gp.failed})` | dynamic | 보간: 실패 수 |
| 622 | `AI 채점 실패` | heading | isFailed 분기 title |
| 623 | `자동 채점 결과가 없습니다` | heading | noGradesAtAll 분기 title |
| 625 | `일부(또는 전체) 문제의 AI 채점이 실패했습니다.${total > 0 ? ` (${done}/${total})` : ""} AI 재채점을 실행하거나 수동으로 채점해주세요.` | body | 보간: done/total |
| 628 | `배경 자동 채점이 실행되지 않았거나 실패했습니다. AI 재채점을 실행해주세요.` | body | |
| 649 | `큐 등록 중...` | button | isRegrading 상태 버튼 |
| 657 | `AI 재채점` | button | |

---

### app/(app)/instructor/[examId]/grade/[studentId]/re/page.tsx
파일 요약: AI 재채점(가채점) 실행 전용 페이지 — 진행 상태 카드 UI

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 49 | `채점 재실행에 실패했습니다` | toast-error | error fallback |
| 57 | `이미 채점이 완료되어 있습니다.` | body | setMessage 호출 |
| 58 | `가채점이 완료되었습니다. (${gradeData.gradesCount || 0}개 문제)` | body | 보간: 문제 수 |
| 69 | `가채점 실행 중 오류가 발생했습니다` | toast-error | error fallback |
| 83 | `로딩 중...` | body | isLoaded=false 화면 |
| 93 | `로그인이 필요합니다` | heading | CardTitle |
| 95 | `가채점을 실행하려면 로그인이 필요합니다.` | body | CardDescription |
| 119 | `가채점 실행 중...` | heading | status=loading CardTitle |
| 120 | `가채점 완료` | heading | status=success CardTitle |
| 121 | `오류 발생` | heading | status=error CardTitle |
| 122 | `세션 없음` | heading | status=no-session CardTitle |
| 129 | `잠시 후 채점 페이지로 이동합니다...` | body | success 상태 |
| 136 | `다시 시도` | button | error 상태 button |
| 145 | `채점 페이지로 돌아가기` | button | no-session 상태 button |

---

### app/(app)/instructor/assignment/[assignmentId]/grade/[sessionId]/page.tsx
파일 요약: 과제 개별 학생 채점 페이지 — AI 채점 배너, 헤더, 과제 전용 레이아웃

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 186 | `채점 데이터 로드 실패 (${response.status})` | toast-error | 보간: HTTP 상태코드 |
| 217 | `AI 재채점에 실패했습니다` | toast-error | error fallback |
| 222 | `이미 채점이 완료되어 있습니다.` | toast-error | |
| 223 | `AI 재채점 요청을 큐에 등록했습니다. 완료되면 자동으로 결과가 표시됩니다.` | toast-error | |
| 231 | `AI 재채점 중 오류가 발생했습니다` | toast-error | error fallback |
| 299 | `채점 데이터를 불러오는 중 오류가 발생했습니다` | heading | 에러 h2 |
| 301 | `제출물을 찾을 수 없습니다` | heading | 에러 h2 |
| 309 | `다시 시도` | button | RefreshCw 버튼 |
| 313 | `돌아가기` | button | Link 버튼 |
| 356 | `과제로 돌아가기` | button | ArrowLeft 버튼 |
| 362 | `${sessionData.student.name} 학생 채점` | heading | h1, 보간: 학생명 |
| 366 | `제출일:` | label | 보간 템플릿 앞 레이블 |
| 369 | `학번: ${sessionData.student.student_number}` | dynamic | 보간: 학번 |
| 372 | `학교: ${sessionData.student.school}` | dynamic | 보간: 학교명 |
| 377 | `전체 점수: ${sessionData.overallScore}점` | dynamic | 보간: 점수 |
| 389 | `마감 시 자동 제출된 과제` | heading | 배너 p.font-medium |
| 392 | `학생이 직접 제출하지 않았으며, 마감 시점에 진행 중이던 내용이 자동으로 제출되었습니다.` | body | 배너 설명 |
| 423 | `AI 채점이 진행 중입니다` | heading | 진행중 배너 |
| 427 | `${done}/${total} 문제 완료` | dynamic | 보간 |
| 427 | `채점 대기 중` | body | total=0 |
| 429 | `(실패 ${gp.failed})` | dynamic | 보간: 실패 수 |
| 448 | `AI 채점 실패` | heading | isFailed 분기 |
| 448 | `자동 채점 결과가 없습니다` | heading | noGradesAtAll 분기 |
| 450 | `일부(또는 전체) 문제의 AI 채점이 실패했습니다.${total > 0 ? ` (${done}/${total})` : ""} AI 재채점을 실행하거나 수동으로 채점해주세요.` | body | 보간 |
| 453 | `배경 자동 채점이 실행되지 않았거나 실패했습니다. AI 재채점을 실행해주세요.` | body | |
| 476 | `큐 등록 중...` | button | isRegrading 상태 |
| 484 | `AI 재채점` | button | |

---

### components/grading/AiDependencySummaryCard.tsx
파일 요약: AI 의존도 / 리서치 참여 신호 카드 — 강사·학생 모드 분기, 리스크 레벨 배지

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 22 | `의존 우려 높음` | label | getRiskLabel, isAssignment=true, high |
| 24 | `의존 우려 있음` | label | getRiskLabel, isAssignment=true, medium |
| 26 | `양호` | label | getRiskLabel, isAssignment=true, default |
| 31 | `높음` | label | getRiskLabel, isAssignment=false, high |
| 33 | `중간` | label | getRiskLabel, isAssignment=false, medium |
| 35 | `낮음` | label | getRiskLabel, isAssignment=false, default |
| 67 | `리서치 참여 신호` | heading | loading 중 CardTitle, isAssignment=true |
| 67 | `AI 의존 신호` | heading | loading 중 CardTitle, isAssignment=false |
| 73 | `채점 완료 후 분석 결과가 표시됩니다` | body | loading 상태 |
| 87 | `리서치 참여 신호` | heading | instructor+isAssignment |
| 87 | `AI 의존 신호` | heading | instructor+!isAssignment |
| 90 | `리서치 참여 평가` | heading | student+isAssignment |
| 91 | `AI 활용 평가` | heading | student+!isAssignment |
| 108 | `전체 세션 해석` | label | overallSummary 섹션 |
| 109 | `AI 의존 ` | label | 배지 앞 부분, isAssignment=true (공백 주의) |
| 109 | `위험도 ` | label | 배지 앞 부분, isAssignment=false (공백 주의) |
| 116 | `${isAssignment ? "리서치 질문" : "트리거"} ${overallSummary.triggerCount}회` | dynamic | 보간: 횟수 |
| 121 | `질문 흐름 연결됨` | label | recovery=true, isAssignment |
| 122 | `질문 연결 제한적` | label | recovery=false, isAssignment |
| 124 | `회복 ${overallSummary.recoveryObserved ? "관찰됨" : "근거 약함"}` | dynamic | !isAssignment 분기 |
| 133 | `현재 문항 해석` | label | questionAssessment 섹션 |
| 144 | `후속·확장 질문 ${metrics.followUpQuestionCount}회` | dynamic | 보간: 횟수 |
| 145 | `검증·확인 질문 ${metrics.verificationQuestionCount}회` | dynamic | 보간: 횟수 |
| 146 | `개념·범위 탐색 ${metrics.conceptExplorationCount}회` | dynamic | 보간: 횟수 |
| 147 | `답안 위임 요청 ${metrics.answerDelegationCount}회` | dynamic | 보간: 횟수 |
| 151 | `풀이 위임형 요청 ${questionAssessment.delegationRequestCount}회` | dynamic | 보간: 횟수 |
| 152 | `출발점 의존 ${questionAssessment.startingPointDependencyCount}회` | dynamic | 보간: 횟수 |
| 153 | `직접 답 요구 ${questionAssessment.directAnswerRequestCount}회` | dynamic | 보간: 횟수 |
| 155 | `답안 유사도 ${(questionAssessment.finalAnswerOverlapScore * 100).toFixed(0)}%` | dynamic | 보간: 백분율 |
| 164 | `질문 흐름이 이어지며 탐색·검증이 관찰됨` | body | recoveryObserved=true, isAssignment |
| 165 | `질문 연결·검증 흔적이 제한적임` | body | recoveryObserved=false, isAssignment |
| 167 | `독립 추론 회복이 확인됨` | body | recoveryObserved=true, !isAssignment |
| 168 | `독립 추론 회복 근거가 제한적임` | body | recoveryObserved=false, !isAssignment |
| 184 | `리서치 질문 예시` | label | instructor+isAssignment |
| 185 | `근거 문장` | label | instructor+!isAssignment |
| 188 | `평가에 반영된 리서치 질문` | label | student+isAssignment |
| 189 | `평가에 반영된 대화 근거` | label | student+!isAssignment |

---

### components/instructor/AIConversationsCard.tsx
파일 요약: 학생-AI 대화 기록 카드 — 채점 화면에서 대화 이력 표시

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 33 | `AI와의 대화 기록` | heading | CardTitle |
| 35 | `학생이 AI와 나눈 대화 내용입니다` | body | CardDescription |
| 73 | `AI와의 대화 기록이 없습니다.` | empty-state | |

---

### components/instructor/AIOverallSummary.tsx
파일 요약: CASE 종합 평가 카드 — 강점/개선점/핵심 인용구/요약 표시

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 24 | `CASE 종합 평가` | heading | empty 상태 h3 |
| 26 | `CASE 답안과 관련 채팅 흐름을 분석해 요약합니다.` | body | empty 상태 p |
| 39 | `CASE 종합 평가 분석 중` | heading | loading CardTitle |
| 47 | `학생의 답안을 전체적으로 검토하고 있습니다...` | body | LoadingMessage 배열[0] |
| 48 | `주요 강점과 개선점을 분석하고 있습니다...` | body | LoadingMessage 배열[1] |
| 49 | `답안에서 핵심 인용구를 추출하고 있습니다...` | body | LoadingMessage 배열[2] |
| 50 | `종합적인 평가 의견을 작성하고 있습니다...` | body | LoadingMessage 배열[3] |
| 67 | `CASE 종합 평가` | heading | 데이터 있을 때 CardTitle |
| 75 | `종합 의견` | heading | h4 |
| 85 | `핵심 인용구 (Highlight)` | heading | h4 |
| 113 | `강점` | heading | h4 |
| 127 | `개선점` | heading | h4 |

---

### components/instructor/BulkGradingPanel.tsx
파일 요약: AI 일괄 가채점 패널 — 인터뷰 채팅·진행률·확정·결과 테이블 통합 UI

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 57 | `검토 후 확정` | label | PERMISSION_LABELS.review_before_commit |
| 58 | `바로 가채점` | label | PERMISSION_LABELS.no_precheck |
| 59 | `AI한테 다 맡기기` | label | PERMISSION_LABELS.ai_default |
| 63 | `검토 후 최종 확정` | body | PERMISSION_DESCRIPTIONS.review_before_commit |
| 64 | `추가 질문 없이 시작` | body | PERMISSION_DESCRIPTIONS.no_precheck |
| 65 | `AI 기본 기준으로 시작` | body | PERMISSION_DESCRIPTIONS.ai_default |
| 213 | `채점 세션을 불러오지 못했습니다` | toast-error | error fallback |
| 231 | `가채점 대화를 불러오지 못했습니다` | toast-error | error fallback |
| 272 | `채점 인터뷰를 시작하지 못했습니다` | toast-error | error fallback |
| 310 | `대화 전송에 실패했습니다` | toast-error | error fallback |
| 354 | `인터뷰를 마무리하지 못했습니다` | toast-error | error fallback |
| 363 | `지금까지의 기준으로 가채점을 시작할 수 있습니다.` | toast-error | toast.success |
| 382 | `확정할 채점 결과가 없습니다.` | toast-error | throw Error |
| 468 | `채점 시작에 실패했습니다.` | toast-error | error fallback |
| 474 | `${result.total}명 전체 ${gradeNoun} 가채점을 시작했습니다.` | toast-error | toast.success, 보간: 인원·noun |
| 509 | `채점 저장에 실패했습니다` | toast-error | error fallback |
| 514 | `${result.gradedCount}개 채점이 확정되었습니다. 성적 공개는 별도로 진행하세요.` | toast-error | toast.success, 보간: 건수 |
| 514 | `확정 결과를 불러오지 못했습니다` | toast-error | error fallback |
| 589 | `${progress.failed}명 채점에 실패했습니다. 성공한 제안 점수만 확정하시겠습니까?` | toast-error | window.confirm, 보간: 실패 수 — 특이사항: confirm 다이얼로그 |
| 758 | `가채점을 시작했습니다` | body | criteriaEchoText fallback |
| 819 | `전체 ${gradeNoun} 가채점 중 · 처리 ${processedCount}/${progress?.total ?? 0}` | dynamic | 보간: noun, 진행수, 전체수 |
| 819 | `· 실패 ${progress.failed}명` | dynamic | 보간: 실패 수 |
| 838 | `일부 실패. 다시 채점하면 제안 점수가 초기화됩니다.` | body | gradingFailed 분기 |
| 840 | `${progress?.failed ?? 0}명 실패. 성공분만 확정할 수 있습니다.` | dynamic | 보간: 실패 수 |
| 951 | `반영됨` | badge | committed 상태 Badge |
| 955 | `채점 중` | badge | isGrading 상태 Badge |
| 958 | `가채점 완료` | badge | 기본 Badge |
| 961 | `확정된 ${gradeNoun} 채점` | heading | committed 분기, 보간: noun |
| 961 | `AI 제안 점수` | heading | !committed 분기 |
| 963 | `(${count}개)` | dynamic | 보간: 건수 |
| 975 | `처리 ${processedCount}/${progress.total}명` | dynamic | 보간: 진행수/전체수 |
| 977 | `성공 ${progress.completed}명 · 실패 ${progress.failed}명` | dynamic | 보간: 성공/실패 수 |
| 980 | `${progressPercent}%` | dynamic | 보간: 진행률 |
| 1007 | `처리 대기 중 ${missingStudents.length}명` | dynamic | isGrading, 보간: 인원 |
| 1007 | `채점되지 않은 학생 ${missingStudents.length}명${failedCount > 0 ? ` (실패 ${failedCount}명)` : ""}` | dynamic | 보간: 인원, 실패 수 |
| 1028 | `다시 가채점` | button | 재시도 버튼 |
| 1052 | `채점 실패` | badge | s.failed=true 뱃지 |
| 1052 | `대기 중` | badge | s.failed=false 뱃지 |
| 1059 | `다시 가채점하면 제안 점수가 초기화됩니다.` | body | 안내문 |
| 1068 | `학생 목록 기준 최종 점수입니다.` | body | committed 상태 안내 |
| 1073 | `확정 결과 불러오는 중...` | body | loading 상태 |
| 1077 | `확정 결과가 없습니다. 학생 목록에서 최종 점수를 확인하세요.` | empty-state | |
| 1082 | `학생` | label | 테이블 헤더 th |
| 1083 | `총점` | label | 테이블 헤더 th |
| 1084 | `상태` | label | 테이블 헤더 th |
| 1114 | `학생` | label | 테이블 헤더 th |
| 1115 | `문제` | label | 테이블 헤더 th |
| 1116 | `점수` | label | 테이블 헤더 th |
| 1117 | `코멘트` | label | 테이블 헤더 th |
| 1136 | `Q${row.qIdx + 1}` | dynamic | 보간: 문항 번호, 확인필요 (Q 접두사 영문 유지 여부) |
| 1178 | `${row.studentName} Q${row.qIdx + 1} 개별 채점 새 탭에서 열기` | aria | aria-label, 보간: 학생명·문항번호 |
| 1183 | `개별 채점` | label | 링크 텍스트 |
| 1193 | `제안 점수가 아직 없습니다.` | empty-state | |
| 1209 | `저장 중...` | button | commitMutation.isPending |
| 1213 | `채점 확정 (${totalGrades}개)` | button | 보간: 건수 |
| 1219 | `확정된 채점입니다. 아래에서 결과만 논의할 수 있습니다.` | body | committed 상태 안내 |
| 1231 | `${gradeNoun} AI 가채점` | aria | aside aria-label, 보간: noun |
| 1243 | `${gradeNoun} AI 가채점` | heading | 패널 h2, 보간: noun |
| 1245 | `(대상 ${data.studentCount}명)` | dynamic | 보간: 인원 |
| 1251 | `닫기` | aria | button aria-label |
| 1267 | `불러오는 중...` | body | isLoading 상태 |
| 1274 | `제출 데이터를 분석하고 채점 인터뷰를 준비하는 중…` | body | !hasThreadContent 상태 |
| 1281 | `대화 불러오는 중...` | body | chatLoading 상태 |
| 1298 | `맨 아래로 이동` | aria | jump-to-bottom button aria-label |
| 1303 | `맨 아래로` | label | jump-to-bottom button 텍스트 |
| 1321 | `이 기준으로 다시 가채점` | button | canRegradeArm 버튼 |
| 1329 | `전송하면 제안 점수를 새로 만듭니다` | body | regradeArmed 배너 |
| 1334 | `취소` | button | regradeArmed 취소 버튼 |
| 1362 | `준비 중...` | button | completeInterviewMutation.isPending |
| 1365 | `여기까지만 질문받고 일단 채점 진행` | button | canProceedToGrading 버튼 |
| 1370 | `점수 범위가 확정되었습니다. 전송하면 전체 ${gradeNoun} 가채점을 시작합니다.` | body | 보간: noun |
| 1382 | `보기 생성 중...` | body | chatOptionsMutation.isPending |
| 1387 | `답변 선택지` | aria | group aria-label |
| 1425 | `추가 메모(선택). 전송하면 가채점을 시작합니다` | placeholder | sendMode=start |
| 1427 | `인터뷰 질문에 답변하세요` | placeholder | interviewInProgress |
| 1429 | `질문 입력` | placeholder | 기본 |
| 1474 | `전체 ${gradeNoun} 가채점 시작` | aria | send button aria-label, sendMode=start, 보간: noun |
| 1475 | `인터뷰 답변 전송` | aria | send button aria-label, sendMode=discuss |

---

### components/instructor/CaseGradingChat.tsx
파일 요약: CASE 문항 AI 채점 채팅 카드 — 점수·코멘트 입력, AI 추천 점수 칩 포함

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 85 | `채점 대화를 불러오지 못했습니다` | toast-error | error fallback |
| 111 | `AI 응답을 받지 못했습니다` | toast-error | error fallback |
| 148 | `0~100 사이의 점수를 입력해주세요` | toast-error | throw Error |
| 162 | `채점 저장에 실패했습니다` | toast-error | error fallback |
| 168 | `채점이 저장되었습니다.` | toast-error | toast.success |
| 219 | `AI 채점 대화` | heading | CardTitle |
| 221 | `${questionNumber}번 문항 — 답안·대화 맥락을 바탕으로 AI와 채점을 논의합니다` | body | CardDescription, 보간: 문항번호 |
| 235 | `대화 불러오는 중…` | body | historyLoading 상태 |
| 243 | `AI와 채점을 논의해 보세요` | body | 빈 상태 p.font-medium |
| 245 | `예: "이 답안의 핵심 강점과 약점은?"` | body | 빈 상태 예시 문구 |
| 295 | `AI가 답변을 작성 중…` | body | chatMutation.isPending |
| 305 | `AI에게 보낼 채점 질문` | aria | Label sr-only |
| 315 | `AI에게 채점 질문하기…` | placeholder | Textarea |
| 326 | `메시지 보내기` | aria | Button aria-label |
| 336 | `Enter 전송 · Shift+Enter 줄바꿈` | body | 안내 텍스트 |
| 341 | `채점 입력` | label | p.text-xs.font-semibold |
| 343 | `점수 (0–100)` | label | Label htmlFor score |
| 360 | `AI 추천 점수 ` | label | 추천 점수 칩 span, 보간: 점수값이 뒤에 옴 |
| 360 | `{suggestedScore}점` | dynamic | 보간: 추천 점수 |
| 372 | `적용` | button | 추천 점수 적용 버튼 |
| 380 | `무시` | button | 추천 점수 무시 버튼 |
| 389 | `코멘트` | label | Label htmlFor comment |
| 395 | `학생에게 전달할 피드백` | placeholder | Textarea |
| 407 | `저장 중…` | button | commitMutation.isPending |
| 412 | `채점 저장` | button | 기본 저장 버튼 |

---

### components/instructor/GradeHeader.tsx
파일 요약: 개별 채점 페이지 상단 헤더 — 학생 정보, 점수, 뒤로가기 버튼

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 40 | `시험으로 돌아가기` | button | ArrowLeft 버튼 |
| 56 | `{studentName} 학생 채점` | heading | h1, 보간: 학생명 |
| 58 | `제출일: ${new Date(submittedAt).toLocaleString()}` | format | 보간: 날짜 — toLocaleString 로케일 미지정(브라우저 기본값) |
| 59 | `학번: ${studentNumber}` | dynamic | 보간: 학번 |
| 60 | `학교: ${school}` | dynamic | 보간: 학교명 |
| 64 | `총점: ${overallScore}점` | dynamic | 보간: 점수 |

---

### components/instructor/GradingPanel.tsx
파일 요약: 문항 채점 패널 — 종합점수 입력, AI 가채점 승인, AI 요약 표시 (레거시 stage 방식 주석처리됨)

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 39 | `긍정적` | label | SENTIMENT_STYLES.positive.label |
| 40 | `부정적` | label | SENTIMENT_STYLES.negative.label |
| 41 | `중립적` | label | SENTIMENT_STYLES.neutral.label |
| 79 | `문제 ${questionNumber} 채점` | heading | isGradingInProgress CardTitle, 보간: 문항번호 |
| 84 | `AI 채점이 진행 중입니다` | body | isGradingInProgress 상태 |
| 86 | `채점이 완료되면 점수와 피드백이 표시됩니다` | body | isGradingInProgress 상태 |
| 99 | `문제 ${questionNumber} 채점` | heading | CardTitle, 보간: 문항번호 |
| 102 | `AI 요약 평가를 참고해 점수를 확정하세요.` | body | isAssignmentMode CardDescription |
| 104 | `가채점만 있습니다. 반드시 점수를 직접 입력해야 합니다.` | body | isAiGradedOnly CardDescription |
| 107 | `AI 가채점 완료. 점수와 피드백을 수정할 수 있습니다.` | body | isGraded && overallScore>0 |
| 108 | `이 문제에 대한 점수와 피드백을 입력하세요` | body | 기본 CardDescription |
| 187 | `종합 점수 (0-100)` | label | Label htmlFor score |
| 268 | `가채점 점수로 채점하기` | label | 체크버튼 title attribute |
| 274 | `가채점 점수: ${aiGradedScore}점. 체크 버튼을 눌러 가채점 점수로 채점하거나 직접 입력해주세요.` | body | 보간: 점수 |
| 288 | `AI 문제별 요약` | heading | h4 |
| 356 | `저장 중...` | button | saving=true |
| 358 | `점수를 입력해주세요` | button | isAiGradedOnly=true |
| 360 | `문제 채점 저장` | button | 기본 |
| 373 | `현재 점수: ${overallScore}점` | dynamic | isAssignmentMode, 보간: 점수 |
| 376 | `⚠ 가채점만 있습니다` | badge | isAiGradedOnly, 특이사항: 이모지 포함 |
| 379 | `✓ AI 가채점 완료` | badge | overallScore>0, 특이사항: 이모지 포함 |
| 380 | `✓ 채점 완료됨` | badge | overallScore=0 |
| 40 | `상세 피드백` | label | (주석처리된 코드 내) — 영문화 대상 제외 가능, 확인필요 |
| 172 | `이 단계에 대한 평가 의견을 입력하세요...` | placeholder | (주석처리된 코드 내) — 확인필요 |

---

### components/instructor/InstructorChatSidebar.tsx
파일 요약: 강사 AI 채팅 사이드바 — 페이지 데이터 기반 질의응답, 플로팅 트리거 버튼

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 38 | `이 페이지의 데이터` | body | scopeDescription 기본값 (props default) |
| 39 | `시험 패널` | heading | title 기본값 (props default) |
| 40 | `이 페이지에서 궁금한 것을 물어보세요.` | body | subtitle 기본값 (props default) |
| 105 | `설정 사이드바 열기` | aria | FloatingTrigger button aria-label |
| 160 | `설정 사이드바 닫기` | aria | SidebarCloseButton aria-label |
| 213 | `API 메서드가 허용되지 않습니다. 서버 설정을 확인해주세요.` | toast-error | 405 에러 처리 |
| 237 | `죄송합니다. 응답을 생성하는 중에 오류가 발생했습니다. 다시 시도해주세요.` | toast-error | onError 에러 메시지 (여러 분기에서 동일) |
| 239 | `오류: ${err.message}` | toast-error | 보간: 에러 메시지 |
| 279 | `이 페이지에 대해 무엇이든 물어보세요` | body | 빈 상태 p.font-medium |
| 283 | `${scopeDescription} 범위에서만 답변합니다.` | body | 빈 상태 안내, 보간: scopeDescription |
| 322 | `답변 생성 중...` | body | mutation.isPending AIMessageRenderer content |
| 334 | `무엇을 도와드릴까요?` | placeholder | Textarea |
| 352 | `전송` | aria | send Button aria-label |

---

### components/instructor/LateEntryPanel.tsx
파일 요약: 지각 학생 입장 승인/거부 패널 — 실시간 대기 목록

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 81 | `요청 실패` | toast-error | error fallback |
| 86 | `학생 입장을 승인했습니다.` | toast-error | toast.success, approve |
| 87 | `학생 입장을 거부했습니다.` | toast-error | toast.success, deny |
| 91 | `오류: ${error.message}` | toast-error | 보간: 에러 메시지 |
| 104 | `지각 학생 대기` | heading | CardTitle |
| 106 | `${lateStudents.length}명` | dynamic | 배지, 보간: 인원 |
| 116 | `불러오는 중...` | body | isLoading 상태 |
| 119 | `지각 대기 중인 학생이 없습니다.` | empty-state | |
| 142 | `${waitingMin}분 ${waitingSec}초 대기 중` | format | 보간: 분·초 — 한국어 시간 단위 |
| 154 | `승인` | button | approve 버튼 |
| 162 | `거부` | button | deny 버튼 |

---

### components/instructor/LiveMonitoringCard.tsx
파일 요약: 시험 중 전체 학생 실시간 질문 모니터링 카드

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 151 | `실시간 모니터링` | heading | CardTitle |
| 153 | `학생들의 실시간 질문 및 활동 모니터링` | body | CardDescription |
| 169 | `활성` | badge | isMonitoring && isPageVisible |
| 170 | `백그라운드` | badge | isMonitoring && !isPageVisible |
| 171 | `중지됨` | badge | !isMonitoring |
| 181 | `중지` | button | isMonitoring=true |
| 186 | `시작` | button | isMonitoring=false |
| 207 | `아직 질문이 없습니다.` | empty-state | |
| 211 | `학생들이 질문하면 여기에 실시간으로 표시됩니다.` | body | 빈 상태 안내 |
| 242 | `AI 답변` | badge | message.role=ai 배지 |
| 243 | `학생 질문` | badge | message.role=user 배지 |
| 245 | `문제 ${message.q_idx + 1}` | dynamic | 배지, 보간: 문항번호 |
| 256 | (formatDistanceToNow with locale:ko) | format | date-fns 한국어 로케일 — 특이사항 |

---

### components/instructor/ObjectiveGradeCard.tsx
파일 요약: 객관식/OX 문항 정답 확인 카드 — 학생 선택과 정답 비교

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 62 | `O·X 정답 확인` | heading | type=true-false 분기 h3/CardTitle |
| 63 | `객관식 정답 확인` | heading | type=multiple-choice 분기 h3/CardTitle |
| 65 | `정답` | badge | isCorrect=true Badge |
| 66 | `오답` | badge | isCorrect=false Badge |
| 68 | `무응답` | badge | selectedIndex=null Badge |
| 74 | `학생이 선택한 답안과 정답을 비교합니다.` | body | p.text-muted 및 CardDescription |
| 82 | `선택지 정보가 없습니다.` | body | resolvedOptions.length=0 |
| 110 | `학생 선택` | badge | isStudentPick Badge |
| 118 | `정답` | badge | isAnswer Badge |
| 130 | `이 문제에 정답 정보가 없어 자동 채점되지 않았습니다.` | body | !hasCorrect 안내 |

---

### components/instructor/PasteLogsCard.tsx
파일 요약: 붙여넣기 로그 카드 — 부정행위 의심 감지 표시

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 53 | `부정행위 의심` | heading | suspiciousCount>0 CardTitle span |
| 54 | `붙여넣기 활동` | heading | suspiciousCount=0 CardTitle span |
| 62 | `외부 복사-붙여넣기 ${suspiciousCount}건 감지` | body | 보간: 건수 |
| 70 | `전체:` | label | 통계 span |
| 71 | `${totalLogs}회` | dynamic | 배지, 보간: 횟수 |
| 74 | `의심:` | label | 통계 span |
| 75 | `${suspiciousCount}회` | dynamic | 배지, 보간: 횟수 |

---

### components/instructor/QuestionAiSummaryCard.tsx
파일 요약: CASE 문항별 AI 평가 카드 — 감정 배지, 강점/개선점 목록

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 16 | `긍정적` | label | SENTIMENT_STYLES.positive.label |
| 17 | `부정적` | label | SENTIMENT_STYLES.negative.label |
| 18 | `중립적` | label | SENTIMENT_STYLES.neutral.label |
| 36 | `CASE 문항 평가` | heading | loading CardTitle |
| 41 | `CASE 문항 평가 생성 중…` | body | loading CardContent |
| 55 | `CASE 문항 평가` | heading | data CardTitle |
| 89 | `강점` | label | span.text-blue-700 |
| 103 | `개선점` | label | span.text-orange-700 |

---

### components/instructor/SessionQuizResultsCard.tsx
파일 요약: 타임어택 퀴즈 결과 카드 — 점수·정오답 표시

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 44 | `타임어택 퀴즈 결과` | heading | CardTitle |
| 54 | `점수 ${quiz.score ?? 0}/100` | dynamic | 배지, 보간: 점수 |
| 57 | `${quiz.total_questions}문항 · ${quiz.time_limit_seconds}초` | dynamic | 배지, 보간: 문항수·시간 |
| 62 | `완료:` | label | quiz.submitted_at 앞 텍스트 |
| 62 | (toLocaleString("ko-KR", {month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"})) | format | 한국어 로케일 하드코딩 — 특이사항 |
| 93 | `정답` | badge | isCorrect=true |
| 94 | `오답` | badge | isCorrect=false |
| 98 | `선택:` | label | 선택지 앞 레이블 |
| 99 | `무응답` | body | selectedIndex 없을 때 |
| 104 | `정답:` | label | correctIndex 정답 표시 앞 레이블 |
| 110 | `근거:` | label | question.rationale 앞 레이블 |

---

### components/instructor/StudentLiveMonitoring.tsx
파일 요약: 개별 학생 실시간 모니터링 다이얼로그 — Supabase Realtime 구독

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 224 | `${studentName} 학생 실시간 모니터링` | heading | DialogTitle, 보간: 학생명 |
| 228 | `학번: ${studentNumber}` | dynamic | DialogDescription, 보간: 학번 |
| 229 | ` | 학교: ${school}` | dynamic | DialogDescription, 보간: 학교명 |
| 248 | `메시지를 불러오는 중...` | body | isLoading && messages.length=0 |
| 252 | `아직 질문이 없습니다.` | empty-state | |
| 254 | `학생이 질문하면 여기에 실시간으로 표시됩니다.` | body | 빈 상태 안내 |
| 278 | `AI 답변` | badge | message.role=ai 배지 |
| 279 | `학생 질문` | badge | message.role=user 배지 |
| 280 | `문제 ${message.q_idx + 1}` | dynamic | 배지, 보간: 문항번호 |
| 286 | (formatDistanceToNow with locale:ko) | format | date-fns 한국어 로케일 — 특이사항 |

---

### components/instructor/StudentProgressCard.tsx
파일 요약: 학생 진행 상황 카드 — 응시 상태 배지, 점수, 모니터링/채점 버튼

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 63 | `방금 전` | body | ElapsedTime diffMs<0 |
| 73 | `${diffDays}일 ${diffHours % 24}시간` | format | 보간: 일·시간 — 한국어 단위 |
| 75 | `${diffHours}시간 ${diffMinutes % 60}분` | format | 보간: 시간·분 — 한국어 단위 |
| 77 | `${diffMinutes}분` | format | 보간: 분 — 한국어 단위 |
| 79 | `방금 전` | body | diffSeconds<60 |
| 110 | `시작한 지: ${elapsedTime}` | dynamic | 보간: 경과시간 문자열 |
| 138 | `학생 진행 상황 (${students.length})` | heading | CardTitle, 보간: 인원 |
| 139 | `학생 참여도와 점수 모니터링` | body | CardDescription |
| 171 | `완료` | badge | status=completed |
| 174 | `진행 중` | badge | status=in-progress |
| 175 | `시작 안함` | badge | status=not-started |
| 200 | `${student.score}점` | dynamic | 보간: 점수 |
| 203 | (toLocaleDateString("ko-KR")) | format | 한국어 로케일 하드코딩 — 특이사항 |
| 235 | `모니터링` | button | in-progress 학생 버튼 |
| 249 | `채점` | button | completed 학생 버튼 |

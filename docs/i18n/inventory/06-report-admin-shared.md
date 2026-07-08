# i18n Inventory — 06 리포트/관리자/공유

## 요약
- 스캔 파일 수: 27
- 텍스트 보유 파일 수: 22
- 총 추출 문자열 수: 193
- 특이사항 개수: 8
- lib/error-messages.ts 매핑 항목 수: 37

---

## 파일별 상세

### app/(app)/student/report/[sessionId]/page.tsx
파일 요약: 학생 리포트 페이지 — 성적 공개 여부·채점 진행 상황에 따라 분기, 객관식/OX/서술형 그룹별 표시.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 103 | `리포트를 찾을 수 없습니다.` | toast-error | 403/404 fetch 실패 |
| 105 | `리포트를 불러오는 중 오류가 발생했습니다.` | toast-error | 일반 fetch 실패 |
| 155 | `리포트를 불러올 수 없습니다` | heading | errorMessage fallback |
| 160 | `학생 대시보드로 돌아가기` | button | ArrowLeft 아이콘 동반 |
| 188 | `대시보드로 돌아가기` | button | 채점 진행 중 화면 |
| 196 | `AI 채점 중 일부 문제가 실패했어요` | heading | isFailed=true |
| 196 | `AI 채점이 진행 중입니다` | heading | isFailed=false |
| 199 | `강사가 확인하고 재채점을 진행할 예정입니다.` | body | isFailed=true |
| 201 | `채점이 완료되면 자동으로 리포트가 표시됩니다.` | body | isFailed=false |
| 205 | `보통 1~2분 내에 완료됩니다.` | body | 채점 진행 중 안내 |
| 213 | `{done}/{progress!.total} 문제 채점 완료` | dynamic | 복수형 없음. "문제 채점 완료" 접미 패턴 |
| 215 | `(실패 {progress!.failed})` | dynamic | 실패 건수 보간 |
| 262 | `대시보드` | nav | breadcrumb |
| 267 | `리포트` | nav | breadcrumb 현재 위치 |
| 273 | `제출일:` | label | toLocaleString("ko-KR") 동반 — format 이슈 |
| 274 | `toLocaleString("ko-KR")` | format | 제출일 날짜 포맷, 로케일 하드코딩 |
| 285 | `전체 점수: {reportData.overallScore}/100점` | dynamic | 점수 표시, "점" 단위어 |
| 291 | `채점이 아직 확정되지 않았습니다. 교수의 최종 확정 후 성적을 확인할 수 있습니다.` | body | gradesNotReleased |
| 301 | `채점 확정 대기중` | label | Badge |
| 309 | `평가 완료` | label | Badge |
| 318 | `문제를 불러올 수 없습니다.` | toast-error | empty questions |
| 327 | `객관식 {mcqQuestions.length}문항` | dynamic | 그룹 헤딩 + 문항 수 보간 |
| 330 | `{correctCount(mcqQuestions)}/{mcqQuestions.length} 정답` | dynamic | Badge, 정오답 집계 |
| 368 | `OX {oxQuestions.length}문항` | dynamic | 그룹 헤딩 |
| 371 | `{correctCount(oxQuestions)}/{oxQuestions.length} 정답` | dynamic | Badge |
| 411 | `서술형 {caseQuestions.length}문항` | dynamic | 그룹 헤딩 |
| 431 | `{score}점` | dynamic | Badge 개별 점수 |
| 441 | `내 AI 채팅 기록` | label | 서술형 채팅 기록 섹션 |
| 458 | `toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })` | format | 채팅 메시지 시간 포맷, 로케일 하드코딩 |
| 479 | `내 최종답변` | label | 서술형 최종 답안 |
| 487 | `제출된 답안이 없습니다.` | empty-state | 서술형 답안 없음 |
| 505 | `시험 정보` | heading | 하단 카드 제목 |
| 509 | `시험 코드:` | label | |
| 513 | `제출 일시:` | label | toLocaleString("ko-KR") 동반 — format 이슈 |
| 515 | `toLocaleString("ko-KR")` | format | 제출일시 포맷, 로케일 하드코딩 |

---

### app/admin/page.tsx
파일 요약: 관리자 대시보드 — 사용자 통계 카드, AI 비용 카드, 승인 대기 강사 목록, 사용자 검색/역할 변경.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 101 | `사용자 정보를 불러오는데 실패했습니다.` | toast-error | fetch 실패 |
| 124 | `AI 사용량 정보를 불러오는데 실패했습니다.` | toast-error | fetch 실패 |
| 161 | `역할 변경에 실패했습니다.` | toast-error | PATCH 실패 |
| 164 | `서버 오류가 발생했습니다.` | toast-error | catch 블록 |
| 195 | `사용자 정보를 불러오는데 실패했습니다.` | toast-error | queryError fallback |
| 220 | `toLocaleDateString("ko-KR", { year, month, day, hour, minute })` | format | 가입일 날짜 포맷, 로케일 하드코딩 |
| 233 | `로딩 중...` | body | 초기 로딩 스피너 |
| 242 | `관리자 대시보드` | heading | AdminShell title prop |
| 246 | `전체 사용자` | label | 통계 카드 제목 |
| 255 | `강사` | label | 통계 카드 제목 |
| 263 | `학생` | label | 통계 카드 제목 |
| 275 | `역할 미설정` | label | 통계 카드 제목 |
| 287 | `최근 7일 AI 비용` | label | AI 비용 카드 제목 |
| 298 | `최근 7일 AI 요청 수` | label | AI 요청 카드 제목 |
| 309 | `최근 7일 실패율` | label | AI 실패율 카드 제목 |
| 326 | `승인 대기 강사 ({pendingInstructors.length}명)` | dynamic | 복수형 없음, "명" 단위어 |
| 330 | `강사 승인 요청이 있습니다. 검토 후 승인해주세요.` | body | CardDescription |
| 346 | `이름 없음` | empty-state | instructor.name 없을 때 fallback |
| 349 | `신청일: {new Date(instructor.created_at).toLocaleDateString("ko-KR")}` | dynamic | format 이슈. 로케일 하드코딩 |
| 356 | `승인` | button | 강사 승인 버튼 |
| 369 | `사용자 관리` | heading | CardTitle |
| 370 | `사용자 목록을 검색하고 역할을 관리하세요` | body | CardDescription |
| 378 | `이메일 또는 이름으로 검색...` | placeholder | Input |
| 386 | `역할 필터` | placeholder | SelectValue |
| 390 | `모든 역할` | label | SelectItem |
| 391 | `강사` | label | SelectItem |
| 392 | `학생` | label | SelectItem |
| 402 | `새로고침` | button | |
| 411 | `검색 조건에 맞는 사용자가 없습니다.` | empty-state | |
| 444 | `강사` | label | Badge |
| 445 | `학생` | label | Badge |
| 446 | `미설정` | label | Badge (역할 없음) |
| 450 | `가입일: {formatDate(user.createdAt)}` | dynamic | format 이슈. ko-KR 포맷 함수 사용 |
| 462 | `강사` | label | SelectItem 역할 변경 |
| 463 | `학생` | label | SelectItem 역할 변경 |

---

### app/admin/layout.tsx
파일 요약: 관리자 레이아웃 래퍼 — 사용자 노출 텍스트 없음.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| (없음) | — | — | 텍스트 없음 |

---

### app/admin/login/page.tsx
파일 요약: 관리자 로그인 페이지 — 사용자명/비밀번호 폼.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 46 | `로그인에 실패했습니다.` | toast-error | 서버 응답 message/error 없을 때 fallback |
| 49 | `서버 오류가 발생했습니다.` | toast-error | catch 블록 |
| 65 | `관리자 로그인` | heading | CardTitle |
| 67 | `Quest-On 관리자 페이지에 접근하려면 로그인해주세요` | body | CardDescription |
| 73 | `사용자명` | label | Label htmlFor="username" |
| 79 | `관리자 사용자명을 입력하세요` | placeholder | Input |
| 85 | `비밀번호` | label | Label htmlFor="password" |
| 92 | `비밀번호를 입력하세요` | placeholder | Input |
| 118 | `로그인 중...` | button | isLoading=true |
| 119 | `로그인` | button | isLoading=false |

---

### app/admin/login/layout.tsx
파일 요약: 관리자 로그인 레이아웃 — 사용자 노출 텍스트 없음.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| (없음) | — | — | 텍스트 없음 |

---

### app/admin/ai-usage/page.tsx
파일 요약: AI 사용량 분석 페이지 — 필터, 요약 카드, 차트, 테이블, 이벤트 상세 다이얼로그.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 185 | `비용` | label | ChartConfig dailyChartConfig |
| 193 | `비용` | label | ChartConfig featureChartConfig |
| 244 | `AI 사용량 요약을 불러오는데 실패했습니다.` | toast-error | |
| 264 | `AI 사용량 상세를 불러오는데 실패했습니다.` | toast-error | |
| 289 | `AI 이벤트를 불러오는데 실패했습니다.` | toast-error | |
| 316 | `AI 사용량` | heading | AdminShell title prop |
| 319 | `필터` | heading | CardTitle |
| 321 | `기간과 feature/model/exam 기준으로 AI 비용과 이벤트를 확인합니다.` | body | CardDescription |
| 335 | `기간` | placeholder | SelectValue |
| 337 | `최근 7일` | label | SelectItem value="7d" |
| 338 | `최근 30일` | label | SelectItem value="30d" |
| 339 | `최근 90일` | label | SelectItem value="90d" |
| 351 | `Feature` | placeholder | SelectValue — 영문 그대로 |
| 354 | `모든 feature` | label | SelectItem value="all" — 한영 혼용 |
| 372 | `상태` | placeholder | SelectValue |
| 374 | `모든 상태` | label | SelectItem value="all" |
| 375 | `성공` | label | SelectItem value="success" |
| 376 | `에러` | label | SelectItem value="error" |
| 377 | `타임아웃` | label | SelectItem value="timeout" |
| 382 | `모델명 exact match` | placeholder | Input — 한영 혼용, 확인필요 |
| 390 | `시험 ID` | placeholder | Input |
| 398 | `세션 ID` | placeholder | Input |
| 417 | `새로고침` | button | |
| 430 | `초기화` | button | 필터 초기화 |
| 443 | `총 비용` | label | CardTitle |
| 452 | `총 요청` | label | CardTitle |
| 461 | `총 토큰` | label | CardTitle |
| 474 | `평균 비용/요청` | label | CardTitle |
| 495 | `실패율` | label | CardTitle |
| 505 | `p95 latency {summary?.totals.p95LatencyMs ?? 0}ms` | dynamic | 영문 기술용어 + 동적 값, 확인필요 |
| 514 | `일별 비용 추이` | heading | CardTitle |
| 515 | `선택한 기간 내 일별 비용 흐름입니다.` | body | CardDescription |
| 549 | `Feature별 비용` | heading | CardTitle — 한영 혼용 |
| 552 | `비용 상위 8개 feature를 표시합니다.` | body | CardDescription — 한영 혼용 |
| 578 | `모델별 집계` | heading | CardTitle |
| 580 | `모델별 요청 수와 비용입니다.` | body | CardDescription |
| 586 | `모델` | label | TableHead |
| 587 | `요청` | label | TableHead |
| 588 | `토큰` | label | TableHead |
| 589 | `비용` | label | TableHead |
| 610 | `시험별 집계` | heading | CardTitle |
| 612 | `시험 기준 비용 hotspot입니다.` | body | CardDescription — 한영 혼용 |
| 619 | `시험` | label | TableHead |
| 620 | `요청` | label | TableHead |
| 621 | `토큰` | label | TableHead |
| 622 | `비용` | label | TableHead |
| 653 | `세션별 집계` | heading | CardTitle |
| 655 | `선택한 시험 안에서 세션별 비용을 확인합니다.` | body | CardDescription |
| 661 | `세션` | label | TableHead |
| 662 | `요청` | label | TableHead |
| 663 | `토큰` | label | TableHead |
| 664 | `비용` | label | TableHead |
| 695 | `최근 이벤트` | heading | CardTitle |
| 697 | `raw AI 이벤트 목록입니다. 행을 클릭하면 request/response id와 metadata를 확인합니다.` | body | CardDescription — 한영 혼용 |
| 704 | `시간` | label | TableHead |
| 705 | `Feature` | label | TableHead — 영문 그대로 |
| 706 | `모델` | label | TableHead |
| 707 | `상태` | label | TableHead |
| 708 | `비용` | label | TableHead |
| 709 | `토큰` | label | TableHead |
| 710 | `지연` | label | TableHead |
| 743 | `이벤트가 없습니다.` | empty-state | TableCell colSpan=7 |
| 759 | `이전` | button | 페이지 이전 |
| 762 | `페이지 {page} / {totalPages}` | dynamic | 페이지네이션 |
| 769 | `다음` | button | 페이지 다음 |
| 781 | `AI 이벤트 상세` | heading | DialogTitle |
| 790 | `Feature` | label | 다이얼로그 필드 — 영문 그대로 |
| 794 | `모델` | label | 다이얼로그 필드 |
| 798 | `상태` | label | 다이얼로그 필드 |
| 802 | `지연 시간` | label | 다이얼로그 필드 |
| 806 | `Request ID` | label | 다이얼로그 필드 — 영문 그대로 |
| 811 | `Response ID` | label | 다이얼로그 필드 — 영문 그대로 |
| 816 | `Exam` | label | 다이얼로그 필드 — 영문 그대로 |
| 821 | `Session` | label | 다이얼로그 필드 — 영문 그대로 |
| 827 | `Input` | label | 토큰 섹션 — 영문 그대로 |
| 832 | `Output` | label | 토큰 섹션 — 영문 그대로 |
| 837 | `Total` | label | 토큰 섹션 — 영문 그대로 |
| 842 | `비용` | label | 토큰 섹션 |
| 852 | `Metadata` | label | 다이얼로그 필드 — 영문 그대로 |

---

### components/report/AssignmentQuizResult.tsx
파일 요약: 과제 타임어택 퀴즈 결과 카드 — 점수/문항수/정오답 표시.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 35 | `타임어택 퀴즈 결과` | heading | CardTitle |
| 41 | `점수 {quiz.score ?? 0}/100` | dynamic | Badge |
| 44 | `{quiz.total_questions}문항 · {quiz.time_limit_seconds}초` | dynamic | "문항", "초" 단위어 포함 |
| 48 | `완료: {new Date(quiz.submitted_at).toLocaleString("ko-KR")}` | dynamic | format 이슈. 로케일 하드코딩 |
| 74 | `정답` | label | Badge 정답 |
| 75 | `오답` | label | Badge 오답 |
| 79 | `선택:` | label | 학생이 선택한 보기 앞 레이블 |
| 82 | `무응답` | label | 선택 없을 때 |
| 86 | `정답:` | label | 정답 보기 앞 레이블 |
| 91 | `근거:` | label | rationale 앞 레이블 |

---

### components/report/ReportCardTemplate.tsx
파일 요약: PDF 출력용 성적 리포트 카드 템플릿 — 학생정보, 시험정보, 종합점수, AI 평가.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 49 | `A (최우수)` | label | getGrade() 반환값 |
| 50 | `B (우수)` | label | getGrade() 반환값 |
| 51 | `C (보통)` | label | getGrade() 반환값 |
| 52 | `D (노력 필요)` | label | getGrade() 반환값 |
| 53 | `F (재평가 필요)` | label | getGrade() 반환값 |
| 73 | `toLocaleString("ko-KR", { year, month(long), day, hour, minute })` | format | 제출일 포맷. "long" month 포함 — 영문화 시 로케일 분기 필요 |
| 113 | `Logo` | aria | img alt — 확인필요(영문이나 i18n 대상) |
| 131 | `평가 결과 리포트` | heading | 리포트 헤더 |
| 168 | `학생 정보` | heading | 학생 정보 섹션 h3 |
| 179 | `이름` | label | 학생 이름 레이블 |
| 200 | `학번` | label | |
| 220 | `학교` | label | |
| 247 | `제출일` | label | |
| 282 | `시험 정보` | heading | 시험 정보 섹션 h3 |
| 292 | `시험 코드` | label | |
| 313 | `설명` | label | |
| 325 | `설명 없음` | empty-state | examDescription 없을 때 |
| 354 | `종합 점수` | heading | |
| 367 | `{overallScore}점` | dynamic | "점" 단위어 |
| 399 | `CASE 종합 평가` | heading | aiSummary 섹션 — 영문 "CASE" 포함 |
| 432 | `주요 강점` | heading | aiSummary.strengths |
| 461 | `개선점` | heading | aiSummary.weaknesses |
| 494 | `AI 의존도 종합 평가` | heading | aiSummary.aiDependency |
| 558 | `문제별 상세 평가` | heading | Questions Detail 섹션 |
| 595 | `문제 {idx + 1}` | dynamic | 문항 번호 |
| 604 | `{grade.score}점` | dynamic | 문항별 점수 |
| 631 | `평가 코멘트` | heading | grade.comment 섹션 |
| 667 | `AI 평가` | heading | stage_grading 섹션 |
| 676 | `AI 대화 평가:` | label | stage_grading.chat — 보간 포함 |
| 693 | `최종 답안 평가:` | label | stage_grading.answer — 보간 포함 |
| 710 | `AI 의존도:` | label | ai_dependency — 보간 포함 |
| 723 | `문항 요약:` | label | ai_summary — 보간 포함 |
| 754 | `Quest-On 평가 리포트 \| 생성일: {new Date().toLocaleDateString("ko-KR")}` | dynamic | 푸터. format 이슈. 로케일 하드코딩 |

---

### components/report/StudentObjectiveAnswer.tsx
파일 요약: 객관식/OX 답안 표시 컴포넌트 — 정오답/미채점/무응답 Badge 표시.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 54 | `무응답` | label | Badge — 답변 없음 |
| 55 | `미채점` | label | Badge — 점수 없음 |
| 59 | `정답` | label | Badge — 정답 |
| 63 | `오답` | label | Badge — 오답 |
| 70 | `{score}점` | dynamic | 점수 표시 |
| 78 | `내 선택: {selectedAnswer}` | dynamic | 선택지 정보 없을 때 텍스트 출력 |
| 79 | `선택지 정보가 없습니다.` | empty-state | |
| 103 | `내 선택` | label | Badge — 선택한 보기 표시 |
| 120 | `선택한 답안이 없습니다.` | empty-state | |

---

### components/admin/AdminShell.tsx
파일 요약: 관리자 레이아웃 셸 — 사이드바, 모바일 시트, 헤더.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 63 | `Quest-On Logo` | aria | Image alt |
| 77 | `주요 네비게이션` | aria | nav aria-label |
| 131 | `메뉴` | heading | SheetTitle (sr-only) |

---

### components/admin/AdminSidebarFooter.tsx
파일 요약: 관리자 사이드바 하단 로그아웃 버튼.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 32 | `로그아웃` | aria | aria-label (collapsed) |
| 33 | `로그아웃` | aria | title (collapsed) |
| 45 | `로그아웃` | button | 텍스트 버튼 |

---

### components/agent/AgentFab.tsx
파일 요약: AI 에이전트 플로팅 버튼 — 데스크톱 우하단 고정.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 27 | `AI 에이전트 열기` | aria | button aria-label |

---

### components/agent/AgentPanel.tsx
파일 요약: AI 에이전트 패널 — idle/running/done/failed/cancelled 상태별 뷰, 입력 컴포저.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 66 | `AI 에이전트` | heading | SheetTitle (sr-only 모바일) |
| 67 | `AI 에이전트 패널` | aria | SheetDescription (sr-only) |
| 80 | `AI 에이전트 패널` | aria | div aria-label (데스크톱) |
| 163 | `실행 중` | label | PHASE_BADGE.running.label |
| 168 | `완료` | label | PHASE_BADGE.done.label |
| 172 | `실패` | label | PHASE_BADGE.failed.label |
| 176 | `중단됨` | label | PHASE_BADGE.cancelled.label |
| 199 | `AI 에이전트` | heading | 패널 헤더 |
| 201 | `시험 편집을 도와드립니다` | body | 헤더 서브텍스트 |
| 211 | `에이전트 패널 닫기` | aria | Button aria-label |
| 279 | `무엇을 도와드릴까요?` | heading | idle 뷰 안내 |
| 283 | `하고 싶은 작업을 자연어로 설명해 주세요. 에이전트가 직접 편집기를 조작하고, 그 과정을 여기에 단계별로 보여드립니다.` | body | idle 뷰 안내 |
| 295 | `예: 미적분 1단원 서술형 시험 5문항 만들어줘` | placeholder | Composer placeholder |
| 349 | `중단 중…` | body | stopping=true |
| 361 | `에이전트 실행 중 · ESC로 중단` | body | stopping=false |
| 372 | `에이전트 실행 중단` | aria | Button aria-label |
| 398 | `작업을 완료했습니다` | heading | done 뷰 |
| 410 | `새 작업 시작하기` | button | done 뷰 |
| 433 | `작업이 실패했습니다` | heading | failed 뷰 |
| 435 | `알 수 없는 오류가 발생했습니다.` | toast-error | failed 뷰 fallback |
| 442 | `새 작업 시작하기` | button | failed 뷰 |
| 464 | `작업이 중단되었습니다` | heading | cancelled 뷰 |
| 467 | `그때까지 진행된 단계는 위에 남아 있습니다. 새 작업을 시작할 수 있습니다.` | body | cancelled 뷰 |
| 474 | `새 작업 시작하기` | button | cancelled 뷰 |
| 519 | `전송` | aria | Composer 전송 버튼 aria-label |

---

### components/agent/AgentStepTimeline.tsx
파일 요약: AI 에이전트 실행 단계 타임라인 — stepType별 라벨, 진행 중 인디케이터.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 21 | `요청` | label | STEP_META.user_input.label |
| 22 | `계획` | label | STEP_META.plan.label |
| 23 | `자료 조회` | label | STEP_META.data_fetch.label |
| 24 | `분석` | label | STEP_META.analysis.label |
| 25 | `툴 실행` | label | STEP_META.tool_call.label |
| 26 | `초안 작성` | label | STEP_META.draft.label |
| 27 | `승인` | label | STEP_META.approval.label |
| 28 | `완료` | label | STEP_META.final.label |
| 88 | `에이전트가 작업 중…` | body | PendingRow, animate-pulse |
| 113 | `아직 단계가 없습니다.` | empty-state | steps=0, pending=false |

---

### components/agent/AgentRunController.tsx
파일 요약: 에이전트 실행 루프 오케스트레이터 — UI 미노출 로직 위주. 아래 항목만 사용자 노출 가능성 있음.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 192 | `강사가 작업을 중단했습니다.` | toast-error | 취소 시 action result error 메시지 — 서버에도 전달됨 |
| 222 | `페이지 이동에 실패했습니다.` | toast-error | navigate 실패 |
| 238 | `편집기가 준비되지 않았습니다. 시험 생성 페이지로 이동이 필요합니다.` | toast-error | executor 없음 |
| 257 | `액션 실행 중 오류가 발생했습니다.` | toast-error | executeAction catch |
| 318 | `에이전트 실행 중 오류가 발생했습니다.` | toast-error | drive() catch |
| 360 | `에이전트 실행을 시작하지 못했습니다.` | toast-error | startRun() catch |
| 418 | `useAgentRunController() 는 <AgentRunControllerProvider> 하위에서만 사용할 수 있습니다.` | toast-error | throw Error — 개발자 대상 메시지, 확인필요 |

---

### components/agent/AgentHighlight.tsx
파일 요약: 에이전트 포커스 링 오버레이 — 사용자 노출 텍스트 없음.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| (없음) | — | — | 텍스트 없음 |

---

### components/agent/AgentCursor.tsx
파일 요약: 에이전트 떠다니는 커서 — label prop은 외부에서 주입, 컴포넌트 자체 문자열 없음.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| (없음) | — | — | 텍스트 없음 (label은 prop으로 주입) |

---

### components/ui/error-alert.tsx
파일 요약: 공용 에러 알림 컴포넌트 — 재시도 버튼 선택적 포함.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 21 | `다시 시도` | button | onRetry prop 있을 때만 표시 |

---

### components/ui/loading-message.tsx
파일 요약: 로딩 메시지 순환 컴포넌트 — 타임아웃 경고 포함.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 19 | `작업이 지연되고 있습니다. 잠시만 더 기다려주세요...` | body | timeoutMessage 기본값 |
| 59 | `네트워크 상태에 따라 시간이 더 소요될 수 있습니다.` | body | isLongLoading=true 추가 안내 |

---

### components/ui/answer-textarea.tsx
파일 요약: 학생 답안 입력 textarea — 내부/외부 붙여넣기 감지 로직 포함.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 30 | `여기에 상세한 답안을 작성하세요...` | placeholder | 기본값 |

---

### components/ui/rich-text-editor.tsx
파일 요약: 풀 기능 리치 텍스트 에디터 — 테이블, 색상, 정렬 툴바 포함.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 47 | `여기에 입력하세요...` | placeholder | 기본값 |
| 258 | `테이블 삽입` | aria | Button title |
| 269 | `왼쪽에 열 추가` | aria | Button title |
| 279 | `오른쪽에 열 추가` | aria | Button title |
| 285 | `위에 행 추가` | aria | Button title |
| 291 | `← 열` | label | 열 추가 버튼 텍스트 — 방향 기호 |
| 295 | `열 →` | label | 열 추가 버튼 텍스트 — 방향 기호 |
| 297 | `↑ 행` | label | 행 추가 버튼 텍스트 — 방향 기호 |
| 301 | `행 ↓` | label | 행 추가 버튼 텍스트 — 방향 기호 |
| 304 | `아래에 행 추가` | aria | Button title |
| 310 | `열 삭제` | aria | Button title |
| 318 | `행 삭제` | aria | Button title |
| 326 | `테이블 삭제` | aria | Button title |

---

### components/ui/simple-rich-text-editor.tsx
파일 요약: 간소화 리치 텍스트 에디터 — 기본 서식/정렬 툴바.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 30 | `여기에 입력하세요...` | placeholder | 기본값 |
| 87 | `굵게 (Ctrl+B)` | aria | Button title — 단축키 표시 |
| 95 | `기울임 (Ctrl+I)` | aria | Button title — 단축키 표시 |
| 113 | `제목 1` | aria | Button title |
| 120 | `제목 2` | aria | Button title |
| 137 | `글머리 기호 목록` | aria | Button title |
| 145 | `번호 매기기 목록` | aria | Button title |
| 163 | `왼쪽 정렬` | aria | Button title |
| 171 | `가운데 정렬` | aria | Button title |
| 179 | `오른쪽 정렬` | aria | Button title |

---

### components/ui/sonner.tsx
파일 요약: Toast(react-hot-toast) 전역 Toaster 설정 — 사용자 노출 하드코딩 텍스트 없음. 아이콘 색상 및 지속 시간만 설정.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| (없음) | — | — | 텍스트 없음 |

---

### components/ProgressBar.tsx
파일 요약: 시험 진행 단계 표시바 — 대화/최종답안 2단계.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 14 | `대화` | label | step label |
| 15 | `문제 풀이 및 AI 도움` | label | step description |
| 19 | `최종답안` | label | step label |
| 20 | `답안 작성 및 제출` | label | step description |

---

### lib/error-messages.ts
파일 요약: HTTP 상태코드 및 영문 에러 메시지를 한국어로 변환하는 매핑 유틸 — UI로 반환되어 사용자에게 노출됨.

#### HTTP 상태코드 → 한국어 매핑 (12건)

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 10 | `잘못된 요청입니다` | toast-error | HTTP 400 |
| 11 | `인증이 필요합니다` | toast-error | HTTP 401 |
| 12 | `접근 권한이 없습니다` | toast-error | HTTP 403 |
| 13 | `요청한 리소스를 찾을 수 없습니다` | toast-error | HTTP 404 |
| 14 | `이미 존재하는 데이터입니다` | toast-error | HTTP 409 |
| 15 | `파일 크기가 너무 큽니다` | toast-error | HTTP 413 |
| 16 | `처리할 수 없는 요청입니다` | toast-error | HTTP 422 |
| 17 | `요청 횟수가 초과되었습니다` | toast-error | HTTP 429 |
| 18 | `서버 내부 오류가 발생했습니다` | toast-error | HTTP 500 |
| 19 | `서버 게이트웨이 오류가 발생했습니다` | toast-error | HTTP 502 |
| 20 | `서비스를 일시적으로 사용할 수 없습니다` | toast-error | HTTP 503 |
| 21 | `서버 응답 시간이 초과되었습니다` | toast-error | HTTP 504 |
| 24 | `서버 오류가 발생했습니다 (${status})` | dynamic | HTTP 알 수 없는 코드 fallback |

#### 영문 에러 문자열 → 한국어 매핑 (24건)

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 44 | `네트워크 연결 오류가 발생했습니다` | toast-error | "network error" 매핑 |
| 45 | `서버에 연결할 수 없습니다` | toast-error | "failed to fetch" 매핑 |
| 46 | `서버 연결이 거부되었습니다` | toast-error | "connection refused" 매핑 |
| 47 | `요청 시간이 초과되었습니다` | toast-error | "timeout" 매핑 |
| 50 | `인증이 필요합니다` | toast-error | "unauthorized" 매핑 |
| 51 | `접근 권한이 없습니다` | toast-error | "forbidden" 매핑 |
| 52 | `권한이 거부되었습니다` | toast-error | "permission denied" 매핑 |
| 53 | `인증에 실패했습니다` | toast-error | "authentication failed" 매핑 |
| 54 | `유효하지 않은 토큰입니다` | toast-error | "invalid token" 매핑 |
| 55 | `토큰이 만료되었습니다` | toast-error | "token expired" 매핑 |
| 58 | `데이터베이스 보안 정책 위반` | toast-error | "row-level security" 매핑 |
| 59 | `보안 정책 위반` | toast-error | "policy violation" 매핑 |
| 60 | `관련 데이터가 있어 삭제할 수 없습니다` | toast-error | "foreign key constraint" 매핑 |
| 61 | `이미 존재하는 데이터입니다` | toast-error | "unique constraint" 매핑 |
| 62 | `필수 항목이 누락되었습니다` | toast-error | "not null constraint" 매핑 |
| 63 | `데이터 유효성 검사에 실패했습니다` | toast-error | "check constraint" 매핑 |
| 66 | `파일 크기가 너무 큽니다` | toast-error | "file too large" 매핑 |
| 67 | `지원하지 않는 파일 형식입니다` | toast-error | "invalid file type" 매핑 |
| 68 | `파일 업로드에 실패했습니다` | toast-error | "upload failed" 매핑 |
| 69 | `파일 저장 중 오류가 발생했습니다` | toast-error | "storage error" 매핑 |
| 70 | `저장소를 찾을 수 없습니다` | toast-error | "bucket not found" 매핑 |
| 71 | `같은 이름의 파일이 이미 존재합니다` | toast-error | "file exists" 매핑 |
| 74 | `서버 내부 오류가 발생했습니다` | toast-error | "internal server error" 매핑 |
| 75 | `잘못된 요청입니다` | toast-error | "bad request" 매핑 |
| 76 | `요청한 리소스를 찾을 수 없습니다` | toast-error | "not found" 매핑 |
| 77 | `알 수 없는 오류가 발생했습니다` | toast-error | "unknown error" 매핑 |
| 78 | `작업에 실패했습니다` | toast-error | "operation failed" 매핑 |
| 79 | `참여한 학생이 있어 문항을 수정할 수 없습니다` | toast-error | "questions_locked" 매핑 |
| 82 | `인증 토큰 오류` | toast-error | "jwt" 매핑 |
| 83 | `유효하지 않은 인증 토큰입니다` | toast-error | "invalid jwt" 매핑 |
| 84 | `이미 존재하는 데이터입니다` | toast-error | "already exists" 매핑 |
| 85 | `중복된 데이터입니다` | toast-error | "duplicate key" 매핑 |

#### 부분 매핑 메시지 (5건)

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 97 | `저장에 실패했습니다` | toast-error | "failed to save" 포함 시 |
| 100 | `생성에 실패했습니다` | toast-error | "failed to create" 포함 시 |
| 103 | `수정에 실패했습니다` | toast-error | "failed to update" 포함 시 |
| 106 | `삭제에 실패했습니다` | toast-error | "failed to delete" 포함 시 |
| 109 | `불러오기에 실패했습니다` | toast-error | "failed to load" 포함 시 |

---

### lib/admin-navigation.ts
파일 요약: 관리자 사이드바 네비게이션 항목 정의.

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 12 | `대시보드` | nav | /admin 링크 |
| 17 | `AI 사용량` | nav | /admin/ai-usage 링크 |

---

### lib/date-utils.ts
파일 요약: KST 날짜 유틸 — `isoToKSTDateString` 함수 1개. 사용자 노출 문자열 없음. 포맷 이슈 기록.

| Line | 함수명 | 포맷 방식 | 비고 |
|------|------|------|------|
| 14 | `isoToKSTDateString(iso)` | UTC+9 오프셋 수동 계산 → `.toISOString().slice(0, 10)` → "YYYY-MM-DD" 반환 | 로케일 의존 없음. 반환값이 ISO 날짜 문자열이므로 영문화 시 로케일 분기 불필요. 단, 이 함수를 사용하는 UI 컴포넌트에서 표시 포맷을 별도로 적용하는 경우 해당 지점에서 로케일 분기 필요 — 함수 자체는 안전. |

---

## 특이사항 상세

1. **`toLocaleString("ko-KR")` / `toLocaleDateString("ko-KR")` 하드코딩 (format 이슈)**: 날짜/시간 포맷이 7개 지점에서 로케일 문자열로 직접 고정됨. 영문화 시 `new Intl.DateTimeFormat(locale, options)` 또는 `date-fns/locale` 분기로 교체 필요.
   - `app/(app)/student/report/[sessionId]/page.tsx` L274, L458, L515
   - `components/report/AssignmentQuizResult.tsx` L48
   - `components/report/ReportCardTemplate.tsx` L73, L754
   - `app/admin/page.tsx` L220
   - `app/admin/ai-usage/page.tsx` L146, L155 (`formatDateTime`, `formatCompactDate` 함수)

2. **한영 혼용 문자열**: `app/admin/ai-usage/page.tsx`에서 "모든 feature", "Feature별 비용", "비용 상위 8개 feature를 표시합니다.", "raw AI 이벤트 목록입니다. 행을 클릭하면 request/response id와 metadata를 확인합니다.", "시험 기준 비용 hotspot입니다.", "모델명 exact match", "p95 latency Nms" 등이 한영 혼용. 영문 기술 용어 처리 정책 결정 필요.

3. **단위어 어순 문제**: 한국어 "N점", "N문항", "N명", "N초" 형태가 다수. 영문화 시 "N points", "N questions", "N people", "N seconds"로 어순 역전 없이 처리 가능하나, 보간 위치 변경 필요.

4. **개발자 대상 throw 메시지 혼입**: `AgentRunController.tsx` L418 `useAgentRunController() 는 <AgentRunControllerProvider> 하위에서만 사용할 수 있습니다.` — 런타임 throw이나 사용자 화면에 노출될 가능성은 낮음. i18n 대상에서 제외 가능하나 확인 필요.

5. **`lib/error-messages.ts` 매핑 구조**: 영문 키 → 한국어 값 매핑이 37건. i18n 도입 시 이 파일 자체를 로케일별 분기로 재설계하거나, 키를 i18n 키로 전환하고 각 로케일 파일에 번역을 두는 방식으로 변경이 필요함.

6. **등급 라벨 영문화**: `ReportCardTemplate.tsx`의 `getGrade()` 함수 반환값 "A (최우수)" 등 5개 — 한국어 등급 설명이 괄호 안에 포함된 복합 형태. 영문화 시 "A (Excellent)" 등으로 교체.

7. **`CASE 종합 평가` 혼합 표현**: `ReportCardTemplate.tsx` L399 — 영문 "CASE"가 섹션 헤딩에 포함. 영문화 전략 결정 필요(대문자 그대로 유지 vs 번역).

8. **`AgentRunController.tsx` 에러 메시지 서버 전달**: L192 `강사가 작업을 중단했습니다.` 는 action result error 필드로 서버에도 전달되므로 영문화 시 서버 로그 영향 검토 필요.

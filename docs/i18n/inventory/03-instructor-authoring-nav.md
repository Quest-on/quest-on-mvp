# i18n Inventory — 03 강사 대시보드/저작/네비

## 요약
- 스캔 파일 수: 37
- 텍스트 보유 파일 수: 35
- 총 추출 문자열 수: 357
- 특이사항 개수: 18

---

## 파일별 상세

### app/(app)/instructor/page.tsx
파일 요약: 강사 홈 페이지 — dynamic import 로딩 상태 텍스트만 보유

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 12 | 강사 대시보드를 불러오는 중... | body | DashboardPageFallback title prop |
| 13 | 시험 목록과 폴더 구조를 순차적으로 준비하고 있습니다. | body | DashboardPageFallback description prop |

---

### app/(app)/instructor/layout.tsx
파일 요약: 강사 레이아웃 — 네비게이션 항목명, 로그인 유도 카드

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 35 | 대시보드 | nav | navigationItems[0].title |
| 41 | 새 시험 생성 | nav | navigationItems[1].title |
| 46 | 과제 만들기 | nav | navigationItems[2].title |
| 107 | 로그인이 필요합니다 | heading | CardTitle |
| 110 | 강사 페이지에 접근하려면 로그인해주세요 | body | |
| 118 | 강사로 로그인 | button | aria-label + 버튼 텍스트 |
| 166 | Quest-On | label | Image alt |

---

### app/(app)/instructor/new/page.tsx
파일 요약: 새 시험 생성 페이지 — 유효성 메시지, 다이얼로그, 배너

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 196 | 파일 용량이 50MB를 초과했습니다. 일부 파일이 비활성화됩니다. | toast-error | |
| 267 | 지원되지 않는 파일 형식입니다. PPT, PDF, 워드, 엑셀, 한글, 이미지 파일만 업로드 가능합니다. | toast-error | |
| 274 | 파일 크기가 50MB를 초과합니다. | toast-error | |
| 282 | 파일 용량이 초과되어 더 이상 파일을 추가할 수 없습니다. | toast-error | |
| 335 | 파일 용량이 초과되어 더 이상 파일을 추가할 수 없습니다. | toast-error | 드롭 핸들러 |
| 488 | 시험 제목을 입력해주세요 | label | submitReasons 배열 항목 |
| 489 | 시험 코드를 생성해주세요 | label | submitReasons 배열 항목 |
| 490 | 문제를 1개 이상 추가해주세요 | label | submitReasons 배열 항목 |
| 492 | 문제 내용을 입력해주세요 | label | submitReasons 배열 항목 |
| 495 | 파일 용량이 50MB를 초과했습니다 | label | submitReasons 배열 항목 |
| 499 | 객관식 문제의 선택지와 정답을 입력해주세요 | label | submitReasons 배열 항목 |
| 501 | 최종 점수 비중을 설정해주세요 | label | submitReasons 배열 항목 |
| 559 | 시험 생성에 실패했습니다 | toast-error | extractErrorMessage fallback |
| 591 | 시험 제목을 입력해주세요. | toast-error | |
| 594 | 시험 코드를 생성해주세요. | toast-error | |
| 605 | 문제를 입력해주세요. | toast-error | |
| 607 | {emptyQuestionIndices.join(", ")}번 문제가 비어있습니다. | toast-error | dynamic |
| 619 | {incompleteObjectiveIndices.join(", ")}번 객관식 문제의 선택지와 정답을 입력해주세요. | toast-error | dynamic |
| 625 | 파일 용량이 50MB를 초과했습니다. 일부 파일을 삭제해주세요. | toast-error | |
| 647 | 최소 1개 이상의 문제를 추가해주세요. | toast-error | |
| 650 | 최종 점수 비중을 설정해주세요. | toast-error | |
| 699 | 시험 생성 중 오류가 발생했습니다. 다시 시도해주세요. | toast-error | |
| 724 | 새로운 시험 만들기 | heading | h1 |
| 737 | 대시보드로 돌아가기 | button | aria-label |
| 740 | {isDemoMode ? "데모로 돌아가기" : "대시보드"} | button | dynamic |
| 744 | 문제와 설정으로 새로운 시험을 구성하세요 | body | |
| 757 | AI 에이전트가 시험을 작성하고 있습니다 | body | 에이전트 배너 |
| 760 | 에이전트가 제목과 문제를 직접 입력합니다. 직접 이어서 작성하려면 작업을 넘겨받으세요. | body | |
| 771 | 에이전트 작업 넘겨받기 | button | aria-label |
| 773 | 넘겨받기 | button | |
| 784 | 데모 모드로 체험 중입니다 | body | 데모 배너 |
| 787 | AI 문제 생성을 자유롭게 체험할 수 있지만, 실제 시험 출제를 위해서는 | body | |
| 791 | 회원가입 | button | 인라인 링크 버튼 |
| 793 | 이 필요합니다. | body | |
| 920 | 출제 완료 | heading | DialogTitle |
| 921 | 시험이 성공적으로 출제되었습니다. | body | DialogDescription |
| 927 | 시험 코드 | label | |
| 939 | 시험 코드가 복사되었습니다. | toast-error | toast.success |
| 943 | 복사 | button | |
| 948 | 이 코드를 학생들에게 공유하세요. | body | |
| 953 | 문제 {questions.length}개{examData.materials.length > 0 && \` · 자료 ${examData.materials.length}개\`} | dynamic | 보간 포함 |
| 954 | 시험 시간: {examData.duration === 0 ? "무제한 (과제형)" : \`${examData.duration}분\`} | dynamic | 조건부 |
| 966 | 확인 | button | |
| 979 | 회원가입이 필요합니다 | heading | DialogTitle |
| 981 | 시험을 출제하려면 회원가입이 필요합니다. | body | DialogDescription |
| 986 | 데모 모드에서는 실제로 시험을 출제할 수 없습니다. 회원가입을 하시면 전체 기능을 이용하실 수 있습니다. | body | |
| 994 | 닫기 | button | |
| 998 | 회원가입하기 | button | |
| 1007 | 이전 작업 복원 | heading | DialogTitle |
| 1009 | 저장되지 않은 이전 작업이 있습니다. 복원하시겠습니까? | body | DialogDescription |
| 1015 | 제목: {savedDraft.title} | dynamic | |
| 1017 | 문제 {savedDraft.questions.length}개 | dynamic | |
| 1020 | 저장 시각: {new Date(savedDraft.savedAt).toLocaleString("ko-KR")} | format | ko-KR 로케일 |
| 1026 | 새로 시작 | button | |
| 1029 | 복원하기 | button | |

---

### app/(app)/instructor/[examId]/page.tsx
파일 요약: 시험 상세/학생 목록 페이지 — 헤더, 필터, 배너, 상태 표시

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 134 | 일괄 채점 상태를 불러오지 못했습니다. | toast-error | fetch error fallback |
| 155 | 성적 공개 상태 변경에 실패했습니다. | toast-error | releaseGradesMutation fallback |
| 169 | 학생들에게 성적이 비공개됩니다. 계속하시겠습니까? | body | window.confirm |
| 170 | 학생들에게 성적이 공개됩니다. 계속하시겠습니까? | body | window.confirm |
| 255 | CASE AI 가채점 진행 중 | label | bulkCtaTitle |
| 257 | CASE AI 가채점 실패 | label | bulkCtaTitle |
| 259 | CASE 채점 결과 | label | bulkCtaTitle |
| 261 | CASE 제안 점수 생성 완료 | label | bulkCtaTitle |
| 262 | CASE AI 가채점하기 | label | bulkCtaTitle (기본값) |
| 264 | 백그라운드 가채점 중 · {bulkGradeProcessed}/{bulkGradeProgress.total}명 처리 | dynamic | bulkCtaDescription |
| 266 | 실패 원인을 확인하고 다시 채점을 시작할 수 있습니다 | body | bulkCtaDescription |
| 267 | 확정된 결과와 가채점 대화 기록을 확인합니다 | body | bulkCtaDescription |
| 270 | 제안 점수를 검토한 뒤 확정해주세요 | body | bulkCtaDescription |
| 271 | 강사의 자연어 기준으로 CASE 답안을 일괄 가채점합니다 | body | bulkCtaDescription |
| 273 | 진행 상황 보기 | button | bulkCtaButtonLabel |
| 275 | 결과/채팅 보기 | button | bulkCtaButtonLabel |
| 277 | 검토/확정 | button | bulkCtaButtonLabel |
| 279 | 다시 보기 | button | bulkCtaButtonLabel |
| 280 | 가채점 시작 | button | bulkCtaButtonLabel |
| 293 | 내보내기에 실패했습니다. | toast-error | handleDownload |
| 315 | 내보내기 중 오류가 발생했습니다. | toast-error | |
| 342 | 오류 발생 | heading | 에러 화면 h2 |
| 345 | {error \|\| "시험 데이터를 불러올 수 없습니다."} | body | |
| 348 | 시험 목록으로 돌아가기 | button | |
| 370 | Status: {exam.status \|\| "undefined"} \| Gate: ... | body | dev only |
| 395 | 모든 학생 채점을 완료해주세요 | body | TooltipContent |
| 419 | 모든 학생 채점을 완료해주세요 | body | TooltipContent (중복) |
| 455 | 시험 정보 | heading | Collapsible h3 |
| 457 | {exam.duration}분 &bull; {exam.code} | dynamic | format 포함 |
| 487 | 문제 보기 | heading | Collapsible h3 |
| 490 | {questionsCount}개 문제 | dynamic | |
| 491 | 문제 로딩 중... | body | |
| 518 | 학생 목록 | heading | h3 |
| 532 | 성적 공개중 | label | |
| 533 | 성적 비공개 | label | |
| 536 | 학생들이 점수와 응시 내용을 볼 수 있습니다 | body | |
| 537 | 학생들은 답안만 확인할 수 있습니다 | body | |
| 553 | 성적 비공개 | button | |
| 554 | 성적 공개 | button | |
| 589 | 학생 이름, 이메일, 학번, 학교로 검색... | placeholder | Input |
| 599 | 정렬 기준 | placeholder | SelectValue |
| 602 | 이름순 | label | SelectItem |
| 603 | 학번순 | label | SelectItem |
| 604 | 제출 빠른 순 | label | SelectItem |
| 605 | 채점 상태순 | label | SelectItem |
| 621 | 새로고침 | label | title 속성 |
| 628 | 총 {filteredAndSortedStudents.length}명 | dynamic | |
| 648 | 학생 목록을 불러오지 못했습니다 | body | 에러 상태 |
| 651 | 잠시 후 다시 시도해 주세요. | body | |
| 655 | 다시 시도 | button | |
| 660 | 표시할 학생이 없습니다. | empty-state | |
| 668 | # | label | 테이블 헤더 |
| 669 | 학생 | label | 테이블 헤더 |
| 670 | 객관식 | label | 테이블 헤더 |
| 671 | O/X | label | 테이블 헤더 |
| 672 | 서술 | label | 테이블 헤더 |
| 673 | 총점 | label | 테이블 헤더 |
| 674 | 제출일시 | label | 테이블 헤더 |
| 675 | 상태 | label | 테이블 헤더 |
| 676 | 액션 | label | 테이블 헤더 |

---

### app/(app)/instructor/[examId]/edit/page.tsx
파일 요약: 시험 편집 페이지 — 헤더, 유효성 메시지, 토스트

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 79 | 시험 데이터를 불러올 수 없습니다. | toast-error | fetch error |
| 98 | 시험 데이터를 불러오는 중 오류가 발생했습니다. | toast-error | |
| 132 | 파일 용량이 50MB를 초과했습니다. 일부 파일이 비활성화됩니다. | toast-error | |
| 159 | 지원되지 않는 파일 형식입니다. | toast-error | (simplified) |
| 163 | 파일 크기가 50MB를 초과합니다. | toast-error | |
| 171 | 파일 용량이 초과되어 더 이상 파일을 추가할 수 없습니다. | toast-error | |
| 196 | 파일 용량이 초과되어 더 이상 파일을 추가할 수 없습니다. | toast-error | 드롭 핸들러 |
| 233 | 파일 | body | getFileNameFromUrl fallback |
| 327 | 변경사항이 저장되었습니다. | body | toast.success |
| 330 | 시험 수정 중 오류가 발생했습니다. | toast-error | getErrorMessage fallback |
| 326 | 시험 수정에 실패했습니다 | toast-error | extractErrorMessage fallback |
| 340 | 시험 제목을 입력해주세요 | label | submitReasons |
| 342 | 문제를 1개 이상 추가해주세요 | label | submitReasons |
| 343 | 문제 내용을 입력해주세요 | label | submitReasons |
| 345 | 파일 용량이 50MB를 초과했습니다 | label | submitReasons |
| 349 | 객관식 문제의 선택지와 정답을 입력해주세요 | label | submitReasons |
| 351 | 최종 점수 비중을 설정해주세요 | label | submitReasons |
| 365 | 시험 데이터를 불러오는 중... | body | 로딩 스피너 |
| 383 | 대시보드 | button | 뒤로 가기 버튼 |
| 388 | {examData.title ? \`${examData.title} 편집\` : "시험 편집"} | heading | dynamic |
| 446 | 변경사항 저장 | button | submitButtonText prop |

---

### app/(app)/instructor/assignment/new/page.tsx
파일 요약: 새 과제 만들기 페이지

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 107 | 과제 제목을 입력해주세요 | label | fieldErrors |
| 108 | 제출 기한을 선택해주세요 | label | fieldErrors |
| 110 | 최소 1개 이상의 문제를 추가해주세요 | label | fieldErrors |
| 114 | 문제 내용을 입력해주세요 | label | fieldErrors |
| 114 | {emptyIndices.join(", ")}번 문제가 비어있습니다 | dynamic | fieldErrors |
| 88 | 과제 생성에 실패했습니다 | toast-error | extractErrorMessage fallback |
| 158 | 과제 생성 중 오류가 발생했습니다. | toast-error | |
| 180 | 새로운 과제 만들기 | heading | h1 |
| 181 | 대시보드 | button | |
| 186 | AI 리서치 채팅 기반 과제를 구성하세요 | body | |
| 244 | 취소 | button | |
| 245 | {isLoading ? "생성 중..." : "과제 출제하기"} | button | dynamic |
| 255 | 과제 생성 완료 | heading | DialogTitle |
| 256 | 과제가 성공적으로 생성되었습니다. | body | DialogDescription |
| 261 | 과제 코드 | label | |
| 264 | 과제 코드가 복사되었습니다. | body | toast.success |
| 265 | 복사 | button | |
| 268 | 이 코드를 학생들에게 공유하세요. | body | |
| 271 | 문제 {questions.length}개 | dynamic | |
| 272 | 제출 기한: {examData.deadline ? \`${examData.deadline} 23:59까지\` : "-"} | dynamic | format 포함 |
| 281 | 확인 | button | |

---

### app/(app)/instructor/assignment/[assignmentId]/page.tsx
파일 요약: 과제 대시보드 — 상태 배지, 학생 테이블, 일괄 채점 CTA

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 73 | 채점완료 | label | Badge |
| 77 | 마감 자동제출 | label | Badge |
| 81 | 제출완료 | label | Badge |
| 86 | 진행중 | label | Badge |
| 94 | 미제출 | label | Badge |
| 163 | 일괄 채점 상태를 불러오지 못했습니다. | toast-error | fetch error fallback |
| 201 | 과제 AI 가채점 진행 중 | label | bulkCtaTitle |
| 203 | 과제 AI 가채점 실패 | label | bulkCtaTitle |
| 205 | 과제 채점 결과 | label | bulkCtaTitle |
| 207 | 과제 제안 점수 생성 완료 | label | bulkCtaTitle |
| 208 | 과제 AI 가채점하기 | label | bulkCtaTitle (기본값) |
| 211 | 백그라운드 가채점 중 · {bulkGradeProcessed}/{bulkGradeProgress.total}명 처리 | dynamic | |
| 213 | 실패 원인을 확인하고 다시 채점을 시작할 수 있습니다 | body | |
| 215 | 확정된 결과와 가채점 대화 기록을 확인합니다 | body | |
| 217 | 제안 점수를 검토한 뒤 확정해주세요 | body | |
| 218 | 강사의 자연어 기준으로 학생 답안을 일괄 가채점합니다 | body | |
| 220 | 진행 상황 보기 | button | |
| 222 | 결과/채팅 보기 | button | |
| 224 | 검토/확정 | button | |
| 226 | 다시 보기 | button | |
| 227 | 가채점 시작 | button | |
| 280 | 오류 발생 | heading | |
| 281 | {error \|\| "과제 데이터를 불러올 수 없습니다."} | body | |
| 283 | 목록으로 돌아가기 | button | |
| 300 | 마감됨 | label | Badge |
| 307 | 진행중 | label | Badge |
| 313 | 예정 | label | Badge |
| 337 | 과제 코드: {exam.code} | body | |
| 354 | 참여한 학생이 있어 편집할 수 없습니다 | body | TooltipContent |
| 361 | 편집 | button | |
| 369 | 대시보드 | button | sm:hidden |
| 370 | 대시보드로 돌아가기 | button | hidden sm:inline |
| 385 | 과제 정보 | heading | Collapsible h3 |
| 390 | 클릭하여 복사 | label | title 속성 |
| 393 | 복사됨! | label | codeCopied 상태 |
| 413 | 과제 설명:  | label | |
| 422 | 설명:  | label | |
| 428 | 생성일: {new Date(exam.createdAt).toLocaleDateString("ko-KR")} | format | ko-KR |
| 443 | 문제 보기 | heading | Collapsible h3 |
| 447 | {questionsCount}개 문제 | dynamic | |
| 448 | 문제 로딩 중... | body | |
| 507 | 학생 이름, 이메일, 학번, 학교로 검색... | placeholder | |
| 519 | 정렬 기준 | placeholder | SelectValue |
| 521 | 제출 빠른 순 | label | SelectItem |
| 522 | 답안 길이 순 | label | SelectItem |
| 534 | 새로고침 | label | title 속성 |
| 546 | 학생 | label | 테이블 헤더 |
| 547 | 제출일시 | label | 테이블 헤더 |
| 548 | 점수 | label | 테이블 헤더 |
| 549 | 상태 | label | 테이블 헤더 |
| 550 | 액션 | label | 테이블 헤더 |
| 573 | 제출한 학생이 없습니다. | empty-state | |
| 590 | 총 {allStudents.length}명 | dynamic | |
| 591 | (채점완료: {gradedStudents.length}명) | dynamic | |
| 659 | {student.score}점 | dynamic | format |
| 695 | {student.isGraded ? "재채점" : "채점"} | button | dynamic |
| 648 | {new Date(student.submittedAt).toLocaleString("ko-KR", { month: "short", day: "numeric", ... })} | format | ko-KR 로케일 |

---

### app/(app)/instructor/assignment/[assignmentId]/edit/page.tsx
파일 요약: 과제 편집 페이지 — 로딩/차단/저장 상태 텍스트

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 74 | 과제 데이터를 불러올 수 없습니다. | toast-error | |
| 91 | 과제 데이터를 불러오는 중 오류가 발생했습니다. | toast-error | |
| 149 | 과제 제목을 입력해주세요 | label | fieldErrors |
| 150 | 제출 기한을 선택해주세요 | label | fieldErrors |
| 152 | 최소 1개 이상의 문제를 추가해주세요 | label | fieldErrors |
| 160 | 문제 내용을 입력해주세요 | label | fieldErrors |
| 161 | {emptyIndices.join(", ")}번 문제가 비어있습니다 | dynamic | |
| 202 | 과제 수정에 실패했습니다 | toast-error | extractErrorMessage fallback |
| 205 | 변경사항이 저장되었습니다. | body | toast.success |
| 210 | 과제 수정 중 오류가 발생했습니다. | toast-error | |
| 228 | 과제 데이터를 불러오는 중... | body | 로딩 스피너 |
| 238 | 편집 불가 | heading | blocked 화면 |
| 239 | 참여한 학생이 있어 과제를 편집할 수 없습니다. | body | |
| 245 | 과제 페이지로 돌아가기 | button | |
| 268 | 과제 페이지 | button | 뒤로 가기 |
| 271 | {examData.title ? \`${examData.title} 편집\` : "과제 편집"} | heading | dynamic |
| 378 | 취소 | button | |
| 381 | {isSaving ? "저장 중..." : "변경사항 저장"} | button | dynamic |

---

### components/layout/dashboard-sidebar.tsx
파일 요약: 사이드바 컴포넌트 — 섹션 라벨, 접기/확장, 기한 배지

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 74 | 기한 없음 | label | getTodoStyle 반환값 |
| 75 | D-DAY | label | getTodoStyle 반환값 |
| 76 | D-{daysLeft} | dynamic | 기한 D-카운터 포맷 |
| 100 | Quest-On Logo | aria | Image alt |
| 107 | Quest-On | label | 사이드바 서비스명 |
| 116 | {isCollapsed ? "사이드바 확장" : "사이드바 축소"} | aria | 토글 버튼 |
| 128 | MAIN | label | SidebarGroupLabel |
| 151 | TODO | label | SidebarGroupLabel |
| 155 | 미제출 과제 없음 | empty-state | |

---

### components/layout/mobile-bottom-nav.tsx
파일 요약: 모바일 하단 네비게이션

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 33 | AI 에이전트 | aria | aria-label |
| 55 | AI 에이전트 | nav | 탭 텍스트 |
| 64 | 하단 네비게이션 | aria | nav aria-label |

---

### components/layout/CenteredViewportShell.tsx
파일 요약: 레이아웃 쉘 — 텍스트 없음

(하드코딩 텍스트 없음)

---

### components/dashboard/DashboardPageFallback.tsx
파일 요약: 대시보드 로딩 폴백 — props로 받는 title/description 렌더 전용

(자체 하드코딩 텍스트 없음 — props로 전달받음)

---

### components/dashboard/FileTree.tsx
파일 요약: 파일 트리 컴포넌트 — 드래그 앤 드롭, 로딩, 에러

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 205 | 자기 자신의 하위 폴더로는 이동할 수 없습니다. | toast-error | |
| 228 | "{draggedNode.name}"이(가) "{targetNode.name}" 폴더로 이동되었습니다. | dynamic | toast.success — 조사 포함 특이사항 |
| 247 | 이동에 실패했습니다 | toast-error | extractErrorMessage fallback |
| 252 | 이동에 실패했습니다 | toast-error | getErrorMessage fallback |
| 324 | 로딩 중... | body | 하위 폴더 로딩 |
| 529 | 자기 자신의 하위 폴더로는 이동할 수 없습니다. | toast-error | root-level 중복 |
| 551 | "{draggedNode.name}"이(가) "{targetNode.name}" 폴더로 이동되었습니다. | dynamic | |
| 607 | 로딩 중... | body | |
| 615 | 폴더가 없습니다 | empty-state | |

---

### components/dashboard/SidebarFooter.tsx
파일 요약: 사이드바 하단 사용자 메뉴

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 72 | 프로필 | label | DropdownMenuItem |
| 78 | 설정 | label | DropdownMenuItem |
| 84 | 테마 | label | 드롭다운 내부 텍스트 |
| 92 | 로그아웃 | button | DropdownMenuItem |
| 107 | 프로필 메뉴 | aria | 접힌 상태 버튼 aria-label |
| 124 | {userRole === "instructor" ? "강사" : "학생"} | label | 역할 표시 |

---

### components/instructor/InstructorHomeClient.tsx
파일 요약: 강사 홈 클라이언트 — 폴더/시험 관리 대시보드 전체

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 127 | 전체 | label | EXAM_FILTER_OPTIONS |
| 128 | 시험 | label | EXAM_FILTER_OPTIONS |
| 129 | 과제 | label | EXAM_FILTER_OPTIONS |
| 130 | 마감 | label | EXAM_FILTER_OPTIONS |
| 131 | 진행 중 | label | EXAM_FILTER_OPTIONS |
| 143 | 파랑 | label | FOLDER_COLORS |
| 144 | 청록 | label | FOLDER_COLORS |
| 145 | 초록 | label | FOLDER_COLORS |
| 146 | 노랑 | label | FOLDER_COLORS |
| 147 | 빨강 | label | FOLDER_COLORS |
| 148 | 보라 | label | FOLDER_COLORS |
| 149 | 핑크 | label | FOLDER_COLORS |
| 150 | 회색 | label | FOLDER_COLORS |
| 208 | 서버 오류 ({response.status}): {response.statusText} | toast-error | dynamic |
| 212 | 폴더 내용을 불러오는데 실패했습니다. ({response.status}) | toast-error | dynamic |
| 255 | 브레드크럼을 불러오는데 실패했습니다. | toast-error | |
| 401 | 시험 코드가 없습니다. | toast-error | |
| 402 | 시험 코드가 복사되었습니다. | body | toast.success |
| 405 | 시험 코드를 복사하지 못했습니다. | toast-error | |
| 413 | 시험을 복사할 수 없습니다. | toast-error | |
| 434 | 시험 복사에 실패했습니다. | toast-error | |
| 441 | 시험이 복사되었습니다. | body | toast.success |
| 449 | 시험 복사에 실패했습니다. | toast-error | |
| 477 | 삭제되었습니다. | body | toast.success |
| 495 | 삭제에 실패했습니다. ({errorMsg}) | toast-error | dynamic (영문 fallback) |
| 497 | 삭제에 실패했습니다. | toast-error | |
| 510 | 삭제에 실패했습니다. ({errorMessage}) | toast-error | dynamic |
| 514 | 삭제에 실패했습니다. | toast-error | |
| 537 | 마감됨 | label | 과제 상태 배지 |
| 544 | 활성 | label | 과제 상태 배지 |
| 551 | 예정 | label | 과제 상태 배지 |
| 558 | 활성 | label | 시험 상태 배지 |
| 560 | 초안 | label | 시험 상태 배지 |
| 562 | 완료 | label | 시험 상태 배지 |
| 589 | 학생 {studentCount}명 | dynamic | renderStudentCount |
| 613 | 이름을 입력해주세요. | toast-error | handleUpdateNode |
| 639 | 이름이 변경되었습니다. | body | toast.success |
| 651 | 이름 변경에 실패했습니다 | toast-error | extractErrorMessage fallback |
| 660 | 이름 변경에 실패했습니다 | toast-error | getErrorMessage fallback |
| 700 | 색상 변경에 실패했습니다. | toast-error | |
| 705 | 색상 변경에 실패했습니다. | toast-error | |
| 717 | 메뉴 열기 | aria | DropdownMenuTrigger aria-label |
| 729 | 편집하기 | label | DropdownMenuItem |
| 735 | 색상 변경 | label | DropdownMenuSubTrigger |
| 769 | 시험 코드 | label | DropdownMenuItem |
| 777 | 복사본 | label | DropdownMenuItem |
| 791 | 삭제 | label | DropdownMenuItem |
| 805 | 그리드 보기 | aria | aria-label |
| 812 | 목록 보기 | aria | aria-label |
| 825 | 루트 | label | 브레드크럼 홈 |
| 855 | 폴더 | label | 로딩 섹션 헤더 |
| 878 | 시험 | label | 로딩 섹션 헤더 |
| 897 | 검색 결과가 없습니다. | empty-state | isFiltering |
| 900 | 아직 시험이나 폴더가 없습니다. | empty-state | |
| 903 | 다른 검색어를 시도해보세요. | body | |
| 905 | 새 폴더를 만들거나 시험을 생성해보세요. | body | |
| 924 | 새 폴더 | button | |
| 929 | 시험 만들기 | button | |
| 934 | 과제 만들기 | button | |
| 943 | + 새 폴더 | button | 폴더 카드 버튼 |
| 952 | 폴더 | label | 섹션 헤더 |
| 955 | {folderNodes.length}개 | dynamic | |
| 963 | 이전 폴더 보기 | aria | 캐러셀 이전 버튼 |
| 973 | 다음 폴더 보기 | aria | 캐러셀 다음 버튼 |
| 993 | 시험 / 과제 | label | 섹션 헤더 |
| 996 | {filteredExamNodes.length}개 | dynamic | |
| 1326 | 폴더 · {formatDate(node.updated_at)} | dynamic | format |
| 1336 | 마감: {formatDate(node.exams.deadline)} | dynamic | format |
| 1339 | {formatDate(node.created_at)} | format | |
| 1650 | · 폴더 | label | 리스트 뷰 |
| 1714 | · <Clock/> 마감: {formatDate(node.exams.deadline)} | dynamic | |
| 1717 | · 생성 {formatDate(node.created_at)} | dynamic | |
| 1754 | 안녕하세요, {profile?.fullName \|\| "강사"}님 | body | 인사말 — 조사 어순 주의 |
| 1765 | 새 항목 | button | |
| 1773 | 새 폴더 | label | DropdownMenuItem |
| 1779 | 새 시험 | label | DropdownMenuItem |
| 1784 | 새 과제 | label | DropdownMenuItem |
| 1793 | 시험 및 폴더 검색 | placeholder | |
| 1829 | 루트 | label | 브레드크럼 |
| 1877 | 폴더가 비어있습니다 | empty-state | FolderChildren |
| 1900 | 검색 결과가 없습니다. | empty-state | 조건부 |
| 1902 | 아직 시험이나 폴더가 없습니다. | empty-state | |
| 1904 | 다른 검색어를 시도해보세요. | body | |
| 1905 | 새 폴더를 만들거나 시험을 생성해보세요. | body | |
| 1952 | 폴더 | label | 섹션 헤더 |
| 1954 | {folderNodes.length}개 | dynamic | |
| 1993 | 시험 / 과제 | label | 섹션 헤더 |
| 1995 | {filteredExamNodes.length}개 | dynamic | |
| 2052 | 선택한 조건에 맞는 시험/과제가 없습니다. | empty-state | |
| 2054 | 시험/과제가 없습니다. | empty-state | |
| 2077 | {nodeToDelete?.kind === "exam" ? "시험 삭제" : "폴더 삭제"} | heading | AlertDialogTitle — dynamic |
| 2080 | 이 작업은 되돌릴 수 없습니다. | body | |
| 2083 | 계속하려면 시험 제목 "{nodeToDelete.name}"을(를) 아래에 입력하세요. | body | dynamic — 조사 어순 주의 |
| 2089 | "{nodeToDelete?.name}" 폴더를 삭제하시겠습니까? | body | dynamic |
| 2117 | 취소 | button | AlertDialogCancel |
| 2127 | 삭제 중... | button | 로딩 상태 |
| 2132 | 삭제 | button | AlertDialogAction |
| 2144 | 이름 편집 | heading | DialogTitle |
| 2146 | {nodeToEdit?.kind === "folder" ? "폴더 이름을 수정해주세요." : "이름을 수정해주세요."} | body | dynamic — DialogDescription |
| 2154 | {nodeToEdit?.kind === "folder" ? "폴더 이름" : "이름"} | label | dynamic — Label |
| 2162 | {nodeToEdit?.kind === "folder" ? "예: 2025-1학기" : "이름을 입력하세요"} | placeholder | dynamic |
| 2175 | 취소 | button | |
| 2188 | {isUpdating ? "저장 중..." : "저장"} | button | dynamic |

---

### components/instructor/SidebarFolderTree.tsx
파일 요약: 사이드바 폴더 트리

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 102 | 로딩 중... | body | 하위 아이템 로딩 |
| 113 | 비어 있음 | empty-state | |
| 155 | FOLDERS | label | SidebarGroupLabel |
| 164 | 로딩 중... | body | 루트 로딩 |
| 171 | 폴더 없음 | empty-state | |

---

### components/instructor/CaseQuestionGenerator.tsx
파일 요약: AI 문제 생성기 — 상태 메시지, 버튼, 에러, 프리뷰

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 97 | 시험 내용 분석 중... | body | getStageMessage "started" |
| 99 | 문제 생성 중 ({current}/{total})... | dynamic | getStageMessage "generating" |
| 100 | 문제 생성 중... | body | getStageMessage "generating" 단수 |
| 102 | 생성 완료! | body | getStageMessage "complete" |
| 104 | 준비 중... | body | getStageMessage default |
| 169 | {all.length}개 문제가 추가되었습니다. | dynamic | toast.success |
| 204 | {isAssignmentMode ? "과제 제목을 먼저 입력해주세요." : "시험 제목을 먼저 입력해주세요."} | toast-error | dynamic |
| 209 | 학생에게 시킬 리서치 주제를 입력해주세요. | toast-error | |
| 279 | {n}개 | label | SelectItem dynamic |
| 290 | 예: 국내 배달앱 3사의 최근 수익성 변화를 조사해오시오 | placeholder | assignment 모드 |
| 291 | 예: 한국 기업 사례 중심으로 1문제 만들어줘 | placeholder | exam 모드 |
| 305 | {isGenerating ? "생성 중" : "생성"} | button | dynamic |
| 315 | 생성 취소 | aria | X 버튼 aria-label |
| 329 | 업로드 자료 {extractionStatus?.size \|\| availableTexts.size}개를 참고합니다. | dynamic | |
| 352 | 과제 제목과 리서치 주제를 입력해야 생성할 수 있습니다. | body | isDisabled 안내 |
| 354 | 시험 제목을 먼저 입력해야 생성할 수 있습니다. | body | |
| 456 | {isAssignmentMode ? "AI 리서치 과제 생성" : "AI 사례형 문제 생성"} | heading | CardTitle dynamic |
| 459 | {generatedQuestions.length}개 생성됨 | dynamic | |
| 477 | 생성할 문제 수 | label | |
| 489 | {n}개 | label | SelectItem |
| 498 | {isAssignmentMode ? "학생에게 어떤 리서치를 시킬까요?" : "어떤 문제를 만들어드릴까요?"} | label | dynamic |
| 501 | (선택) | label | |
| 511 | 예: 국내 배달앱 3사의 최근 수익성 변화를 조사해오시오 | placeholder | |
| 512 | 예: 시장조사 과제, 한국 기업 사례 중심, 난이도 높게... | placeholder | |
| 529 | 업로드된 자료 {extractionStatus?.size \|\| availableTexts.size}개가 문제 생성에 활용됩니다. | dynamic | |
| 562 | (추출 실패) | label | |
| 599 | {isAssignmentMode ? "리서치 과제 생성하기" : "문제 생성하기"} | button | dynamic |
| 610 | 취소 | button | |
| 617 | {isAssignmentMode ? "과제 제목과 리서치 주제를 입력해야 과제를 생성할 수 있습니다." : "시험 제목을 먼저 입력해야 문제를 생성할 수 있습니다."} | body | dynamic |
| 660 | AI 생성 미리보기 | heading | |
| 663 | 생성 완료 시 자동으로 문제 목록에 추가됩니다. | body | |
| 391 | 생성 완료 시 문제 목록에 자동 추가됩니다. | body | variant=line |

---

### components/instructor/ExamCard.tsx
파일 요약: 시험 카드 컴포넌트 — 상태 배지, 버튼, 날짜 포맷

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 35 | 게시됨 | label | 상태 배지 |
| 42 | 임시저장 | label | 상태 배지 |
| 46 | {new Date(dateString).toLocaleDateString("ko-KR", {...})} | format | ko-KR |
| 77 | {exam.student_count \|\| 0}명 참여 | dynamic | |
| 93 | 복사 | button | hidden sm:inline |
| 99 | 보기 | button | |
| 106 | 편집 | button | |
| 113 | 삭제 | button | |
| 69 | {exam.duration}분 | dynamic | format |

---

### components/instructor/ExamControlButtons.tsx
파일 요약: 시험 시작/종료 컨트롤 버튼 및 모달

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 83 | 이름 없음 | label | 학생명 fallback |
| 145 | 시험이 시작되었습니다. | body | toast.success |
| 156 | 시험 시작에 실패했습니다. 다시 시도해주세요. | toast-error | |
| 162 | 시험 시작 중 오류가 발생했습니다. | toast-error | |
| 174 | 시험을 종료합니다. 백그라운드에서 AI 가채점이 곧 진행됩니다 | body | toast.success |
| 179 | 시험 종료에 실패했습니다. 다시 시도해주세요. | toast-error | |
| 185 | 시험 종료 중 오류가 발생했습니다. | toast-error | |
| 196 | 예약됨 | label | 상태 배지 |
| 204 | 시험 시작 | button | |
| 215 | 초안 | label | 상태 배지 |
| 223 | 시험 시작 | button | |
| 232 | 입장 가능 | label | 상태 배지 |
| 240 | 시험 시작 | button | |
| 249 | 진행 중 | label | 상태 배지 |
| 265 | 종료 중... | button | 로딩 |
| 269 | 시험 종료 | button | |
| 278 | 입장 마감 | label | 상태 배지 |
| 291 | 종료 중... | button | |
| 295 | 시험 종료 | button | |
| 304 | 종료됨 | label | 상태 배지 |
| 315 | {examStatus \|\| "알 수 없음"} | label | unknown 상태 fallback |
| 336 | 시험 시작 확인 | heading | AlertDialogTitle |
| 338 | 시험을 시작하시겠습니까? 시작하면 대기 중인 모든 학생의 시험이 동시에 시작됩니다. | body | AlertDialogDescription |
| 344 | 대기 중인 학생 ({(waitingStudents?.length ?? 0)}명) | dynamic | |
| 350 | 학생 목록 불러오는 중... | body | 로딩 스피너 |
| 358 | 학생 목록을 불러오지 못했습니다. 새로고침해주세요. | body | 에러 상태 |
| 386 | 대기 중인 학생이 없습니다. | empty-state | |
| 393 | 입장 마감 시간 (선택사항) | label | |
| 397 | 입장 마감 시간을 설정하세요 | placeholder | Input |
| 405 | 설정하지 않으면 입장 마감 시간이 없습니다. 이 시간 이후에는 새로운 학생이 입장할 수 없습니다. | body | |
| 408 | 주의사항: | label | |
| 411 | 시험 시작 후에는 되돌릴 수 없습니다. | body | li |
| 412 | 대기 중인 모든 학생의 타이머가 동시에 시작됩니다. | body | li |
| 413 | 시험 시간은 각 학생의 개별 타이머로 관리됩니다. | body | li |
| 419 | 취소 | button | AlertDialogCancel |
| 427 | 시작 중... | button | 로딩 |
| 431 | 시험 시작 | button | AlertDialogAction |
| 441 | 시험 종료 확인 | heading | AlertDialogTitle |
| 443 | 시험을 종료하시겠습니까? 이 작업은 되돌릴 수 없습니다. | body | AlertDialogDescription |
| 447 | ⚠️ 주의사항: | label | 이모지 포함 — 확인필요 |
| 449 | 진행 중인 모든 학생의 시험이 강제로 제출됩니다. | body | li, strong 포함 |
| 450 | 시험 종료 후에는 다시 시작할 수 없습니다. | body | li |
| 451 | 학생들이 작성 중인 답안도 마지막 저장 상태로 제출됩니다. | body | li |
| 452 | 이 작업은 되돌릴 수 없습니다. | body | li, strong 포함 |
| 457 | 취소 | button | AlertDialogCancel |
| 463 | 종료 중... | button | 로딩 |
| 470 | 시험 종료 | button | AlertDialogAction |

---

### components/instructor/ExamDetailHeader.tsx
파일 요약: 시험 상세 헤더 — 코드 표시, 대시보드/편집 버튼

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 24 | 시험 코드: {code} | body | dynamic |
| 32 | 대시보드 | button | sm:hidden |
| 33 | 대시보드로 돌아가기 | button | hidden sm:inline |
| 37 | 시험 편집 | button | |

---

### components/instructor/ExamDetailsCard.tsx
파일 요약: 시험 정보 카드

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 25 | 시험 코드가 복사되었습니다. | body | toast.success |
| 29 | 시험 코드를 복사하지 못했습니다. | toast-error | |
| 38 | 시험 정보 | heading | CardTitle |
| 42 | 설명 | label | |
| 46 | 시간 | label | |
| 48 | {duration}분 | dynamic | format |
| 52 | 생성일 | label | |
| 54 | {new Date(createdAt).toLocaleDateString()} | format | 로케일 미지정 — 확인필요 |
| 57 | 시험 코드 | label | |
| 65 | 복사 | button | |

---

### components/instructor/ExamInfoForm.tsx
파일 요약: 시험/과제 정보 폼 — 제목, 코드, 시간, 마감일, 언어

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 160 | {mode === "assignment" ? "과제 정보" : "시험 정보"} | heading | CardTitle dynamic |
| 161 | {mode === "assignment" ? "과제의 기본 세부사항" : "시험의 기본 세부사항"} | body | CardDescription dynamic |
| 167 | {mode === "assignment" ? "과제 제목" : "시험 제목"} | label | dynamic |
| 173 | 시험의 제목을 입력하세요. 예: "국제경영론 25-1 중간고사"와 같이 과목명과 시험 정보를 포함하면 좋습니다. | body | TooltipContent |
| 186 | 예) 국제경영론 25-1 중간고사 | placeholder | Input |
| 196 | {mode === "assignment" ? "과제 코드" : "시험 코드"} | label | dynamic |
| 202 | 학생들이 시험에 접속할 때 사용하는 고유 코드입니다. 자동으로 생성되며, 재생성 버튼을 눌러 변경할 수 있습니다. | body | TooltipContent |
| 220 | 재생성 | button | |
| 231 | AI 언어 | label | |
| 237 | AI 튜터 및 자동 채점이 사용할 언어를 선택합니다. 학생 UI에는 영향이 없습니다. 영어 강의/시험이면 English를 선택하세요. | body | TooltipContent |
| 252 | 한국어 (기본) | label | SelectItem |
| 253 | English | label | SelectItem |
| 262 | 제출 기한 | label | |
| 268 | 학생들이 과제를 제출해야 하는 마감 기한을 설정하세요. 선택한 날짜 23:59:59까지 제출 가능합니다. | body | TooltipContent |
| 283 | {deadline ? format(new Date(deadline), "PPP", { locale: ko }) : "날짜 선택"} | format | date-fns ko 로케일 — 확인필요 |
| 308 | 시험 시간 | label | |
| 314 | 학생들이 시험을 치르는 데 주어지는 시간을 설정하세요. 슬라이더를 조절하거나 직접 입력할 수 있습니다. 무제한으로 설정하면 시간 제한 없이 제출할 때까지 풀 수 있습니다. 최소 1분부터 최대 1440분(24시간)까지 설정 가능합니다. | body | TooltipContent |
| 334 | 시간 무제한 (과제형) | label | Checkbox 라벨 |
| 351 | {isUnlimited ? "무제한" : "분"} | placeholder | dynamic |
| 354 | 분 | label | |
| 390 | {time}분 | button | 빠른 선택 버튼 dynamic |
| 398 | 시험 시간은 최소 15분 이상이어야 합니다. | body | 경고 메시지 |

---

### components/instructor/ExamQuickActionsCard.tsx
파일 요약: 빠른 작업 카드 — 코드 복사

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 16 | 시험 코드가 복사되었습니다. | body | toast.success |
| 20 | 시험 코드를 복사하지 못했습니다. | toast-error | |
| 29 | 빠른 작업 | heading | CardTitle |
| 33 | 시험 코드 복사 | button | |

---

### components/instructor/ExamStudentCard.tsx
파일 요약: 학생 카드 컴포넌트 — 진행상황, 채점 버튼

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 93 | 제출: {new Date(student.submittedAt).toLocaleString("ko-KR", {...})} | format | ko-KR 로케일 |
| 107 | 객관식 | label | dt |
| 114 | O/X | label | dt |
| 119 | 서술 | label | dt |
| 125 | 총점 | label | dt |
| 141 | 실시간 보기 | button | |
| 155 | {student.overallStatus === "manually_graded" ? "재채점" : "채점"} | button | dynamic |

---

### components/instructor/ExamStudentCardSkeleton.tsx
파일 요약: 학생 카드 스켈레톤 — 텍스트 없음

(하드코딩 텍스트 없음)

---

### components/instructor/ExamStudentRow.tsx
파일 요약: 학생 행 컴포넌트 — 버튼, 날짜 포맷

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 148 | {new Date(student.submittedAt).toLocaleString("ko-KR", {...})} | format | ko-KR |
| 169 | 실시간 | button | |
| 184 | {student.overallStatus === "manually_graded" ? "재채점" : "채점"} | button | dynamic |

---

### components/instructor/FileUpload.tsx
파일 요약: 파일 업로드 카드 — 드래그, 상태 라벨

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 32 | 업로드 중... | label | status "uploading" |
| 40 | AI 분석 중... | label | status "extracting" |
| 48 | 완료 | label | status "done" |
| 55 | 실패 | label | status "failed" |
| 105 | 수업 자료 | heading | CardTitle |
| 112 | 시험 문제 작성을 위한 수업 자료를 업로드하세요. PPT, PDF, 워드, 엑셀, 한글, 이미지 파일을 지원하며, 최대 50MB까지 업로드 가능합니다. AI가 이 자료를 참고하여 문제를 생성합니다. | body | TooltipContent |
| 120 | PPT, PDF, 워드, 엑셀, CSV, 한글, 이미지 파일 (최대 50MB, 자동 압축) | body | CardDescription |
| 121 | {!canAddMoreFiles && " - 용량 초과로 추가 불가"} | dynamic | |
| 157 | 파일을 여기에 놓으세요 | body | isDragOver |
| 158 | 파일을 드래그하거나 클릭하여 선택 | body | 기본 상태 |
| 166 | 업로드된 파일: | label | |
| 167 | 총 용량: {(totalSize / 1024 / 1024).toFixed(1)}MB / 50MB | dynamic | format |
| 182 | (기존 파일) | label | |
| 249 | (용량 초과로 비활성화) | label | |

---

### components/instructor/GeneratedQuestionCard.tsx
파일 요약: AI 생성 문제 카드 — 프리셋, 액션 버튼, 토스트

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 28 | 더 어렵게 | button | BASE_PRESETS |
| 29 | 더 쉽게 | button | BASE_PRESETS |
| 30 | 더 길게 | button | BASE_PRESETS |
| 31 | 보기 추가 | button | BASE_PRESETS |
| 36 | 더 어렵게 | button | ASSIGNMENT_PRESETS |
| 37 | 더 쉽게 | button | ASSIGNMENT_PRESETS |
| 38 | 더 구체적으로 | button | ASSIGNMENT_PRESETS |
| 84 | 이 리서치 과제를 한국어로 번역해주세요. | body | langPreset instruction (hidden) |
| 85 | 이 문제를 한국어로 번역해주세요. 시나리오와 질문 모두 한국어로 작성해주세요. | body | langPreset instruction (hidden) |
| 84 | 이 리서치 과제를 영어로 번역해주세요. | body | langPreset instruction (hidden) |
| 85 | 이 문제를 영어로 번역해주세요. 시나리오와 질문 모두 영어로 작성해주세요. | body | langPreset instruction (hidden) |
| 84 | 한국어로 | button | langPreset label |
| 84 | 영어로 | button | langPreset label |
| 114 | AI 생성 미리보기 {index + 1} | heading | dynamic |
| 115 | 미리보기 | label | |
| 147 | 접기 | button | 접힌 상태 |
| 153 | 더 보기 | button | 펼쳐진 상태 |
| 179 | "{preset.label}" 수정이 적용되었습니다. | dynamic | toast.success |
| 182 | 수정에 실패했습니다. | toast-error | |
| 213 | AI로 문제 다듬기 | button | |
| 221 | 재생성 | button | |
| 239 | 재생성 중... | body | 오버레이 |
| 240 | 삭제 | label | TooltipContent |
| 108 | 재생성 중... | body | 오버레이 텍스트 |

---

### components/instructor/QuestionAdjustSheet.tsx
파일 요약: AI 문제 수정 사이드 시트 — 프리셋, 채팅, 적용

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 23 | 더 어렵게 | button | PRESETS |
| 24 | 더 쉽게 | button | PRESETS |
| 25 | 더 구체적으로 | button | PRESETS |
| 26 | 더 길게 | button | PRESETS |
| 30 | 더 어렵게 | button | ASSIGNMENT_PRESETS |
| 31 | 더 쉽게 | button | ASSIGNMENT_PRESETS |
| 32 | 더 구체적으로 | button | ASSIGNMENT_PRESETS |
| 33 | 더 길게 | button | ASSIGNMENT_PRESETS |
| 126 | {generationMode === "research-assignment" ? "AI로 과제 생성" : "AI 수정"} | heading | SheetTitle dynamic |
| 131 | 원하는 O·X 문제를 한 문장으로 적어주세요. 문장과 정답을 AI가 만들어 줍니다. | body | emptyHint (true-false) |
| 132 | 원하는 객관식 문제를 한 문장으로 적어주세요. 문제·선택지·정답을 AI가 만들어 줍니다. | body | emptyHint (multiple-choice) |
| 133 | 원하는 문제를 한 문장으로 적어주세요. | body | emptyHint (essay) |
| 135 | "재귀 함수에 대한 O·X 문제를 만들어줘" | body | emptyExample (true-false) |
| 136 | "다형성 개념을 묻는 사지선다 문제를 만들어줘" | body | emptyExample (multiple-choice) |
| 138 | "난이도는 유지하고, 사례를 한국 기업으로 바꿔줘" | body | emptyExample (essay) |
| 140 | 예: 상속 개념을 묻는 O·X 문제 | placeholder | true-false |
| 141 | 예: 다형성 개념을 묻는 사지선다 문제 | placeholder | multiple-choice |
| 142 | 예: 난이도는 유지하고, 사례를 한국 기업으로 바꿔줘 | placeholder | essay |
| 191 | 현재 문제 | label | 미리보기 토글 |
| 249 | 수정된 문제 미리보기 | body | CollapsibleTrigger |
| 281 | 이 버전이 적용되었습니다. | body | toast.success |
| 283 | {appliedIdx === idx ? "적용됨" : "이 버전 적용"} | button | dynamic |
| 93 | 정답 | label | OptionPreview 배지 |
| 319 | "{preset.label}" 적용됨 | dynamic | toast.success |
| 322 | 수정에 실패했습니다. | toast-error | |

---

### components/instructor/QuestionEditor.tsx
파일 요약: 문제 편집기 — 유형 라벨, 선택지, 액션 버튼

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 33 | 사지선다 | label | QUESTION_TYPE_LABELS |
| 34 | O·X | label | QUESTION_TYPE_LABELS |
| 35 | 사례형 | label | QUESTION_TYPE_LABELS |
| 36 | 단답형 | label | QUESTION_TYPE_LABELS |
| 106 | 선택지를 입력하고 정답을 표시하세요. | body | OptionEditor |
| 110 | 정답 선택지 | aria | radiogroup aria-label |
| 129 | {idx + 1}번 선택지를 정답으로 표시 | aria | 라디오 버튼 dynamic |
| 147 | 선택지 {idx + 1} | placeholder | Input dynamic |
| 149 | {idx + 1}번 선택지 내용 | aria | Input dynamic |
| 202 | {isEmpty ? "AI 생성" : "AI 수정"} | button | variant=line dynamic |
| 220 | 문제 삭제 | label | TooltipContent |
| 229 | 문제를 입력하세요 | placeholder | RichTextEditor (line variant) |
| 258 | 문제 출제 중 | label | card variant 상태 텍스트 |
| 278 | {isEmpty ? "AI 생성" : "AI 수정"} | button | card variant dynamic |
| 290 | 문제 삭제 | label | TooltipContent |
| 301 | {isEmpty ? "AI로 문제를 생성하세요" : "AI로 문제, 선택지, 정답을 수정"} | body | dynamic |
| 313 | {mode === "assignment" ? "과제 문제를 입력하세요." : "시험 문제를 입력하세요."} | body | TooltipContent dynamic |
| 322 | 여기에 문제를 입력하세요... | placeholder | card variant RichTextEditor |

---

### components/instructor/QuestionNavigation.tsx
파일 요약: 문제 네비게이션 — 유형별 탭, 채점 배지

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 35 | 사지선다 | label | getTypePrefix |
| 36 | OX | label | getTypePrefix |
| 37 | CASE | label | getTypePrefix (영문) — 확인필요 |
| 67 | 모두 | label | FILTER_TABS |
| 68 | 사지선다 | label | FILTER_TABS |
| 69 | OX | label | FILTER_TABS |
| 70 | Case | label | FILTER_TABS (대문자 시작 영문) — 확인필요 |
| 89 | 문제를 불러올 수 없습니다. | body | 에러 상태 |
| 168 | {grade.score \|\| 0}점 | dynamic | format |

---

### components/instructor/QuestionPromptCard.tsx
파일 요약: 문제 프롬프트 카드 — 문제 표시

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 32 | 문제 {questionNumber} | heading | CardTitle dynamic |
| 41 | AI 컨텍스트: | label | |
| 49 | ❌ 문제를 불러올 수 없습니다. | body | 이모지 포함 — 확인필요 |
| 51 | 선택된 문제 인덱스: {questionNumber - 1} | body | dynamic (개발용?) |

---

### components/instructor/QuestionSkeletonCard.tsx
파일 요약: 문제 스켈레톤 카드

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 13 | 문제 {index + 1} | heading | dynamic |

---

### components/instructor/QuestionsList.tsx
파일 요약: 문제 직접 작성 리스트 카드

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 94 | 수정에 실패했습니다. | toast-error | handleAdjust |
| 129 | 문제 직접 작성 | heading | CardTitle |
| 131 | {questions.length}개 | dynamic | |
| 150 | {mode === "assignment" ? "과제 문제를 입력하세요" : "시험 문제를 입력하세요"} | body | dynamic |
| 158 | 문제 추가 | button | |
| 184 | 위로 이동 | aria | aria-label |
| 196 | 아래로 이동 | aria | aria-label |
| 217 | 아직 문제가 없습니다 | empty-state | |
| 224 | 첫 문제 추가하기 | button | |

---

### components/instructor/QuestionsListCard.tsx
파일 요약: 문제 목록 카드 (시험 상세 뷰)

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 26 | 문제 ({questions.length}) | heading | CardTitle dynamic |
| 27 | 시험 문제 검토 및 편집 | body | CardDescription |
| 33 | 등록된 문제가 없습니다. | empty-state | |
| 39 | 문제 {index + 1} | heading | dynamic |
| 42 | 서술형 | label | 유형 배지 |
| 44 | 단답형 | label | 유형 배지 |
| 46 | 객관식 | label | 유형 배지 |

---

### components/instructor/QuickActionsCard.tsx
파일 요약: 빠른 작업 카드 (PDF 다운로드)

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 167 | 평가가 완료되지 않았습니다. | body | alert() — 확인필요 (alert 사용) |
| 182 | 리포트 데이터를 불러올 수 없습니다. | body | Error.message |
| 192 | PDF 템플릿을 찾을 수 없습니다. | body | Error.message |
| 230 | {dataToUse.exam.title \|\| "시험"}_${dataToUse.studentName \|\| "학생"}_리포트카드.pdf | dynamic | 파일명 format |
| 237 | PDF 생성 중 오류가 발생했습니다. | body | alert() |
| 249 | 빠른 작업 | heading | CardTitle |
| 259 | 생성 중... | button | downloading 상태 |
| 265 | PDF 다운로드 | button | |

---

### components/instructor/SimpleExamAuthoringForm.tsx
파일 요약: 시험 저작 폼 (주요 UI) — 섹션 라벨, 유형 선택, 채점 설정

> 2026-08-12 (#197 / PR #202): 평문 Field 나열이 4개 Card 그룹(시험 정보/수업 자료/문제/채점)으로 재구성됐다.
> 아래 표의 Line 번호와 "Field label/helper" 비고는 재구성 이전 기준이고, 문자열 자체는 그대로 유효하다
> (helper 문구는 SubField 의 HelpCircle 툴팁 또는 CardDescription 으로 이동).

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 121 | 업로드 중 | label | getStatusText "uploading" |
| 122 | 분석 중 | label | getStatusText "extracting" |
| 123 | 완료 | label | getStatusText "done" |
| 124 | 실패 | label | getStatusText "failed" |
| 125 | 대기 | label | getStatusText default |
| 193 | 사지선다 | label | QUESTION_TYPE_OPTIONS |
| 194 | 4지선다 객관식 | body | description |
| 196 | O·X | label | QUESTION_TYPE_OPTIONS |
| 197 | 참·거짓 O/X | body | description |
| 198 | 사례형 | label | QUESTION_TYPE_OPTIONS |
| 199 | 서술형 사례 | body | description |
| 201 | 사지선다 | label | SCORE_BUCKET_LABELS |
| 202 | O/X | label | SCORE_BUCKET_LABELS |
| 203 | 사례형 | label | SCORE_BUCKET_LABELS |
| 388 | 일부 문제 생성에 실패했습니다. 다시 시도해주세요. | toast-error | |
| 413 | AI 문제 생성 전에 시험 제목을 입력해주세요. | toast-error | |
| 706 | 시험 제목 | label | Field label |
| 708 | 학생이 입장 화면과 결과지에서 보게 될 이름입니다. | body | Field helper |
| 713 | 시험 제목 | aria | aria-label |
| 717 | 예) 국제경영론 25-1 중간고사 | placeholder | |
| 726 | 시험 코드 | label | Field label (편집 모드) |
| 728 | 학생이 시험에 입장할 때 사용하는 코드입니다. 변경 시 학생들에게 새 코드를 알려주세요. | body | Field helper |
| 734 | 시험 코드 | aria | aria-label |
| 740 | 재생성 | button | |
| 753 | 시험 시간 | label | Field label |
| 755 | 응시 제한 시간입니다. 무제한으로 두면 과제형으로 출제됩니다. | body | Field helper |
| 767 | {isUnlimited ? "무제한" : "60"} | placeholder | dynamic |
| 771 | 분 | label | |
| 803 | 무제한 | label | Switch 라벨 |
| 810 | 출제하려면 15분 이상으로 설정하세요. | body | 경고 |
| 820 | 수업 자료 | label | Field label |
| 822 | 업로드하면 AI가 자료를 근거로 문제를 만듭니다. | body | Field helper |
| 853 | 파일을 여기에 놓으세요 | body | isDragOver |
| 857 | 파일을 드래그하거나 클릭하여 선택 | body | |
| 860 | PPT · PDF · 워드 · 엑셀 · CSV · 한글 · 이미지 (최대 50MB) | body | |
| 877 | {name} 삭제 | aria | 기존 파일 삭제 버튼 dynamic |
| 921 | {file.name} 삭제 | aria | 새 파일 삭제 버튼 dynamic |
| 930 | {(totalSize / 1024 / 1024).toFixed(1)}MB / 50MB | dynamic | format |
| 939 | AI 응답 언어 | label | Field label |
| 941 | 학생이 시험 중 AI 튜터와 대화할 때 사용할 언어입니다. | body | Field helper |
| 950 | 한국어 AI | label | SelectItem |
| 951 | English AI | label | SelectItem |
| 958 | 문제 | label | Field label |
| 960 | {questions.length > 0 ? \`${questions.length}개 작성됨\` : "최소 1개 이상 필요합니다."} | dynamic | Field helper |
| 985 | 위로 이동 | aria | aria-label |
| 995 | 아래로 이동 | aria | aria-label |
| 1029 | {questions.length === 0 ? "첫 문제 추가" : "문제 추가"} | button | dynamic |
| 1032 | 직접 작성하거나 AI로 생성하세요 | body | |
| 1039 | 최종 점수 비중 | label | Field label |
| 1042 | 유형별 배점을 직접 정하세요. 합계는 자유이며 최종 점수는 100점 만점으로 환산됩니다. 같은 유형 안의 문항은 동일하게 나눠 계산됩니다. | body | Field helper |
| 1047 | {scoreWeights && presentScoreBuckets.length > 0 ? "유형별 배점을 자유롭게 정할 수 있습니다." : "문항을 추가하면 문제 유형별 점수 배분이 자동으로 설정됩니다."} | body | dynamic |
| 1057 | 균등 재분배 | button | |
| 1103 | 현재 문제 유형이 하나뿐이라 전체 점수를 이 유형에 배정합니다. | body | |
| 1129 | {scoreBucketCounts[bucket]}문항{perQuestionScore !== null ? \` · 문항당 ${formatScoreValue(perQuestionScore)}점\` : ""} | dynamic | format |
| 1141 | {SCORE_BUCKET_LABELS[bucket]} 비중 | aria | Slider dynamic |
| 1157 | {SCORE_BUCKET_LABELS[bucket]} 비중 | aria | Input dynamic |
| 1159 | % | label | |
| 1172 | 저장된 비중이 현재 문제 구성과 맞지 않습니다. {error} | body | dynamic |
| 1182 | 현재 문제 기준으로 복구 | button | |
| 1196 | 채점 비중 | label | Field label |
| 1198 | AI 대화 과정과 최종 답안을 채점에 반영하는 비율입니다. 비워두면 기본값 50:50으로 채점됩니다. | body | Field helper |
| 1202 | 대화 {effectiveWeight}% / 최종 답안 {100 - effectiveWeight}% | dynamic | format |
| 1210 | 조정 | button | |
| 1225 | 직접 설정 | label | Switch 라벨 |
| 1249 | {formReady ? "출제 가능" : "확인 필요"} | label | 상태 Badge dynamic |
| 1251 | {durationBadgeLabel} | dynamic | |
| 1252 | 문제 {questions.length}개 | dynamic | |
| 1253 | {materialSummary} | dynamic | materialSummary 포함 |
| 1267 | 취소 | button | |
| 1272 | {isSubmitting ? (submitButtonText ? "저장 중..." : "출제 중...") : (submitButtonText ?? "출제하기")} | button | dynamic — 조건 복잡 |
| 1307 | 문제 추가 | heading | DialogTitle |
| 1308 | 추가할 문제 유형을 선택하세요. | body | DialogDescription |
| 1314 | 개수 | label | |
| 1343 | 어떤 문제를 만들고 싶은지 입력하세요 | label | |
| 1345 | (비워두면 빈 문제 추가) | label | |
| 1350 | 예: AI 기술이 의료 산업에 미치는 영향을 분석하는 문제 | placeholder | |
| 1365 | 생성 중... | button | AI 생성 중 |
| 1371 | AI로 {pickedCount}개 생성 | button | dynamic |
| 1374 | 추가 | button | 직접 추가 |
| 500 | 자료 없음 | label | materialSummary 계산 |
| 506 | {files.length}개 중 {failed}개 실패 | dynamic | |
| 507 | {files.length}개 분석 중 | dynamic | |
| 509 | {files.length}개 준비됨 | dynamic | |

---

### components/instructor/FinalAnswerCard.tsx
파일 요약: 최종 답안 카드 — 붙여넣기 감지, 표시

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 309 | 최종 답안 | heading | CardTitle |
| 311 | 학생이 작성한 최종답안입니다 | body | CardDescription |
| 325 | 아직 작성되지 않음 | empty-state | |
| 345 | 최종 답안 | heading | CardTitle |
| 365 | 외부 붙여넣기 {suspiciousLogs.length}건 | dynamic | Badge |
| 359 | 내부 복사 {internalLogs.length}건 | dynamic | Badge |
| 366 | 학생이 제출한 최종 답안입니다 | body | CardDescription |
| 375 | 부정행위 의심 활동 감지 | body | 경고 패널 heading |
| 381 | • {log.length.toLocaleString()}자 외부 붙여넣기 ({new Date(log.timestamp).toLocaleString("ko-KR", {...})}) | dynamic | format — ko-KR + toLocaleString |
| 399 | 내부 복사 활동 | body | 안내 패널 heading |
| 404 | • {log.length.toLocaleString()}자 내부 복사 ({new Date(log.timestamp).toLocaleString("ko-KR", {...})}) | dynamic | format |
| 424 | 외부 복사 | label | 범례 |
| 428 | 내부 복사 (AI 답변) | label | 범례 |
| 433 | 붙여넣기 후 수정됨 | label | 범례 |
| 448 | 답안이 없습니다. | empty-state | dangerouslySetInnerHTML fallback |
| 455 | 제출된 답안이 없습니다. | empty-state | |
| 93 | 붙여넣기 후 수정됨 | label | applyPositionFallback title 속성 |

---

## 특이사항 목록

1. **조사 어순 문제** — `"이(가)"`, `"을(를)"` 사용 (FileTree.tsx L228, InstructorHomeClient.tsx L2083): 영문화 시 단순 치환 불가, 문장 구조 재설계 필요
2. **인사말 어순** — `"안녕하세요, {name}님"` (InstructorHomeClient.tsx L1754): 영문에서 "Hello, {name}!" 어순 상이
3. **ko-KR 로케일 하드코딩** — `toLocaleString("ko-KR")`, `toLocaleDateString("ko-KR")` 다수 파일: i18n 시 로케일 파라미터 동적화 필요
4. **date-fns `ko` 로케일** — ExamInfoForm.tsx L283: `format(date, "PPP", { locale: ko })` — 날짜 포맷 문자열도 로케일 대응 필요
5. **ExamDetailsCard.tsx L54** — `toLocaleDateString()` 로케일 미지정: 브라우저 기본값 의존, 명시적 로케일 추가 권장
6. **이모지 포함 텍스트** — `"⚠️ 주의사항:"` (ExamControlButtons.tsx L447), `"❌ 문제를 불러올 수 없습니다."` (QuestionPromptCard.tsx L49): 영문화 시 이모지 유지 여부 결정 필요
7. **영문 혼용 레이블** — `"MAIN"`, `"TODO"`, `"FOLDERS"` (dashboard-sidebar.tsx, SidebarFolderTree.tsx), `"CASE"`, `"OX"`, `"Case"` (QuestionNavigation.tsx): 대소문자 및 영/한 혼용 — 확인필요
8. **alert() 사용** — QuickActionsCard.tsx L167, L237: 네이티브 alert — 영문화 시 toast 또는 Dialog로 전환 검토
9. **PDF 파일명 포맷** — `${exam.title}_${studentName}_리포트카드.pdf` (QuickActionsCard.tsx L230): "리포트카드" 한국어 문자열 포함
10. **D-DAY/D-N 포맷** — dashboard-sidebar.tsx L74~76: 영문에선 "DUE TODAY"/"DUE IN N days" 등 다른 표현 필요
11. **동적 보간 + 단위** — `{n}분`, `{n}개`, `{n}명`, `{n}점` 등 단위어 다수: 영문에서 단수/복수형 처리 필요
12. **무제한 vs unlimited 혼용** — `"무제한"` 표현이 다수 파일에 존재 (시간 무제한, 과제형 등)
13. **"재채점"/"채점" 동적 버튼** — ExamStudentCard.tsx, ExamStudentRow.tsx 등에서 `isGraded ? "재채점" : "채점"` 패턴 다수 존재
14. **ExamControlButtons.tsx L447** — `⚠️` 이모지가 HTML에 직접 삽입됨
15. **복사 성공/실패 토스트 중복** — 동일 메시지 `"시험 코드가 복사되었습니다."` 여러 파일 (ExamDetailsCard, ExamQuickActionsCard, InstructorHomeClient): 공통 상수화 권장
16. **"부정행위 의심" 법적 표현** — FinalAnswerCard.tsx L375: 번역 시 법적 뉘앙스 검토 필요
17. **"선택" 레이블** — SimpleExamAuthoringForm.tsx L501, ExamInfoForm.tsx의 optional 표시: 영문에서 "(optional)" 형태로 변환 필요
18. **할당 관련 파일명 fallback** — `"파일"` (EditExam getFileNameFromUrl fallback): 영문에서 "File" 치환 필요

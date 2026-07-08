# i18n Inventory — 02 인증/온보딩/프로필

## 요약
- 스캔 파일 수: 14
- 텍스트 보유 파일 수: 10
- 총 추출 문자열 수: 133
- 특이사항 개수: 9

> 텍스트 없는 파일(노출 문자열 0건):
> - `app/(auth)/layout.tsx` — 래퍼만 존재, 문자열 없음
> - `app/(auth)/sign-in/[[...sign-in]]/page.tsx` — CustomSignIn 위임, 문자열 없음
> - `app/(auth)/sign-up/[[...sign-up]]/page.tsx` — CustomSignUp 위임, 문자열 없음
> - `app/(auth)/sign-up/sso-callback/page.tsx` — 미사용 페이지, null 반환
> - `app/(app)/onboarding/layout.tsx` — 래퍼만 존재, 문자열 없음

---

## 파일별 상세

### components/auth/CustomSignIn.tsx
파일 요약: 이메일·Google·Microsoft 로그인 폼 (2단 레이아웃)

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 66 | `Quest-On Logo` | aria | `<Image alt>` |
| 79 | `Quest-On에 오신 것을 환영합니다` | heading | h1 |
| 83 | `Quest-On 계정에 로그인하세요` | body | |
| 107 | `Google로 계속하기` | button | |
| 124–125 | `Microsoft로 계속하기` | button | |
| 126 | `준비중` | label | Badge; 서비스 미완료 상태 표시 |
| 139 | `또는` | body | 구분선 텍스트 |
| 147 | `이메일 주소` | label | `<Label>` |
| 151 | `이메일 주소를 입력하세요` | placeholder | |
| 159 | `비밀번호` | label | `<Label>` |
| 163 | `비밀번호를 입력하세요` | placeholder | |
| 34 | `이메일 또는 비밀번호가 올바르지 않습니다.` | toast-error | signInError 분기 |
| 183 | `로그인` | button | submit |
| 190 | `계정이 없으신가요?` | body | |
| 194 | `회원가입` | button | Link |
| 209 | `Quest-On` | aria | 우측 패널 `<Image alt>` |

---

### components/auth/CustomSignUp.tsx
파일 요약: 역할 선택 → 이메일 가입 → OTP 인증 3단계 회원가입 폼

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 102 | `Quest-On Logo` | aria | `<Image alt>` |
| 119 | `새로운 계정 만들기` | heading | h1 |
| 123 | `Quest-On 계정을 만들어보세요` | body | |
| 130 | `사용자 유형 선택` | label | `<Label>` |
| 131 | `계정 유형을 선택해주세요` | body | |
| 148 | `강사` | label | 역할 버튼 |
| 152 | `시험을 만들고 관리합니다` | body | |
| 167 | `학생` | label | 역할 버튼 |
| 171 | `시험에 참여하고 피드백을 받습니다` | body | |
| 197 | `Google로 계속하기` | button | |
| 213–214 | `Microsoft로 계속하기` | button | |
| 215 | `준비중` | label | Badge |
| 228 | `또는` | body | 구분선 |
| 237 | `이메일 주소` | label | |
| 241 | `이메일 주소를 입력하세요` | placeholder | |
| 249 | `비밀번호` | label | |
| 253 | `비밀번호를 입력하세요 (6자 이상)` | placeholder | 최소 길이 포함; 영문화 시 숫자 보간 주의 |
| 84 | `인증 코드가 올바르지 않습니다. 다시 확인해주세요.` | toast-error | OTP 검증 실패 |
| 273 | `회원가입` | button | submit |
| 280 | `이미 계정이 있으신가요?` | body | |
| 284 | `로그인` | button | Link |
| 295 | `이메일 인증` | heading | h1 (verify step) |
| 298–301 | `{email}로 발송된 6자리 인증 코드를 입력해주세요.` | dynamic | 보간 포함; 이메일 앞에 조사 "로" → 영문 어순과 다름 **특이사항①** |
| 307 | `인증 코드` | label | |
| 313 | `6자리 코드 입력` | placeholder | |
| 333 | `인증 완료` | button | submit |
| 341 | `이메일 다시 입력하기` | button | |
| 356 | `Quest-On` | aria | 우측 패널 `<Image alt>` |

---

### components/auth/UserMenu.tsx
파일 요약: 헤더 우측 아바타 드롭다운 메뉴 (프로필·설정·테마·로그아웃)

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 55 | `User` | aria | `<AvatarImage alt>` fallback; 확인필요 (비노출 가능) |
| 77 | `프로필` | label | DropdownMenuItem |
| 82 | `설정` | label | DropdownMenuItem |
| 89 | `테마` | label | DropdownMenuItem 내 span |
| 99 | `로그아웃` | button | DropdownMenuItem |

---

### components/settings/ChangePasswordForm.tsx
파일 요약: 비밀번호 변경/설정 폼 (현재 비밀번호 재인증, show/hide 토글, 다른 기기 로그아웃 옵션)

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 54 | `비밀번호 숨기기` | aria | `aria-label` (show=true 분기) |
| 54 | `비밀번호 표시` | aria | `aria-label` (show=false 분기) |
| 89 | `현재 비밀번호를 입력해주세요.` | toast-error | validate() 반환 |
| 90–91 | `새 비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.` | dynamic | 상수 보간; 복수형 없음이지만 숫자 단위 "자" 처리 **특이사항②** |
| 93 | `새 비밀번호와 확인이 일치하지 않습니다.` | toast-error | validate() 반환 |
| 95 | `새 비밀번호가 현재 비밀번호와 동일합니다.` | toast-error | validate() 반환 |
| 115 | `계정 이메일을 확인할 수 없습니다. 다시 로그인해주세요.` | toast-error | |
| 130 | `현재 비밀번호가 올바르지 않습니다.` | toast-error | reauth 실패 |
| 141 | `비밀번호 변경에 실패했습니다.` | toast-error | updateUser 실패; `updateError.message || ...` **특이사항③** |
| 153–155 | `비밀번호가 변경되었습니다. (다른 기기 로그아웃은 일부 실패했습니다)` | toast-error | signOut others 실패 분기 |
| 162 | `비밀번호가 변경되었습니다.` | toast-error | 성공 toast (hasPassword=true) |
| 162 | `비밀번호가 설정되었습니다.` | toast-error | 성공 toast (hasPassword=false) |
| 166 | `처리 중 오류가 발생했습니다. 다시 시도해주세요.` | toast-error | catch-all |
| 175–178 | `소셜 로그인(예: Google)으로 가입한 계정입니다. 비밀번호를 설정하면 이메일과 비밀번호로도 로그인할 수 있습니다.` | body | 소셜 전용 계정 안내; "예: Google"이 하드코딩됨 **특이사항④** |
| 185 | `현재 비밀번호` | label | `<PasswordField label>` |
| 191 | `현재 비밀번호` | placeholder | `<PasswordField placeholder>` |
| 197 | `새 비밀번호` | label | hasPassword=true 분기 |
| 197 | `비밀번호` | label | hasPassword=false 분기 |
| 203 | `${MIN_PASSWORD_LENGTH}자 이상` | dynamic | placeholder 보간 **특이사항②** |
| 207 | `비밀번호 확인` | label | |
| 214 | `비밀번호를 다시 입력` | placeholder | |
| 215 | `비밀번호가 일치하지 않습니다.` | toast-error | inline 에러 |
| 225 | `변경 후 다른 기기에서 모두 로그아웃` | label | Checkbox label |
| 236 | `처리 중...` | button | 로딩 상태 |
| 238 | `비밀번호 변경` | button | hasPassword=true |
| 240 | `비밀번호 설정` | button | hasPassword=false |

---

### app/(app)/onboarding/page.tsx
파일 요약: 신규 가입자 역할 선택 → 프로필(이름·학번·학교) 입력 2단계 온보딩

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 229 | `로딩 중...` | body | 초기 로딩 스피너 텍스트 |
| 244 | `Quest-On에 오신 것을 환영합니다!` | heading | CardTitle |
| 248 | `시작하려면 역할을 선택해주세요` | body | CardDescription |
| 264 | `강사 (시험 출제자)` | label | RadioGroup 항목 |
| 270 | `학생 (시험 응시자)` | label | RadioGroup 항목 |
| 282 | `계속하기` | button | |
| 293 | `프로필 설정` | heading | CardTitle (Step 2) |
| 296 | `학생 정보를 입력해주세요` | body | role=student 분기 |
| 297 | `강사 정보를 입력해주세요` | body | role=instructor 분기 |
| 306 | `이름` | label | `<Label>` |
| 311 | `이름을 입력하세요` | placeholder | |
| 326 | `학번` | label | 학생만 표시 |
| 332 | `학번을 입력하세요` | placeholder | |
| 343 | `학교` | label | role=student 분기 |
| 343 | `소속 기관` | label | role=instructor 분기 |
| 351 | `학교명을 검색하세요` | placeholder | role=student |
| 353 | `소속 기관명을 검색하세요` | placeholder | role=instructor |
| 392–394 | `선택된 학교: {school}` | dynamic | 보간 포함; "선택된 학교" 고정 텍스트는 role=instructor일 때도 "학교"로 표시됨 **특이사항⑤** |
| 148 | `이름을 입력해주세요.` | toast-error | 유효성 검사 |
| 152 | `학교를 선택해주세요.` | toast-error | 유효성 검사 |
| 156 | `학번을 입력해주세요.` | toast-error | 유효성 검사 |
| 219 | `저장에 실패했습니다. 다시 시도해주세요.` | toast-error | catch-all |
| 407 | `이전` | button | |
| 424–426 | `저장 중...` | button | 로딩 상태 |
| 427 | `완료` | button | submit |
| 439 | `역할을 확인해주세요` | heading | AlertDialog title |
| 441–447 | `{role === "instructor" ? "강사 (시험 출제자)" : "학생 (시험 응시자)"}(으)로 시작합니다. 역할 선택 후에도 프로필 설정에서 변경할 수 있습니다.` | dynamic | 조사 "(으)로" 보간 → 한국어 조사 자동화 고려 **특이사항⑥** |
| 451 | `다시 선택하기` | button | AlertDialogCancel |
| 453 | `확인` | button | AlertDialogAction |

---

### app/(app)/join/page.tsx
파일 요약: 6자리 코드 입력으로 시험/과제 입장 페이지

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 37 | `이미 제출한 시험입니다. 재시험은 불가능합니다.` | toast-error | errorMessages 맵 |
| 38 | `시험을 찾을 수 없습니다. 시험 코드를 확인해주세요.` | toast-error | |
| 39–41 | `현재 응시할 수 없는 시험입니다. 시험이 종료되었거나 비공개 상태입니다.` | toast-error | |
| 42–43 | `시험 입장 시간이 마감되었습니다. 강사에게 문의해주세요.` | toast-error | |
| 44 | `로그인이 필요합니다. 다시 로그인해주세요.` | toast-error | |
| 45–46 | `서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.` | toast-error | |
| 47–48 | `네트워크 오류가 발생했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.` | toast-error | |
| 51–53 | `알 수 없는 오류가 발생했습니다. 다시 시도해주세요.` | toast-error | 매핑 미등록 오류 fallback |
| 67 | `코드를 확인할 수 없습니다.` | toast-error | fetch 실패 fallback |
| 77 | `오류가 발생했습니다.` | toast-error | catch 분기 |
| 100 | `코드 입력` | heading | CardTitle |
| 102 | `강사가 제공한 코드를 입력하여 시험 또는 과제를 시작하세요` | body | CardDescription |
| 141 | `영문자와 숫자만 입력 가능합니다 (예: MATH01)` | body | 입력 힌트; "예: MATH01" 하드코딩 **특이사항⑦** |
| 149 | `입력 중...` | button | 로딩 상태 |
| 149 | `입장` | button | submit |
| 158 | `도움이 필요하신가요? 강사에게 문의하세요` | body | |
| 161 | `홈으로 돌아가기` | button | |

---

### app/(app)/profile/page.tsx
파일 요약: 로그인 사용자 프로필 조회 페이지 (학생 정보·계정 세부·테마 설정)

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 112 | `프로필` | heading | h1 |
| 114 | `계정 정보 및 개인 설정을 확인하세요` | body | |
| 121 | `프로필 정보` | heading | CardTitle |
| 123 | `기본 계정 정보` | body | CardDescription |
| 130 | `User` | aria | `<AvatarImage alt>` fallback **특이사항⑧** |
| 139 | `이름 없음` | empty-state | profile.fullName 없을 때 fallback |
| 158 | `이메일` | label | |
| 160 | `이메일 없음` | empty-state | user.email 없을 때 fallback |
| 170 | `가입일` | label | |
| 172–178 | `new Date(user.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })` | format | 로케일 하드코딩 "ko-KR" **특이사항⑨** |
| 178 | `날짜 없음` | empty-state | created_at 없을 때 fallback |
| 187 | `학생 정보` | heading | h3 |
| 199 | `이름` | label | 학생 프로필 내 |
| 201 | `미입력` | empty-state | student_number·school 없을 때 |
| 210 | `학번` | label | |
| 212 | `미입력` | empty-state | |
| 222 | `학교` | label | |
| 224 | `미입력` | empty-state | |
| 232–234 | `프로필 정보가 없습니다.` | empty-state | studentProfile null |
| 237 | `프로필 설정하기` | button | |
| 251 | `계정 세부 정보` | heading | CardTitle |
| 253 | `추가 계정 정보` | body | CardDescription |
| 259 | `사용자 ID` | label | |
| 272 | `이름` | label | |
| 285 | `역할` | label | |
| 292 | `강사` | label | roleLabel 분기 |
| 293 | `관리자` | label | roleLabel 분기 |
| 294 | `학생` | label | roleLabel 분기 |
| 296 | `테마 설정` | heading | CardTitle |
| 298 | `화면 테마를 변경할 수 있습니다` | body | CardDescription |
| 306 | `테마 모드` | label | |
| 308 | `라이트 모드 또는 다크 모드를 선택하세요` | body | |
| 323 | `돌아가기` | button | |
| 328 | `강사 대시보드` | button | role=instructor |
| 332 | `학생 대시보드` | button | role=student |

---

### app/(app)/settings/page.tsx
파일 요약: 설정 페이지 (비밀번호 변경 카드 포함)

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 42 | `설정` | heading | h1 |
| 44 | `계정 보안 및 환경 설정을 관리하세요` | body | |
| 53 | `비밀번호 변경` | heading | CardTitle |
| 57 | `보안을 위해 현재 비밀번호 확인 후 변경됩니다. 비밀번호는 8자 이상으로 설정하세요.` | body | CardDescription; "8자" 하드코딩 — MIN_PASSWORD_LENGTH 상수와 별개 **특이사항②** |

---

### app/(app)/instructor-pending/page.tsx
파일 요약: 강사 계정 승인 대기 안내 페이지

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 29 | `[Quest-On 강사 승인 요청]` | dynamic | 이메일 제목 (encodeURIComponent) |
| 31–45 | (이메일 본문 전체 템플릿) | dynamic | 보간 포함(`${profile?.email}`); 한국어 경어체 **특이사항⑥** |
| 61 | `승인 대기 중입니다` | heading | h1 |
| 63–65 | `강사 계정은 관리자 승인 후 사용 가능합니다.\n아래 이메일로 문의해 주시면 빠르게 처리해드리겠습니다.` | body | |
| 72 | `문의 이메일` | label | |
| 82 | `이메일 복사` | aria | `<button title>` |
| 91 | `이메일이 복사되었습니다!` | toast-error | 복사 성공 피드백 (success 메시지) |
| 99 | `문의하기 (이메일 작성)` | button | |
| 105 | `📋 이메일에 포함해주세요` | body | 이모지 포함 고정 텍스트 **특이사항④** |
| 106 | `• 소속 기관 (대학교/회사명)` | body | |
| 107 | `• 담당 과목` | body | |
| 108 | `• 사용 목적` | body | |
| 116 | `승인 여부 확인하기` | button | |
| 127 | `로그아웃` | button | |

---

### app/(app)/student/profile-setup/page.tsx
파일 요약: 학생 프로필 최초 입력/수정 페이지 (온보딩과 유사하나 학생 전용)

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 222 | `프로필 설정` | heading | CardTitle |
| 224–226 | `프로필 정보를 불러오는 중...` | body | 로딩 상태 CardDescription |
| 225–226 | `학생 정보를 입력하거나 수정해주세요. 시험 참여를 위해 필수 정보입니다.` | body | 기본 CardDescription |
| 233 | `이름` | label | |
| 239 | `이름을 입력하세요` | placeholder | |
| 252 | `학번` | label | |
| 258 | `학번을 입력하세요` | placeholder | |
| 270 | `학교` | label | |
| 279 | `학교명을 검색하세요` | placeholder | |
| 317–319 | `선택된 학교: {school}` | dynamic | 보간 포함 |
| 159 | `이름을 입력해주세요.` | toast-error | 유효성 검사 |
| 163 | `학번을 입력해주세요.` | toast-error | |
| 167 | `학교를 선택해주세요.` | toast-error | |
| 194 | `프로필 저장에 실패했습니다.` | toast-error | API 에러 fallback |
| 197 | `서버 오류가 발생했습니다.` | toast-error | catch-all |
| 334–336 | `저장 중...` | button | 로딩 상태 |
| 338 | `프로필 저장` | button | submit |

---

## 특이사항 목록

| # | 파일 | 설명 |
|---|------|------|
| ① | CustomSignUp.tsx L298–301 | `{email}로 발송된` — 한국어 조사 "로"가 이메일 주소 뒤에 붙음. 영문 등 다른 언어로 전환 시 조사 제거 또는 문장 구조 변경 필요. |
| ② | ChangePasswordForm.tsx L90–91, L203 / settings/page.tsx L57 | `MIN_PASSWORD_LENGTH(8)자 이상` 패턴 — ChangePasswordForm은 상수 보간을 사용하지만 settings/page.tsx CardDescription은 "8자"를 리터럴로 하드코딩. 두 곳이 불일치하며 영문화 시 단위 "자(characters)"도 별도 처리 필요. |
| ③ | ChangePasswordForm.tsx L141 | `updateError.message \|\| "비밀번호 변경에 실패했습니다."` — Supabase가 반환하는 영문 에러 메시지가 그대로 노출될 수 있음. 영문 메시지 키-맵 변환 레이어 필요. |
| ④ | ChangePasswordForm.tsx L175–178 / instructor-pending/page.tsx L105 | "예: Google" 및 이모지(📋)가 하드코딩됨. 영문화 시 이모지는 유지 가능하나 "예:" 표현 현지화 필요. |
| ⑤ | onboarding/page.tsx L392–394 | `선택된 학교:` 레이블이 role=instructor일 때도 "학교"로 고정 표시. 현재 한국어 UI에서도 "소속 기관"으로 바꿔야 하며, i18n 키 분기도 필요. 확인필요. |
| ⑥ | onboarding/page.tsx L441–447 / instructor-pending/page.tsx L31–45 | 조사 "(으)로" 자동 선택 로직 없이 리터럴로 처리. 영문 등에서는 불필요하므로 동적 조사 유틸 또는 별도 문장 키 필요. |
| ⑦ | join/page.tsx L141 | `(예: MATH01)` — 샘플 코드가 하드코딩. 영문화 시 예시 값은 유지 가능하나 "예:" 표현 현지화 필요. |
| ⑧ | profile/page.tsx L130 | `<AvatarImage alt="User">` — 영문 "User" 그대로이지만 alt는 screen reader에 노출됨. 현지화 고려 필요. 확인필요. |
| ⑨ | profile/page.tsx L172–178 | `toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })` — 로케일 하드코딩. i18n 도입 시 사용자 로케일을 따르도록 변경 필요. |

/**
 * 에러 메시지를 한글로 변환하는 유틸리티 함수
 */

/**
 * HTTP 상태 코드를 한글 메시지로 변환
 */
function getHttpStatusMessage(status: number): string {
  const statusMessages: Record<number, string> = {
    400: "잘못된 요청입니다",
    401: "인증이 필요합니다",
    403: "접근 권한이 없습니다",
    404: "요청한 리소스를 찾을 수 없습니다",
    409: "이미 존재하는 데이터입니다",
    413: "파일 크기가 너무 큽니다",
    422: "처리할 수 없는 요청입니다",
    429: "요청 횟수가 초과되었습니다",
    500: "서버 내부 오류가 발생했습니다",
    502: "서버 게이트웨이 오류가 발생했습니다",
    503: "서비스를 일시적으로 사용할 수 없습니다",
    504: "서버 응답 시간이 초과되었습니다",
  };

  return statusMessages[status] || `서버 오류가 발생했습니다 (${status})`;
}

/**
 * 일반적인 에러 메시지 패턴을 한글로 변환
 */
function translateErrorMessage(message: string): string {
  const lowerMessage = message.toLowerCase();

  // HTTP 상태 코드 패턴
  if (lowerMessage.includes("http") && lowerMessage.includes("status")) {
    const statusMatch = message.match(/(\d{3})/);
    if (statusMatch) {
      return getHttpStatusMessage(parseInt(statusMatch[1]));
    }
  }

  // 일반적인 에러 메시지 매핑
  const errorMappings: Record<string, string> = {
    // 네트워크/연결 에러
    "network error": "네트워크 연결 오류가 발생했습니다",
    "failed to fetch": "서버에 연결할 수 없습니다",
    "connection refused": "서버 연결이 거부되었습니다",
    "timeout": "요청 시간이 초과되었습니다",
    
    // 인증/권한 에러
    "unauthorized": "인증이 필요합니다",
    "forbidden": "접근 권한이 없습니다",
    "permission denied": "권한이 거부되었습니다",
    "authentication failed": "인증에 실패했습니다",
    "invalid token": "유효하지 않은 토큰입니다",
    "token expired": "토큰이 만료되었습니다",
    
    // 데이터베이스 에러
    "row-level security": "데이터베이스 보안 정책 위반",
    "policy violation": "보안 정책 위반",
    "foreign key constraint": "관련 데이터가 있어 삭제할 수 없습니다",
    "unique constraint": "이미 존재하는 데이터입니다",
    "not null constraint": "필수 항목이 누락되었습니다",
    "check constraint": "데이터 유효성 검사에 실패했습니다",
    
    // 파일 업로드 에러
    "file too large": "파일 크기가 너무 큽니다",
    "invalid file type": "지원하지 않는 파일 형식입니다",
    "upload failed": "파일 업로드에 실패했습니다",
    "storage error": "파일 저장 중 오류가 발생했습니다",
    "bucket not found": "저장소를 찾을 수 없습니다",
    "file exists": "같은 이름의 파일이 이미 존재합니다",
    
    // 일반적인 에러
    "internal server error": "서버 내부 오류가 발생했습니다",
    "bad request": "잘못된 요청입니다",
    "not found": "요청한 리소스를 찾을 수 없습니다",
    "unknown error": "알 수 없는 오류가 발생했습니다",
    "operation failed": "작업에 실패했습니다",
    "questions_locked": "참여한 학생이 있어 문항을 수정할 수 없습니다",
    
    // Supabase 관련 에러
    "jwt": "인증 토큰 오류",
    "invalid jwt": "유효하지 않은 인증 토큰입니다",
    "already exists": "이미 존재하는 데이터입니다",
    "duplicate key": "중복된 데이터입니다",
  };

  // 정확한 매칭 시도
  for (const [key, value] of Object.entries(errorMappings)) {
    if (lowerMessage.includes(key)) {
      return value;
    }
  }

  // 부분 매칭 시도 (더 구체적인 메시지)
  if (lowerMessage.includes("failed to save")) {
    return "저장에 실패했습니다";
  }
  if (lowerMessage.includes("failed to create")) {
    return "생성에 실패했습니다";
  }
  if (lowerMessage.includes("failed to update")) {
    return "수정에 실패했습니다";
  }
  if (lowerMessage.includes("failed to delete")) {
    return "삭제에 실패했습니다";
  }
  if (lowerMessage.includes("failed to load")) {
    return "불러오기에 실패했습니다";
  }

  return message; // 변환할 수 없으면 원본 반환
}

/**
 * 에러 객체나 메시지를 한글 메시지로 변환
 */
export function getErrorMessage(
  error: unknown,
  defaultMessage: string
): string {
  if (!error) {
    return defaultMessage;
  }

  // Error 객체인 경우
  if (error instanceof Error) {
    const translated = translateErrorMessage(error.message);
    // 이미 한글이 포함되어 있으면 그대로 사용
    if (/[가-힣]/.test(translated)) {
      return translated;
    }
    // 영어 메시지인 경우 기본 메시지와 함께 표시
    return `${defaultMessage} (${translated})`;
  }

  // 문자열인 경우
  if (typeof error === "string") {
    const translated = translateErrorMessage(error);
    if (/[가-힣]/.test(translated)) {
      return translated;
    }
    return `${defaultMessage} (${translated})`;
  }

  return defaultMessage;
}

/**
 * API 응답에서 에러 메시지를 추출하고 한글로 변환
 */
export function extractErrorMessage(
  errorData: unknown,
  defaultMessage: string,
  status?: number
): string {
  // 여러 필드에서 에러 메시지 추출
  const data = errorData as Record<string, unknown> | null | undefined;
  const errorMsg =
    data?.error ||
    data?.message ||
    data?.details ||
    (status ? getHttpStatusMessage(status) : null);

  if (!errorMsg) {
    return defaultMessage;
  }

  // 이미 한글이 포함되어 있으면 그대로 사용
  if (typeof errorMsg === "string" && /[가-힣]/.test(errorMsg)) {
    return errorMsg;
  }

  // 영어 메시지인 경우 한글로 변환
  const translated = translateErrorMessage(String(errorMsg));
  
  // 변환된 메시지가 원본과 다르면 (한글로 변환됨) 그대로 사용
  if (translated !== String(errorMsg) && /[가-힣]/.test(translated)) {
    return translated;
  }

  // 변환할 수 없으면 기본 메시지와 함께 표시
  return `${defaultMessage} (${errorMsg})`;
}


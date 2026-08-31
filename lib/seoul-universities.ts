// 서울 지역 대학교 데이터 타입 정의 및 유틸리티 함수

export interface SeoulUniversity {
  main_key: string;
  name_kor: string; // 학교명
  type: string; // 설립 (국립, 사립, 공립 등)
  cate1_name: string; // 학교종류 (일반대학, 전문대학 등)
  branch: string; // 본분교
  h_kor_city: string; // 행정시
  h_kor_gu: string; // 행정구
  h_kor_dong: string; // 행정동
  add_kor: string; // 주소
  add_kor_road: string | null; // 도로명주소
  tel: string | null; // 전화번호
  fax: string | null; // 팩스번호
  hp: string | null; // 홈페이지
  state: string; // 학교상태 (기존, 폐교 등)
  year: string; // 연도
  postcode: string | null; // 우편번호
}

// 검색 결과를 위한 간소화된 타입
export interface UniversitySearchResult {
  name: string;
  type: string;
  category: string;
  branch: string;
  address: string;
  fullName: string; // 표시용 전체 이름 (본교/분교 포함)
}

// JSON 데이터를 로드하고 검색 가능한 형태로 변환
let universitiesCache: UniversitySearchResult[] | null = null;

export async function loadUniversities(): Promise<UniversitySearchResult[]> {
  if (universitiesCache) {
    return universitiesCache;
  }

  try {
    // JSON 파일을 직접 import (resolveJsonModule이 true이므로 가능)
    const data = await import("@/seoul-uni.json");
    // JSON 파일의 타입 정의
    interface SeoulUniJson {
      DESCRIPTION: Record<string, string>;
      DATA: SeoulUniversity[];
    }
    const jsonData = data as unknown as SeoulUniJson;
    const universities: SeoulUniversity[] = jsonData.DATA;

    universitiesCache = universities
      .filter((uni) => uni.state === "기존") // 기존 학교만 필터링
      .map((uni) => ({
        name: uni.name_kor,
        type: uni.type,
        category: uni.cate1_name,
        branch: uni.branch,
        address: uni.add_kor || "",
        fullName:
          uni.branch === "본교"
            ? uni.name_kor
            : `${uni.name_kor} ${uni.branch}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));

    return universitiesCache;
  } catch {
    return [];
  }
}

// 한글 초성 추출 함수
function getInitials(text: string): string {
  const initialConsonants = [
    "ㄱ",
    "ㄲ",
    "ㄴ",
    "ㄷ",
    "ㄸ",
    "ㄹ",
    "ㅁ",
    "ㅂ",
    "ㅃ",
    "ㅅ",
    "ㅆ",
    "ㅇ",
    "ㅈ",
    "ㅉ",
    "ㅊ",
    "ㅋ",
    "ㅌ",
    "ㅍ",
    "ㅎ",
  ];

  return text
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      // 한글 유니코드 범위: 0xAC00 ~ 0xD7A3
      if (code >= 0xac00 && code <= 0xd7a3) {
        const initialIndex = Math.floor((code - 0xac00) / 588);
        return initialConsonants[initialIndex];
      }
      return char;
    })
    .join("");
}

// 학교명으로 검색 (초성 검색 지원)
export async function searchUniversities(
  query: string,
  limit?: number
): Promise<UniversitySearchResult[]> {
  const universities = await loadUniversities();
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return limit ? universities.slice(0, limit) : universities;
  }

  const lowerQuery = trimmedQuery.toLowerCase();
  const queryInitials = getInitials(trimmedQuery);

  // 검색 결과를 우선순위별로 분류
  const exactMatches: UniversitySearchResult[] = [];
  const nameStartsWith: UniversitySearchResult[] = [];
  const containsMatches: UniversitySearchResult[] = [];
  const initialMatches: UniversitySearchResult[] = [];

  universities.forEach((uni) => {
    const searchableText = `${uni.name} ${uni.fullName} ${uni.address}`;
    const lowerSearchableText = searchableText.toLowerCase();
    const searchableInitials = getInitials(searchableText);

    // 1. 정확한 일치 (이름 또는 fullName이 정확히 일치)
    if (uni.name === trimmedQuery || uni.fullName === trimmedQuery) {
      exactMatches.push(uni);
      return;
    }

    // 2. 이름으로 시작하는 경우
    if (uni.name.toLowerCase().startsWith(lowerQuery) || uni.fullName.toLowerCase().startsWith(lowerQuery)) {
      nameStartsWith.push(uni);
      return;
    }

    // 3. 일반 텍스트 검색 (포함)
    if (lowerSearchableText.includes(lowerQuery)) {
      containsMatches.push(uni);
      return;
    }

    // 4. 초성만 입력한 경우 (예: 'ㅅ', 'ㅅㅇ')
    // 완성형 한글까지 첫 초성으로 넓히면 무관한 학교가 섞이므로, 초성 질의에서만
    // 질의 전체를 접두사로 비교한다.
    if (/^[ㄱ-ㅎ]+$/.test(trimmedQuery)) {
      if (searchableInitials.startsWith(queryInitials)) {
        initialMatches.push(uni);
        return;
      }
    }
  });

  // 우선순위대로 결과 합치기
  const results = [
    ...exactMatches,
    ...nameStartsWith,
    ...containsMatches,
    ...initialMatches,
  ];

  // limit이 지정된 경우에만 제한 적용
  return limit ? results.slice(0, limit) : results;
}

// 학교명으로 정확히 찾기
export async function findUniversityByName(
  name: string
): Promise<UniversitySearchResult | null> {
  const universities = await loadUniversities();
  return (
    universities.find((uni) => uni.name === name || uni.fullName === name) ||
    null
  );
}

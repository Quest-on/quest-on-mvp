# 한글 폰트 설정 가이드

PDF 리포트 카드에서 한글이 깨지는 문제를 해결하기 위해 한글 폰트를 등록해야 합니다.

## 1. 폰트 파일 다운로드

1. [Google Fonts - Noto Sans KR](https://fonts.google.com/noto/specimen/Noto+Sans+KR)에서 폰트를 다운로드합니다.
2. 또는 다음 명령어로 다운로드할 수 있습니다:

```bash
# public/fonts 디렉토리 생성
mkdir -p public/fonts

# Noto Sans KR 폰트 다운로드 (예시)
# 직접 Google Fonts에서 다운로드하거나, 다음 링크에서 다운로드:
# https://fonts.google.com/noto/specimen/Noto+Sans+KR
```

## 2. 폰트 파일 배치

다운로드한 폰트 파일을 `public/fonts/` 디렉토리에 배치합니다:

```
public/
  fonts/
    NotoSansKR-Regular.ttf
    NotoSansKR-Bold.ttf
```

## 3. 폰트 등록

`components/pdf/ReportCardPDF.tsx` 파일에서 폰트를 등록합니다:

```typescript
import { Font } from "@react-pdf/renderer";

// 폰트 등록
Font.register({
  family: "NotoSansKR",
  fonts: [
    {
      src: "/fonts/NotoSansKR-Regular.ttf",
    },
    {
      src: "/fonts/NotoSansKR-Bold.ttf",
      fontWeight: "bold",
    },
  ],
});

// 스타일에서 사용
const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansKR", // Helvetica 대신 NotoSansKR 사용
    // ...
  },
});
```

## 4. 대안: 다른 한글 폰트 사용

Noto Sans KR 외에도 다음 폰트를 사용할 수 있습니다:

- 나눔고딕 (Nanum Gothic)
- 맑은 고딕 (Malgun Gothic) - Windows 시스템 폰트
- Apple SD Gothic Neo - macOS 시스템 폰트

## 참고사항

- 폰트 파일 크기가 클 수 있으므로, 필요한 weight만 다운로드하는 것을 권장합니다.
- 서버 사이드 렌더링 환경에서는 폰트 파일이 `public/` 디렉토리에 있어야 접근 가능합니다.

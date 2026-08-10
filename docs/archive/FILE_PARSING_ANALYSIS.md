# 파일 파싱 및 데이터 저장 로직 분석 리포트

> RAG 구현을 위한 현재 시스템 상태 분석 문서

## 📋 개요

현재 시스템은 강사가 업로드한 파일(PDF, DOCX, PPTX, CSV 등)에서 텍스트를 추출하여 시험 자료로 저장하는 기능을 구현하고 있습니다. 이 문서는 RAG 구현을 위해 필요한 현재 상태를 정리합니다.

---

## 1. DB 스키마 분석

### 1.1 주요 테이블: `exams`

**위치**: `prisma/schema.prisma` (37-56번째 줄)

```prisma
model exams {
  id            String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  title         String
  code          String       @unique
  description   String?
  duration      Int
  questions     Json
  status        String?      @default("draft")
  instructor_id String
  student_count Int?         @default(0)
  created_at    DateTime?    @default(now()) @db.Timestamptz(6)
  updated_at    DateTime?    @default(now()) @db.Timestamptz(6)
  materials     Json?        @default("[]")      // 파일 URL 배열
  rubric        Json?        @default("[]")
  exam_nodes    exam_nodes[]

  @@index([code], map: "idx_exams_code")
  @@index([instructor_id], map: "idx_exams_instructor_id")
  @@index([rubric], map: "idx_exams_rubric", type: Gin)
}
```

### 1.2 파일 내용 저장 구조

**현재 저장 방식**:

- `materials` (JSON): 파일 URL 배열

  ```json
  [
    "https://supabase.co/storage/v1/object/public/exam-materials/instructor-xxx/file.pdf"
  ]
  ```

- `materials_text` (JSON): 추출된 텍스트 배열 (실제 DB 스키마에는 명시되지 않았으나 코드에서 사용)
  ```json
  [
    {
      "url": "https://...",
      "text": "추출된 텍스트 내용...",
      "fileName": "example.pdf"
    }
  ]
  ```

**참고**: `materials_text` 필드는 Prisma 스키마에 명시되어 있지 않지만, `app/api/supa/route.ts`의 `createExam` 함수에서 사용되고 있습니다. Supabase에서는 JSONB 컬럼에 동적으로 필드를 추가할 수 있으므로, 실제 DB에는 존재할 가능성이 높습니다.

### 1.3 Vector 타입 사용 여부

**결론**: ❌ **사용하지 않음**

- 현재 `exams` 테이블에는 `vector` 타입 컬럼이 없습니다.
- PostgreSQL의 `pgvector` 확장을 사용하는 컬럼도 없습니다.
- 모든 데이터는 `Json` 또는 `String` 타입으로 저장됩니다.

---

## 2. 임베딩 로직 분석

### 2.1 OpenAI 임베딩 모델 사용 여부

**결론**: ❌ **사용하지 않음**

**검색 결과**:

- 코드베이스 전체에서 `text-embedding`, `embedding`, `pgvector` 관련 코드가 없습니다.
- `lib/openai.ts`에는 Chat Completions API만 사용하고 있습니다.
- 임베딩 생성 및 저장 로직이 전혀 구현되어 있지 않습니다.

### 2.2 현재 사용 중인 OpenAI API

**위치**: `lib/openai.ts`

```typescript
import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "MISSING_OPENAI_API_KEY",
});
```

**사용 용도**:

- Chat Completions (GPT 모델)
- Responses API (대화 체이닝)
- **임베딩 API는 사용하지 않음**

---

## 3. 파일 처리 범위 분석

### 3.1 지원 파일 형식

**위치**: `app/api/extract-text/route.ts`

| 파일 형식                     | 지원 여부 | 라이브러리/방법                                                   |
| ----------------------------- | --------- | ----------------------------------------------------------------- |
| PDF                           | ✅        | `pdf2json` (Node.js 전용)                                         |
| DOCX                          | ✅        | `mammoth`                                                         |
| PPTX                          | ✅        | `AdmZip` + XML 파싱                                               |
| CSV                           | ✅        | UTF-8 디코딩                                                      |
| DOC                           | ❌        | 지원 안 함 (에러 메시지)                                          |
| PPT                           | ❌        | 지원 안 함 (에러 메시지)                                          |
| XLSX                          | ❌        | **코드에 없음** (클라이언트에서는 허용하지만 서버에서 처리 안 함) |
| 이미지 (JPEG, PNG, GIF, WEBP) | ⚠️        | **업로드는 가능하지만 텍스트 추출 안 함**                         |

### 3.2 텍스트 추출 로직

**위치**: `app/api/extract-text/route.ts`

**처리 흐름**:

1. Supabase Storage에서 파일 다운로드
2. 파일 형식에 따라 분기:
   - **PDF**: `pdf2json`으로 텍스트 노드 추출
   - **DOCX**: `mammoth.extractRawText()` 사용
   - **PPTX**: ZIP 압축 해제 후 XML에서 `<a:t>` 태그 텍스트 추출
   - **CSV**: UTF-8 디코딩
3. 추출된 텍스트를 문자열로 반환

**예시 코드** (PDF 추출):

```typescript
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const PDFParserClass = await getPDFParser();
  const pdfParser = new PDFParserClass(null, 1);
  // ... 텍스트 추출 로직
  return textParts.join("\n\n");
}
```

### 3.3 이미지 분석 (Vision API) 사용 여부

**결론**: ❌ **사용하지 않음**

**현재 상태**:

- 이미지 파일(JPEG, PNG, GIF, WEBP)은 업로드 가능하지만 (`app/api/upload/route.ts`에서 허용)
- 이미지에서 텍스트를 추출하거나 설명을 생성하는 로직이 없습니다.
- OpenAI Vision API를 사용하는 코드가 없습니다.
- 이미지 파일은 `materials` 배열에 URL만 저장되고, `materials_text`에는 포함되지 않습니다.

**관련 코드** (`app/instructor/new/page.tsx`):

```typescript
const textExtractableExtensions = ["pdf", "docx", "pptx", "csv"];
if (!textExtractableExtensions.includes(extension)) {
  return; // 텍스트 추출 불가능한 파일은 건너뛰기
}
```

---

## 4. 폴더 구조 및 주요 파일 위치

### 4.1 파일 업로드

**위치**: `app/api/upload/route.ts`

**기능**:

- FormData로 파일 수신
- 파일 형식 검증 (화이트리스트)
- 파일 크기 검증 (25MB 제한)
- Supabase Storage (`exam-materials` 버킷)에 업로드
- 저장 경로: `instructor-{userId}/{timestamp}_{uuid}.{ext}`

**반환값**:

```json
{
  "ok": true,
  "objectKey": "instructor-xxx/file.pdf",
  "url": "https://supabase.co/storage/v1/object/public/exam-materials/...",
  "meta": {
    "originalName": "example.pdf",
    "size": 1024,
    "mime": "application/pdf"
  }
}
```

### 4.2 텍스트 추출

**위치**: `app/api/extract-text/route.ts`

**기능**:

- Supabase Storage에서 파일 다운로드
- 파일 형식별 텍스트 추출
- 추출된 텍스트 반환

**반환값**:

```json
{
  "success": true,
  "text": "추출된 텍스트...",
  "length": 1234
}
```

### 4.3 시험 생성 및 데이터 저장

**위치**: `app/api/supa/route.ts` (124-281번째 줄)

**기능**:

- `createExam` 함수에서 시험 데이터 저장
- `materials`: 파일 URL 배열
- `materials_text`: 추출된 텍스트 배열
- `exams` 테이블에 INSERT

**저장 데이터 구조**:

```typescript
const examData = {
  title: data.title,
  code: data.code,
  duration: data.duration,
  questions: sanitizedQuestions,
  materials: data.materials || [], // URL 배열
  materials_text: data.materials_text || [], // 텍스트 배열
  rubric: data.rubric || [],
  // ...
};
```

### 4.4 클라이언트 측 파일 처리

**위치**: `app/instructor/new/page.tsx`

**흐름**:

1. 파일 선택/드래그 앤 드롭
2. `extractTextFromFile` 함수 호출 (270번째 줄)
3. `/api/upload`로 파일 업로드
4. `/api/extract-text`로 텍스트 추출
5. 추출된 텍스트를 `materialsText` 상태에 저장
6. 시험 생성 시 `materials_text`로 전송

**관련 코드**:

```typescript
const extractTextFromFile = async (file: File) => {
  // 1. 파일 업로드
  const uploadResponse = await fetch("/api/upload", { ... });

  // 2. 텍스트 추출
  const extractResponse = await fetch("/api/extract-text", {
    body: JSON.stringify({
      fileUrl: uploadResult.url,
      fileName: file.name,
      mimeType: file.type,
    }),
  });

  // 3. 결과 저장
  setExtractedTexts((prev) => {
    const newMap = new Map(prev);
    newMap.set(uploadResult.url, { text, fileName: file.name });
    return newMap;
  });
};
```

### 4.5 라이브러리 및 유틸리티

**위치**: `lib/material-search.ts`

**기능**:

- `formatMaterialsText`: 추출된 텍스트를 DB 저장 형식으로 변환
- 현재는 RAG 검색 기능이 없고, 단순 포맷팅만 수행

---

## 5. 현재 시스템의 한계점 (RAG 구현을 위해 필요한 것)

### 5.1 Vector 저장소 부재

- ❌ 임베딩 벡터를 저장할 컬럼이 없음
- ❌ `pgvector` 확장 미사용
- ❌ 벡터 유사도 검색 기능 없음

### 5.2 임베딩 생성 로직 부재

- ❌ OpenAI Embedding API 호출 코드 없음
- ❌ 텍스트 청킹(chunking) 로직 없음
- ❌ 벡터 변환 및 저장 파이프라인 없음

### 5.3 이미지 처리 부재

- ❌ Vision API를 사용한 이미지 분석 없음
- ❌ 이미지에서 텍스트 추출(OCR) 없음
- ❌ 이미지 설명 생성 없음

### 5.4 검색 기능 부재

- ❌ 의미 기반 검색(semantic search) 없음
- ❌ 벡터 유사도 기반 검색 없음
- ❌ 현재는 단순 텍스트 매칭만 가능 (코드에서 확인되지 않음)

---

## 6. RAG 구현을 위한 다음 단계 제안

### 6.1 DB 스키마 확장

1. **새 테이블 생성** (또는 `exams` 테이블에 컬럼 추가):

   ```sql
   CREATE TABLE document_chunks (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     exam_id UUID REFERENCES exams(id),
     file_url TEXT,
     chunk_index INT,
     content TEXT,
     embedding vector(1536),  -- text-embedding-3-small 사용 시
     metadata JSONB,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops);
   ```

2. **또는 `exams` 테이블에 `materials_embeddings` JSONB 컬럼 추가** (간단한 방법)

### 6.2 임베딩 생성 파이프라인

1. **텍스트 청킹**: 긴 문서를 작은 청크로 분할
2. **임베딩 생성**: OpenAI `text-embedding-3-small` API 호출
3. **벡터 저장**: PostgreSQL `pgvector` 확장 사용

### 6.3 검색 API 구현

1. **쿼리 임베딩 생성**: 사용자 질문을 벡터로 변환
2. **유사도 검색**: 코사인 유사도로 관련 청크 검색
3. **컨텍스트 구성**: 검색된 청크를 프롬프트에 포함

### 6.4 이미지 처리 추가 (선택)

1. **Vision API 통합**: 이미지에서 텍스트/설명 추출
2. **이미지 임베딩**: CLIP 모델 또는 Vision API 사용
3. **멀티모달 검색**: 텍스트 + 이미지 통합 검색

---

## 7. 요약

| 항목               | 현재 상태                        | RAG 구현 필요 여부       |
| ------------------ | -------------------------------- | ------------------------ |
| **DB Vector 타입** | ❌ 없음                          | ✅ 필요                  |
| **임베딩 생성**    | ❌ 없음                          | ✅ 필요                  |
| **텍스트 추출**    | ✅ 구현됨 (PDF, DOCX, PPTX, CSV) | ✅ 유지                  |
| **이미지 분석**    | ❌ 없음                          | ⚠️ 선택적                |
| **벡터 검색**      | ❌ 없음                          | ✅ 필요                  |
| **텍스트 저장**    | ✅ JSONB로 저장                  | ✅ 유지 (추가 작업 필요) |

---

## 8. 참고 파일 목록

- `app/api/upload/route.ts` - 파일 업로드
- `app/api/extract-text/route.ts` - 텍스트 추출
- `app/api/supa/route.ts` - 시험 생성 및 저장
- `app/instructor/new/page.tsx` - 클라이언트 파일 처리
- `lib/material-search.ts` - 자료 검색 유틸리티 (현재는 포맷팅만)
- `prisma/schema.prisma` - DB 스키마 정의
- `lib/openai.ts` - OpenAI 클라이언트 설정

---

**작성일**: 2024년
**목적**: RAG 구현을 위한 현재 시스템 상태 분석

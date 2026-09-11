# RAG 시스템 구현 가이드

> 파일 파싱 및 벡터 검색을 위한 RAG 시스템 구현 완료 문서

## 📋 구현 완료 항목

### ✅ 1. DB 스키마 (pgvector)

**파일**: `prisma/schema.prisma`, `prisma/migrations/*/migration.sql`

- Prisma 스키마에 `exam_material_chunks` 모델 추가
- `vector` 확장 활성화 (마이그레이션 SQL에 포함)
- 벡터 유사도 검색 인덱스 (IVFFlat)
- `match_exam_materials` RPC 함수 생성

**적용 방법**:

```bash
# 마이그레이션 적용 (개발 환경)
npx prisma migrate dev

# 또는 프로덕션 환경
npx prisma migrate deploy

# Prisma Client 생성
npx prisma generate
```

**참고**: 마이그레이션 파일은 `prisma/migrations/20251222152103_add_exam_material_chunks/migration.sql`에 생성되어 있습니다.

### ✅ 2. 임베딩 생성

**파일**: `lib/embedding.ts`, `app/api/embed/route.ts`

- OpenAI `text-embedding-3-small` 모델 사용 (1536차원)
- 단일 텍스트 및 배치 임베딩 생성 지원
- `/api/embed` 엔드포인트 제공

**사용 예시**:

```typescript
import { createEmbedding } from "@/lib/embedding";

const embedding = await createEmbedding("질문 텍스트");
```

### ✅ 3. 텍스트 청킹

**파일**: `lib/chunking.ts`

- 긴 문서를 800자 단위로 분할
- 200자 겹침(overlap)으로 문맥 유지
- 구분자(`\n\n`) 기반 스마트 분할

**사용 예시**:

```typescript
import { chunkText } from "@/lib/chunking";

const chunks = chunkText(longText, {
  chunkSize: 800,
  chunkOverlap: 200,
});
```

### ✅ 4. 파일 텍스트 추출 및 임베딩 저장

**파일**: `app/api/extract-text/route.ts`

**기능**:

- 텍스트 추출 (기존 기능 유지)
- 청킹 및 임베딩 생성
- `exam_material_chunks` 테이블에 자동 저장

**요청 형식**:

```json
{
  "fileUrl": "https://...",
  "fileName": "example.pdf",
  "mimeType": "application/pdf",
  "examId": "uuid" // 선택적, 있으면 자동으로 청크 저장
}
```

### ✅ 5. 시험 생성 시 자동 RAG 처리

**파일**: `app/api/supa/route.ts` (createExam 함수)

**기능**:

- 시험 생성 시 `materials_text` 배열을 자동으로 처리
- 각 파일의 텍스트를 청킹하고 임베딩 생성
- DB에 자동 저장

### ✅ 6. 벡터 유사도 검색

**파일**: `lib/search-chunks.ts`, `app/api/search-materials/route.ts`

**기능**:

- 질문 텍스트를 임베딩으로 변환
- Supabase RPC 함수로 유사도 검색
- 검색 결과를 컨텍스트 문자열로 포맷팅

**사용 예시**:

```typescript
import { searchMaterialChunks } from "@/lib/search-chunks";

const results = await searchMaterialChunks("질문", {
  examId: "uuid", // 선택적
  matchThreshold: 0.5,
  matchCount: 5,
});
```

## 🚀 사용 방법

### 1. DB 설정

Supabase SQL Editor에서 `database/create_rag_tables.sql` 실행:

```sql
-- 벡터 확장 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- 테이블 및 인덱스 생성
-- (파일 내용 참조)
```

### 2. 파일 업로드 및 텍스트 추출

**기존 방식 유지**:

```typescript
// 1. 파일 업로드
const uploadRes = await fetch("/api/upload", {
  method: "POST",
  body: formData,
});

// 2. 텍스트 추출 (examId 포함 시 자동으로 청크 저장)
const extractRes = await fetch("/api/extract-text", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    fileUrl: uploadRes.url,
    fileName: file.name,
    mimeType: file.type,
    examId: "uuid", // 추가: 시험 ID
  }),
});
```

### 3. 시험 생성 시 자동 처리

**기존 코드 그대로 사용**:

```typescript
const examData = {
  title: "시험 제목",
  materials: [fileUrl1, fileUrl2],
  materials_text: [
    { url: fileUrl1, text: "추출된 텍스트...", fileName: "file1.pdf" },
    { url: fileUrl2, text: "추출된 텍스트...", fileName: "file2.docx" },
  ],
  // ...
};

// createExam 호출 시 자동으로 청킹 및 임베딩 저장
await createExamMutation.mutateAsync(examData);
```

### 4. RAG 검색 사용

**API 호출**:

```typescript
const searchRes = await fetch("/api/search-materials", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: "학생의 질문",
    examId: "uuid", // 선택적
    matchThreshold: 0.5, // 선택적
    matchCount: 5, // 선택적
  }),
});

const { results, context } = await searchRes.json();
```

**라이브러리 사용**:

```typescript
import {
  searchMaterialChunks,
  formatSearchResultsAsContext,
} from "@/lib/search-chunks";

const results = await searchMaterialChunks("질문", {
  examId: "uuid",
  matchThreshold: 0.5,
  matchCount: 5,
});

const context = formatSearchResultsAsContext(results);
// 프롬프트에 context 포함하여 AI에게 전달
```

## 📁 파일 구조

```
lib/
  ├── embedding.ts          # 임베딩 생성 유틸리티
  ├── chunking.ts           # 텍스트 청킹 유틸리티
  ├── save-chunks.ts        # 청크 DB 저장 유틸리티
  └── search-chunks.ts      # 벡터 검색 유틸리티

app/api/
  ├── embed/route.ts        # 임베딩 생성 API
  ├── extract-text/route.ts # 텍스트 추출 + 청킹 + 저장
  ├── search-materials/route.ts # RAG 검색 API
  └── supa/route.ts         # 시험 생성 (RAG 처리 포함)

database/
  └── create_rag_tables.sql # DB 스키마 SQL
```

## 🔧 설정

### 환경 변수

기존 환경 변수만 있으면 됩니다:

- `OPENAI_API_KEY`: OpenAI API 키
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Service Role Key

### Supabase 설정

1. **pgvector 확장 활성화**: SQL Editor에서 `CREATE EXTENSION vector;` 실행
2. **테이블 생성**: `database/create_rag_tables.sql` 실행
3. **RLS 정책** (선택적): 필요시 파일 내 주석 참조

## 📊 데이터 흐름

```
1. 파일 업로드
   ↓
2. 텍스트 추출 (extract-text API)
   ↓
3. 청킹 (800자 단위, 200자 겹침)
   ↓
4. 임베딩 생성 (OpenAI text-embedding-3-small)
   ↓
5. DB 저장 (exam_material_chunks 테이블)
   ↓
6. 검색 시: 질문 → 임베딩 → 유사도 검색 → 컨텍스트 생성
```

## 🎯 다음 단계 (선택적)

1. **채팅 API 통합**: `app/api/chat/route.ts`에서 RAG 검색 결과를 프롬프트에 포함
2. **성능 최적화**: IVFFlat 인덱스 파라미터 조정 (데이터 양에 따라)
3. **캐싱**: 자주 검색되는 질문의 임베딩 캐싱
4. **모니터링**: 검색 성능 및 정확도 추적

## ⚠️ 주의사항

1. **임베딩 비용**: OpenAI Embedding API 사용 시 비용 발생
2. **청크 크기**: 현재 800자로 설정되어 있으나, 필요시 조정 가능
3. **검색 임계값**: `matchThreshold`가 너무 높으면 결과가 없을 수 있음
4. **인덱스 성능**: 데이터가 많아지면 IVFFlat 인덱스 재생성 필요

## 📝 참고

- OpenAI Embedding 모델: `text-embedding-3-small` (1536차원)
- 청크 크기: 800자 (겹침 200자)
- 검색 기본값: 유사도 0.5 이상, 상위 5개 결과

---

**구현 완료일**: 2024년
**목적**: RAG 기반 수업 자료 검색 시스템

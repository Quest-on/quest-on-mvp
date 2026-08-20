# RAG 시스템 작동 구조 및 흐름

## 📋 현재 시스템 구조

### 1. 데이터 저장 흐름 (시험 생성 시)

```
[클라이언트] 파일 업로드
    ↓
[API] /api/upload → Supabase Storage에 저장
    ↓
[API] /api/extract-text → 텍스트 추출 (examId 없음, 청크 저장 안 됨)
    ↓
[클라이언트] materials_text 배열 생성
    ↓
[API] /api/supa (createExam)
    ├─ exams 테이블에 시험 저장
    └─ materials_text 배열 처리:
        ├─ 각 파일 텍스트를 청킹 (800자 단위, 200자 겹침)
        ├─ OpenAI Embedding API로 벡터 생성 (text-embedding-3-small)
        └─ exam_material_chunks 테이블에 저장
```

**로그 예시**:

```
🚀 [createExam] RAG 처리 시작: { examId: "...", materialsCount: 2 }
📄 [createExam] 파일 1/2 처리: { fileName: "example.pdf", textLength: 5000 }
✂️ [createExam] 청킹 시작: example.pdf
✅ [createExam] 청킹 완료: { chunksCount: 6, duration: "5ms" }
🧮 [createExam] 임베딩 생성 시작: example.pdf
✅ [createExam] 임베딩 생성 완료: { embeddingsCount: 6, duration: "1200ms" }
💾 [save-chunks] 청크 저장 시작: { examId: "...", chunksCount: 6 }
✅ [save-chunks] 배치 1 저장 완료: { savedCount: 6 }
🎉 [createExam] RAG 처리 완료: { totalChunksSaved: 12 }
```

### 2. 검색 흐름 (학생 질문 시)

```
[학생] 질문 입력
    ↓
[API] /api/chat
    ├─ ✅ 벡터 검색 (searchMaterialChunks)
    │   ├─ 질문을 임베딩 벡터로 변환
    │   ├─ Supabase RPC 함수 (match_exam_materials)로 유사도 검색
    │   └─ 검색 결과를 프롬프트에 포함
    │
    └─ ⚠️ 폴백: 키워드 검색 (searchRelevantMaterials)
        └─ 벡터 검색 결과가 없을 때만 사용
```

**로그 예시**:

```
🔍 [chat] 정규 세션 - RAG 벡터 검색 시작: { examId: "...", questionPreview: "..." }
📝 [search-chunks] 질문 임베딩 생성 시작...
✅ [search-chunks] 질문 임베딩 생성 완료: { dimensions: 1536, duration: "800ms" }
📊 [search-chunks] DB 청크 수 확인: { examId: "...", totalChunks: 12 }
🔎 [search-chunks] RPC 함수 호출 시작...
📥 [search-chunks] RPC 함수 응답: { resultsCount: 3, duration: "50ms" }
🎯 [search-chunks] 검색 완료: { resultsCount: 3, topSimilarity: "0.782" }
✅ [chat] 정규 세션 - 컨텍스트 생성 완료: { contextLength: 1500 }
```

## 🔍 주요 변경사항

### ✅ 수정 완료

1. **chat API에서 벡터 검색 사용**

   - 기존: `searchRelevantMaterials` (키워드 기반)만 사용
   - 변경: `searchMaterialChunks` (벡터 검색) 우선 사용
   - 폴백: 벡터 검색 결과가 없을 때만 키워드 검색 사용

2. **상세 로그 추가**

   - 각 단계별 이모지와 상세 정보 로그
   - 성능 측정 (시간, 개수 등)
   - 에러 발생 시 상세 정보

3. **DB 저장 상태 확인**
   - 청크 저장 전후 로그
   - 배치 처리 상태 추적
   - 검색 전 DB 청크 수 확인

## 📊 로그 확인 방법

### 터미널에서 확인

```bash
# 개발 서버 실행 시 모든 로그가 터미널에 출력됩니다
npm run dev

# 특정 키워드로 필터링
npm run dev | grep "RAG\|벡터\|청크\|임베딩"
```

### 주요 로그 키워드

- `🚀 [createExam]` - 시험 생성 시 RAG 처리
- `💾 [save-chunks]` - 청크 DB 저장
- `🔍 [chat]` - 채팅 시 벡터 검색
- `📝 [search-chunks]` - 검색 상세 로그
- `✅` - 성공
- `⚠️` - 경고
- `❌` - 에러

## 🐛 문제 해결

### 벡터 검색 결과가 없을 때

1. **DB에 청크가 저장되었는지 확인**

   ```
   📊 [search-chunks] DB 청크 수 확인: { examId: "...", totalChunks: 0 }
   ```

   - `totalChunks: 0`이면 청크가 저장되지 않은 것

2. **시험 생성 시 RAG 처리 로그 확인**

   ```
   🎉 [createExam] RAG 처리 완료: { totalChunksSaved: 0 }
   ```

   - `totalChunksSaved: 0`이면 저장 실패

3. **에러 로그 확인**
   ```
   ❌ [createExam] RAG 처리 실패
   ❌ [save-chunks] 청크 저장 실패
   ```

### 벡터 검색이 작동하지 않을 때

1. **RPC 함수 존재 확인**

   - Supabase SQL Editor에서 `match_exam_materials` 함수 확인
   - 마이그레이션 적용 확인: `npx prisma migrate deploy`

2. **임베딩 생성 확인**

   ```
   ✅ [search-chunks] 질문 임베딩 생성 완료: { dimensions: 1536 }
   ```

   - `dimensions: 1536`이 아니면 문제

3. **RPC 함수 호출 에러 확인**
   ```
   ❌ [search-chunks] RPC 함수 호출 실패: { error: "..." }
   ```

## 📝 다음 단계

1. **테스트**: 시험 생성 후 학생 질문으로 벡터 검색 확인
2. **모니터링**: 로그를 통해 각 단계 성능 확인
3. **최적화**: 필요시 임계값, 청크 크기 등 조정

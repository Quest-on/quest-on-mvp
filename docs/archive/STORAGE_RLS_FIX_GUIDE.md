# Supabase Storage RLS 완전 해결 가이드

## 🎯 목표

Direct upload 시 발생하는 RLS 에러를 완전히 제거

## 🔧 해결 방법

### 방법 1: SQL 스크립트 실행 (권장)

Supabase SQL Editor에서 다음 실행:

```sql
-- 버킷을 공개로 설정
UPDATE storage.buckets
SET public = true
WHERE id = 'exam-materials';

-- 기존 정책 삭제
DELETE FROM storage.policies WHERE bucket_id = 'exam-materials';

-- 새로운 정책 생성
INSERT INTO storage.policies (id, bucket_id, name, definition, check_expression) VALUES
('exam-materials-select', 'exam-materials', 'Allow public read access', 'true', 'true'),
('exam-materials-insert', 'exam-materials', 'Allow public insert', 'true', 'true'),
('exam-materials-update', 'exam-materials', 'Allow public update', 'true', 'true'),
('exam-materials-delete', 'exam-materials', 'Allow public delete', 'true', 'true');
```

### 방법 2: Supabase Dashboard 설정

1. **Supabase Dashboard** → **Storage** → **Buckets**
2. **exam-materials** 버킷 클릭
3. **Settings** 탭에서:
   - ✅ **Public bucket** 체크
   - **File size limit**: 적절한 값 설정 (예: 50MB)
   - **Allowed MIME types**: `*` 또는 필요한 타입들
4. **Save** 클릭

### 방법 3: Storage Policies 설정

1. **Supabase Dashboard** → **Authentication** → **Policies**
2. **Storage policies** 탭으로 이동
3. **exam-materials** 버킷에 대해 다음 정책들 생성:

#### Select Policy

- **Policy name**: `Allow public read access`
- **Target roles**: `public`
- **USING expression**: `true`

#### Insert Policy

- **Policy name**: `Allow public insert`
- **Target roles**: `public`
- **WITH CHECK expression**: `true`

#### Update Policy

- **Policy name**: `Allow public update`
- **Target roles**: `public`
- **USING expression**: `true`
- **WITH CHECK expression**: `true`

#### Delete Policy

- **Policy name**: `Allow public delete`
- **Target roles**: `public`
- **USING expression**: `true`

## 🔍 확인 방법

### SQL로 확인:

```sql
-- 버킷 설정 확인
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'exam-materials';

-- 정책 확인
SELECT id, bucket_id, name, definition, check_expression
FROM storage.policies
WHERE bucket_id = 'exam-materials';
```

### 브라우저에서 확인:

1. 시험 생성 페이지에서 파일 업로드 시도
2. 브라우저 개발자 도구 → Console 확인
3. RLS 에러 메시지가 사라졌는지 확인

## 🚨 문제가 지속되는 경우

### 최후의 수단 (개발용):

```sql
-- Storage RLS 완전 비활성화 (개발용만)
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets DISABLE ROW LEVEL SECURITY;
```

## 📝 주의사항

- **프로덕션 환경**에서는 더 엄격한 정책 설정 권장
- **Public bucket** 설정 시 보안 고려 필요
- **파일 크기 제한** 및 **MIME 타입 제한** 설정 권장

## ✅ 성공 확인

성공하면 다음이 사라집니다:

- `StorageApiError: new row violates row-level security policy`
- `Direct upload failed` 메시지
- `RLS policy error detected, falling back to server API` 메시지

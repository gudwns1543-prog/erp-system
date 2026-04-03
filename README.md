# 근태 ERP 시스템

## 설치 및 실행

### 1. 패키지 설치
```bash
npm install
```

### 2. 환경변수 설정
`.env.local.example` 파일을 복사하여 `.env.local` 생성:
```bash
copy .env.local.example .env.local
```
Supabase 프로젝트 Settings > API에서 값 복사 후 입력

### 3. Supabase DB 설정
Supabase 대시보드 → SQL Editor → `supabase_schema.sql` 전체 붙여넣기 후 Run

### 4. 로컬 실행
```bash
npm run dev
```
브라우저에서 http://localhost:3000 접속

### 5. 첫 관리자 계정 생성
1. Supabase → Authentication → Users → Add user
2. 이메일/비밀번호 입력 후 생성
3. profiles 테이블에서 해당 사용자 role을 'director'로 변경
4. status를 'active'로 변경

## Vercel 배포
1. GitHub에 push
2. Vercel에서 Import
3. Environment Variables에 Supabase 키 입력
4. Deploy

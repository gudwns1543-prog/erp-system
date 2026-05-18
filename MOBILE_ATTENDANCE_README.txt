모바일 출근 / 부정출근 방지 패치 구성

1) 덮어쓰기 파일
- src/app/mobile/page.tsx
- src/app/api/mobile-attendance/route.ts
- src/app/api/mobile-attendance/admin/route.ts
- src/app/dashboard/mobile-requests/page.tsx
- src/app/dashboard/layout.tsx
- src/app/login/page.tsx
- src/app/dashboard/page.tsx

2) Supabase SQL Editor에서 1회 실행
- mobile_attendance_migration.sql

3) .env.local / Vercel 환경변수에 추가 권장
- COMPANY_LATITUDE=회사 위도
- COMPANY_LONGITUDE=회사 경도
- COMPANY_RADIUS_METERS=150
- COMPANY_ALLOWED_IPS=회사공인IP1,회사공인IP2

회사 좌표를 아직 모르면 COMPANY_LATITUDE / COMPANY_LONGITUDE를 비워도 됩니다.
단, 이 경우 회사 IP가 아닌 모바일 출근은 승인 대기로 처리됩니다.

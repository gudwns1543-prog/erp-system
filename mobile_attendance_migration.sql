-- ============================================================
-- 모바일 출근 / 부정출근 방지 기능 추가 SQL
-- Supabase SQL Editor에서 1회 실행하세요.
-- ============================================================

create table if not exists public.mobile_attendance_requests (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  work_date date not null,
  requested_time time not null,
  request_type text not null default 'outside_work' check (request_type in ('outside_work','business_trip','exception')),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  approver_id uuid references public.profiles(id),
  approved_at timestamptz,
  admin_note text,
  attendance_id uuid references public.attendance(id) on delete set null,
  source_ip text,
  user_agent text,
  is_mobile boolean default true,
  latitude numeric(11,8),
  longitude numeric(11,8),
  accuracy numeric(10,2),
  distance_meters int,
  decision_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_mobile_att_req_user_date on public.mobile_attendance_requests(user_id, work_date);
create index if not exists idx_mobile_att_req_status on public.mobile_attendance_requests(status, created_at desc);

alter table public.mobile_attendance_requests enable row level security;

drop policy if exists "mobile_attendance_select" on public.mobile_attendance_requests;
drop policy if exists "mobile_attendance_insert_own" on public.mobile_attendance_requests;
drop policy if exists "mobile_attendance_update_admin" on public.mobile_attendance_requests;

create policy "mobile_attendance_select" on public.mobile_attendance_requests for select
  using (user_id = auth.uid() or approver_id = auth.uid() or exists (
    select 1 from public.profiles where id = auth.uid() and role = 'director'
  ));

create policy "mobile_attendance_insert_own" on public.mobile_attendance_requests for insert
  with check (user_id = auth.uid());

create policy "mobile_attendance_update_admin" on public.mobile_attendance_requests for update
  using (approver_id = auth.uid() or exists (
    select 1 from public.profiles where id = auth.uid() and role = 'director'
  ));

-- Realtime 사용 중인 프로젝트라면 실패해도 기능에는 큰 영향 없습니다.
do $$
begin
  alter publication supabase_realtime add table public.mobile_attendance_requests;
exception when others then null;
end $$;

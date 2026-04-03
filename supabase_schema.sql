-- ============================================================
-- 근태 ERP 시스템 DB 스키마
-- Supabase SQL Editor에 전체 붙여넣기 후 Run 클릭
-- ============================================================

-- 1. 직원 프로필 테이블 (auth.users와 연동)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  email text not null,
  tel text,
  dept text default '미배정',
  grade text default '사원',
  role text default 'staff' check (role in ('director', 'staff')),
  join_date date default current_date,
  status text default 'active' check (status in ('active', 'inactive', 'pending')),
  annual_leave int default 15,
  color text default '#E6F1FB',
  tc text default '#185FA5',
  created_at timestamptz default now()
);

-- 2. 급여 정보 테이블
create table public.salary_info (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  annual int default 0,
  dependents int default 1,
  meal int default 200000,
  transport int default 200000,
  comm int default 100000,
  updated_at timestamptz default now(),
  unique(user_id)
);

-- 3. 근태 기록 테이블
create table public.attendance (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  work_date date not null,
  check_in time,
  check_out time,
  reg_hours numeric(5,2) default 0,
  ext_hours numeric(5,2) default 0,
  night_hours numeric(5,2) default 0,
  hol_hours numeric(5,2) default 0,
  hol_eve_hours numeric(5,2) default 0,
  hol_night_hours numeric(5,2) default 0,
  ignored_hours numeric(5,2) default 0,
  is_holiday boolean default false,
  note text,
  created_at timestamptz default now(),
  unique(user_id, work_date)
);

-- 4. 결재 테이블 (연차/출장 등)
create table public.approvals (
  id uuid default gen_random_uuid() primary key,
  requester_id uuid references public.profiles(id) on delete cascade,
  approver_id uuid references public.profiles(id),
  type text not null,
  start_date date not null,
  end_date date not null,
  reason text,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. 공지사항 테이블
create table public.notices (
  id uuid default gen_random_uuid() primary key,
  author_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz default now()
);

-- 6. 채팅방 테이블
create table public.chat_rooms (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- 7. 채팅방 멤버 테이블
create table public.chat_members (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.chat_rooms(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  unique(room_id, user_id)
);

-- 8. 채팅 메시지 테이블
create table public.chat_messages (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.chat_rooms(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete cascade,
  content text not null,
  is_system boolean default false,
  created_at timestamptz default now()
);

-- 9. 가입 대기 테이블
create table public.signup_requests (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text not null unique,
  tel text,
  dept text,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now()
);

-- ============================================================
-- RLS (Row Level Security) 정책 설정
-- ============================================================

alter table public.profiles enable row level security;
alter table public.salary_info enable row level security;
alter table public.attendance enable row level security;
alter table public.approvals enable row level security;
alter table public.notices enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.signup_requests enable row level security;

-- profiles: 본인 + 관리자 전체 조회
create policy "profiles_select" on public.profiles for select
  using (auth.uid() = id or exists (
    select 1 from public.profiles where id = auth.uid() and role = 'director'
  ));
create policy "profiles_update_own" on public.profiles for update
  using (auth.uid() = id);
create policy "profiles_update_admin" on public.profiles for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'director'));
create policy "profiles_insert" on public.profiles for insert
  with check (auth.uid() = id);

-- salary_info: 본인 + 관리자
create policy "salary_select_own" on public.salary_info for select
  using (user_id = auth.uid() or exists (
    select 1 from public.profiles where id = auth.uid() and role = 'director'
  ));
create policy "salary_all_admin" on public.salary_info for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'director'));

-- attendance: 본인 조회/수정, 관리자 전체
create policy "attendance_select" on public.attendance for select
  using (user_id = auth.uid() or exists (
    select 1 from public.profiles where id = auth.uid() and role = 'director'
  ));
create policy "attendance_insert_own" on public.attendance for insert
  with check (user_id = auth.uid());
create policy "attendance_update_own" on public.attendance for update
  using (user_id = auth.uid());
create policy "attendance_all_admin" on public.attendance for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'director'));

-- approvals: 본인 신청/조회, 결재자 처리
create policy "approvals_select" on public.approvals for select
  using (requester_id = auth.uid() or approver_id = auth.uid() or
    exists (select 1 from public.profiles where id = auth.uid() and role = 'director'));
create policy "approvals_insert" on public.approvals for insert
  with check (requester_id = auth.uid());
create policy "approvals_update" on public.approvals for update
  using (approver_id = auth.uid() or exists (
    select 1 from public.profiles where id = auth.uid() and role = 'director'
  ));
create policy "approvals_delete_own" on public.approvals for delete
  using (requester_id = auth.uid() and status = 'pending');

-- notices: 전직원 조회, 관리자만 작성
create policy "notices_select" on public.notices for select using (true);
create policy "notices_insert_admin" on public.notices for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'director'));
create policy "notices_delete_admin" on public.notices for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'director'));

-- chat: 멤버만 조회
create policy "chat_rooms_select" on public.chat_rooms for select
  using (exists (select 1 from public.chat_members where room_id = id and user_id = auth.uid()));
create policy "chat_rooms_insert" on public.chat_rooms for insert with check (auth.uid() is not null);
create policy "chat_rooms_delete" on public.chat_rooms for delete
  using (created_by = auth.uid() or exists (
    select 1 from public.profiles where id = auth.uid() and role = 'director'
  ));
create policy "chat_members_select" on public.chat_members for select
  using (user_id = auth.uid() or exists (
    select 1 from public.chat_members cm where cm.room_id = room_id and cm.user_id = auth.uid()
  ));
create policy "chat_members_insert" on public.chat_members for insert with check (auth.uid() is not null);
create policy "chat_members_delete" on public.chat_members for delete
  using (user_id = auth.uid() or exists (
    select 1 from public.profiles where id = auth.uid() and role = 'director'
  ));
create policy "chat_messages_select" on public.chat_messages for select
  using (exists (select 1 from public.chat_members where room_id = chat_messages.room_id and user_id = auth.uid()));
create policy "chat_messages_insert" on public.chat_messages for insert
  with check (sender_id = auth.uid() or is_system = true);

-- signup_requests: 누구나 신청, 관리자만 조회/처리
create policy "signup_insert" on public.signup_requests for insert with check (true);
create policy "signup_select_admin" on public.signup_requests for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'director'));
create policy "signup_update_admin" on public.signup_requests for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'director'));
create policy "signup_delete_admin" on public.signup_requests for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'director'));

-- ============================================================
-- 트리거: 회원가입 시 profiles 자동 생성
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'pending'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Realtime 활성화 (채팅용)
-- ============================================================
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.chat_rooms;
alter publication supabase_realtime add table public.chat_members;
alter publication supabase_realtime add table public.approvals;
alter publication supabase_realtime add table public.notices;


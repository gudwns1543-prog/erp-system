import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function nowKstIso() {
  return new Date().toISOString()
}
async function getUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return { user: null, profile: null, error: '로그인이 필요합니다.' }
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return { user: null, profile: null, error: '로그인 정보가 만료되었습니다.' }
  const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', data.user.id).maybeSingle()
  if (!profile || profile.role !== 'director') return { user: data.user, profile, error: '관리자 권한이 필요합니다.' }
  return { user: data.user, profile, error: null }
}

async function getNextSeq(userId: string, workDate: string) {
  const { data } = await supabaseAdmin.from('attendance')
    .select('seq, check_in, check_out')
    .eq('user_id', userId)
    .eq('work_date', workDate)
    .order('seq', { ascending: false })
    .order('created_at', { ascending: false })
  const rows = data || []
  const open = rows.find((s:any) => s.check_in && !s.check_out)
  const maxSeq = rows.reduce((max:number, s:any) => Math.max(max, Number(s.seq || 1)), 0)
  return { nextSeq: maxSeq + 1, open }
}

export async function GET(req: NextRequest) {
  const { error } = await getUser(req)
  if (error) return NextResponse.json({ error }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'pending'
  const { data, error: qErr } = await supabaseAdmin.from('mobile_attendance_requests')
    .select('*, user:profiles!mobile_attendance_requests_user_id_fkey(id,name,dept,grade,color,tc), approver:profiles!mobile_attendance_requests_approver_id_fkey(id,name)')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100)
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 400 })
  return NextResponse.json({ ok: true, requests: data || [] })
}

export async function POST(req: NextRequest) {
  const { user, error } = await getUser(req)
  if (error || !user) return NextResponse.json({ error }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const id = body.id
  const action = body.action
  const adminNote = String(body.adminNote || '').trim()
  if (!id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: '요청값이 올바르지 않습니다.' }, { status: 400 })
  }

  const { data: reqRow, error: findErr } = await supabaseAdmin.from('mobile_attendance_requests')
    .select('*').eq('id', id).maybeSingle()
  if (findErr || !reqRow) return NextResponse.json({ error: findErr?.message || '신청 건을 찾을 수 없습니다.' }, { status: 404 })
  if (reqRow.status !== 'pending') return NextResponse.json({ error: '이미 처리된 신청입니다.' }, { status: 400 })

  if (action === 'reject') {
    const { data, error: updErr } = await supabaseAdmin.from('mobile_attendance_requests').update({
      status: 'rejected',
      approver_id: user.id,
      approved_at: nowKstIso(),
      admin_note: adminNote || null,
    }).eq('id', id).select('*').single()
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })
    return NextResponse.json({ ok: true, message: '반려 처리되었습니다.', request: data })
  }

  const noteLabel = reqRow.request_type === 'business_trip' ? '모바일 출장출근 승인' : reqRow.request_type === 'training' ? '모바일 교육출근 승인' : reqRow.request_type === 'exception' ? '모바일 예외출근 승인' : '모바일 외근출근 승인'
  const { nextSeq, open } = await getNextSeq(reqRow.user_id, reqRow.work_date)

  if (open) {
    return NextResponse.json({ error: '이미 해당 직원에게 근무 중인 출근 기록이 있습니다. 기존 기록을 확인한 뒤 처리해 주세요.' }, { status: 400 })
  }

  const { data: att, error: attErr } = await supabaseAdmin.from('attendance').insert({
    user_id: reqRow.user_id,
    work_date: reqRow.work_date,
    seq: nextSeq,
    check_in: reqRow.requested_time,
    is_holiday: false,
    note: noteLabel,
  }).select('*').single()
  if (attErr) return NextResponse.json({ error: attErr.message }, { status: 400 })

  const { data, error: updErr } = await supabaseAdmin.from('mobile_attendance_requests').update({
    status: 'approved',
    approver_id: user.id,
    approved_at: nowKstIso(),
    admin_note: adminNote || null,
    attendance_id: att.id,
  }).eq('id', id).select('*').single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })
  return NextResponse.json({ ok: true, message: '승인 처리되어 근태 기록에 반영되었습니다.', request: data, attendance: att })
}

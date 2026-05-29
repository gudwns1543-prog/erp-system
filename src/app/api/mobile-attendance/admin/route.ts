
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function getUser(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return { user: null as any, profile: null as any, error: '로그인이 필요합니다.' }
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return { user: null as any, profile: null as any, error: '로그인이 만료되었습니다.' }
  const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', data.user.id).maybeSingle()
  return { user: data.user, profile, error: null as any }
}
function nowIso() { return new Date().toISOString() }
async function nextSeq(userId: string, workDate: string) {
  const { data } = await supabaseAdmin.from('attendance')
    .select('seq').eq('user_id', userId).eq('work_date', workDate)
    .order('seq', { ascending: false }).limit(1)
  return Number(data?.[0]?.seq || 0) + 1
}
function noteLabel(type: string) {
  if (type === 'business_trip') return '모바일 출장출근 승인'
  if (type === 'training') return '모바일 교육출근 승인'
  if (type === 'exception') return '모바일 예외출근 승인'
  return '모바일 외근출근 승인'
}

export async function GET(req: NextRequest) {
  const { profile, error } = await getUser(req)
  if (error) return NextResponse.json({ error }, { status: 401 })
  if (profile?.role !== 'director') return NextResponse.json({ error: '관리자만 조회할 수 있습니다.' }, { status: 403 })
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
  const { user, profile, error } = await getUser(req)
  if (error || !user) return NextResponse.json({ error }, { status: 401 })
  if (profile?.role !== 'director') return NextResponse.json({ error: '관리자만 처리할 수 있습니다.' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const id = body.id
  const action = body.action
  const adminNote = String(body.adminNote || '').trim()
  if (!id || !['approve','reject'].includes(action)) return NextResponse.json({ error: '요청값이 올바르지 않습니다.' }, { status: 400 })

  const { data: reqRow, error: findErr } = await supabaseAdmin.from('mobile_attendance_requests')
    .select('*').eq('id', id).maybeSingle()
  if (findErr || !reqRow) return NextResponse.json({ error: findErr?.message || '신청을 찾을 수 없습니다.' }, { status: 404 })
  if (reqRow.status !== 'pending') return NextResponse.json({ error: '이미 처리된 신청입니다.' }, { status: 400 })

  if (action === 'reject') {
    const { data, error: updErr } = await supabaseAdmin.from('mobile_attendance_requests').update({
      status: 'rejected', approver_id: user.id, approved_at: nowIso(), admin_note: adminNote || null,
    }).eq('id', id).select('*').single()
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })
    return NextResponse.json({ ok: true, message: '반려 처리되었습니다.', request: data })
  }

  const { data: open } = await supabaseAdmin.from('attendance')
    .select('id, check_in, check_out')
    .eq('user_id', reqRow.user_id).eq('work_date', reqRow.work_date)
    .is('check_out', null).not('check_in','is',null)
    .limit(1).maybeSingle()
  if (open) return NextResponse.json({ error: '이미 해당 직원에게 근무 중인 출근 기록이 있습니다.' }, { status: 400 })

  const seq = await nextSeq(reqRow.user_id, reqRow.work_date)
  const { data: att, error: attErr } = await supabaseAdmin.from('attendance').insert({
    user_id: reqRow.user_id,
    work_date: reqRow.work_date,
    seq,
    check_in: reqRow.requested_time,
    is_holiday: false,
    note: noteLabel(reqRow.request_type),
  }).select('*').single()
  if (attErr) return NextResponse.json({ error: attErr.message }, { status: 400 })

  const { data, error: updErr } = await supabaseAdmin.from('mobile_attendance_requests').update({
    status: 'approved', approver_id: user.id, approved_at: nowIso(), admin_note: adminNote || null, attendance_id: att.id,
  }).eq('id', id).select('*').single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })
  return NextResponse.json({ ok: true, message: '승인 처리되어 근태 기록에 반영되었습니다.', request: data, attendance: att })
}

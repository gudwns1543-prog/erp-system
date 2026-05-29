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

function kstTodayStr() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

function kstHour() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.getUTCHours()
}

function parseTimeSec(t: string): number {
  const [h, m, s] = String(t || '00:00:00').split(':').map(Number)
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0)
}

function overlap(s1:number,e1:number,s2:number,e2:number) {
  return Math.max(0, Math.min(e1,e2) - Math.max(s1,s2))
}

function secToHours(s:number) {
  return Math.round(Math.max(s,0) / 360) / 10
}

function calcWork(checkIn: string, checkOut: string) {
  const inS = parseTimeSec(checkIn)
  let outS = parseTimeSec(checkOut)
  if (outS < inS) outS += 86400
  const lunch = overlap(inS, outS, 43200, 46800)
  const reg = Math.max(0, overlap(inS, outS, 32400, 64800) - lunch)
  const ext = overlap(inS, outS, 68400, 79200)
  const night = overlap(inS, outS, 79200, 111600)
  return { reg: secToHours(reg), ext: secToHours(ext), night: secToHours(night) }
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

function getNoteLabel(type: string) {
  if (type === 'business_trip') return '모바일 출장출근 승인'
  if (type === 'training') return '모바일 교육출근 승인'
  if (type === 'exception') return '모바일 예외출근 승인'
  return '모바일 외근출근 승인'
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

  const today = kstTodayStr()
  const requestDate = String(reqRow.work_date)
  const shouldAutoClose =
    requestDate < today ||
    (requestDate === today && kstHour() >= 18)

  const noteLabel = getNoteLabel(reqRow.request_type)

  // 같은 날짜의 열린 세션 확인. 과거일 또는 18시 이후 승인 건은 자동으로 18:00 마감 처리합니다.
  const { data: openSessions, error: openErr } = await supabaseAdmin.from('attendance')
    .select('id, check_in, check_out, note, work_date')
    .eq('user_id', reqRow.user_id)
    .eq('work_date', reqRow.work_date)
    .is('check_out', null)
    .not('check_in', 'is', null)
    .order('created_at', { ascending: false })

  if (openErr) return NextResponse.json({ error: openErr.message }, { status: 400 })

  if (openSessions?.length) {
    if (!shouldAutoClose) {
      return NextResponse.json({ error: '이미 해당 직원에게 근무 중인 출근 기록이 있습니다. 기존 기록을 확인한 뒤 처리해 주세요.' }, { status: 400 })
    }

    for (const open of openSessions) {
      const inHour = parseInt(String(open.check_in || '00').slice(0, 2))
      const closeTime = inHour >= 18 ? '23:59:00' : '18:00:00'
      const r = calcWork(open.check_in, closeTime)
      await supabaseAdmin.from('attendance').update({
        check_out: closeTime,
        reg_hours: r.reg,
        ext_hours: r.ext,
        night_hours: r.night,
        note: open.note || '자동퇴근',
      }).eq('id', open.id)
    }
  }

  // 다음 seq 계산
  const { data: seqRows, error: seqErr } = await supabaseAdmin.from('attendance')
    .select('seq')
    .eq('user_id', reqRow.user_id)
    .eq('work_date', reqRow.work_date)
    .order('seq', { ascending: false })
    .limit(1)

  if (seqErr) return NextResponse.json({ error: seqErr.message }, { status: 400 })
  const nextSeq = Math.max(0, ...(seqRows || []).map((r:any) => Number(r.seq || 0))) + 1

  const closeTime = shouldAutoClose
    ? (parseInt(String(reqRow.requested_time || '00').slice(0, 2)) >= 18 ? '23:59:00' : '18:00:00')
    : null
  const calc = closeTime ? calcWork(reqRow.requested_time, closeTime) : null

  const { data: att, error: attErr } = await supabaseAdmin.from('attendance').insert({
    user_id: reqRow.user_id,
    work_date: reqRow.work_date,
    seq: nextSeq,
    check_in: reqRow.requested_time,
    check_out: closeTime,
    reg_hours: calc?.reg || 0,
    ext_hours: calc?.ext || 0,
    night_hours: calc?.night || 0,
    is_holiday: false,
    note: closeTime ? `${noteLabel} · 자동퇴근` : noteLabel,
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
  return NextResponse.json({ ok: true, message: closeTime ? '승인 처리되어 근태 기록에 반영되었고 자동퇴근까지 처리되었습니다.' : '승인 처리되어 근태 기록에 반영되었습니다.', request: data, attendance: att })
}

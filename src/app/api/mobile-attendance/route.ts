
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

function todayStr() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth()+1).padStart(2,'0')}-${String(kst.getUTCDate()).padStart(2,'0')}`
}
function nowTimeStr() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return `${String(kst.getUTCHours()).padStart(2,'0')}:${String(kst.getUTCMinutes()).padStart(2,'0')}:${String(kst.getUTCSeconds()).padStart(2,'0')}`
}
function nowKstIso() {
  return new Date().toISOString()
}
function isMobileUA(ua: string) {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua || '')
}
function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || ''
}
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000
  const toRad = (v: number) => v * Math.PI / 180
  const dLat = toRad(lat2-lat1)
  const dLon = toRad(lon2-lon1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)))
}
async function getUser(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return { user: null as any, error: '로그인이 필요합니다.' }
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return { user: null as any, error: '로그인이 만료되었습니다.' }
  return { user: data.user, error: null as any }
}
async function getDirectorId() {
  const { data } = await supabaseAdmin.from('profiles')
    .select('id,name,grade,role')
    .eq('status','active')
    .eq('role','director')
  const sorted = (data || []).sort((a:any,b:any) => {
    if (a.name === '박팔주') return -1
    if (b.name === '박팔주') return 1
    return (a.name || '').localeCompare(b.name || '', 'ko')
  })
  return sorted[0]?.id || null
}
async function nextSeq(userId: string, workDate: string) {
  const { data } = await supabaseAdmin.from('attendance')
    .select('seq')
    .eq('user_id', userId)
    .eq('work_date', workDate)
    .order('seq', { ascending: false })
    .limit(1)
  return Number(data?.[0]?.seq || 0) + 1
}
function requestTypeLabel(t: string) {
  if (t === 'business_trip') return '출장'
  if (t === 'training') return '교육'
  if (t === 'exception') return '예외'
  return '외근'
}
function noteForType(t: string) {
  if (t === 'business_trip') return '모바일 출장출근 승인'
  if (t === 'training') return '모바일 교육출근 승인'
  if (t === 'exception') return '모바일 예외출근 승인'
  return '모바일 외근출근 승인'
}
function makeDecision(req: NextRequest, gps: any, attendanceType: string) {
  const ua = req.headers.get('user-agent') || ''
  const ip = getIp(req)
  const lat = Number(gps?.lat ?? gps?.latitude)
  const lng = Number(gps?.lng ?? gps?.longitude)
  const accuracy = Number(gps?.accuracy || 0)
  const hasGps = Number.isFinite(lat) && Number.isFinite(lng)
  const officeLat = Number(process.env.OFFICE_LAT || process.env.NEXT_PUBLIC_OFFICE_LAT || 0)
  const officeLng = Number(process.env.OFFICE_LNG || process.env.NEXT_PUBLIC_OFFICE_LNG || 0)
  const radius = Number(process.env.OFFICE_RADIUS_M || process.env.NEXT_PUBLIC_OFFICE_RADIUS_M || 150)
  const hasOffice = !!officeLat && !!officeLng
  const distance = hasGps && hasOffice ? distanceMeters(lat, lng, officeLat, officeLng) : null
  const inCompanyRadius = distance !== null && distance <= radius
  const mobile = isMobileUA(ua)

  const externalType = ['business_trip','training','outside_work','exception'].includes(attendanceType)
  let needsApproval = externalType
  let reason = externalType ? `${requestTypeLabel(attendanceType)} 출근 신청` : '회사 출근'

  if (!externalType) {
    if (!hasGps) { needsApproval = true; reason = 'GPS 위치정보 없음' }
    else if (accuracy && accuracy > 300) { needsApproval = true; reason = `GPS 정확도 낮음(${Math.round(accuracy)}m)` }
    else if (hasOffice && !inCompanyRadius) { needsApproval = true; reason = `회사 반경 밖(${distance}m)` }
  }
  return { ip, ua, mobile, lat: hasGps ? lat : null, lng: hasGps ? lng : null, accuracy: accuracy || null, distance, inCompanyRadius, needsApproval, reason }
}

export async function GET(req: NextRequest) {
  const { user, error } = await getUser(req)
  if (!user) return NextResponse.json({ error }, { status: 401 })
  const ds = todayStr()
  const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', user.id).maybeSingle()
  const { data: sessions } = await supabaseAdmin.from('attendance')
    .select('*').eq('user_id', user.id).eq('work_date', ds).order('seq', { ascending: true }).order('created_at', { ascending: true })
  const { data: pending } = await supabaseAdmin.from('mobile_attendance_requests')
    .select('*').eq('user_id', user.id).eq('work_date', ds).eq('status', 'pending').order('created_at', { ascending: false })
  return NextResponse.json({ ok: true, today: ds, now: nowTimeStr(), profile, sessions: sessions || [], pending: pending || [] })
}

export async function POST(req: NextRequest) {
  const { user, error } = await getUser(req)
  if (!user) return NextResponse.json({ error }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const action = body.action
  const memo = String(body.memo || '').trim()
  const attendanceType = String(body.attendanceType || 'normal')
  const gps = body.gps || {}
  const ds = todayStr()
  const t = nowTimeStr()
  const d = makeDecision(req, gps, attendanceType)

  if (action === 'checkin') {
    const { data: open } = await supabaseAdmin.from('attendance')
      .select('id,check_in,check_out')
      .eq('user_id', user.id).eq('work_date', ds)
      .is('check_out', null).not('check_in', 'is', null)
      .limit(1).maybeSingle()
    if (open) return NextResponse.json({ error: '이미 근무 중인 출근 기록이 있습니다.' }, { status: 400 })

    const { data: pending } = await supabaseAdmin.from('mobile_attendance_requests')
      .select('id').eq('user_id', user.id).eq('work_date', ds).eq('status', 'pending').limit(1).maybeSingle()
    if (pending) return NextResponse.json({ error: '이미 승인 대기 중인 모바일 출근 신청이 있습니다.' }, { status: 400 })

    if (!d.needsApproval) {
      const seq = await nextSeq(user.id, ds)
      const { data, error: insErr } = await supabaseAdmin.from('attendance').insert({
        user_id: user.id,
        work_date: ds,
        seq,
        check_in: t,
        is_holiday: false,
        note: d.mobile ? '모바일 정상출근' : '정상출근',
      }).select('*').single()
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })
      return NextResponse.json({ ok: true, mode: 'approved', message: '출근 처리되었습니다.', record: data, audit: d })
    }

    const requestType = attendanceType === 'normal' ? 'outside_work' : attendanceType
    if (!memo) return NextResponse.json({ error: `${requestTypeLabel(requestType)} 출근 사유를 입력해야 합니다.` }, { status: 400 })
    const approverId = await getDirectorId()
    const { data: reqRow, error: reqErr } = await supabaseAdmin.from('mobile_attendance_requests').insert({
      user_id: user.id,
      work_date: ds,
      requested_time: t,
      request_type: requestType,
      reason: memo,
      status: 'pending',
      approver_id: approverId,
      source_ip: d.ip,
      user_agent: d.ua,
      is_mobile: d.mobile,
      latitude: d.lat,
      longitude: d.lng,
      accuracy: d.accuracy,
      distance_meters: d.distance,
      decision_reason: d.reason,
    }).select('*').single()
    if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 400 })
    return NextResponse.json({ ok: true, mode: 'pending', message: '모바일 외부 출근 신청이 관리자 결재함으로 접수되었습니다.', request: reqRow, audit: d })
  }

  return NextResponse.json({ error: '지원하지 않는 요청입니다.' }, { status: 400 })
}

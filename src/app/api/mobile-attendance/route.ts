import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function kstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
}
function todayStr() {
  return kstNow().toISOString().slice(0, 10)
}
function nowTimeStr() {
  const d = kstNow()
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`
}
function clientIp(req: NextRequest) {
  const xf = req.headers.get('x-forwarded-for') || ''
  return xf.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}
function isMobileUA(ua: string) {
  return /Mobile|Android|iPhone|iPad|iPod|Windows Phone/i.test(ua || '')
}
function allowIps() {
  return (process.env.COMPANY_ALLOWED_IPS || '')
    .split(',').map(v => v.trim()).filter(Boolean)
}
function isAllowedCompanyIp(ip: string) {
  const list = allowIps()
  if (!list.length || !ip || ip === 'unknown') return false
  return list.some(v => ip === v || ip.startsWith(v))
}
function toNumber(v: any) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000
  const toRad = (x: number) => x * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}
function companyLocation() {
  const lat = toNumber(process.env.COMPANY_LATITUDE)
  const lng = toNumber(process.env.COMPANY_LONGITUDE)
  const radius = toNumber(process.env.COMPANY_RADIUS_METERS) || 150
  if (lat === null || lng === null) return null
  return { lat, lng, radius }
}
async function getUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return { user: null, error: '로그인이 필요합니다.' }
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return { user: null, error: '로그인 정보가 만료되었습니다.' }
  return { user: data.user, error: null }
}
async function getDirectorId() {
  const { data } = await supabaseAdmin.from('profiles')
    .select('id, grade, role')
    .eq('status', 'active')
    .eq('role', 'director')
    .limit(1)
    .maybeSingle()
  return data?.id || null
}
function decision(req: NextRequest, gps: any) {
  const ip = clientIp(req)
  const ua = req.headers.get('user-agent') || ''
  const mobile = isMobileUA(ua)
  const companyIp = isAllowedCompanyIp(ip)
  const cfg = companyLocation()
  const lat = toNumber(gps?.latitude)
  const lng = toNumber(gps?.longitude)
  const accuracy = toNumber(gps?.accuracy)
  let distance: number | null = null
  let inCompanyRadius = false
  if (cfg && lat !== null && lng !== null) {
    distance = distanceMeters(cfg.lat, cfg.lng, lat, lng)
    inCompanyRadius = distance <= cfg.radius
  }
  const hasGps = lat !== null && lng !== null
  const normal = companyIp || inCompanyRadius
  const needsApproval = !normal
  const reason = companyIp
    ? '회사 허용 IP에서 접속'
    : inCompanyRadius
      ? `회사 위치 반경 내 접속${distance !== null ? ` (${distance}m)` : ''}`
      : hasGps
        ? `회사 위치 반경 밖 접속${distance !== null ? ` (${distance}m)` : ''}`
        : 'GPS 위치 확인 불가 또는 권한 거부'
  return { ip, ua, mobile, companyIp, hasGps, lat, lng, accuracy, distance, inCompanyRadius, needsApproval, reason }
}

export async function GET(req: NextRequest) {
  const { user, error } = await getUser(req)
  if (!user) return NextResponse.json({ error }, { status: 401 })
  const ds = todayStr()
  const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', user.id).maybeSingle()
  const { data: sessions } = await supabaseAdmin.from('attendance')
    .select('*').eq('user_id', user.id).eq('work_date', ds).order('created_at', { ascending: true })
  const { data: pending } = await supabaseAdmin.from('mobile_attendance_requests')
    .select('*').eq('user_id', user.id).eq('work_date', ds).eq('status', 'pending').order('created_at', { ascending: false })
  return NextResponse.json({ ok: true, today: ds, now: nowTimeStr(), profile, sessions: sessions || [], pending: pending || [] })
}

export async function POST(req: NextRequest) {
  const { user, error } = await getUser(req)
  if (!user) return NextResponse.json({ error }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const action = body.action
  const gps = body.gps || {}
  const memo = String(body.memo || '').trim()
  const attendanceType = body.attendanceType || 'outside_work'
  const ds = todayStr()
  const t = nowTimeStr()
  const d = decision(req, gps)

  if (action === 'checkin') {
    const { data: open } = await supabaseAdmin.from('attendance')
      .select('id, check_in, check_out, note').eq('user_id', user.id).eq('work_date', ds).is('check_out', null).not('check_in', 'is', null)
      .limit(1).maybeSingle()
    if (open) return NextResponse.json({ error: '이미 근무 중인 출근 기록이 있습니다.' }, { status: 400 })

    const { data: pending } = await supabaseAdmin.from('mobile_attendance_requests')
      .select('id').eq('user_id', user.id).eq('work_date', ds).eq('status', 'pending').limit(1).maybeSingle()
    if (pending) return NextResponse.json({ error: '이미 승인 대기 중인 모바일 출근 신청이 있습니다.' }, { status: 400 })

    if (!d.needsApproval) {
      const { data, error: insErr } = await supabaseAdmin.from('attendance').insert({
        user_id: user.id,
        work_date: ds,
        check_in: t,
        is_holiday: false,
        note: d.mobile ? '모바일 정상출근' : '정상출근',
      }).select('*').single()
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })
      return NextResponse.json({ ok: true, mode: 'approved', message: '출근 처리되었습니다.', record: data, audit: d })
    }

    if (!memo) {
      return NextResponse.json({ error: '회사 밖 모바일 출근은 출장/외근 사유를 입력해야 합니다.' }, { status: 400 })
    }
    const approverId = await getDirectorId()
    const { data: reqRow, error: reqErr } = await supabaseAdmin.from('mobile_attendance_requests').insert({
      user_id: user.id,
      work_date: ds,
      requested_time: t,
      request_type: attendanceType,
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
    return NextResponse.json({ ok: true, mode: 'pending', message: '회사 밖 모바일 출근으로 감지되어 관리자 승인 대기로 접수되었습니다.', request: reqRow, audit: d })
  }

  if (action === 'checkout') {
    const { data: open } = await supabaseAdmin.from('attendance')
      .select('*').eq('user_id', user.id).eq('work_date', ds).is('check_out', null).not('check_in', 'is', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!open) return NextResponse.json({ error: '퇴근 처리할 근무 중 기록이 없습니다.' }, { status: 400 })
    const { data, error: updErr } = await supabaseAdmin.from('attendance')
      .update({ check_out: t, note: open.note ? `${open.note} · 모바일퇴근` : '모바일퇴근' })
      .eq('id', open.id).select('*').single()
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })
    return NextResponse.json({ ok: true, message: '퇴근 처리되었습니다.', record: data, audit: d })
  }

  return NextResponse.json({ error: '지원하지 않는 작업입니다.' }, { status: 400 })
}

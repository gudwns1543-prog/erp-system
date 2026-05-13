import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Supabase Admin 클라이언트 (서비스 롤 키 필요)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 초 단위 시간 계산
function parseTimeSec(t: string): number {
  const parts = t.split(':').map(Number)
  return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0)
}
function overlap(s1:number,e1:number,s2:number,e2:number){ return Math.max(0,Math.min(e1,e2)-Math.max(s1,s2)) }
function secToHours(s:number){ return Math.round(Math.max(s,0)/360)/10 }

// 야간 자동 컷오프: 익일 07:00으로 처리
// 어제 출근했는데 퇴근 못 찍은 사람들 처리
// (어제 18시 자동퇴근 cron에서 18시 이후 출근자만 제외됐기 때문에 야근자만 남음)
function calcWorkOvernight(checkIn: string) {
  // checkIn은 어제 시각, checkOut은 익일 07:00으로 가정
  const inS = parseTimeSec(checkIn)
  const outS = parseTimeSec('07:00:00') + 86400 // 익일 07:00

  // 시간 구간 (초 단위)
  // 정규 09~18 = 32400~64800
  // 시간외 19~22 = 68400~79200
  // 야간 22~익일07 = 79200~111600
  const lunch = overlap(inS, outS, 43200, 46800) // 12~13시
  const dinner = overlap(inS, outS, 64800, 68400) // 18~19시
  const reg = Math.max(0, overlap(inS, outS, 32400, 64800) - lunch)
  const ext = Math.max(0, overlap(inS, outS, 68400, 79200) - dinner)
  const night = overlap(inS, outS, 79200, 111600)

  return {
    reg: secToHours(reg),
    ext: secToHours(ext),
    night: secToHours(night),
  }
}

export async function POST(req: NextRequest) {
  // Vercel Cron 또는 수동 호출 시 보안 키 확인
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const koreaTime = new Date(now.getTime() + 9 * 60 * 60 * 1000) // KST

    // 어제 날짜 (KST 기준)
    const yesterday = new Date(koreaTime.getTime() - 86400 * 1000)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)

    // 어제 미퇴근 세션 모두 조회
    const { data: openSessions, error } = await supabaseAdmin
      .from('attendance')
      .select('id, user_id, work_date, check_in, note')
      .eq('work_date', yesterdayStr)
      .is('check_out', null)
      .not('check_in', 'is', null)

    if (error) throw error
    if (!openSessions?.length) {
      return NextResponse.json({ message: '미퇴근자 없음', date: yesterdayStr })
    }

    // 각 직원별 가장 최근 미퇴근 세션만 처리 (여러 세션 중 마지막 것)
    const byUser: Record<string, any> = {}
    for (const s of openSessions) {
      if (!byUser[s.user_id] || s.check_in > byUser[s.user_id].check_in) {
        byUser[s.user_id] = s
      }
    }

    const autoCheckout = '07:00:00' // 야간 컷오프 시각
    let processed = 0

    for (const session of Object.values(byUser)) {
      // 이미 연차/반차로 처리된 날이면 스킵
      if (session.note && ['연차','반차(오전)','반차(오후)','반반차'].includes(session.note)) continue

      // 18시 이후 출근(=야근 시작)한 경우만 처리
      // (18시 이전 출근자는 이미 18시 자동퇴근 cron에서 처리됐어야 함)
      const inHour = parseInt(session.check_in.slice(0, 2))
      if (inHour < 18) continue

      const { reg, ext, night } = calcWorkOvernight(session.check_in)
      await supabaseAdmin.from('attendance').update({
        check_out: autoCheckout,
        reg_hours: reg,
        ext_hours: ext,
        night_hours: night,
        note: '야간자동컷오프',
      }).eq('id', session.id)
      processed++
    }

    return NextResponse.json({
      message: `야간 자동 컷오프 완료: ${processed}명 처리`,
      date: yesterdayStr,
      processed
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}

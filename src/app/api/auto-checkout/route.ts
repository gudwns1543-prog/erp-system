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

function calcWork(checkIn: string, checkOut: string) {
  const inS = parseTimeSec(checkIn)
  let outS = parseTimeSec(checkOut)
  if (outS < inS) outS += 86400
  const lunch = overlap(inS,outS,43200,46800)
  const reg   = Math.max(0, overlap(inS,outS,32400,64800) - lunch)
  const ext   = overlap(inS,outS,68400,79200)
  const night = overlap(inS,outS,79200,111600)
  return { reg: secToHours(reg), ext: secToHours(ext), night: secToHours(night) }
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
    const todayStr = koreaTime.toISOString().slice(0, 10)
    const hour = koreaTime.getHours()

    // 18시 이전이면 실행 안 함
    if (hour < 18) {
      return NextResponse.json({ message: '18시 이전 - 자동퇴근 미실행', hour })
    }

    // 오늘 미퇴근(check_out IS NULL) 세션 모두 조회
    const { data: openSessions, error } = await supabaseAdmin
      .from('attendance')
      .select('id, user_id, work_date, check_in')
      .eq('work_date', todayStr)
      .is('check_out', null)
      .not('check_in', 'is', null)

    if (error) throw error
    if (!openSessions?.length) {
      return NextResponse.json({ message: '미퇴근자 없음' })
    }

    // 각 직원별 가장 최근 미퇴근 세션만 처리 (여러 세션 중 마지막 것만)
    const byUser: Record<string, any> = {}
    for (const s of openSessions) {
      if (!byUser[s.user_id] || s.check_in > byUser[s.user_id].check_in) {
        byUser[s.user_id] = s
      }
    }

    const autoCheckout = '18:00:00'
    let processed = 0

    for (const session of Object.values(byUser)) {
      // 이미 연차/반차로 처리된 날이면 스킵 (note 컬럼 확인)
      const { data: noteCheck } = await supabaseAdmin
        .from('attendance').select('note').eq('id', session.id).maybeSingle()
      if (noteCheck?.note && ['연차','반차(오전)','반차(오후)','반반차'].includes(noteCheck.note)) continue

      // check_in이 18시 이후면 스킵 (야근 시작한 경우)
      const inHour = parseInt(session.check_in.slice(0, 2))
      if (inHour >= 18) continue

      // check_in이 18시 이전이면 18:00으로 자동 퇴근
      const { reg, ext, night } = calcWork(session.check_in, autoCheckout)
      await supabaseAdmin.from('attendance').update({
        check_out: autoCheckout,
        reg_hours: reg,
        ext_hours: ext,
        night_hours: night,
        note: '자동퇴근',
      }).eq('id', session.id)
      processed++
    }

    return NextResponse.json({
      message: `자동퇴근 완료: ${processed}명 처리`,
      date: todayStr,
      processed
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET도 지원 (Vercel Cron은 GET으로 호출)
export async function GET(req: NextRequest) {
  return POST(req)
}

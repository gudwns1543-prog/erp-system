import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 초 단위 시간 변환
function parseTimeSec(t: string): number {
  const parts = t.split(':').map(Number)
  return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0)
}
function overlap(s1:number,e1:number,s2:number,e2:number){ return Math.max(0,Math.min(e1,e2)-Math.max(s1,s2)) }
function secToHours(s:number){ return Math.round(Math.max(s,0)/360)/10 }

// 출근/퇴근 초로 근무시간 계산 (퇴근이 익일이면 86400+ 로 전달)
function calcWork(checkInSec: number, checkOutSec: number) {
  const lunch = overlap(checkInSec, checkOutSec, 43200, 46800) // 12~13시
  const dinner = overlap(checkInSec, checkOutSec, 64800, 68400) // 18~19시
  const reg = Math.max(0, overlap(checkInSec, checkOutSec, 32400, 64800) - lunch)
  const ext = Math.max(0, overlap(checkInSec, checkOutSec, 68400, 79200) - dinner)
  const night = overlap(checkInSec, checkOutSec, 79200, 111600)
  return {
    reg: secToHours(reg),
    ext: secToHours(ext),
    night: secToHours(night),
  }
}

export async function POST(req: NextRequest) {
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

    // 어제 미퇴근 세션 전부 조회
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

    // 직원별 가장 최근 미퇴근 세션만 처리
    const byUser: Record<string, any> = {}
    for (const s of openSessions) {
      if (!byUser[s.user_id] || s.check_in > byUser[s.user_id].check_in) {
        byUser[s.user_id] = s
      }
    }

    let processedDay = 0
    let processedNight = 0

    for (const session of Object.values(byUser)) {
      // 이미 연차/반차로 처리된 날이면 스킵
      if (session.note && ['연차','반차(오전)','반차(오후)','반반차'].includes(session.note)) continue

      const inHour = parseInt(session.check_in.slice(0, 2))
      const checkInSec = parseTimeSec(session.check_in)

      let checkOut: string
      let checkOutSec: number
      let noteVal: string

      if (inHour < 18) {
        // 18시 이전 출근 → 18:00으로 처리 (당일 자동퇴근)
        checkOut = '18:00:00'
        checkOutSec = parseTimeSec('18:00:00')
        noteVal = '자동퇴근'
        processedDay++
      } else {
        // 18시 이후 출근(야간 출근) → 익일 07:00으로 처리
        checkOut = '07:00:00'
        checkOutSec = parseTimeSec('07:00:00') + 86400 // 익일 표현
        noteVal = '야간자동컷오프'
        processedNight++
      }

      const { reg, ext, night } = calcWork(checkInSec, checkOutSec)

      await supabaseAdmin.from('attendance').update({
        check_out: checkOut,
        reg_hours: reg,
        ext_hours: ext,
        night_hours: night,
        note: noteVal,
      }).eq('id', session.id)
    }

    return NextResponse.json({
      message: `자동 컷오프 완료`,
      date: yesterdayStr,
      day_checkout: processedDay,
      night_checkout: processedNight,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}

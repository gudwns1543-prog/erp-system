import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function parseTimeSec(t: string): number {
  const parts = String(t || '00:00:00').split(':').map(Number)
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0)
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

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const todayStr = kstTodayStr()
    const hour = kstHour()

    if (hour < 18) {
      // 과거 미퇴근 세션은 18시 이전에도 정리할 수 있게 처리합니다.
      // 오늘 건은 18시 전에는 닫지 않습니다.
    }

    const { data: openSessions, error } = await supabaseAdmin
      .from('attendance')
      .select('id, user_id, work_date, check_in, note, created_at')
      .lte('work_date', todayStr)
      .is('check_out', null)
      .not('check_in', 'is', null)
      .order('work_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw error
    if (!openSessions?.length) {
      return NextResponse.json({ message: '미퇴근자 없음', processed: 0 })
    }

    let processed = 0
    const skippedTodayBefore18 = []

    for (const session of openSessions) {
      const note = session.note || ''
      if (['연차','반차(오전)','반차(오후)','반반차','병가','공가','특별휴가'].includes(note)) continue

      const isToday = session.work_date === todayStr
      if (isToday && hour < 18) {
        skippedTodayBefore18.push(session.id)
        continue
      }

      const inHour = parseInt(String(session.check_in || '00').slice(0, 2))
      const autoCheckout = inHour >= 18 ? '23:59:00' : '18:00:00'
      const { reg, ext, night } = calcWork(session.check_in, autoCheckout)

      const newNote = note
        ? (note.includes('자동퇴근') ? note : `${note} · 자동퇴근`)
        : '자동퇴근'

      const { error: updErr } = await supabaseAdmin.from('attendance').update({
        check_out: autoCheckout,
        reg_hours: reg,
        ext_hours: ext,
        night_hours: night,
        note: newNote,
      }).eq('id', session.id)

      if (!updErr) processed++
    }

    return NextResponse.json({
      message: `자동퇴근 완료: ${processed}건 처리`,
      date: todayStr,
      processed,
      skippedTodayBefore18: skippedTodayBefore18.length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}

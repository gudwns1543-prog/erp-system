'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { classifyWork, minutesToHours, isHoliday } from '@/lib/attendance'

function nowStr() {
  const n = new Date()
  return String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0')+':'+String(n.getSeconds()).padStart(2,'0')
}
function todayStr() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
}
const DAYS = ['일','월','화','수','목','금','토']

export default function DashboardPage() {
  const [time, setTime] = useState('00:00:00')
  const [profile, setProfile] = useState<any>(null)
  const [sessions, setSessions] = useState<any[]>([])  // 오늘 출퇴근 세션들
  const [weekData, setWeekData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState('')
  const [usedLeave, setUsedLeave] = useState(0)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)

    // 오늘 세션 전체 조회
    const { data: todaySessions } = await supabase.from('attendance')
      .select('*').eq('user_id', session.user.id).eq('work_date', todayStr())
      .order('created_at', {ascending: true})
    setSessions(todaySessions || [])

    // 이번 주 월~일
    const now = new Date()
    const dow = now.getDay()
    const mon = new Date(now); mon.setDate(now.getDate()-(dow===0?6:dow-1))
    const sun = new Date(mon); sun.setDate(mon.getDate()+6)
    const { data: week } = await supabase.from('attendance')
      .select('*').eq('user_id', session.user.id)
      .gte('work_date', `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,'0')}-${String(mon.getDate()).padStart(2,'0')}`)
      .lte('work_date', `${sun.getFullYear()}-${String(sun.getMonth()+1).padStart(2,'0')}-${String(sun.getDate()).padStart(2,'0')}`)
    setWeekData(week || [])

    const year = new Date().getFullYear()
    const { data: leaves } = await supabase.from('approvals')
      .select('type,start_date,end_date')
      .eq('requester_id', session.user.id).eq('status','approved')
      .in('type',['연차','반차(오전)','반차(오후)']).gte('start_date',`${year}-01-01`)
    if (leaves) {
      const used = leaves.reduce((sum:number, l:any) => {
        if (l.type==='반차(오전)'||l.type==='반차(오후)') return sum+0.5
        const s=new Date(l.start_date), e=new Date(l.end_date)
        return sum+Math.round((e.getTime()-s.getTime())/86400000)+1
      }, 0)
      setUsedLeave(used)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date()
      setTime(`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // 현재 활성 세션 (가장 최근 미완료 세션)
  const LEAVE_NOTES = ['연차','반차(오전)','반차(오후)','반반차','병가','출장','외근','특별휴가']
  const leaveSession = sessions.find((s:any) => LEAVE_NOTES.includes(s.note))
  const activeSession = !leaveSession ? sessions.find((s:any) => s.check_in && !s.check_out) : null
  // 오늘 마지막 완료 세션
  const lastDone = sessions.filter((s:any) => s.check_out).slice(-1)[0]
  const isWorking = !!activeSession
  const isDone = !isWorking && !leaveSession && sessions.length > 0 && sessions.every((s:any) => s.check_out)

  async function handleCheckIn() {
    setLoading(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }
    const ds = todayStr(); const inTime = nowStr()
    const seqNum = sessions.length + 1
    await supabase.from('attendance').insert({
      user_id: session.user.id, work_date: ds,
      check_in: inTime, is_holiday: isHoliday(ds),
    })
    const label = seqNum === 1 ? '출근' : `${seqNum}번째 출근 (복귀)`
    setAlert(`${label} 완료 (${inTime.slice(0,5)})`)
    setTimeout(()=>setAlert(''),4000); loadData(); setLoading(false)
  }

  async function handleCheckOut() {
    if (!activeSession) return
    setLoading(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const outTime = nowStr(); const ds = todayStr()
    const r = classifyWork(ds, activeSession.check_in, outTime)
    await supabase.from('attendance').update({
      check_out: outTime,
      reg_hours: minutesToHours(r.reg), ext_hours: minutesToHours(r.ext),
      night_hours: minutesToHours(r.night), hol_hours: minutesToHours(r.hReg),
      hol_eve_hours: minutesToHours(r.hEve), hol_night_hours: minutesToHours(r.hNight),
      ignored_hours: minutesToHours(r.ignored),
    }).eq('id', activeSession.id)
    setAlert(`퇴근 완료! 정규 ${minutesToHours(r.reg)}h / 시간외 ${minutesToHours(r.ext)}h`)
    setTimeout(()=>setAlert(''),4000); loadData(); setLoading(false)
  }

  // 오늘 전체 합산 근태
  const todayTotals = sessions.reduce((a,s)=>({
    reg: a.reg+(s.reg_hours||0),
    ext: a.ext+(s.ext_hours||0),
  }),{reg:0,ext:0})

  const d = new Date()
  const dateStr = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일`
  const hol = isHoliday(todayStr())
  const remainLeave = (profile?.annual_leave||0) - usedLeave

  // 이번 주 날짜별 합산 - attendance 페이지와 동일한 로직으로 통일
  const weekDays = Array.from({length:7},(_,i)=>{
    const now = new Date(); const dow = now.getDay()
    const mon = new Date(now); mon.setDate(now.getDate()-(dow===0?6:dow-1))
    const dt = new Date(mon); dt.setDate(mon.getDate()+i)
    const ds = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
    const daySessions = weekData.filter(w=>w.work_date===ds)
    if (daySessions.length === 0) {
      return { dt, ds, rec: null, sessionCount: 0 }
    }
    // 첫출근 / 마지막퇴근 찾기 (여러 세션 합치기)
    let firstCheckIn: string | null = null
    let lastCheckOut: string | null = null
    let hasOpenSession = false
    for (const s of daySessions) {
      if (!s.check_in) continue
      if (!firstCheckIn || s.check_in < firstCheckIn) firstCheckIn = s.check_in
      if (s.check_out) {
        if (!lastCheckOut || s.check_out > lastCheckOut) lastCheckOut = s.check_out
      } else {
        hasOpenSession = true
      }
    }
    // 첫출근~마지막퇴근으로 classifyWork 재계산 (attendance와 동일)
    let totals = { reg_hours: 0, ext_hours: 0, night_hours: 0,
                   hol_hours: 0, hol_eve_hours: 0, hol_night_hours: 0, ignored_hours: 0 }
    if (firstCheckIn && lastCheckOut) {
      const r = classifyWork(ds, firstCheckIn, lastCheckOut)
      totals = {
        reg_hours: minutesToHours(r.reg),
        ext_hours: minutesToHours(r.ext),
        night_hours: minutesToHours(r.night),
        hol_hours: minutesToHours(r.hReg),
        hol_eve_hours: minutesToHours(r.hEve),
        hol_night_hours: minutesToHours(r.hNight),
        ignored_hours: minutesToHours(r.ignored),
      }
    }
    return {
      dt, ds,
      rec: {
        ...totals,
        check_in: firstCheckIn,
        check_out: lastCheckOut,
        _hasOpenSession: hasOpenSession,
      },
      sessionCount: daySessions.length
    }
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">출퇴근</h1>
      {alert && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{alert}</div>}

      <div className="card mb-4 text-center py-6">
        <div className="text-5xl font-bold text-gray-800 tabular-nums tracking-wider">{time}</div>
        <div className="text-sm text-gray-400 mt-2">{dateStr}</div>
        {hol && <div className="text-xs text-red-400 mt-1">오늘은 휴일입니다</div>}
        <div className={`inline-block mt-2 px-4 py-1 rounded-full text-xs font-medium
          ${leaveSession?'bg-amber-50 text-amber-700':isWorking?'bg-green-50 text-green-700':isDone?'bg-purple-50 text-purple-700':'bg-gray-100 text-gray-500'}`}>
          {leaveSession?`${leaveSession.note} (승인됨)`:isWorking?`근무 중 (${sessions.length}번째 세션)`:isDone?'퇴근 완료':'미출근'}
        </div>

        {/* 오늘 세션 목록 */}
        {sessions.length > 0 && (
          <div className="mt-4 mx-auto max-w-sm text-xs text-gray-500 space-y-1">
            {sessions.map((s,i)=>(
              <div key={s.id} className="flex justify-center gap-3">
                <span className="text-gray-400">{i+1}번째</span>
                <span>출근 {s.check_in?.slice(0,5)}</span>
                <span>→ 퇴근 {s.check_out?.slice(0,5)||'근무중'}</span>
                {s.reg_hours>0 && <span className="text-purple-500">정규 {s.reg_hours}h</span>}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-center gap-3 mt-5">
          <button onClick={handleCheckIn}
            disabled={!!leaveSession||isWorking||loading}
            className="btn-primary px-8 py-2.5 text-base disabled:opacity-40">
            {sessions.length>0&&!isWorking?'🔄 복귀 출근':'출근'}
          </button>
          <button onClick={handleCheckOut}
            disabled={!isWorking||loading}
            className="btn-secondary px-8 py-2.5 text-base disabled:opacity-40">퇴근</button>
        </div>
        {isDone && (
          <div className="mt-3 text-xs text-amber-600 bg-amber-50 rounded-lg px-4 py-2 inline-block">
            업무 복귀 시 출근 버튼을 다시 누르세요
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          {label:'첫 출근', val:sessions[0]?.check_in?.slice(0,5)||'--:--', c:'text-gray-800'},
          {label:'오늘 세션', val:sessions.length+'회', c:'text-blue-600'},
          {label:'오늘 정규', val:todayTotals.reg+'h', c:'text-purple-600'},
          {label:'잔여 연차', val:remainLeave+'일', c:'text-teal-600'},
        ].map(m=>(
          <div key={m.label} className="card text-center py-3">
            <div className="text-xs text-gray-400 mb-1">{m.label}</div>
            <div className={`text-base font-semibold ${m.c}`}>{m.val}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="text-sm font-medium text-gray-700 mb-3">이번 주 현황 (월~일)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-gray-100">
              {['날짜','요일','첫출근','마지막퇴근','세션','평일정규','평일시간외','평일야간','휴일정규','휴일시간외','휴일야간','미인정'].map(h=>(
                <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-2 whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {weekDays.map(({dt,ds,rec,sessionCount})=>{
                const isToday = ds===todayStr()
                const isSun = dt.getDay()===0; const isSat = dt.getDay()===6
                return (
                  <tr key={ds} className={`border-b border-gray-50
                    ${isToday?'bg-purple-50':isSun?'bg-rose-50/50':isSat?'bg-sky-50/50':''}`}>
                    <td className="py-1.5 pr-2">{dt.getMonth()+1}/{dt.getDate()}</td>
                    <td className={`py-1.5 pr-2 font-medium ${isSun||isSat?'text-red-400':''}`}>{DAYS[dt.getDay()]}</td>
                    <td className="py-1.5 pr-2">{rec?.check_in?.slice(0,5)||'--'}</td>
                    <td className="py-1.5 pr-2">{rec?.check_out?.slice(0,5)||'--'}</td>
                    <td className="py-1.5 pr-2 text-blue-500">{sessionCount>0?sessionCount+'회':'-'}</td>
                    <td className="py-1.5 pr-2 text-purple-600 font-medium">{(rec as any)?.reg_hours>0?(rec as any).reg_hours+'h':'-'}</td>
                    <td className="py-1.5 pr-2 text-blue-600">{(rec as any)?.ext_hours>0?(rec as any).ext_hours+'h':'-'}</td>
                    <td className="py-1.5 pr-2 text-red-600">{(rec as any)?.night_hours>0?(rec as any).night_hours+'h':'-'}</td>
                    <td className="py-1.5 pr-2 text-teal-600">{(rec as any)?.hol_hours>0?(rec as any).hol_hours+'h':'-'}</td>
                    <td className="py-1.5 pr-2 text-amber-600">{(rec as any)?.hol_eve_hours>0?(rec as any).hol_eve_hours+'h':'-'}</td>
                    <td className="py-1.5 pr-2 text-rose-600">{(rec as any)?.hol_night_hours>0?(rec as any).hol_night_hours+'h':'-'}</td>
                    <td className="py-1.5 pr-2 text-gray-400">{(rec as any)?.ignored_hours>0?(rec as any).ignored_hours+'h':'-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

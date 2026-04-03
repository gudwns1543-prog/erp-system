'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { classifyWork, minutesToHours, isHoliday } from '@/lib/attendance'

function nowStr() {
  const n = new Date()
  return String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0')
}
function todayStr() { return new Date().toISOString().slice(0,10) }
const DAYS = ['일','월','화','수','목','금','토']

export default function DashboardPage() {
  const [time, setTime] = useState('00:00:00')
  const [profile, setProfile] = useState<any>(null)
  const [today, setToday] = useState<any>(null)
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
    const { data: t } = await supabase.from('attendance')
      .select('*').eq('user_id', session.user.id).eq('work_date', todayStr()).maybeSingle()
    setToday(t)

    // 이번 주 월~일 (7일)
    const now = new Date()
    const dow = now.getDay()
    const mon = new Date(now)
    mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    const { data: week } = await supabase.from('attendance')
      .select('*').eq('user_id', session.user.id)
      .gte('work_date', mon.toISOString().slice(0,10))
      .lte('work_date', sun.toISOString().slice(0,10))
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
        return sum + Math.round((e.getTime()-s.getTime())/86400000)+1
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

  async function handleCheckIn() {
    setLoading(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const ds = todayStr(); const inTime = nowStr()
    await supabase.from('attendance').upsert({
      user_id: session.user.id, work_date: ds, check_in: inTime, is_holiday: isHoliday(ds),
    }, { onConflict: 'user_id,work_date' })
    setAlert(`출근 완료 (${inTime})`); setTimeout(()=>setAlert(''),3000); loadData(); setLoading(false)
  }

  async function handleCheckOut() {
    if (!today?.check_in) return
    setLoading(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const outTime = nowStr(); const ds = todayStr()
    const r = classifyWork(ds, today.check_in, outTime)
    await supabase.from('attendance').update({
      check_out: outTime,
      reg_hours: minutesToHours(r.reg), ext_hours: minutesToHours(r.ext),
      night_hours: minutesToHours(r.night), hol_hours: minutesToHours(r.hReg),
      hol_eve_hours: minutesToHours(r.hEve), hol_night_hours: minutesToHours(r.hNight),
      ignored_hours: minutesToHours(r.ignored),
    }).eq('user_id', session.user.id).eq('work_date', ds)
    setAlert(`퇴근 완료! 정규 ${minutesToHours(r.reg)}h / 시간외 ${minutesToHours(r.ext)}h`)
    setTimeout(()=>setAlert(''),4000); loadData(); setLoading(false)
  }

  const d = new Date()
  const dateStr = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일`
  const hol = isHoliday(todayStr())
  const remainLeave = (profile?.annual_leave||0) - usedLeave

  // 이번 주 월~일 7일
  const weekDays = Array.from({length:7},(_,i)=>{
    const now = new Date(); const dow = now.getDay()
    const mon = new Date(now); mon.setDate(now.getDate()-(dow===0?6:dow-1))
    const dt = new Date(mon); dt.setDate(mon.getDate()+i)
    const ds = dt.toISOString().slice(0,10)
    return { dt, ds, rec: weekData.find(w=>w.work_date===ds) }
  })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">출퇴근</h1>
      {alert && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{alert}</div>}
      <div className="card mb-4 text-center py-6">
        <div className="text-5xl font-bold text-gray-800 tabular-nums tracking-wider">{time}</div>
        <div className="text-sm text-gray-400 mt-2">{dateStr}</div>
        {hol && <div className="text-xs text-red-400 mt-1">오늘은 휴일입니다</div>}
        <div className={`inline-block mt-2 px-4 py-1 rounded-full text-xs font-medium
          ${today?.check_out?'bg-purple-50 text-purple-700':today?.check_in?'bg-green-50 text-green-700':'bg-gray-100 text-gray-500'}`}>
          {today?.check_out?'퇴근 완료':today?.check_in?'근무 중':'미출근'}
        </div>
        <div className="flex justify-center gap-3 mt-5">
          <button onClick={handleCheckIn} disabled={!!today?.check_in||loading} className="btn-primary px-8 py-2.5 text-base">출근</button>
          <button onClick={handleCheckOut} disabled={!today?.check_in||!!today?.check_out||loading} className="btn-secondary px-8 py-2.5 text-base">퇴근</button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          {label:'출근',val:today?.check_in?.slice(0,5)||'--:--',c:'text-gray-800'},
          {label:'퇴근',val:today?.check_out?.slice(0,5)||'--:--',c:'text-gray-800'},
          {label:'오늘 정규',val:(today?.reg_hours??0)+'h',c:'text-purple-600'},
          {label:'잔여 연차',val:remainLeave+'일',c:'text-teal-600'},
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
              {['날짜','요일','출근','퇴근','정규','시간외','야간','휴일'].map(h=>(
                <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-3">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {weekDays.map(({dt,ds,rec})=>{
                const isToday = ds===todayStr()
                const isWeekend = dt.getDay()===0||dt.getDay()===6
                return (
                  <tr key={ds} className={`border-b border-gray-50 ${isToday?'bg-purple-50':isWeekend?'bg-gray-50':''}`}>
                    <td className="py-1.5 pr-3">{dt.getMonth()+1}/{dt.getDate()}</td>
                    <td className={`py-1.5 pr-3 ${isWeekend?'text-red-400':''}`}>{DAYS[dt.getDay()]}</td>
                    <td className="py-1.5 pr-3">{rec?.check_in?.slice(0,5)||'--'}</td>
                    <td className="py-1.5 pr-3">{rec?.check_out?.slice(0,5)||'--'}</td>
                    <td className="py-1.5 pr-3 text-purple-600">{rec?.reg_hours>0?rec.reg_hours+'h':'--'}</td>
                    <td className="py-1.5 pr-3 text-blue-600">{rec?.ext_hours>0?rec.ext_hours+'h':'-'}</td>
                    <td className="py-1.5 pr-3 text-red-600">{rec?.night_hours>0?rec.night_hours+'h':'-'}</td>
                    <td className="py-1.5 pr-3 text-teal-600">{rec?.hol_hours>0?rec.hol_hours+'h':'-'}</td>
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

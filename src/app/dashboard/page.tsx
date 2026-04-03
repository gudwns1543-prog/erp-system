'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { classifyWork, minutesToHours, isHoliday } from '@/lib/attendance'

function nowStr() {
  const n = new Date()
  return String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0')
}
function todayStr() {
  return new Date().toISOString().slice(0,10)
}
const DAYS = ['일','월','화','수','목','금','토']

export default function DashboardPage() {
  const [time, setTime] = useState('00:00:00')
  const [profile, setProfile] = useState<any>(null)
  const [today, setToday] = useState<any>(null)
  const [weekData, setWeekData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState('')

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const { data: t } = await supabase.from('attendance')
      .select('*').eq('user_id', session.user.id).eq('work_date', todayStr()).single()
    setToday(t)

    // 이번 주 데이터
    const mon = new Date()
    mon.setDate(mon.getDate() - (mon.getDay() === 0 ? 6 : mon.getDay() - 1))
    const fri = new Date(mon); fri.setDate(mon.getDate() + 4)
    const { data: week } = await supabase.from('attendance')
      .select('*').eq('user_id', session.user.id)
      .gte('work_date', mon.toISOString().slice(0,10))
      .lte('work_date', fri.toISOString().slice(0,10))
    setWeekData(week || [])
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
    const ds = todayStr()
    const { error } = await supabase.from('attendance').upsert({
      user_id: session.user.id,
      work_date: ds,
      check_in: nowStr(),
      is_holiday: isHoliday(ds),
    }, { onConflict: 'user_id,work_date' })
    if (!error) { setAlert(`출근 처리 완료 (${nowStr()})`); loadData() }
    setLoading(false)
  }

  async function handleCheckOut() {
    if (!today?.check_in) return
    setLoading(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const outTime = nowStr()
    const r = classifyWork(todayStr(), today.check_in, outTime)
    const { error } = await supabase.from('attendance').update({
      check_out: outTime,
      reg_hours: minutesToHours(r.reg),
      ext_hours: minutesToHours(r.ext),
      night_hours: minutesToHours(r.night),
      hol_hours: minutesToHours(r.hReg),
      hol_eve_hours: minutesToHours(r.hEve),
      hol_night_hours: minutesToHours(r.hNight),
      ignored_hours: minutesToHours(r.ignored),
    }).eq('user_id', session.user.id).eq('work_date', todayStr())
    if (!error) {
      setAlert(`퇴근 완료! 정규 ${minutesToHours(r.reg)}h / 시간외 ${minutesToHours(r.ext)}h / 야간 ${minutesToHours(r.night)}h`)
      loadData()
    }
    setLoading(false)
  }

  const d = new Date()
  const dateStr = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일`
  const hol = isHoliday(todayStr())

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">출퇴근</h1>

      {alert && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {alert}
        </div>
      )}

      <div className="card mb-4 text-center py-6">
        <div className="text-5xl font-bold text-gray-800 tabular-nums tracking-wider">{time}</div>
        <div className="text-sm text-gray-400 mt-2">{dateStr}</div>
        <div className={`inline-block mt-2 px-4 py-1 rounded-full text-xs font-medium
          ${today?.check_out ? 'bg-purple-50 text-purple-700' :
            today?.check_in ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {today?.check_out ? '퇴근 완료' : today?.check_in ? '근무 중' : '미출근'}
        </div>
        {hol && <div className="mt-1 text-xs text-red-500">오늘은 휴일입니다</div>}
        <div className="flex justify-center gap-3 mt-5">
          <button onClick={handleCheckIn} disabled={!!today?.check_in || loading}
            className="btn-primary px-8 py-2.5 text-base">출근</button>
          <button onClick={handleCheckOut} disabled={!today?.check_in || !!today?.check_out || loading}
            className="btn-secondary px-8 py-2.5 text-base">퇴근</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="card text-center py-3">
          <div className="text-xs text-gray-400 mb-1">출근 시간</div>
          <div className="text-base font-semibold text-gray-800">{today?.check_in?.slice(0,5) || '--:--'}</div>
        </div>
        <div className="card text-center py-3">
          <div className="text-xs text-gray-400 mb-1">퇴근 시간</div>
          <div className="text-base font-semibold text-gray-800">{today?.check_out?.slice(0,5) || '--:--'}</div>
        </div>
        <div className="card text-center py-3">
          <div className="text-xs text-gray-400 mb-1">오늘 정규</div>
          <div className="text-base font-semibold text-purple-600">{today?.reg_hours ?? 0}h</div>
        </div>
        <div className="card text-center py-3">
          <div className="text-xs text-gray-400 mb-1">잔여 연차</div>
          <div className="text-base font-semibold text-teal-600">{profile?.annual_leave ?? '--'}일</div>
        </div>
      </div>

      <div className="card">
        <div className="text-sm font-medium text-gray-700 mb-3">이번 주 현황</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                {['날짜','요일','출근','퇴근','정규','시간외','야간'].map(h => (
                  <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({length:5},(_,i)=>{
                const dt = new Date(); dt.setDate(dt.getDate()-(dt.getDay()===0?6:dt.getDay()-1)+i)
                const ds = dt.toISOString().slice(0,10)
                const rec = weekData.find(w=>w.work_date===ds)
                const isToday = ds === todayStr()
                return (
                  <tr key={ds} className={`border-b border-gray-50 ${isToday?'bg-purple-50':''}`}>
                    <td className="py-1.5 pr-4">{dt.getMonth()+1}/{dt.getDate()}</td>
                    <td className="py-1.5 pr-4">{DAYS[dt.getDay()]}</td>
                    <td className="py-1.5 pr-4">{rec?.check_in?.slice(0,5)||'--'}</td>
                    <td className="py-1.5 pr-4">{rec?.check_out?.slice(0,5)||'--'}</td>
                    <td className="py-1.5 pr-4 text-purple-600">{rec?.reg_hours||'--'}</td>
                    <td className="py-1.5 pr-4 text-blue-600">{rec?.ext_hours||'--'}</td>
                    <td className="py-1.5 pr-4 text-red-600">{rec?.night_hours||'--'}</td>
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

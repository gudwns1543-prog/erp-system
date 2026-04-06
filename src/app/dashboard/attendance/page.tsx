'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { isHoliday, sortByGrade, classifyWork, minutesToHours } from '@/lib/attendance'

const DAYS = ['일','월','화','수','목','금','토']

export default function AttendancePage() {
  const [profile, setProfile] = useState<any>(null)
  const [records, setRecords] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [selUser, setSelUser] = useState('')
  const [selMonth, setSelMonth] = useState(new Date().getMonth()+1)
  const [selYear, setSelYear] = useState(new Date().getFullYear())

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    if (p?.role === 'director') {
      const { data: s } = await supabase.from('profiles').select('id,name,grade').eq('status','active')
      setStaff(sortByGrade(s||[]))
      if (!selUser) setSelUser(session.user.id)
    }
    const userId = selUser || session.user.id
    const start = `${selYear}-${String(selMonth).padStart(2,'0')}-01`
    // 해당 월의 실제 마지막 날 계산 (4월=30일, 2월=28/29일 등)
    const lastDay = new Date(selYear, selMonth, 0).getDate()
    const end = `${selYear}-${String(selMonth).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
    const { data: recs, error: recsError } = await supabase.from('attendance')
      .select('*').eq('user_id', userId)
      .gte('work_date', start).lte('work_date', end)
    console.log('근태 쿼리 결과:', { userId, start, end, count: recs?.length, error: recsError })
    // check_in 기준으로 JS에서 정렬 (time 타입은 DB order 미지원)
    const sortedRecs = (recs||[]).sort((a:any, b:any) => {
      if (a.work_date !== b.work_date) return a.work_date.localeCompare(b.work_date)
      return (a.check_in||'').localeCompare(b.check_in||'')
    })
    // 날짜별 세션 합산 - 첫 출근 ~ 마지막 퇴근 기준으로 계산
    const dateMap: Record<string,any> = {}
    ;(sortedRecs).forEach((r:any)=>{
      const ds = r.work_date
      if (!ds || !r.check_in) return
      if (!dateMap[ds]) {
        dateMap[ds] = {
          ...r,
          _firstCheckIn: r.check_in,
          _lastCheckOut: r.check_out || null,
          _sessionCount: 1,
          _allCheckIns: [r.check_in],
          _allCheckOuts: r.check_out ? [r.check_out] : [],
        }
      } else {
        // 첫 출근은 가장 이른 시간
        if (r.check_in < dateMap[ds]._firstCheckIn) {
          dateMap[ds]._firstCheckIn = r.check_in
        }
        // 마지막 퇴근은 가장 늦은 시간으로 갱신
        if (r.check_out) {
          if (!dateMap[ds]._lastCheckOut || r.check_out > dateMap[ds]._lastCheckOut) {
            dateMap[ds]._lastCheckOut = r.check_out
          }
        }
        // check_out 없는 세션 = 아직 근무중인 세션이 하나라도 있으면 표시
        if (!r.check_out) dateMap[ds]._hasOpenSession = true
        dateMap[ds]._sessionCount = (dateMap[ds]._sessionCount||1) + 1
      }
    })
    // 첫출근 ~ 마지막퇴근으로 시간 재계산
    const merged = Object.values(dateMap).map((d:any) => {
      const ci = d._firstCheckIn
      const co = d._lastCheckOut
      if (ci && co) {
        const r = classifyWork(d.work_date, ci, co)
        return {
          ...d,
          check_in: ci,
          check_out: co,
          reg_hours: minutesToHours(r.reg),
          ext_hours: minutesToHours(r.ext),
          night_hours: minutesToHours(r.night),
          hol_hours: minutesToHours(r.hReg),
          hol_eve_hours: minutesToHours(r.hEve),
          hol_night_hours: minutesToHours(r.hNight),
          ignored_hours: minutesToHours(r.ignored),
        }
      }
      return { ...d, check_in: ci, check_out: co }
    })
    setRecords(merged)
  }, [selUser, selMonth, selYear])

  useEffect(() => { load() }, [load])

  const totals = records.reduce((a,r)=>({
    reg:a.reg+(r.reg_hours||0), ext:a.ext+(r.ext_hours||0),
    night:a.night+(r.night_hours||0), hReg:a.hReg+(r.hol_hours||0),
    hEve:a.hEve+(r.hol_eve_hours||0), hNight:a.hNight+(r.hol_night_hours||0),
  }),{reg:0,ext:0,night:0,hReg:0,hEve:0,hNight:0})

  const days = Array.from({length:31},(_,i)=>{
    const ds = `${selYear}-${String(selMonth).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`
    const d = new Date(ds+'T00:00:00')
    if (d.getMonth()+1!==selMonth) return null
    const dow = d.getDay()
    const rec = records.find(r=>r.work_date===ds)
    if (!rec && (isHoliday(ds)||dow===0||dow===6)) return null  // 주말/공휴일은 기록없으면 숨김
    return { ds, dow, rec: rec||null }
  }).filter(Boolean)

  const curYear = new Date().getFullYear()
  const years = Array.from({length:5},(_,i)=>curYear-i)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-lg font-semibold text-gray-800">근태 기록</h1>
        <div className="flex gap-2">
          {profile?.role==='director' && (
            <select className="input w-auto text-sm" value={selUser} onChange={e=>setSelUser(e.target.value)}>
              {staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <select className="input w-auto text-sm" value={selYear} onChange={e=>setSelYear(+e.target.value)}>
            {years.map(y=><option key={y} value={y}>{y}년</option>)}
          </select>
          <select className="input w-auto text-sm" value={selMonth} onChange={e=>setSelMonth(+e.target.value)}>
            {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}월</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-2 mb-4">
        {[
          {label:'평일 정규',val:totals.reg,c:'text-purple-600'},
          {label:'평일 시간외',val:totals.ext,c:'text-blue-600'},
          {label:'평일 야간',val:totals.night,c:'text-red-600'},
          {label:'휴일 정규',val:totals.hReg,c:'text-teal-600'},
          {label:'휴일 시간외',val:totals.hEve,c:'text-amber-600'},
          {label:'휴일 야간',val:totals.hNight,c:'text-rose-600'},
        ].map(m=>(
          <div key={m.label} className="card text-center py-2">
            <div className="text-xs text-gray-400 mb-1">{m.label}</div>
            <div className={`text-lg font-semibold ${m.c}`}>{Number(m.val).toFixed(1)}<span className="text-xs text-gray-400">h</span></div>
          </div>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-gray-100">
            {['날짜','요일','구분','출근','퇴근','평일정규','평일시외','평일야간','휴일정규','휴일시외','휴일야간','미인정'].map(h=>(
              <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-2 whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {days.map((d:any)=>{
              const hol = isHoliday(d.ds) && d.dow !== 6  // 토요일은 공휴일 표시 안 함
              const dd = new Date(d.ds+'T00:00:00')
              const isSat = d.dow === 6
              const isSun = d.dow === 0
              return (
                <tr key={d.ds} className={`border-b border-gray-50 hover:bg-gray-50
                  ${isSat ? 'bg-blue-50/40' : hol || isSun ? 'bg-red-50/40' : ''}`}>
                  <td className="py-1.5 pr-2">{dd.getMonth()+1}/{dd.getDate()}</td>
                  <td className={`py-1.5 pr-2 font-medium ${isSat ? 'text-blue-500' : isSun ? 'text-red-400' : ''}`}>{DAYS[d.dow]}</td>
                  <td className="py-1.5 pr-2">{hol?<span className="badge-holiday">휴일</span>:isSat?<span className="text-blue-500 text-xs">토요일</span>:<span className="badge-work">평일</span>}</td>
                  <td className="py-1.5 pr-2 font-medium">{d.rec?.check_in?.slice(0,5)||'--'}</td>
                  <td className="py-1.5 pr-2 font-medium">
                    {d.rec?.check_out?.slice(0,5)
                      ? <>
                          {d.rec.check_out.slice(0,5)}
                          {d.rec?._hasOpenSession && <span className="ml-1 text-xs text-green-500">+근무중</span>}
                        </>
                      : d.rec?.check_in ? <span className="text-green-500">근무중</span> : '--'}
                    {d.rec?._sessionCount > 1 && (
                      <span className="ml-1 text-xs text-gray-300">({d.rec._sessionCount}회)</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-purple-600">{d.rec?.reg_hours>0?d.rec.reg_hours:'-'}</td>
                  <td className="py-1.5 pr-2 text-blue-600">{d.rec?.ext_hours>0?d.rec.ext_hours:'-'}</td>
                  <td className="py-1.5 pr-2 text-red-600">{d.rec?.night_hours>0?d.rec.night_hours:'-'}</td>
                  <td className="py-1.5 pr-2 text-teal-600">{d.rec?.hol_hours>0?d.rec.hol_hours:'-'}</td>
                  <td className="py-1.5 pr-2 text-amber-600">{d.rec?.hol_eve_hours>0?d.rec.hol_eve_hours:'-'}</td>
                  <td className="py-1.5 pr-2 text-rose-600">{d.rec?.hol_night_hours>0?d.rec.hol_night_hours:'-'}</td>
                  <td className="py-1.5 pr-2 text-gray-400">{d.rec?.ignored_hours>0?d.rec.ignored_hours:'-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

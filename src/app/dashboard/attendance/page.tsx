'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { isHoliday, sortByGrade } from '@/lib/attendance'

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
    const end   = `${selYear}-${String(selMonth).padStart(2,'0')}-31`
    const { data: recs } = await supabase.from('attendance')
      .select('*').eq('user_id', userId)
      .gte('work_date',start).lte('work_date',end)
      .order('work_date', {ascending: true})
      .order('check_in', {ascending: true})
    // 날짜별 세션 합산 - 모든 세션 누적 (10초 근무도 포함)
    const dateMap: Record<string,any> = {}
    ;(recs||[]).forEach((r:any)=>{
      const ds = r.work_date
      if (!ds) return
      // check_in 없는 레코드는 스킵
      if (!r.check_in) return
      if (!dateMap[ds]) {
        dateMap[ds] = {
          ...r,
          _firstCheckIn: r.check_in,
          _lastCheckOut: r.check_out || null,
          _sessionCount: 1
        }
      } else {
        // 모든 시간 누적 합산
        dateMap[ds].reg_hours       = (dateMap[ds].reg_hours||0)       + (r.reg_hours||0)
        dateMap[ds].ext_hours       = (dateMap[ds].ext_hours||0)       + (r.ext_hours||0)
        dateMap[ds].night_hours     = (dateMap[ds].night_hours||0)     + (r.night_hours||0)
        dateMap[ds].hol_hours       = (dateMap[ds].hol_hours||0)       + (r.hol_hours||0)
        dateMap[ds].hol_eve_hours   = (dateMap[ds].hol_eve_hours||0)   + (r.hol_eve_hours||0)
        dateMap[ds].hol_night_hours = (dateMap[ds].hol_night_hours||0) + (r.hol_night_hours||0)
        dateMap[ds].ignored_hours   = (dateMap[ds].ignored_hours||0)   + (r.ignored_hours||0)
        // 마지막 퇴근: check_out 있는 최신 세션
        if (r.check_out) dateMap[ds]._lastCheckOut = r.check_out
        // 아직 퇴근 안 한 세션이면 null 유지
        if (!r.check_out) dateMap[ds]._lastCheckOut = null
        dateMap[ds]._sessionCount = (dateMap[ds]._sessionCount||1) + 1
      }
    })
    // check_in / check_out 을 첫출근/마지막퇴근으로 정리
    const merged = Object.values(dateMap).map((d:any) => ({
      ...d,
      check_in:  d._firstCheckIn  || null,
      check_out: d._lastCheckOut  || null,
    }))
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
                      ? d.rec.check_out.slice(0,5)
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

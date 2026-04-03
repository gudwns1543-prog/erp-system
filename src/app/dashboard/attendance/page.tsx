'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { isHoliday } from '@/lib/attendance'

const DAYS = ['일','월','화','수','목','금','토']
const MONTHS = Array.from({length:12},(_,i)=>i+1)

export default function AttendancePage() {
  const [profile, setProfile] = useState<any>(null)
  const [records, setRecords] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [selUser, setSelUser] = useState('')
  const [selMonth, setSelMonth] = useState(new Date().getMonth()+1)
  const [selYear] = useState(2026)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const userId = selUser || session.user.id
    if (p?.role === 'director' && !selUser) setSelUser(session.user.id)
    const { data: s } = await supabase.from('profiles').select('id,name').neq('role','director')
    setStaff(s || [])

    const start = `${selYear}-${String(selMonth).padStart(2,'0')}-01`
    const end   = `${selYear}-${String(selMonth).padStart(2,'0')}-31`
    const { data: recs } = await supabase.from('attendance')
      .select('*').eq('user_id', userId)
      .gte('work_date', start).lte('work_date', end).order('work_date')
    setRecords(recs || [])
  }, [selUser, selMonth, selYear])

  useEffect(() => { load() }, [load])

  // 월의 평일 날짜 목록
  const days = Array.from({length:31},(_,i)=>{
    const ds = `${selYear}-${String(selMonth).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`
    const d = new Date(ds+'T00:00:00')
    if (d.getMonth()+1 !== selMonth) return null
    const dow = d.getDay()
    if (isHoliday(ds) && !records.find(r=>r.work_date===ds)) return null
    if ((dow===0||dow===6) && !records.find(r=>r.work_date===ds)) return null
    return { ds, dow, rec: records.find(r=>r.work_date===ds)||null }
  }).filter(Boolean)

  const totals = records.reduce((a,r)=>({
    reg:   a.reg   + (r.reg_hours||0),
    ext:   a.ext   + (r.ext_hours||0),
    night: a.night + (r.night_hours||0),
    hol:   a.hol   + (r.hol_hours||0),
  }),{reg:0,ext:0,night:0,hol:0})

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-lg font-semibold text-gray-800">근태 기록</h1>
        <div className="flex gap-2">
          {profile?.role === 'director' && (
            <select className="input w-auto text-sm" value={selUser} onChange={e=>setSelUser(e.target.value)}>
              {staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <select className="input w-auto text-sm" value={selMonth} onChange={e=>setSelMonth(+e.target.value)}>
            {MONTHS.map(m=><option key={m} value={m}>{m}월</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          {label:'평일 정규', val:totals.reg, color:'text-purple-600'},
          {label:'평일 시간외', val:totals.ext, color:'text-blue-600'},
          {label:'평일 야간', val:totals.night, color:'text-red-600'},
          {label:'휴일 근로', val:totals.hol, color:'text-teal-600'},
        ].map(m=>(
          <div key={m.label} className="card text-center py-3">
            <div className="text-xs text-gray-400 mb-1">{m.label}</div>
            <div className={`text-xl font-semibold ${m.color}`}>{m.val.toFixed(1)}<span className="text-sm font-normal text-gray-400">h</span></div>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              {['날짜','요일','구분','출근','퇴근','정규(h)','시간외(h)','야간(h)','휴일근로(h)','미인정(h)'].map(h=>(
                <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-3 pb-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d:any)=>{
              const hol = isHoliday(d.ds)
              const dd = new Date(d.ds+'T00:00:00')
              return (
                <tr key={d.ds} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-1.5 pr-3">{dd.getMonth()+1}/{dd.getDate()}</td>
                  <td className="py-1.5 pr-3">{DAYS[d.dow]}</td>
                  <td className="py-1.5 pr-3">
                    {hol ? <span className="badge-holiday">휴일</span> : <span className="badge-work">평일</span>}
                  </td>
                  <td className="py-1.5 pr-3">{d.rec?.check_in?.slice(0,5)||'--'}</td>
                  <td className="py-1.5 pr-3">{d.rec?.check_out?.slice(0,5)||'--'}</td>
                  <td className="py-1.5 pr-3 text-purple-600">{d.rec?.reg_hours||'-'}</td>
                  <td className="py-1.5 pr-3 text-blue-600">{d.rec?.ext_hours||'-'}</td>
                  <td className="py-1.5 pr-3 text-red-600">{d.rec?.night_hours||'-'}</td>
                  <td className="py-1.5 pr-3 text-teal-600">{d.rec?.hol_hours||'-'}</td>
                  <td className="py-1.5 pr-3 text-gray-400">{d.rec?.ignored_hours||'-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { calcSalary, formatWon, sortByGrade } from '@/lib/attendance'

export default function MySlipPage() {
  const [profile, setProfile] = useState<any>(null)
  const [salary, setSalary] = useState<any>(null)
  const [work, setWork] = useState<any>(null)
  const [staffList, setStaffList] = useState<any[]>([])
  const [selStaffId, setSelStaffId] = useState('')
  const [selYear, setSelYear] = useState(new Date().getFullYear())
  const [selMonth, setSelMonth] = useState(new Date().getMonth()+1)
  const [result, setResult] = useState<any>(null)

  const curYear = new Date().getFullYear()
  const years = Array.from({length:5},(_,i)=>curYear-i)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const targetId = (p?.role==='director'&&selStaffId) ? selStaffId : session.user.id
    if (p?.role==='director') {
      const { data: sl } = await supabase.from('profiles').select('id,name,grade').eq('status','active')
      setStaffList(sortByGrade(sl||[]))
      if (!selStaffId && sl?.[0]) setSelStaffId(sl[0].id)
    }
    const { data: sal } = await supabase.from('salary_info').select('*').eq('user_id', targetId).maybeSingle()
    setSalary(sal)
    const start = `${selYear}-${String(selMonth).padStart(2,'0')}-01`
    const end   = `${selYear}-${String(selMonth).padStart(2,'0')}-31`
    const { data: recs } = await supabase.from('attendance').select('*')
      .eq('user_id', targetId).gte('work_date', start).lte('work_date', end)
    if (recs && recs.length > 0) {
      setWork(recs.reduce((a:any,r:any)=>({
        regH:      a.regH      + (r.reg_hours||0),
        extH:      a.extH      + (r.ext_hours||0),
        nightH:    a.nightH    + (r.night_hours||0),
        holH:      a.holH      + (r.hol_hours||0),
        holExtH:   a.holExtH   + (r.hol_eve_hours||0),
        holNightH: a.holNightH + (r.hol_night_hours||0),
      }),{regH:0,extH:0,nightH:0,holH:0,holExtH:0,holNightH:0}))
    } else { setWork(null) }
  }, [selStaffId, selYear, selMonth])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!salary || !work) { setResult(null); return }
    setResult(calcSalary({
      annual:salary.annual, dependents:salary.dependents,
      meal:salary.meal, transport:salary.transport, comm:salary.comm,
      regH:work.regH, extH:work.extH, nightH:work.nightH,
      holH:work.holH, holExtH:work.holExtH, holNightH:work.holNightH,
    }))
  }, [salary, work])

  const targetName = profile?.role==='director'
    ? (staffList.find(s=>s.id===selStaffId)?.name||'')
    : profile?.name

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-lg font-semibold text-gray-800">내 급여명세서</h1>
        <div className="flex gap-2 items-center flex-wrap justify-end">
          {profile?.role==='director' && (
            <select className="input w-auto text-sm" value={selStaffId} onChange={e=>setSelStaffId(e.target.value)}>
              {staffList.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <select className="input w-auto text-sm" value={selYear} onChange={e=>setSelYear(+e.target.value)}>
            {years.map(y=><option key={y} value={y}>{y}년</option>)}
          </select>
          <select className="input w-auto text-sm" value={selMonth} onChange={e=>setSelMonth(+e.target.value)}>
            {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}월</option>)}
          </select>
          <button onClick={()=>window.print()} className="btn-secondary text-sm">🖨 인쇄</button>
        </div>
      </div>
      {!result ? (
        <div className="card py-16 text-center">
          <div className="text-3xl mb-3">📭</div>
          <div className="text-gray-400 text-sm">{selYear}년 {selMonth}월 급여 데이터가 없습니다.</div>
          <div className="text-gray-300 text-xs mt-1">근태가 입력된 년월을 선택해 주세요</div>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              {label:'기본 시간단가', val:Math.round(result.rate).toLocaleString()+'원/h', c:'text-gray-700'},
              {label:'총 지급액', val:formatWon(result.grossTotal), c:'text-purple-600'},
              {label:'총 공제액', val:'-'+formatWon(result.totalDeduct), c:'text-red-600'},
              {label:'실 수령액', val:formatWon(result.netPay), c:'text-teal-600'},
            ].map(m=>(
              <div key={m.label} className="card text-center py-3">
                <div className="text-xs text-gray-400 mb-1">{m.label}</div>
                <div className={`text-sm font-semibold ${m.c}`}>{m.val}</div>
              </div>
            ))}
          </div>
          <div className="card mb-4 p-3">
            <div className="flex gap-5 flex-wrap text-xs">
              <span><span className="text-gray-400">정규 </span><strong className="text-purple-600">{work?.regH}h</strong></span>
              {work?.extH>0 && <span><span className="text-gray-400">시간외 </span><strong className="text-blue-600">{work.extH}h</strong></span>}
              {work?.nightH>0 && <span><span className="text-gray-400">야간 </span><strong className="text-red-600">{work.nightH}h</strong></span>}
              {work?.holH>0 && <span><span className="text-gray-400">휴일 </span><strong className="text-teal-600">{work.holH}h</strong></span>}
            </div>
          </div>
          <div className="card mb-4">
            <div className="grid grid-cols-2 gap-0 divide-x divide-gray-100">
              <div className="pr-6">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">지급 항목</div>
                {[
                  ['기본급', result.base],
                  result.payExt>0&&[`평일 시간외 ×1.5 (${work.extH}h)`,result.payExt],
                  result.payNight>0&&[`평일 야간 ×2.0 (${work.nightH}h)`,result.payNight],
                  result.payHol>0&&[`휴일 근무 ×1.5 (${work.holH}h)`,result.payHol],
                  result.payHolExt>0&&[`휴일 시간외 ×2.0 (${work.holExtH}h)`,result.payHolExt],
                  salary?.meal>0&&['식대 (비과세)',salary.meal],
                  salary?.transport>0&&['교통비 (비과세)',salary.transport],
                  salary?.comm>0&&['통신비 (비과세)',salary.comm],
                ].filter(Boolean).map((item:any,i)=>(
                  <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                    <span className="text-gray-500">{item[0]}</span>
                    <span className="text-purple-600 font-medium">{formatWon(item[1])}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 text-sm font-semibold">
                  <span>합계</span><span className="text-purple-600">{formatWon(result.grossTotal)}</span>
                </div>
              </div>
              <div className="pl-6">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">공제 항목</div>
                {[
                  ['국민연금 (4.5%)',result.pension],
                  ['건강보험 (3.545%)',result.health],
                  ['장기요양보험',result.ltc],
                  ['고용보험 (0.9%)',result.employ],
                  [`소득세 (${salary?.dependents}인)`,result.incomeTax],
                  ['지방소득세',result.localTax],
                ].map(([l,v],i)=>(
                  <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                    <span className="text-gray-500">{l}</span>
                    <span className="text-red-600 font-medium">-{formatWon(v as number)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 text-sm font-semibold">
                  <span>합계</span><span className="text-red-600">-{formatWon(result.totalDeduct)}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-xl p-5 flex justify-between items-center" style={{background:'linear-gradient(135deg,#534AB7,#6c63d4)'}}>
            <div>
              <div className="text-white/80 text-sm font-medium">실 수령액</div>
              <div className="text-white/60 text-xs mt-0.5">{selYear}년 {selMonth}월 · {targetName}</div>
            </div>
            <div className="text-white text-2xl font-bold">{formatWon(result.netPay)}</div>
          </div>
          <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-400 leading-relaxed">
            📌 연봉 {formatWon(salary?.annual)} ÷ 12 ÷ 209h = 시간단가 {Math.round(result.rate).toLocaleString()}원 · 부양가족 {salary?.dependents}명 기준
          </div>
        </div>
      )}
    </div>
  )
}

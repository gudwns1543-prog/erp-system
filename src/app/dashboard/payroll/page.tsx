'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { calcSalary, formatWon, sortByGrade } from '@/lib/attendance'

export default function PayrollPage() {
  const [staffList, setStaffList] = useState<any[]>([])
  const [salaryList, setSalaryList] = useState<any[]>([])
  const [editing, setEditing] = useState<any>(null)
  const [alert, setAlert] = useState('')
  const [selIdx, setSelIdx] = useState(0)
  const [selYear, setSelYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth()+1)
  const [work, setWork] = useState({regH:0,extH:0,nightH:0,holH:0,holExtH:0,holNightH:0})
  const [result, setResult] = useState<any>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: s } = await supabase.from('profiles').select('id,name,grade').eq('status','active')
    setStaffList(sortByGrade(s||[]))
    const { data: sal } = await supabase.from('salary_info').select('*')
    setSalaryList(sal||[])
  }, [])

  useEffect(()=>{ load() },[load])

  async function loadWork(userId: string) {
    const supabase = createClient()
    const start = `${selYear}-${String(month).padStart(2,'0')}-01`
    const end   = `${selYear}-${String(month).padStart(2,'0')}-31`
    const { data } = await supabase.from('attendance').select('*')
      .eq('user_id', userId).gte('work_date',start).lte('work_date',end)
    if (data?.length) {
      const w = data.reduce((a:any,r:any)=>({
        regH:      a.regH      + (r.reg_hours||0),
        extH:      a.extH      + (r.ext_hours||0),
        nightH:    a.nightH    + (r.night_hours||0),
        holH:      a.holH      + (r.hol_hours||0),
        holExtH:   a.holExtH   + (r.hol_eve_hours||0),
        holNightH: a.holNightH + (r.hol_night_hours||0),
      }),{regH:0,extH:0,nightH:0,holH:0,holExtH:0,holNightH:0})
      setWork(w)
    } else setWork({regH:0,extH:0,nightH:0,holH:0,holExtH:0,holNightH:0})
  }

  useEffect(()=>{
    if (!staffList[selIdx]) return
    const uid = staffList[selIdx].id
    loadWork(uid)
  },[selIdx, month, selYear, staffList])

  useEffect(()=>{
    const uid = staffList[selIdx]?.id
    const sal = salaryList.find(s=>s.user_id===uid)
    if (!sal) { setResult(null); return }
    setResult(calcSalary({...sal, ...work, transport:sal.transport}))
  },[work, selIdx, staffList, salaryList])

  async function saveSalary() {
    if (!editing) return
    const supabase = createClient()
    await supabase.from('salary_info').upsert({...editing}, {onConflict:'user_id'})
    setEditing(null); setAlert('저장되었습니다.'); load()
    setTimeout(()=>setAlert(''),3000)
  }

  const curStaff = staffList[selIdx]
  const curSalary = salaryList.find(s=>s.user_id===curStaff?.id)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">급여 계산</h1>
      {alert && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{alert}</div>}

      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-2 space-y-4">
          <div className="card">
            <div className="text-sm font-medium text-gray-700 mb-3">직원 선택</div>
            <div className="flex gap-2 mb-3">
              <select className="input flex-1 text-sm" value={selIdx} onChange={e=>setSelIdx(+e.target.value)}>
                {staffList.map((s,i)=><option key={s.id} value={i}>{s.name} ({s.grade})</option>)}
              </select>
              <select className="input w-24 text-sm" value={selYear} onChange={e=>setSelYear(+e.target.value)}>
                {Array.from({length:5},(_,i)=><option key={i} value={new Date().getFullYear()-i}>{new Date().getFullYear()-i}년</option>)}
              </select>
              <select className="input w-20 text-sm" value={month} onChange={e=>setMonth(+e.target.value)}>
                {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}월</option>)}
              </select>
            </div>
            {curSalary ? (
              <div className="space-y-1 text-xs text-gray-500">
                <div className="flex justify-between"><span>연봉</span><span className="font-medium text-gray-700">{formatWon(curSalary.annual)}</span></div>
                <div className="flex justify-between"><span>부양가족</span><span>{curSalary.dependents}명</span></div>
                <div className="flex justify-between"><span>시간단가</span><span>{Math.round(curSalary.annual/12/209).toLocaleString()}원/h</span></div>
              </div>
            ) : (
              <div className="text-xs text-gray-300 text-center py-2">급여 정보 없음</div>
            )}
            <button onClick={()=>setEditing(curSalary ? {...curSalary} : {user_id:curStaff?.id,annual:0,dependents:1,meal:200000,transport:200000,comm:100000})}
              className="btn-secondary w-full text-xs mt-3">급여 정보 설정</button>
          </div>

          <div className="card">
            <div className="text-sm font-medium text-gray-700 mb-3">근태 실적 ({month}월)</div>
            {[
              ['정규(h)','regH'],['평일 시간외(h)','extH'],['평일 야간(h)','nightH'],
              ['휴일 근무(h)','holH'],['휴일 시간외(h)','holExtH'],['휴일 야간(h)','holNightH'],
            ].map(([l,k])=>(
              <div key={k} className="flex justify-between items-center py-1.5 border-b border-gray-50">
                <span className="text-xs text-gray-500">{l}</span>
                <input type="number" className="input w-20 text-right text-xs py-1"
                  value={(work as any)[k]} onChange={e=>setWork(w=>({...w,[k]:+e.target.value}))} />
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-3">
          {!result ? (
            <div className="card py-16 text-center text-gray-300 text-sm">급여 정보를 설정해 주세요</div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  {l:'총 지급액', v:formatWon(result.grossTotal), c:'text-purple-600'},
                  {l:'실 수령액', v:formatWon(result.netPay), c:'text-teal-600'},
                ].map(m=>(
                  <div key={m.l} className="card text-center py-3">
                    <div className="text-xs text-gray-400 mb-1">{m.l}</div>
                    <div className={`text-lg font-semibold ${m.c}`}>{m.v}</div>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="grid grid-cols-2 gap-0 divide-x divide-gray-100">
                  <div className="pr-4">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">지급</div>
                    {[
                      ['기본급', result.base],
                      result.payExt>0&&[`시간외(${work.extH}h)`, result.payExt],
                      result.payNight>0&&[`야간(${work.nightH}h)`, result.payNight],
                      result.payHol>0&&[`휴일(${work.holH}h)`, result.payHol],
                      result.payHolExt>0&&[`휴일시외(${work.holExtH}h)`, result.payHolExt],
                      curSalary?.meal>0&&['식대', curSalary.meal],
                      curSalary?.transport>0&&['교통비', curSalary.transport],
                      curSalary?.comm>0&&['통신비', curSalary.comm],
                    ].filter(Boolean).map((item:any,i)=>(
                      <div key={i} className="flex justify-between py-1 text-xs border-b border-gray-50">
                        <span className="text-gray-500">{item[0]}</span>
                        <span className="text-purple-600">{formatWon(item[1])}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-1.5 text-xs font-semibold">
                      <span>합계</span><span className="text-purple-600">{formatWon(result.grossTotal)}</span>
                    </div>
                  </div>
                  <div className="pl-4">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">공제</div>
                    {[
                      ['국민연금', result.pension],['건강보험', result.health],
                      ['장기요양', result.ltc],['고용보험', result.employ],
                      ['소득세', result.incomeTax],['지방세', result.localTax],
                    ].map(([l,v],i)=>(
                      <div key={i} className="flex justify-between py-1 text-xs border-b border-gray-50">
                        <span className="text-gray-500">{l}</span>
                        <span className="text-red-500">-{formatWon(v as number)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-1.5 text-xs font-semibold">
                      <span>합계</span><span className="text-red-500">-{formatWon(result.totalDeduct)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-xl p-4 flex justify-between items-center" style={{background:'linear-gradient(135deg,#534AB7,#6c63d4)'}}>
                <div className="text-white/80 text-sm">실 수령액 · {curStaff?.name} · {month}월</div>
                <div className="text-white text-xl font-bold">{formatWon(result.netPay)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-5 w-96 shadow-xl">
            <div className="text-sm font-semibold text-gray-800 mb-3">급여 정보 설정 — {curStaff?.name}</div>
            {[
              {l:'연봉', k:'annual', t:'number'},
              {l:'부양가족 수', k:'dependents', t:'number'},
              {l:'식대', k:'meal', t:'number'},
              {l:'교통비', k:'transport', t:'number'},
              {l:'통신비', k:'comm', t:'number'},
            ].map(f=>(
              <div key={f.k} className="mb-2">
                <label className="block text-xs text-gray-500 mb-1">{f.l}</label>
                <input type={f.t} className="input text-sm" value={editing[f.k]||0}
                  onChange={e=>setEditing((p:any)=>({...p,[f.k]:+e.target.value}))} />
              </div>
            ))}
            <div className="flex gap-2 justify-end mt-3">
              <button onClick={()=>setEditing(null)} className="btn-secondary text-sm">취소</button>
              <button onClick={saveSalary} className="btn-primary text-sm">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

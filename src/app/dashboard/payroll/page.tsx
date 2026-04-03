'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { calcSalary, formatWon, sortByGrade } from '@/lib/attendance'

export default function PayrollPage() {
  const [staffList, setStaffList] = useState<any[]>([])
  const [salaryList, setSalaryList] = useState<any[]>([])
  const [alert, setAlert] = useState('')
  const [selIdx, setSelIdx] = useState(0)
  const [selYear, setSelYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth()+1)
  const [workData, setWorkData] = useState<any>(null)
  const [result, setResult] = useState<any>(null)
  // 수기 입력 항목
  const [bonus, setBonus] = useState(0)
  const [celebration, setCelebration] = useState(0)
  const [extraItems, setExtraItems] = useState<{label:string,amount:number}[]>([])
  // 계약연봉 수정
  const [editingAnnual, setEditingAnnual] = useState(false)
  const [newAnnual, setNewAnnual] = useState(0)

  const years = Array.from({length:5},(_,i)=>new Date().getFullYear()-i)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: s } = await supabase.from('profiles').select('id,name,grade,dept').eq('status','active')
    const sorted = sortByGrade(s||[])
    setStaffList(sorted)
    const { data: sal } = await supabase.from('salary_info').select('*')
    setSalaryList(sal||[])
  }, [])

  useEffect(() => { load() }, [load])

  // 직원 선택 시 근태 로드
  useEffect(() => {
    if (!staffList[selIdx]) return
    const loadWork = async () => {
      const supabase = createClient()
      const uid = staffList[selIdx].id
      const start = `${selYear}-${String(month).padStart(2,'0')}-01`
      const end   = `${selYear}-${String(month).padStart(2,'0')}-31`
      const { data: recs } = await supabase.from('attendance').select('*')
        .eq('user_id', uid).gte('work_date', start).lte('work_date', end)
      if (recs?.length) {
        const w = recs.reduce((a:any,r:any)=>({
          regH:      a.regH      + (r.reg_hours||0),
          extH:      a.extH      + (r.ext_hours||0),
          nightH:    a.nightH    + (r.night_hours||0),
          holH:      a.holH      + (r.hol_hours||0),
          holExtH:   a.holExtH   + (r.hol_eve_hours||0),
          holNightH: a.holNightH + (r.hol_night_hours||0),
        }),{regH:0,extH:0,nightH:0,holH:0,holExtH:0,holNightH:0})
        setWorkData(w)
      } else {
        setWorkData(null)
      }
      // 수기항목 초기화
      setBonus(0); setCelebration(0); setExtraItems([])
      setEditingAnnual(false)
    }
    loadWork()
  }, [selIdx, selYear, month, staffList])

  // 급여 계산
  useEffect(() => {
    const sal = salaryList.find(s=>s.user_id===staffList[selIdx]?.id)
    if (!sal || !workData) { setResult(null); return }
    const base = calcSalary({
      annual:sal.annual, dependents:sal.dependents,
      meal:sal.meal, transport:sal.transport, comm:sal.comm,
      ...workData
    })
    // 특별수당 합산 (비과세 처리)
    const specialTotal = bonus + celebration + extraItems.reduce((a,x)=>a+(x.amount||0),0)
    setResult({...base, specialTotal,
      finalPay: base.netPay + specialTotal
    })
    setNewAnnual(sal.annual)
  }, [workData, salaryList, selIdx, staffList, bonus, celebration, other])

  async function saveAnnual() {
    if (!staffList[selIdx]) return
    const supabase = createClient()
    await supabase.from('salary_info').update({annual: newAnnual, updated_at: new Date().toISOString()})
      .eq('user_id', staffList[selIdx].id)
    setEditingAnnual(false)
    setAlert('계약연봉이 수정되었습니다.')
    load(); setTimeout(()=>setAlert(''),3000)
  }

  const selStaff = staffList[selIdx]
  const selSalary = salaryList.find(s=>s.user_id===selStaff?.id)
  const rate = selSalary ? Math.round(selSalary.annual/12/209) : 0

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">급여 일괄계산</h1>
      {alert && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{alert}</div>}

      {/* 조회 옵션 */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <select className="input w-auto text-sm" value={selIdx} onChange={e=>setSelIdx(+e.target.value)}>
          {staffList.map((s,i)=><option key={s.id} value={i}>{s.name} ({s.grade})</option>)}
        </select>
        <select className="input w-auto text-sm" value={selYear} onChange={e=>setSelYear(+e.target.value)}>
          {years.map(y=><option key={y} value={y}>{y}년</option>)}
        </select>
        <select className="input w-20 text-sm" value={month} onChange={e=>setMonth(+e.target.value)}>
          {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}월</option>)}
        </select>
      </div>

      {selSalary ? (
        <div className="grid grid-cols-2 gap-4">
          {/* 왼쪽: 계약정보 + 근태 */}
          <div className="space-y-4">
            {/* 계약연봉 */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-gray-700">💼 계약 정보</div>
                {!editingAnnual
                  ? <button onClick={()=>setEditingAnnual(true)} className="btn-secondary text-xs px-2 py-1">연봉 수정</button>
                  : <div className="flex gap-1">
                      <button onClick={()=>setEditingAnnual(false)} className="btn-secondary text-xs px-2 py-1">취소</button>
                      <button onClick={saveAnnual} className="btn-primary text-xs px-2 py-1">저장</button>
                    </div>
                }
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">계약연봉</span>
                  {editingAnnual
                    ? <input type="number" className="input w-36 text-sm text-right" value={newAnnual}
                        onChange={e=>setNewAnnual(+e.target.value)} />
                    : <span className="text-sm font-semibold text-purple-600">{formatWon(selSalary.annual)}</span>
                  }
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">기본 시간단가</span>
                  <span className="text-xs font-medium text-gray-700">{rate.toLocaleString()}원/h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">부양가족</span>
                  <span className="text-xs text-gray-700">{selSalary.dependents}명</span>
                </div>
                {[{l:'식대',v:selSalary.meal},{l:'교통비',v:selSalary.transport},{l:'통신비',v:selSalary.comm}].map(x=>(
                  <div key={x.l} className="flex justify-between">
                    <span className="text-xs text-gray-500">{x.l} (비과세)</span>
                    <span className="text-xs text-gray-700">{formatWon(x.v)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 근태 실적 (RAW - 읽기전용) */}
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-sm font-semibold text-gray-700">📋 {selYear}년 {month}월 근태 실적</div>
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">읽기 전용</span>
              </div>
              <div className="space-y-1.5">
                {[
                  {l:'평일 정규',    key:'regH',     c:'text-purple-600', rate:'×1.0', pct:'통상임금 100%'},
                  {l:'평일 시간외',  key:'extH',     c:'text-blue-600',   rate:'×1.5', pct:'가산임금 150%'},
                  {l:'평일 야간',    key:'nightH',   c:'text-red-600',    rate:'×2.0', pct:'야간가산 200%'},
                  {l:'휴일 정규',    key:'holH',     c:'text-teal-600',   rate:'×1.5', pct:'휴일가산 150%'},
                  {l:'휴일 시간외',  key:'holExtH',  c:'text-amber-600',  rate:'×2.0', pct:'휴일+가산 200%'},
                  {l:'휴일 야간',    key:'holNightH',c:'text-rose-600',   rate:'×2.5', pct:'휴일+야간 250%'},
                ].map(x=>{
                  const v = workData?.[x.key] || 0
                  return (
                    <div key={x.l} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 font-medium">{x.l}</span>
                          <span className={`text-xs ${x.c} font-semibold`}>{x.rate}</span>
                        </div>
                        <div className="text-xs text-gray-400">{x.pct}</div>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-bold ${v>0?x.c:'text-gray-300'}`}>{v}h</span>
                        {!workData && <div className="text-xs text-gray-300">데이터 없음</div>}
                      </div>
                    </div>
                  )
                })}
                {!workData && (
                  <div className="mt-2 p-2 bg-gray-50 rounded-lg text-xs text-gray-400 text-center">
                    해당 월 근태 기록이 없습니다 (수기 입력 항목만 계산됩니다)
                  </div>
                )}
              </div>
            </div>

            {/* 수기 입력 항목 */}
            <div className="card">
              <div className="text-sm font-semibold text-gray-700 mb-3">✏️ 수기 입력 항목</div>
              <div className="space-y-2.5">
                {/* 고정 항목 */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">상여금 (원)</label>
                  <input type="number" className="input text-sm" value={bonus||0}
                    onChange={e=>setBonus(+e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">경조사비 (원)</label>
                  <input type="number" className="input text-sm" value={celebration||0}
                    onChange={e=>setCelebration(+e.target.value)} placeholder="0" />
                </div>
                {/* 동적 기타 항목 */}
                {extraItems.map((item,idx)=>(
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1">
                      <input type="text" className="input text-xs" value={item.label}
                        placeholder="항목명 (예: 특별수당)"
                        onChange={e=>setExtraItems(prev=>prev.map((x,i)=>i===idx?{...x,label:e.target.value}:x))} />
                      <input type="number" className="input text-sm" value={item.amount||0}
                        placeholder="금액 (원)"
                        onChange={e=>setExtraItems(prev=>prev.map((x,i)=>i===idx?{...x,amount:+e.target.value}:x))} />
                    </div>
                    <button onClick={()=>setExtraItems(prev=>prev.filter((_,i)=>i!==idx))}
                      className="mt-1 w-7 h-7 flex items-center justify-center rounded-full bg-red-50 text-red-500 hover:bg-red-100 text-sm flex-shrink-0">
                      −
                    </button>
                  </div>
                ))}
                {/* 항목 추가 버튼 */}
                <button onClick={()=>setExtraItems(prev=>[...prev,{label:'',amount:0}])}
                  className="w-full py-2 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-purple-300 hover:text-purple-600 transition-colors">
                  + 항목 추가 (기타수당, 특별수당 등)
                </button>
              </div>
              {(bonus+celebration+extraItems.reduce((a,x)=>a+(x.amount||0),0)) > 0 && (
                <div className="mt-3 p-2 bg-amber-50 rounded-lg text-xs text-amber-700">
                  수기 합계: {formatWon(bonus+celebration+extraItems.reduce((a,x)=>a+(x.amount||0),0))}
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽: 계산 결과 */}
          <div className="space-y-4">
            {result ? (
              <>
                {/* 요약 */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {l:'총 지급액', v:formatWon(result.grossTotal+(result.specialTotal||0)), c:'text-purple-600'},
                    {l:'총 공제액', v:'-'+formatWon(result.totalDeduct), c:'text-red-600'},
                  ].map(x=>(
                    <div key={x.l} className="card text-center py-3">
                      <div className="text-xs text-gray-400 mb-1">{x.l}</div>
                      <div className={`text-base font-semibold ${x.c}`}>{x.v}</div>
                    </div>
                  ))}
                </div>

                {/* 지급 상세 */}
                <div className="card">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">지급 항목</div>
                  {[
                    ['기본급', result.base],
                    result.payExt>0      && [`평일 시간외 (${workData.extH}h × 1.5)`, result.payExt],
                    result.payNight>0    && [`평일 야간 (${workData.nightH}h × 2.0)`, result.payNight],
                    result.payHol>0      && [`휴일 정규 (${workData.holH}h × 1.5)`, result.payHol],
                    result.payHolExt>0   && [`휴일 시간외 (${workData.holExtH}h × 2.0)`, result.payHolExt],
                    result.payHolNight>0 && [`휴일 야간 (${workData.holNightH}h × 2.5)`, result.payHolNight],
                    selSalary?.meal>0      && ['식대 (비과세)', selSalary.meal],
                    selSalary?.transport>0 && ['교통비 (비과세)', selSalary.transport],
                    selSalary?.comm>0      && ['통신비 (비과세)', selSalary.comm],
                    bonus>0        && ['상여금', bonus],
                    celebration>0  && ['경조사비', celebration],
                    ...extraItems.filter(x=>x.amount>0).map(x=>[x.label||'기타수당', x.amount]),
                  ].filter(Boolean).map((item:any,i)=>(
                    <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 text-xs">
                      <span className="text-gray-500">{item[0]}</span>
                      <span className="text-purple-600 font-medium">{formatWon(item[1])}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 text-sm font-semibold">
                    <span>합계</span>
                    <span className="text-purple-600">{formatWon(result.grossTotal+(result.specialTotal||0))}</span>
                  </div>
                </div>

                {/* 공제 상세 */}
                <div className="card">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">공제 항목</div>
                  {[
                    ['국민연금 (4.5%)', result.pension],
                    ['건강보험 (3.545%)', result.health],
                    ['장기요양보험', result.ltc],
                    ['고용보험 (0.9%)', result.employ],
                    [`소득세 (${selSalary?.dependents}인)`, result.incomeTax],
                    ['지방소득세', result.localTax],
                  ].map(([l,v],i)=>(
                    <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 text-xs">
                      <span className="text-gray-500">{l}</span>
                      <span className="text-red-600 font-medium">-{formatWon(v as number)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 text-sm font-semibold">
                    <span>합계</span>
                    <span className="text-red-600">-{formatWon(result.totalDeduct)}</span>
                  </div>
                </div>

                {/* 계산식 */}
                <div className="card bg-gray-50 border-gray-100">
                  <div className="text-xs font-semibold text-gray-500 mb-2">📐 계산 기준</div>
                  <div className="space-y-1 text-xs text-gray-400">
                    <div>기본 시간단가: {formatWon(selSalary?.annual)} ÷ 12 ÷ 209h = <span className="text-purple-600 font-medium">{rate.toLocaleString()}원/h</span></div>
                    <div className="grid grid-cols-2 gap-x-4 mt-1">
                      <div>평일 시간외 <span className="text-blue-500 font-medium">×1.5배</span></div>
                      <div>평일 야간 <span className="text-red-500 font-medium">×2.0배</span></div>
                      <div>휴일 정규 <span className="text-teal-500 font-medium">×1.5배</span></div>
                      <div>휴일 시간외 <span className="text-amber-500 font-medium">×2.0배</span></div>
                      <div>휴일 야간 <span className="text-rose-500 font-medium">×2.5배</span></div>
                    </div>
                  </div>
                </div>

                {/* 최종 수령액 */}
                <div className="rounded-xl p-5 flex justify-between items-center"
                  style={{background:'linear-gradient(135deg,#534AB7,#6c63d4)'}}>
                  <div>
                    <div className="text-white/80 text-sm font-medium">최종 실 수령액</div>
                    <div className="text-white/60 text-xs mt-0.5">
                      {selYear}년 {month}월 · {selStaff?.name}
                    </div>
                    {result.specialTotal>0 && (
                      <div className="text-white/50 text-xs mt-0.5">
                        (근태급여 {formatWon(result.netPay)} + 수기항목 {formatWon(result.specialTotal)})
                      </div>
                    )}
                  </div>
                  <div className="text-white text-2xl font-bold">{formatWon(result.finalPay)}</div>
                </div>
              </>
            ) : (
              <div className="card py-16 text-center">
                <div className="text-3xl mb-3">📭</div>
                <div className="text-gray-400 text-sm">{selYear}년 {month}월 근태 데이터가 없습니다</div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card py-16 text-center">
          <div className="text-3xl mb-3">💼</div>
          <div className="text-gray-400 text-sm">급여 정보가 등록되지 않은 직원입니다</div>
          <div className="text-gray-300 text-xs mt-1">인사관리 → 계약연봉 관리에서 먼저 등록해주세요</div>
        </div>
      )}
    </div>
  )
}

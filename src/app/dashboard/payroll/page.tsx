'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { calcSalary, formatWon, sortByGrade, getLatestPayMonth, formatPayLabel } from '@/lib/attendance'

export default function PayrollPage() {
  const [staffList, setStaffList] = useState<any[]>([])
  const [salaryList, setSalaryList] = useState<any[]>([])
  const [alert, setAlert] = useState('')
  const [selIdx, setSelIdx] = useState(0)
  // 기본값: 최신 지급될 명세서의 근무월 (예: 5/14 → 4월)
  const initPay = getLatestPayMonth()
  const [selYear, setSelYear] = useState(initPay.year)
  const [month, setMonth] = useState(initPay.month)
  const [workData, setWorkData] = useState<any>(null)
  const [result, setResult] = useState<any>(null)
  const [bonus, setBonus] = useState(0)
  const [celebration, setCelebration] = useState(0)
  const [extraItems, setExtraItems] = useState<{label:string,amount:number}[]>([])
  const [editingAnnual, setEditingAnnual] = useState(false)
  const [newAnnual, setNewAnnual] = useState(0)
  const [tripAllowance, setTripAllowance] = useState(0)
  const [tripDays, setTripDays] = useState(0)
  const [deductItems, setDeductItems] = useState<any[]>([])
  const [manualInputs, setManualInputs] = useState<Record<string, number>>({}) // 수기 입력 항목
  const [tripCount, setTripCount] = useState(0) // 그 월 출장 횟수
  const [tripTotalFromTrips, setTripTotalFromTrips] = useState(0) // business_trips에서 자동 합계

  const years = Array.from({length:5},(_,i)=>new Date().getFullYear()-i)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: s } = await supabase.from('profiles').select('id,name,grade,dept').eq('status','active')
    setStaffList(sortByGrade(s||[]))
    const { data: sal } = await supabase.from('salary_info').select('*')
    setSalaryList(sal||[])
    // 회사설정 로드
    const { data: settings } = await supabase.from('company_settings').select('key,value')
      .in('key',['trip_allowance','deduct_items'])
    ;(settings||[]).forEach((s:any)=>{
      if (s.key==='trip_allowance') setTripAllowance(Number(s.value)||0)
      if (s.key==='deduct_items') { try { setDeductItems(JSON.parse(s.value)) } catch {} }
    })
  }, [])

  useEffect(() => { load() }, [load])

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
        setWorkData(recs.reduce((a:any,r:any)=>({
          regH:      a.regH      + (r.reg_hours||0),
          extH:      a.extH      + (r.ext_hours||0),
          nightH:    a.nightH    + (r.night_hours||0),
          holH:      a.holH      + (r.hol_hours||0),
          holExtH:   a.holExtH   + (r.hol_eve_hours||0),
          holNightH: a.holNightH + (r.hol_night_hours||0),
        }),{regH:0,extH:0,nightH:0,holH:0,holExtH:0,holNightH:0}))
      } else {
        setWorkData(null)
      }
      // 출장 - business_trips에서 가져오기 (승인된 건만, 회사 부담)
      const { data: trips } = await supabase.from('business_trips')
        .select('id, allowance, duration_hours, all_day')
        .eq('user_id', uid)
        .eq('status', 'approved') // 승인된 출장만 급여에 산입
        .gte('trip_date', start).lte('trip_date', end)
      const tripsCount = trips?.length || 0
      const tripsTotal = (trips || []).reduce((sum: number, t: any) => sum + (t.allowance || 0), 0)
      setTripCount(tripsCount)
      setTripTotalFromTrips(tripsTotal)
      // 호환을 위해 tripDays도 계속 (옛 attendance note='출장' 방식과 합산하지 않음, 출장보고가 정식)
      setTripDays(0)

      // 수기 입력 데이터 (salary_manual_inputs)
      const { data: manualRow } = await supabase.from('salary_manual_inputs')
        .select('items')
        .eq('user_id', uid).eq('work_year', selYear).eq('work_month', month)
        .maybeSingle()
      setManualInputs((manualRow?.items as any) || {})

      setBonus(0); setCelebration(0); setExtraItems([])
      setEditingAnnual(false)
    }
    loadWork()
  }, [selIdx, selYear, month, staffList])

  useEffect(() => {
    const sal = salaryList.find(s=>s.user_id===staffList[selIdx]?.id)
    if (!sal) { setResult(null); return }
    const w = workData || {regH:0,extH:0,nightH:0,holH:0,holExtH:0,holNightH:0}
    const base = calcSalary({
      annual:sal.annual, dependents:sal.dependents,
      meal:sal.meal, transport:sal.transport, comm:sal.comm, ...w
    })
    // 출장수당 - business_trips에서 자동 합계 우선, 옛 attendance 방식은 fallback
    const tripPay = tripTotalFromTrips > 0 ? tripTotalFromTrips : (tripDays * tripAllowance)
    const customDeducts = deductItems.filter((d:any)=>d.enabled && !['pension','health','ltc','employ','incomeTax','localTax'].includes(d.id))
    const customDeductTotal = customDeducts.reduce((sum:number,d:any)=>{
      if (d.rateType==='percent') return sum + Math.round(base.grossTaxable * d.rate / 100)
      return sum + (d.rate||0)
    }, 0)
    // 기존 일회성 (호환)
    const specialTotal = bonus + celebration + extraItems.reduce((a,x)=>a+(x.amount||0),0)
    // 수기 입력 8개 지급 합계
    const manualPayKeys = ['bonus_manual','comm_manual','edu','meal_manual','performance','reward','transport_manual','extra_pay']
    const manualPayTotal = manualPayKeys.reduce((sum, k) => sum + (manualInputs[k] || 0), 0)
    // 수기 공제: ltc/employment는 자동값 대체용, 나머지는 추가 공제
    const ltcOverride = manualInputs.ltc || 0
    const empOverride = manualInputs.employment || 0
    const yearEndDeduct = (manualInputs.year_income_tax || 0) + (manualInputs.year_local_tax || 0) + (manualInputs.other_deduct || 0)
    // 자동값과 수기값의 차이 (양/음 모두 가능)
    const ltcDelta = ltcOverride > 0 ? (ltcOverride - base.ltc) : 0
    const empDelta = empOverride > 0 ? (empOverride - base.employ) : 0
    // 최종 총공제액
    const totalDeductFinal = base.totalDeduct + ltcDelta + empDelta + yearEndDeduct
    // 최종 실수령액
    const netPayFinal = base.grossTotal - totalDeductFinal
    setResult({
      ...base,
      totalDeduct: totalDeductFinal,
      netPay: netPayFinal,
      specialTotal, tripPay, customDeductTotal,
      manualPayTotal,
      manualDeductTotal: ltcDelta + empDelta + yearEndDeduct,
      finalPay: netPayFinal + specialTotal + tripPay + manualPayTotal - customDeductTotal,
    })
    setNewAnnual(sal.annual)
  }, [workData, salaryList, selIdx, staffList, bonus, celebration, extraItems, tripTotalFromTrips, tripDays, tripAllowance, deductItems, manualInputs])

  async function saveAnnual() {
    if (!staffList[selIdx]) return
    const supabase = createClient()
    await supabase.from('salary_info').update({annual: newAnnual, updated_at: new Date().toISOString()})
      .eq('user_id', staffList[selIdx].id)
    setEditingAnnual(false)
    setAlert('계약연봉이 수정되었습니다.')
    load(); setTimeout(()=>setAlert(''),3000)
  }

  // 수기 입력 항목 저장 (salary_manual_inputs)
  async function saveManualInputs() {
    if (!staffList[selIdx]) return
    const supabase = createClient()
    // 값이 있는 항목만 저장
    const cleanedItems: Record<string, number> = {}
    for (const [k, v] of Object.entries(manualInputs)) {
      if (v && v !== 0) cleanedItems[k] = v
    }
    const { error } = await supabase.from('salary_manual_inputs').upsert({
      user_id: staffList[selIdx].id,
      work_year: selYear,
      work_month: month,
      items: cleanedItems,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,work_year,work_month' })
    if (error) { setAlert('저장 실패: ' + error.message); setTimeout(()=>setAlert(''),3000); return }
    setAlert('💾 수기 입력 항목이 저장되었습니다.')
    setTimeout(()=>setAlert(''),2500)
  }

  function setManualValue(key: string, value: number) {
    setManualInputs(prev => ({ ...prev, [key]: value || 0 }))
  }

  const selStaff = staffList[selIdx]
  const selSalary = salaryList.find(s=>s.user_id===selStaff?.id)
  const rate = selSalary ? Math.round(selSalary.annual/12/209) : 0
  const specialTotal = bonus + celebration + extraItems.reduce((a,x)=>a+(x.amount||0),0)

  const WORK_ITEMS = [
    {l:'평일 정규',   key:'regH',     c:'text-purple-600', rate:'×1.0', pct:'통상임금 100%'},
    {l:'평일 시간외', key:'extH',     c:'text-blue-600',   rate:'×1.5', pct:'가산임금 150%'},
    {l:'평일 야간',   key:'nightH',   c:'text-red-600',    rate:'×2.0', pct:'야간가산 200%'},
    {l:'휴일 정규',   key:'holH',     c:'text-teal-600',   rate:'×1.5', pct:'휴일가산 150%'},
    {l:'휴일 시간외', key:'holExtH',  c:'text-amber-600',  rate:'×2.0', pct:'휴일+가산 200%'},
    {l:'휴일 야간',   key:'holNightH',c:'text-rose-600',   rate:'×2.5', pct:'휴일+야간 250%'},
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-gray-800">급여 일괄계산</h1>
        <div className="text-xs text-gray-500 mt-0.5">
          📅 <strong>{formatPayLabel(selYear, month)}</strong>
        </div>
      </div>

      {/* 사용 안내 */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-1">
        <div className="font-semibold">💡 급여 계산 흐름</div>
        <div>1. <strong>자동 계산</strong>: 기본급, 시간외/야간/휴일수당, 식대/교통비/통신비, 출장수당 (출장보고 승인 건)</div>
        <div>2. <strong>수기 입력</strong>: 상여금, 성과급, 교육비, 급량비 등은 아래 <span className="bg-amber-100 px-1 rounded font-semibold">📝 명세서 수기 입력</span> 영역에 직접 입력 후 <strong>💾 저장</strong></div>
        <div>3. <strong>최종 명세서</strong>: 자동 + 수기 합산 결과가 직원의 급여명세 조회에 반영</div>
      </div>

      {alert && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{alert}</div>}

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <select className="input w-auto text-sm" value={selIdx} onChange={e=>setSelIdx(+e.target.value)}>
          {staffList.map((s,i)=><option key={s.id} value={i}>{s.name} ({s.grade})</option>)}
        </select>
        <span className="text-xs text-gray-500 ml-2">근무월:</span>
        <select className="input w-auto text-sm" value={selYear} onChange={e=>setSelYear(+e.target.value)}>
          {years.map(y=><option key={y} value={y}>{y}년</option>)}
        </select>
        <select className="input w-20 text-sm" value={month} onChange={e=>setMonth(+e.target.value)}>
          {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}월</option>)}
        </select>
      </div>

      {selSalary ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-4">
            {/* 계약 정보 */}
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

            {/* 근태 실적 */}
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-sm font-semibold text-gray-700">📋 {selYear}년 {month}월 근태 실적</div>
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">읽기 전용</span>
              </div>
              <div className="space-y-1.5">
                {WORK_ITEMS.map(x=>{
                  const v = workData?.[x.key] || 0
                  return (
                    <div key={x.l} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 font-medium">{x.l}</span>
                          <span className={`text-xs font-semibold ${x.c}`}>{x.rate}</span>
                        </div>
                        <div className="text-xs text-gray-400">{x.pct}</div>
                      </div>
                      <span className={`text-sm font-bold ${v>0?x.c:'text-gray-300'}`}>{v}h</span>
                    </div>
                  )
                })}
                {/* 출장수당 - business_trips에서 자동 합계 */}
                <div className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 font-medium">🚗 출장수당</span>
                      <span className="text-[10px] text-purple-500">자동</span>
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {tripCount > 0
                        ? `승인된 출장 ${tripCount}건 (4h↑ 25,000원/4h미만 15,000원)`
                        : `해당 월 승인된 출장보고서 없음`}
                    </div>
                  </div>
                  <div className="text-right">
                    {tripTotalFromTrips > 0 ? (
                      <span className="text-sm font-bold text-amber-600 tabular-nums">{tripTotalFromTrips.toLocaleString()}원</span>
                    ) : (
                      <span className="text-sm text-gray-300">0원</span>
                    )}
                  </div>
                </div>
                {!workData && (
                  <div className="mt-2 p-2 bg-gray-50 rounded-lg text-xs text-gray-400 text-center">
                    해당 월 근태 기록 없음 · 수기 입력 항목만 계산됩니다
                  </div>
                )}
              </div>
            </div>

            {/* 수기 입력 */}
            <div className="card">
              <div className="text-sm font-semibold text-gray-700 mb-3">✏️ 일회성 추가/감액</div>
              <div className="space-y-2.5">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">경조사비 (원)</label>
                  <input type="number" className="input text-sm" value={celebration||0}
                    onChange={e=>setCelebration(+e.target.value)} placeholder="0" />
                </div>
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
                <button onClick={()=>setExtraItems(prev=>[...prev,{label:'',amount:0}])}
                  className="w-full py-2 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-purple-300 hover:text-purple-600 transition-colors">
                  + 항목 추가 (기타 일회성 지급)
                </button>
              </div>
              {specialTotal > 0 && (
                <div className="mt-3 p-2 bg-amber-50 rounded-lg text-xs text-amber-700">
                  일회성 합계: {formatWon(specialTotal)}
                </div>
              )}
            </div>

            {/* 명세서 수기 입력 (월별 저장) - 세무사 명세서 양식 기반 */}
            <div className="card border-2 border-amber-300 bg-amber-50/30">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-bold text-amber-800 flex items-center gap-1">
                    <span className="text-base">📝</span>
                    명세서 수기 입력 (세무사 조정값)
                  </div>
                  <div className="text-[11px] text-amber-700 mt-0.5">
                    세무사가 보내준 최종 명세서의 항목을 여기에 입력하고 <strong>💾 저장</strong>하세요. 이 값이 직원에게 보이는 명세서에 반영됩니다.
                  </div>
                </div>
                <button onClick={saveManualInputs}
                  className="btn-primary text-sm px-3 py-1.5 bg-amber-600 hover:bg-amber-700">💾 저장</button>
              </div>

              <div className="space-y-3">
                {/* 지급 항목 8개 */}
                <div>
                  <div className="text-xs font-semibold text-green-700 mb-1.5">+ 지급 항목</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {key:'bonus_manual',label:'상여금'},
                      {key:'comm_manual',label:'통신비'},
                      {key:'edu',label:'교육비지원금'},
                      {key:'meal_manual',label:'급량비'},
                      {key:'performance',label:'성과급'},
                      {key:'reward',label:'업무시상금'},
                      {key:'transport_manual',label:'교통비'},
                      {key:'extra_pay',label:'추가수당'},
                    ].map(item => (
                      <div key={item.key}>
                        <label className="block text-[10px] text-gray-500 mb-0.5">{item.label}</label>
                        <input type="number" className="input text-xs py-1"
                          placeholder="0"
                          value={manualInputs[item.key] || 0}
                          onChange={e => setManualValue(item.key, +e.target.value)} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 공제 항목 5개 */}
                <div>
                  <div className="text-xs font-semibold text-red-700 mb-1.5">− 공제 항목 (세무사 조정값)</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {key:'ltc',label:'장기요양보험'},
                      {key:'employment',label:'고용보험'},
                      {key:'year_income_tax',label:'연말정산소득세'},
                      {key:'year_local_tax',label:'연말정산지방소득세'},
                      {key:'other_deduct',label:'기타공제'},
                    ].map(item => (
                      <div key={item.key}>
                        <label className="block text-[10px] text-gray-500 mb-0.5">{item.label}</label>
                        <input type="number" className="input text-xs py-1"
                          placeholder="0"
                          value={manualInputs[item.key] || 0}
                          onChange={e => setManualValue(item.key, +e.target.value)} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {(result?.manualPayTotal > 0 || result?.manualDeductTotal > 0) && (
                <div className="mt-3 p-2 bg-blue-50 rounded-lg text-xs text-blue-700 space-y-0.5">
                  {result?.manualPayTotal > 0 && <div>+ 수기 지급 합계: <strong>{formatWon(result.manualPayTotal)}</strong></div>}
                  {result?.manualDeductTotal > 0 && <div>− 수기 공제 합계: <strong className="text-red-700">{formatWon(result.manualDeductTotal)}</strong></div>}
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽: 계산 결과 */}
          <div className="space-y-4">
            {result ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {l:'총 지급액', v:formatWon(result.grossTotal+specialTotal+(result.tripPay||0)+(result.manualPayTotal||0)), c:'text-purple-600'},
                    {l:'총 공제액', v:'-'+formatWon(result.totalDeduct+(result.customDeductTotal||0)+(result.manualDeductTotal||0)), c:'text-red-600'},
                  ].map(x=>(
                    <div key={x.l} className="card text-center py-3">
                      <div className="text-xs text-gray-400 mb-1">{x.l}</div>
                      <div className={`text-base font-semibold ${x.c}`}>{x.v}</div>
                    </div>
                  ))}
                </div>

                <div className="card">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">지급 항목</div>
                  {([
                    ['기본급', result.base],
                    result.payExt>0      && [`평일 시간외 (×1.5)`, result.payExt],
                    result.payNight>0    && [`평일 야간 (×2.0)`, result.payNight],
                    result.payHol>0      && [`휴일 정규 (×1.5)`, result.payHol],
                    result.payHolExt>0   && [`휴일 시간외 (×2.0)`, result.payHolExt],
                    result.payHolNight>0 && [`휴일 야간 (×2.5)`, result.payHolNight],
                    selSalary?.meal>0      && ['식대 (비과세)', selSalary.meal],
                    selSalary?.transport>0 && ['교통비 (비과세)', selSalary.transport],
                    selSalary?.comm>0      && ['통신비 (비과세)', selSalary.comm],
                    (result.tripPay||0)>0 && ['🚗 출장수당', result.tripPay],
                    // 수기 입력 8개 항목
                    (manualInputs.bonus_manual||0)>0 && ['상여금', manualInputs.bonus_manual],
                    (manualInputs.comm_manual||0)>0 && ['통신비 (수기)', manualInputs.comm_manual],
                    (manualInputs.edu||0)>0 && ['교육비지원금', manualInputs.edu],
                    (manualInputs.meal_manual||0)>0 && ['급량비', manualInputs.meal_manual],
                    (manualInputs.performance||0)>0 && ['성과급', manualInputs.performance],
                    (manualInputs.reward||0)>0 && ['업무시상금', manualInputs.reward],
                    (manualInputs.transport_manual||0)>0 && ['교통비 (수기)', manualInputs.transport_manual],
                    (manualInputs.extra_pay||0)>0 && ['추가수당', manualInputs.extra_pay],
                    // 일회성
                    celebration>0  && ['경조사비', celebration],
                    ...extraItems.filter(x=>x.amount>0).map(x=>[x.label||'기타수당', x.amount] as [string,number]),
                  ] as any[]).filter(Boolean).map((item:any,i:number)=>(
                    <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 text-xs">
                      <span className="text-gray-500">{item[0]}</span>
                      <span className="text-purple-600 font-medium">{formatWon(item[1])}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 text-sm font-semibold">
                    <span>합계</span>
                    <span className="text-purple-600">{formatWon(result.grossTotal+specialTotal+(result.tripPay||0)+(result.manualPayTotal||0))}</span>
                  </div>
                </div>

                <div className="card">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">공제 항목</div>
                  {([
                    ['국민연금 (4.5%)', result.pension],
                    ['건강보험 (3.545%)', result.health],
                    // 장기요양보험은 자동 + 수기 입력값이 있으면 수기로 (세무사 조정)
                    (manualInputs.ltc||0) > 0
                      ? ['장기요양보험 (수기)', manualInputs.ltc]
                      : ['장기요양보험', result.ltc],
                    (manualInputs.employment||0) > 0
                      ? ['고용보험 (수기)', manualInputs.employment]
                      : ['고용보험 (0.9%)', result.employ],
                    [`소득세 (${selSalary?.dependents}인)`, result.incomeTax],
                    ['지방소득세', result.localTax],
                    // 수기 공제 항목 (연말정산 등)
                    (manualInputs.year_income_tax||0) > 0 && ['연말정산소득세', manualInputs.year_income_tax],
                    (manualInputs.year_local_tax||0) > 0 && ['연말정산지방소득세', manualInputs.year_local_tax],
                    (manualInputs.other_deduct||0) > 0 && ['기타공제', manualInputs.other_deduct],
                  ] as any[]).filter(Boolean).map((item:any,i:number)=>(
                    <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 text-xs">
                      <span className="text-gray-500">{item[0]}</span>
                      <span className="text-red-600 font-medium">-{formatWon(item[1] as number)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 text-sm font-semibold">
                    <span>합계</span>
                    <span className="text-red-600">-{formatWon(result.totalDeduct+(result.manualDeductTotal||0))}</span>
                  </div>
                </div>

                <div className="card bg-gray-50 border-gray-100">
                  <div className="text-xs font-semibold text-gray-500 mb-2">📐 계산 기준</div>
                  <div className="text-xs text-gray-400 space-y-1">
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

                <div className="rounded-xl p-5 flex justify-between items-center"
                  style={{background:'linear-gradient(135deg,#534AB7,#6c63d4)'}}>
                  <div>
                    <div className="text-white/80 text-sm font-medium">최종 실 수령액</div>
                    <div className="text-white/60 text-xs mt-0.5">{selYear}년 {month}월 · {selStaff?.name}</div>
                    {specialTotal>0 && (
                      <div className="text-white/50 text-xs mt-0.5">
                        근태급여 {formatWon(result.netPay)} + 수기 {formatWon(specialTotal)}
                      </div>
                    )}
                  </div>
                  <div className="text-white text-2xl font-bold">{formatWon(result.finalPay)}</div>
                </div>
              </>
            ) : (
              <div className="card py-16 text-center">
                <div className="text-3xl mb-3">📭</div>
                <div className="text-gray-400 text-sm">급여 정보를 확인 중입니다</div>
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

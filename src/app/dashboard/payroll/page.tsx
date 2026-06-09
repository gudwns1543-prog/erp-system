'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { calcSalary, formatWon, sortByGrade, getLatestPayMonth, formatPayLabel, classifyWork, minutesToHours } from '@/lib/attendance'

// ─── 표준 급여 명세서 항목 정의 ──────
// 자동 = ERP가 근태/연봉으로 계산, 수기 = 관리자가 직접 입력
type ItemDef = { key: string; label: string; auto?: boolean; description?: string }

const PAY_ITEMS: ItemDef[] = [
  // 자동 항목 (시급 × 근무시간)
  { key: 'base',         label: '기본급',         auto: true, description: '월 계약액에서 식대/통신비/교통비 제외' },
  { key: 'reg',          label: '정규근무수당',   auto: true, description: '시급 × 정규근무 시간' },
  { key: 'overtime',     label: '평일연장수당',   auto: true, description: '시급 × 1.5 × 연장시간' },
  { key: 'night',        label: '평일야간수당',   auto: true, description: '시급 × 2.0 × 야간시간' },
  { key: 'holiday',      label: '휴일근무수당',   auto: true, description: '시급 × 1.5 × 휴일근무' },
  { key: 'holiday_ext',  label: '휴일연장수당',   auto: true, description: '시급 × 2.0 × 휴일연장' },
  { key: 'holiday_night',label: '휴일야간수당',   auto: true, description: '시급 × 2.5 × 휴일야간' },
  // 비과세 자동
  { key: 'meal',         label: '식대',           auto: true, description: '비과세 (월 계약값)' },
  { key: 'transport_fixed', label: '교통비',      auto: true, description: '비과세 (월 계약값)' },
  { key: 'comm_fixed',   label: '통신비',         auto: true, description: '비과세 (월 계약값)' },
  { key: 'trip',         label: '🚗 출장수당',    auto: true, description: '승인된 출장 합계' },
  // 수기 입력 항목
  { key: 'bonus',        label: '상여금' },
  { key: 'performance',  label: '성과급' },
  { key: 'reward',       label: '업무시상금' },
  { key: 'edu',          label: '교육비지원금' },
  { key: 'meal_extra',   label: '급량비 (추가)' },
  { key: 'duty',         label: '직책수당' },
  { key: 'family',       label: '가족수당' },
  { key: 'longevity',    label: '근속수당' },
  { key: 'celebration',  label: '경조사비' },
  { key: 'etc_pay',      label: '기타수당' },
]

const DEDUCT_ITEMS: ItemDef[] = [
  // 자동 항목 (정부 산식)
  { key: 'pension',      label: '국민연금',      auto: true, description: '4.5%' },
  { key: 'health',       label: '건강보험',      auto: true, description: '3.545%' },
  { key: 'ltc',          label: '장기요양보험',  auto: true, description: '건강보험의 12.95%' },
  { key: 'employment',   label: '고용보험',      auto: true, description: '0.9%' },
  { key: 'income_tax',   label: '소득세',        auto: true, description: '근로소득간이세액표' },
  { key: 'local_tax',    label: '지방소득세',    auto: true, description: '소득세의 10%' },
  // 수기 공제
  { key: 'year_income_tax', label: '연말정산소득세' },
  { key: 'year_local_tax',  label: '연말정산지방소득세' },
  { key: 'health_adjust',   label: '건강보험 정산' },
  { key: 'pension_adjust',  label: '국민연금 정산' },
  { key: 'union',           label: '노동조합비' },
  { key: 'etc_deduct',      label: '기타공제' },
]

export default function PayrollPage() {
  const [staffList, setStaffList] = useState<any[]>([])
  const [salaryList, setSalaryList] = useState<any[]>([])
  const [alert, setAlert] = useState('')
  const [selIdx, setSelIdx] = useState(0)
  // 기본값: 최신 지급될 명세서의 근무월
  const initPay = getLatestPayMonth()
  const [selYear, setSelYear] = useState(initPay.year)
  const [month, setMonth] = useState(initPay.month)
  const [workData, setWorkData] = useState<any>(null)
  const [autoCalc, setAutoCalc] = useState<any>(null) // calcSalary 결과
  const [editingAnnual, setEditingAnnual] = useState(false)
  const [newAnnual, setNewAnnual] = useState(0)
  const [payComp, setPayComp] = useState({ annual: 0, meal: 0, transport: 0, comm: 0 })
  // 수기 입력: 지급/공제 모두 한 객체로
  const [payOverrides, setPayOverrides] = useState<Record<string, number>>({})
  const [deductOverrides, setDeductOverrides] = useState<Record<string, number>>({})
  const [tripCount, setTripCount] = useState(0)
  const [tripTotalFromTrips, setTripTotalFromTrips] = useState(0)
  // 회사 출장 정책 (4시간 미만 / 4시간 이상)
  const [tripPolicy, setTripPolicy] = useState({ short: 15000, long: 25000 })

  const years = Array.from({length:5},(_,i)=>new Date().getFullYear()-i)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: s } = await supabase.from('profiles').select('id,name,grade,dept').eq('status','active')
    setStaffList(sortByGrade(s||[]))
    const { data: salaries } = await supabase.from('salary_info').select('*')
    setSalaryList(salaries||[])
    // 회사 출장 정책 가져오기
    const { data: cs } = await supabase.from('company_settings')
      .select('trip_short_amount, trip_long_amount').eq('id', 1).maybeSingle()
    if (cs) {
      setTripPolicy({
        short: cs.trip_short_amount ?? 15000,
        long: cs.trip_long_amount ?? 25000,
      })
    }
  }, [])

  useEffect(() => { load() }, [load])

  // 직원/월 바뀌면 근태 + 출장 + 수기 입력 다시 로딩
  useEffect(() => {
    if (!staffList[selIdx]) return
    const loadWork = async () => {
      const supabase = createClient()
      const uid = staffList[selIdx].id
      const start = `${selYear}-${String(month).padStart(2,'0')}-01`
      const end   = `${selYear}-${String(month).padStart(2,'0')}-31`
      // 근태: 근태기록 화면과 동일하게 날짜별 첫 출근~마지막 퇴근 기준으로 재계산합니다.
      // DB에 저장된 개별 세션 합산값과 화면 표시값이 달라지는 문제를 방지합니다.
      const { data: recs } = await supabase.from('attendance').select('*')
        .eq('user_id', uid).gte('work_date', start).lte('work_date', end)
      if (recs?.length) {
        const sorted = (recs || []).slice().sort((a:any,b:any) => {
          if (a.work_date !== b.work_date) return String(a.work_date).localeCompare(String(b.work_date))
          return String(a.check_in || '').localeCompare(String(b.check_in || ''))
        })
        const dateMap: Record<string, any> = {}
        for (const r of sorted) {
          const ds = r.work_date
          if (!ds || !r.check_in) continue
          if (!dateMap[ds]) {
            dateMap[ds] = {
              work_date: ds,
              _firstCheckIn: r.check_in,
              _lastCheckOut: r.check_out || null,
              _hasOpenSession: !r.check_out,
              _fallback: { ...r },
            }
          } else {
            if (r.check_in < dateMap[ds]._firstCheckIn) dateMap[ds]._firstCheckIn = r.check_in
            if (r.check_out && (!dateMap[ds]._lastCheckOut || r.check_out > dateMap[ds]._lastCheckOut)) {
              dateMap[ds]._lastCheckOut = r.check_out
            }
            if (!r.check_out) dateMap[ds]._hasOpenSession = true
          }
        }
        const merged = Object.values(dateMap).map((d:any) => {
          const ci = d._firstCheckIn
          const co = d._lastCheckOut
          if (ci && co) {
            const r = classifyWork(d.work_date, ci, co)
            return {
              reg_hours: minutesToHours(r.reg),
              ext_hours: minutesToHours(r.ext),
              night_hours: minutesToHours(r.night),
              hol_hours: minutesToHours(r.hReg),
              hol_eve_hours: minutesToHours(r.hEve),
              hol_night_hours: minutesToHours(r.hNight),
            }
          }
          // 미퇴근/휴무성 기록은 저장된 값만 보수적으로 반영합니다.
          return d._fallback || {}
        })
        setWorkData(merged.reduce((a:any,r:any)=>({
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
      // 출장 (승인된 것만)
      const { data: trips } = await supabase.from('business_trips')
        .select('id, allowance').eq('user_id', uid).eq('status', 'approved')
        .gte('trip_date', start).lte('trip_date', end)
      const tripsCount = trips?.length || 0
      const tripsTotal = (trips || []).reduce((sum: number, t: any) => sum + (t.allowance || 0), 0)
      setTripCount(tripsCount)
      setTripTotalFromTrips(tripsTotal)

      // 수기 입력 데이터
      const { data: manualRow } = await supabase.from('salary_manual_inputs')
        .select('items')
        .eq('user_id', uid).eq('work_year', selYear).eq('work_month', month)
        .maybeSingle()
      const items = (manualRow?.items as any) || {}
      // items 안에서 지급/공제 분리
      const pays: Record<string, number> = {}
      const deducts: Record<string, number> = {}
      for (const [k, v] of Object.entries(items)) {
        if (PAY_ITEMS.find(p => p.key === k)) pays[k] = v as number
        else if (DEDUCT_ITEMS.find(d => d.key === k)) deducts[k] = v as number
      }
      setPayOverrides(pays)
      setDeductOverrides(deducts)
      setEditingAnnual(false)
    }
    loadWork()
  }, [selIdx, selYear, month, staffList])

  // 자동 계산
  useEffect(() => {
    const sal = salaryList.find(s=>s.user_id===staffList[selIdx]?.id)
    if (!sal) { setAutoCalc(null); return }
    const w = workData || {regH:0,extH:0,nightH:0,holH:0,holExtH:0,holNightH:0}
    const base = calcSalary({
      annual: sal.annual, dependents: sal.dependents,
      meal: sal.meal, transport: sal.transport, comm: sal.comm, ...w
    })
    setAutoCalc({
      ...base,
      tripPay: tripTotalFromTrips, // business_trips 자동 합계
    })
    setNewAnnual(sal.annual)
    setPayComp({
      annual: sal.annual || 0,
      meal: sal.meal || 0,
      transport: sal.transport || 0,
      comm: sal.comm || 0,
    })
  }, [workData, salaryList, selIdx, staffList, tripTotalFromTrips])

  // 자동 항목의 기본값 - calcSalary 결과에서 가져옴
  function getAutoPayValue(key: string): number {
    if (!autoCalc) return 0
    const sal = salaryList.find(s=>s.user_id===staffList[selIdx]?.id)
    switch (key) {
      case 'base':            return autoCalc.base || 0
      case 'reg':             return 0 // 기본급에 포함되어 별도 표시 없음
      case 'overtime':        return autoCalc.payExt || 0
      case 'night':           return autoCalc.payNight || 0
      case 'holiday':         return autoCalc.payHol || 0
      case 'holiday_ext':     return autoCalc.payHolExt || 0
      case 'holiday_night':   return autoCalc.payHolNight || 0
      case 'meal':            return sal?.meal || 0
      case 'transport_fixed': return sal?.transport || 0
      case 'comm_fixed':      return sal?.comm || 0
      case 'trip':            return autoCalc.tripPay || 0
      default:                return 0
    }
  }
  function getAutoDeductValue(key: string): number {
    if (!autoCalc) return 0
    switch (key) {
      case 'pension':    return autoCalc.pension || 0
      case 'health':     return autoCalc.health || 0
      case 'ltc':        return autoCalc.ltc || 0
      case 'employment': return autoCalc.employ || 0
      case 'income_tax': return autoCalc.incomeTax || 0
      case 'local_tax':  return autoCalc.localTax || 0
      default:           return 0
    }
  }

  // 최종 값 = 수기 입력이 있으면 그 값, 없으면 자동값 (자동 항목만), 수기 항목은 입력값 그대로
  // 단, 근태 기반 자동 항목은 절대 override 불가 (시급×시간으로 엄격하게)
  function getPayValue(item: ItemDef): number {
    const isFromAttendance = ['base','reg','overtime','night','holiday','holiday_ext','holiday_night'].includes(item.key)
    if (isFromAttendance) return getAutoPayValue(item.key) // 강제로 자동값
    if (payOverrides[item.key] !== undefined) return payOverrides[item.key]
    if (item.auto) return getAutoPayValue(item.key)
    return 0
  }
  function getDeductValue(item: ItemDef): number {
    if (deductOverrides[item.key] !== undefined) return deductOverrides[item.key]
    if (item.auto) return getAutoDeductValue(item.key)
    return 0
  }

  // 합계
  const totalPay = PAY_ITEMS.reduce((sum, it) => sum + getPayValue(it), 0)
  const totalDeduct = DEDUCT_ITEMS.reduce((sum, it) => sum + getDeductValue(it), 0)
  const netPay = totalPay - totalDeduct

  function setPayValue(key: string, value: number | undefined) {
    setPayOverrides(prev => {
      const next = { ...prev }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })
  }
  function setDeductValue(key: string, value: number | undefined) {
    setDeductOverrides(prev => {
      const next = { ...prev }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })
  }

  async function saveOverrides() {
    if (!staffList[selIdx]) return
    const supabase = createClient()
    // 자동 항목은 입력값이 있을 때만 저장 (자동값과 다른 경우만 의미 있음)
    const items: Record<string, number> = {}
    for (const [k, v] of Object.entries(payOverrides)) items[k] = Number(v || 0)
    for (const [k, v] of Object.entries(deductOverrides)) items[k] = Number(v || 0)
    const { error } = await supabase.from('salary_manual_inputs').upsert({
      user_id: staffList[selIdx].id,
      work_year: selYear,
      work_month: month,
      items,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,work_year,work_month' })
    if (error) {
      setAlert('저장 실패: ' + error.message)
      setTimeout(()=>setAlert(''),3000)
      return
    }
    setAlert('💾 명세서가 저장되었습니다.')
    setTimeout(()=>setAlert(''),2500)
  }

  async function saveSalarySettings() {
    if (!staffList[selIdx]) return
    const supabase = createClient()
    const { error } = await supabase.from('salary_info').update({
      annual: payComp.annual,
      meal: payComp.meal,
      transport: payComp.transport,
      comm: payComp.comm,
      updated_at: new Date().toISOString(),
    }).eq('user_id', staffList[selIdx].id)
    if (error) {
      setAlert('급여 구성 저장 실패: ' + error.message)
      setTimeout(()=>setAlert(''),3000)
      return
    }
    setEditingAnnual(false)
    setAlert('급여 구성이 저장되었습니다.')
    await load(); setTimeout(()=>setAlert(''),3000)
  }

  const selStaff = staffList[selIdx]
  const selSalary = salaryList.find(s=>s.user_id===selStaff?.id)
  const rate = selSalary ? Math.round(selSalary.annual/12/209) : 0

  // 입력값 표시용 (DB 저장값과 자동값 둘 다 고려)
  function getInputDisplayValue(item: ItemDef, type: 'pay' | 'deduct'): string {
    const override = type === 'pay' ? payOverrides[item.key] : deductOverrides[item.key]
    if (override !== undefined) return String(override)
    if (item.auto) {
      const autoVal = type === 'pay' ? getAutoPayValue(item.key) : getAutoDeductValue(item.key)
      return autoVal > 0 ? String(autoVal) : ''
    }
    return ''
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-5 flex justify-between items-end gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">급여 일괄계산</h1>
          <div className="text-xs text-gray-500 mt-0.5">
            📅 <strong>{formatPayLabel(selYear, month)}</strong>
          </div>
        </div>
        <button onClick={saveOverrides}
          className="btn-primary text-sm px-4 py-2 bg-amber-600 hover:bg-amber-700">
          💾 명세서 저장
        </button>
      </div>

      {/* 사용 안내 */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-1">
        <div className="font-semibold">💡 명세서 작성 흐름</div>
        <div>1. <strong>회색 자동 항목</strong>: 기본급/근태수당/출장수당은 자동 계산, 공제 자동항목은 필요 시 0원 포함 수기 조정 가능</div>
        <div>2. <strong>흰색 수기 항목</strong>: 빈칸은 0원, 세무사 명세서 보고 직접 입력</div>
        <div>3. 모두 입력 후 우측 상단 <strong>💾 명세서 저장</strong> 클릭 → 직원의 급여명세 조회에 반영</div>
      </div>

      {alert && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{alert}</div>}

      {/* 직원 + 년/월 선택 */}
      <div className="card mb-4">
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">대상 직원</label>
            <select className="input min-w-[180px]" value={selIdx}
              onChange={e=>setSelIdx(+e.target.value)}>
              {staffList.map((s,i)=>(
                <option key={s.id} value={i}>{s.name} {s.grade} · {s.dept}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">근무 년도</label>
            <select className="input" value={selYear} onChange={e=>setSelYear(+e.target.value)}>
              {years.map(y=>(<option key={y} value={y}>{y}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">근무 월</label>
            <select className="input" value={month} onChange={e=>setMonth(+e.target.value)}>
              {Array.from({length:12},(_,i)=>i+1).map(m=>(<option key={m} value={m}>{m}월</option>))}
            </select>
          </div>
          {selSalary && (
            <div className="ml-auto flex items-center gap-3 text-xs text-gray-500 flex-wrap justify-end">
              <span>계약연봉:
                <span className="ml-1 font-semibold text-gray-800">{formatWon(selSalary.annual)}</span>
              </span>
              <span>월 계약액: <strong className="text-gray-800">{formatWon((selSalary.annual || 0) / 12)}</strong></span>
              <span>기본급: <strong className="text-gray-800">{formatWon(Math.max(0, (selSalary.annual || 0) / 12 - ((selSalary.meal||0)+(selSalary.transport||0)+(selSalary.comm||0))))}</strong></span>
              <span>시급(기준): <strong className="text-gray-800">{formatWon(rate)}/h</strong></span>
              <button onClick={()=>setEditingAnnual(!editingAnnual)} className="text-[10px] text-purple-500 hover:text-purple-700">
                {editingAnnual ? '닫기' : '급여구성 수정'}
              </button>
            </div>
          )}
        </div>
        {selSalary && editingAnnual && (
          <div className="mt-3 p-3 bg-purple-50/60 border border-purple-100 rounded-xl grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            {[
              ['annual','계약연봉'], ['meal','식대'], ['comm','통신비'], ['transport','교통비']
            ].map(([key,label]) => (
              <label key={key} className="block">
                <span className="text-gray-500 mb-1 block">{label}</span>
                <input className="input text-xs py-1 text-right" inputMode="numeric"
                  value={formatInputAmount((payComp as any)[key])}
                  onChange={e=>setPayComp(prev=>({...prev, [key]: parseAmountInput(e.target.value) || 0}))} />
              </label>
            ))}
            <div className="flex items-end gap-2">
              <button onClick={saveSalarySettings} className="btn-primary text-xs px-3 py-2">저장</button>
              <button onClick={()=>setEditingAnnual(false)} className="btn-secondary text-xs px-3 py-2">취소</button>
            </div>
            <div className="col-span-2 md:col-span-5 text-[11px] text-purple-700">
              월 계약액은 연봉÷12이며, 기본급은 월 계약액에서 식대·통신비·교통비를 제외한 금액으로 자동 산정됩니다.
            </div>
          </div>
        )}
        {workData ? (
          <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 grid grid-cols-3 md:grid-cols-6 gap-2">
            <div>정규 <strong className="text-gray-800">{workData.regH.toFixed(1)}h</strong></div>
            <div>연장 <strong className="text-gray-800">{workData.extH.toFixed(1)}h</strong></div>
            <div>야간 <strong className="text-gray-800">{workData.nightH.toFixed(1)}h</strong></div>
            <div>휴일 <strong className="text-gray-800">{workData.holH.toFixed(1)}h</strong></div>
            <div>휴일연장 <strong className="text-gray-800">{workData.holExtH.toFixed(1)}h</strong></div>
            <div>휴일야간 <strong className="text-gray-800">{workData.holNightH.toFixed(1)}h</strong></div>
          </div>
        ) : (
          <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">⚠ 해당 월 근태 기록 없음 · 수기 입력으로만 계산</div>
        )}
      </div>

      {/* 근무시간 × 시급 = 금액 명확 표시 (N × M = L 양식) */}
      {workData && selSalary && autoCalc && (
        <div className="card mb-4 bg-gradient-to-r from-blue-50/30 to-white border-blue-100">
          <div className="text-sm font-semibold text-blue-800 mb-3">⏱ 근무시간 × 시급 계산표</div>
          <div className="text-[10px] text-gray-500 mb-2">
            시급 기준: 계약연봉 {formatWon(selSalary.annual)} ÷ 12개월 ÷ 209시간 = <strong className="text-gray-800">{formatWon(rate)}/h</strong>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-2 py-1.5">구분</th>
                  <th className="text-right px-2 py-1.5">시간 (M)</th>
                  <th className="text-center px-2 py-1.5">×</th>
                  <th className="text-right px-2 py-1.5">시급 (N)</th>
                  <th className="text-center px-2 py-1.5">=</th>
                  <th className="text-right px-2 py-1.5">금액 (L)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: '평일 정규근무', hours: workData.regH, rate: rate, pay: autoCalc.base || 0,
                    note: '기본급에 포함 (월 209h 기준)' },
                  { label: '평일 연장수당', hours: workData.extH, rate: Math.round(rate * 1.5), pay: autoCalc.payExt || 0,
                    note: '시급 × 1.5' },
                  { label: '평일 야간수당', hours: workData.nightH, rate: Math.round(rate * 2.0), pay: autoCalc.payNight || 0,
                    note: '시급 × 2.0 (22~06시)' },
                  { label: '휴일 근무수당', hours: workData.holH, rate: Math.round(rate * 1.5), pay: autoCalc.payHol || 0,
                    note: '시급 × 1.5' },
                  { label: '휴일 연장수당', hours: workData.holExtH, rate: Math.round(rate * 2.0), pay: autoCalc.payHolExt || 0,
                    note: '시급 × 2.0' },
                  { label: '휴일 야간수당', hours: workData.holNightH, rate: Math.round(rate * 2.5), pay: autoCalc.payHolNight || 0,
                    note: '시급 × 2.5' },
                ].map((row, i) => (
                  <tr key={i} className={`border-b border-gray-50 ${row.hours > 0 ? '' : 'opacity-40'}`}>
                    <td className="px-2 py-1.5">
                      <div className="text-gray-700 font-medium">{row.label}</div>
                      <div className="text-[9px] text-gray-400">{row.note}</div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-gray-700">{row.hours.toFixed(1)}h</td>
                    <td className="px-2 py-1.5 text-center text-gray-300">×</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{formatWon(row.rate)}</td>
                    <td className="px-2 py-1.5 text-center text-gray-300">=</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-blue-700">
                      {row.pay > 0 ? formatWon(row.pay) : '-'}
                    </td>
                  </tr>
                ))}
                <tr className="bg-blue-50 font-semibold">
                  <td colSpan={5} className="px-2 py-2 text-right text-blue-800">근로 지급 소계</td>
                  <td className="px-2 py-2 text-right tabular-nums text-blue-700">
                    {formatWon((autoCalc.base||0) + (autoCalc.payExt||0) + (autoCalc.payNight||0) +
                      (autoCalc.payHol||0) + (autoCalc.payHolExt||0) + (autoCalc.payHolNight||0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="text-[10px] text-gray-400 mt-2">
            ⚠️ 근무시간(M)과 시급(N)은 근태기록 및 계약연봉 기반으로 자동 산정되며 수정할 수 없습니다.
          </div>
        </div>
      )}

      {/* 명세서 양식 */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* 지급 항목 */}
        <div className="card p-0 overflow-hidden">
          <div className="bg-green-50 px-4 py-2.5 border-b border-green-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-green-800">+ 지급 항목</div>
            <div className="text-xs text-green-700 font-bold tabular-nums">
              {totalPay > 0 ? formatWon(totalPay) : '0원'}
            </div>
          </div>
          <div>
            {PAY_ITEMS.map((item, idx) => {
              const value = getPayValue(item)
              const display = getInputDisplayValue(item, 'pay')
              const isOverridden = payOverrides[item.key] !== undefined
              // 근태 기반 자동 항목은 수정 불가 (시급 × 시간으로 정확히 산정)
              const isFromAttendance = ['base','reg','overtime','night','holiday','holiday_ext','holiday_night'].includes(item.key)
              return (
                <div key={item.key}
                  className={`px-3 py-2 border-b border-gray-50 last:border-0 flex items-center gap-2
                    ${item.auto ? 'bg-gray-50/50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                      {item.label}
                      {isFromAttendance && <span className="text-[9px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded">근태 자동</span>}
                      {item.auto && !isFromAttendance && <span className="text-[9px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded">자동</span>}
                      {item.auto && !isFromAttendance && isOverridden && <span className="text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded">수정됨</span>}
                    </div>
                    {item.description && (
                      <div className="text-[9px] text-gray-400 mt-0.5">{item.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {isFromAttendance ? (
                      // 근태 자동 항목 - 읽기 전용
                      <div className="text-xs py-1 w-28 text-right tabular-nums font-semibold text-blue-700 bg-blue-50 rounded px-2">
                        {getAutoPayValue(item.key) > 0 ? formatWon(getAutoPayValue(item.key)) : '-'}
                      </div>
                    ) : (
                      // 수정 가능
                      <>
                        <input type="number"
                          className={`input text-xs py-1 w-28 text-right tabular-nums
                            ${item.auto ? (isOverridden ? 'bg-amber-50' : 'bg-white') : ''}`}
                          placeholder={item.auto ? String(getAutoPayValue(item.key)) : '0'}
                          value={display}
                          onChange={e => setPayValue(item.key, e.target.value === '' ? undefined : +e.target.value)} />
                        {item.auto && isOverridden && (
                          <button onClick={() => setPayValue(item.key, undefined)}
                            title="자동값으로 복원"
                            className="text-[10px] text-gray-400 hover:text-purple-600 px-1">↺</button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
            <div className="bg-green-50 px-4 py-2.5 border-t-2 border-green-200 flex items-center justify-between">
              <div className="text-xs font-semibold text-green-800">지급 합계</div>
              <div className="text-sm font-bold text-green-700 tabular-nums">{formatWon(totalPay)}</div>
            </div>
          </div>
        </div>

        {/* 공제 항목 */}
        <div className="card p-0 overflow-hidden">
          <div className="bg-red-50 px-4 py-2.5 border-b border-red-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-red-800">− 공제 항목</div>
            <div className="text-xs text-red-700 font-bold tabular-nums">
              {totalDeduct > 0 ? '-' + formatWon(totalDeduct) : '0원'}
            </div>
          </div>
          <div>
            {DEDUCT_ITEMS.map((item, idx) => {
              const value = getDeductValue(item)
              const display = getInputDisplayValue(item, 'deduct')
              const isOverridden = deductOverrides[item.key] !== undefined
              return (
                <div key={item.key}
                  className={`px-3 py-2 border-b border-gray-50 last:border-0 flex items-center gap-2
                    ${item.auto ? 'bg-gray-50/50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                      {item.label}
                      {item.auto && <span className="text-[9px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded">자동</span>}
                      {item.auto && isOverridden && <span className="text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded">수정됨</span>}
                    </div>
                    {item.description && (
                      <div className="text-[9px] text-gray-400 mt-0.5">{item.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <input type="number"
                      className={`input text-xs py-1 w-28 text-right tabular-nums
                        ${item.auto ? (isOverridden ? 'bg-amber-50' : 'bg-white') : ''}`}
                      placeholder={item.auto ? String(getAutoDeductValue(item.key)) : '0'}
                      value={display}
                      onChange={e => setDeductValue(item.key, e.target.value === '' ? undefined : +e.target.value)} />
                    {item.auto && isOverridden && (
                      <button onClick={() => setDeductValue(item.key, undefined)}
                        title="자동값으로 복원"
                        className="text-[10px] text-gray-400 hover:text-purple-600 px-1">↺</button>
                    )}
                  </div>
                </div>
              )
            })}
            <div className="bg-red-50 px-4 py-2.5 border-t-2 border-red-200 flex items-center justify-between">
              <div className="text-xs font-semibold text-red-800">공제 합계</div>
              <div className="text-sm font-bold text-red-700 tabular-nums">-{formatWon(totalDeduct)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 출장 수당 + 실수령액 */}
      <div className="mt-4 grid md:grid-cols-2 gap-4">
        <div className="card bg-amber-50/40 border-amber-200">
          <div className="text-xs font-semibold text-amber-800 mb-2">🚗 출장수당 (자동)</div>
          {tripCount > 0 ? (
            <>
              <div className="text-xs text-amber-700">승인된 출장 <strong>{tripCount}건</strong></div>
              <div className="text-base font-bold text-amber-700 mt-1 tabular-nums">{formatWon(tripTotalFromTrips)}</div>
              <div className="text-[10px] text-amber-600 mt-1">
                정책: 4시간 이상 {tripPolicy.long.toLocaleString()}원 / 4시간 미만 {tripPolicy.short.toLocaleString()}원
              </div>
            </>
          ) : (
            <div className="text-xs text-amber-500">해당 월 승인된 출장 보고서 없음</div>
          )}
        </div>

        <div className="card bg-gradient-to-r from-purple-600 to-purple-700 border-0">
          <div className="text-xs font-semibold text-purple-100 mb-1">실수령액</div>
          <div className="text-2xl font-bold text-white tabular-nums">{formatWon(netPay)}</div>
          <div className="text-[10px] text-purple-100 mt-1">
            지급 {formatWon(totalPay)} − 공제 {formatWon(totalDeduct)}
          </div>
        </div>
      </div>
    </div>
  )
}

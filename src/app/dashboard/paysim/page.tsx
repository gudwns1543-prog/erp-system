'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { calcSalary, formatWon } from '@/lib/attendance'

// 색상 통일: 배수별로 같은 색
const RATE_COLOR: Record<string, string> = {
  '×1.0': 'text-gray-600',
  '×1.5': 'text-blue-600',
  '×2.0': 'text-amber-600',
  '×2.5': 'text-rose-600',
}
const RATE_BG: Record<string, string> = {
  '×1.0': 'bg-gray-50',
  '×1.5': 'bg-blue-50',
  '×2.0': 'bg-amber-50',
  '×2.5': 'bg-rose-50',
}

export default function PaySimPage() {
  const [profile, setProfile] = useState<any>(null)
  const [salary, setSalary] = useState<any>(null)
  const [actualWork, setActualWork] = useState<any>(null)
  const [addWork, setAddWork] = useState({regH:0,extH:0,nightH:0,holH:0,holExtH:0,holNightH:0})
  const [actualResult, setActualResult] = useState<any>(null)
  const [simResult, setSimResult] = useState<any>(null)

  const now = new Date()
  const thisYear = now.getFullYear()
  const thisMonth = now.getMonth()+1

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const { data: sal } = await supabase.from('salary_info').select('*').eq('user_id', session.user.id).maybeSingle()
    setSalary(sal)
    const start = `${thisYear}-${String(thisMonth).padStart(2,'0')}-01`
    const end   = `${thisYear}-${String(thisMonth).padStart(2,'0')}-31`
    const { data: recs } = await supabase.from('attendance').select('*')
      .eq('user_id', session.user.id).gte('work_date', start).lte('work_date', end)
    const w = (recs||[]).reduce((a:any,r:any)=>({
      regH:      a.regH      + (r.reg_hours||0),
      extH:      a.extH      + (r.ext_hours||0),
      nightH:    a.nightH    + (r.night_hours||0),
      holH:      a.holH      + (r.hol_hours||0),
      holExtH:   a.holExtH   + (r.hol_eve_hours||0),
      holNightH: a.holNightH + (r.hol_night_hours||0),
    }),{regH:0,extH:0,nightH:0,holH:0,holExtH:0,holNightH:0})
    setActualWork(w)
  }, [thisYear, thisMonth])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!salary || !actualWork) { setActualResult(null); return }
    setActualResult(calcSalary({
      annual:salary.annual, dependents:salary.dependents,
      meal:salary.meal, transport:salary.transport, comm:salary.comm,
      ...actualWork
    }))
  }, [salary, actualWork])

  useEffect(() => {
    if (!salary || !actualWork) { setSimResult(null); return }
    setSimResult(calcSalary({
      annual:salary.annual, dependents:salary.dependents,
      meal:salary.meal, transport:salary.transport, comm:salary.comm,
      regH:      (actualWork.regH||0)      + (addWork.regH||0),
      extH:      (actualWork.extH||0)      + (addWork.extH||0),
      nightH:    (actualWork.nightH||0)    + (addWork.nightH||0),
      holH:      (actualWork.holH||0)      + (addWork.holH||0),
      holExtH:   (actualWork.holExtH||0)   + (addWork.holExtH||0),
      holNightH: (actualWork.holNightH||0) + (addWork.holNightH||0),
    }))
  }, [salary, actualWork, addWork])

  const hasExtra = Object.values(addWork).some(v => (v as number) > 0)
  const rate = salary ? Math.round(salary.annual/12/209) : 0

  // 계산식 행 컴포넌트
  const CalcRow = ({label, hours, rateStr, amount, readOnly=true}:{label:string,hours:number,rateStr:string,amount:number,readOnly?:boolean}) => (
    hours > 0 ? (
      <div className={`flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 ${readOnly?'':'bg-amber-50/30'}`}>
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs text-gray-500 w-20">{label}</span>
          <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${RATE_BG[rateStr]} ${RATE_COLOR[rateStr]} font-semibold`}>
            {hours}h × {rateStr.replace('×','')} = {formatWon(Math.round(rate * hours * parseFloat(rateStr.replace('×',''))))}
          </span>
        </div>
        <span className="text-xs font-semibold text-purple-600">{formatWon(amount)}</span>
      </div>
    ) : null
  )

  if (!salary) return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">예상 급여 조회</h1>
      <div className="card py-16 text-center">
        <div className="text-3xl mb-3">💼</div>
        <div className="text-gray-400 text-sm">급여 정보가 등록되지 않았습니다.</div>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-1">
        <h1 className="text-lg font-semibold text-gray-800">예상 급여 조회</h1>
        <span className="text-xs bg-purple-50 text-purple-600 px-2.5 py-1 rounded-full font-medium">
          {thisYear}년 {thisMonth}월
        </span>
      </div>
      <p className="text-xs text-gray-400 mb-5">이번 달 현재까지 근무 기록 기반으로 계산합니다</p>

      {/* ① 이번달 근태 현황 */}
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">1</div>
          <span className="text-sm font-semibold text-gray-700">이번달 근태 현황</span>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">읽기 전용</span>
        </div>
        <div className="card">
          <div className="grid grid-cols-3 gap-2">
            {[
              {label:'평일 정규', val:actualWork?.regH||0, rate:'×1.0', c:'text-gray-600', bg:'bg-gray-50'},
              {label:'평일 시간외', val:actualWork?.extH||0, rate:'×1.5', c:'text-blue-600', bg:'bg-blue-50'},
              {label:'평일 야간', val:actualWork?.nightH||0, rate:'×2.0', c:'text-amber-600', bg:'bg-amber-50'},
              {label:'휴일 정규', val:actualWork?.holH||0, rate:'×1.5', c:'text-blue-600', bg:'bg-blue-50'},
              {label:'휴일 시간외', val:actualWork?.holExtH||0, rate:'×2.0', c:'text-amber-600', bg:'bg-amber-50'},
              {label:'휴일 야간', val:actualWork?.holNightH||0, rate:'×2.5', c:'text-rose-600', bg:'bg-rose-50'},
            ].map(f=>(
              <div key={f.label} className={`${f.bg} rounded-lg p-2.5 text-center`}>
                <div className="text-xs text-gray-500 mb-1">{f.label}</div>
                <div className={`text-lg font-bold ${f.c}`}>{f.val}<span className="text-xs font-normal text-gray-400 ml-0.5">h</span></div>
                <div className={`text-xs font-semibold ${f.c} mt-0.5`}>{f.rate}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-center my-1 text-gray-300 text-lg">↓</div>

      {/* ② 현재 기준 예상 수령액 */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">2</div>
          <span className="text-sm font-semibold text-gray-700">현재 근무 기준 예상 수령액</span>
        </div>
        {actualResult && (
          <>
            <div className="card mb-3">
              {/* 계산 기준 범례 */}
              <div className="flex flex-wrap gap-2 mb-3 pb-2 border-b border-gray-100">
                <span className="text-xs text-gray-400">배수 기준:</span>
                {[
                  {rate:'×1.0', label:'통상임금', c:'text-gray-600', bg:'bg-gray-100'},
                  {rate:'×1.5', label:'가산 50%', c:'text-blue-600', bg:'bg-blue-100'},
                  {rate:'×2.0', label:'가산 100%', c:'text-amber-600', bg:'bg-amber-100'},
                  {rate:'×2.5', label:'가산 150%', c:'text-rose-600', bg:'bg-rose-100'},
                ].map(x=>(
                  <span key={x.rate} className={`text-xs px-2 py-0.5 rounded-full font-semibold ${x.c} ${x.bg}`}>
                    {x.rate} {x.label}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-0 divide-x divide-gray-100">
                <div className="pr-4">
                  <div className="text-xs font-semibold text-gray-400 mb-2">지급 항목 (계산식)</div>
                  {/* 기본급 */}
                  <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                    <span className="text-xs text-gray-500">기본급 (정규 통상임금)</span>
                    <span className="text-xs font-semibold text-purple-600">{formatWon(actualResult.base)}</span>
                  </div>
                  {/* 시간외 계산식 */}
                  {actualWork?.extH>0 && (
                    <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
                      <div>
                        <div className="text-xs text-gray-500">평일 시간외</div>
                        <div className="text-xs font-mono text-blue-600">{actualWork.extH}h × 1.5 = {formatWon(Math.round(rate*actualWork.extH*1.5))}</div>
                      </div>
                      <span className="text-xs font-semibold text-purple-600">{formatWon(actualResult.payExt)}</span>
                    </div>
                  )}
                  {actualWork?.nightH>0 && (
                    <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
                      <div>
                        <div className="text-xs text-gray-500">평일 야간</div>
                        <div className="text-xs font-mono text-amber-600">{actualWork.nightH}h × 2.0 = {formatWon(Math.round(rate*actualWork.nightH*2.0))}</div>
                      </div>
                      <span className="text-xs font-semibold text-purple-600">{formatWon(actualResult.payNight)}</span>
                    </div>
                  )}
                  {actualWork?.holH>0 && (
                    <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
                      <div>
                        <div className="text-xs text-gray-500">휴일 정규</div>
                        <div className="text-xs font-mono text-blue-600">{actualWork.holH}h × 1.5 = {formatWon(Math.round(rate*actualWork.holH*1.5))}</div>
                      </div>
                      <span className="text-xs font-semibold text-purple-600">{formatWon(actualResult.payHol)}</span>
                    </div>
                  )}
                  {actualWork?.holExtH>0 && (
                    <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
                      <div>
                        <div className="text-xs text-gray-500">휴일 시간외</div>
                        <div className="text-xs font-mono text-amber-600">{actualWork.holExtH}h × 2.0 = {formatWon(Math.round(rate*actualWork.holExtH*2.0))}</div>
                      </div>
                      <span className="text-xs font-semibold text-purple-600">{formatWon(actualResult.payHolExt)}</span>
                    </div>
                  )}
                  {actualWork?.holNightH>0 && (
                    <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
                      <div>
                        <div className="text-xs text-gray-500">휴일 야간</div>
                        <div className="text-xs font-mono text-rose-600">{actualWork.holNightH}h × 2.5 = {formatWon(Math.round(rate*actualWork.holNightH*2.5))}</div>
                      </div>
                      <span className="text-xs font-semibold text-purple-600">{formatWon(actualResult.payHolNight)}</span>
                    </div>
                  )}
                  {salary?.meal>0 && <div className="flex justify-between py-1.5 border-b border-gray-50 text-xs"><span className="text-gray-500">식대 (비과세)</span><span className="text-purple-600 font-semibold">{formatWon(salary.meal)}</span></div>}
                  {salary?.transport>0 && <div className="flex justify-between py-1.5 border-b border-gray-50 text-xs"><span className="text-gray-500">교통비 (비과세)</span><span className="text-purple-600 font-semibold">{formatWon(salary.transport)}</span></div>}
                  {salary?.comm>0 && <div className="flex justify-between py-1.5 border-b border-gray-50 text-xs"><span className="text-gray-500">통신비 (비과세)</span><span className="text-purple-600 font-semibold">{formatWon(salary.comm)}</span></div>}
                  <div className="flex justify-between pt-2 text-xs font-bold"><span>지급 합계</span><span className="text-purple-600">{formatWon(actualResult.grossTotal)}</span></div>
                </div>
                <div className="pl-4">
                  <div className="text-xs font-semibold text-gray-400 mb-2">공제 항목</div>
                  {[
                    ['국민연금 (4.5%)', actualResult.pension],
                    ['건강보험 (3.545%)', actualResult.health],
                    ['장기요양보험', actualResult.ltc],
                    ['고용보험 (0.9%)', actualResult.employ],
                    [`소득세 (${salary?.dependents}인)`, actualResult.incomeTax],
                    ['지방소득세', actualResult.localTax],
                  ].map(([l,v],i)=>(
                    <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 text-xs">
                      <span className="text-gray-500">{l}</span>
                      <span className="text-red-500 font-semibold">-{formatWon(v as number)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 text-xs font-bold"><span>공제 합계</span><span className="text-red-500">-{formatWon(actualResult.totalDeduct)}</span></div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-400">
                기본 시간단가: {formatWon(salary?.annual)} ÷ 12 ÷ 209h = <span className="text-purple-600 font-semibold">{rate.toLocaleString()}원/h</span>
              </div>
            </div>
            <div className="rounded-xl p-4 flex justify-between items-center bg-purple-600">
              <div>
                <div className="text-white/80 text-sm font-medium">예상 수령액 ①</div>
                <div className="text-white/60 text-xs mt-0.5">지급 {formatWon(actualResult.grossTotal)} - 공제 {formatWon(actualResult.totalDeduct)}</div>
              </div>
              <div className="text-white text-2xl font-bold">{formatWon(actualResult.netPay)}</div>
            </div>
          </>
        )}
      </div>

      {/* 구분선 */}
      <div className="relative my-5">
        <div className="border-t border-dashed border-gray-200"></div>
        <div className="absolute left-1/2 -translate-x-1/2 -top-3 bg-white px-3 text-xs text-gray-400">추가 근무 시뮬레이션</div>
      </div>

      {/* ③ 추가 근무시간 입력 */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">3</div>
            <span className="text-sm font-semibold text-gray-700">추가 근무시간 입력</span>
            <span className="text-xs text-gray-400">이만큼 더 근무한다면?</span>
          </div>
          {hasExtra && (
            <button onClick={()=>setAddWork({regH:0,extH:0,nightH:0,holH:0,holExtH:0,holNightH:0})}
              className="text-xs text-gray-400 hover:text-red-400">초기화</button>
          )}
        </div>
        <div className="card">
          <div className="grid grid-cols-3 gap-3">
            {[
              {label:'평일 정규(h)', key:'regH', rate:'×1.0', c:'text-gray-600'},
              {label:'평일 시간외(h)', key:'extH', rate:'×1.5', c:'text-blue-600'},
              {label:'평일 야간(h)', key:'nightH', rate:'×2.0', c:'text-amber-600'},
              {label:'휴일 정규(h)', key:'holH', rate:'×1.5', c:'text-blue-600'},
              {label:'휴일 시간외(h)', key:'holExtH', rate:'×2.0', c:'text-amber-600'},
              {label:'휴일 야간(h)', key:'holNightH', rate:'×2.5', c:'text-rose-600'},
            ].map(f=>(
              <div key={f.key}>
                <label className={`block text-xs font-medium mb-1 ${f.c}`}>+ {f.label} <span className="font-bold">{f.rate}</span></label>
                <input type="number" step="0.5" min="0" className="input text-sm text-center"
                  value={(addWork as any)[f.key]||0}
                  onChange={e=>setAddWork(p=>({...p,[f.key]:+e.target.value}))} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-center my-1 text-gray-300 text-lg">↓</div>

      {/* ④ 추가 포함 급여 상세 */}
      {simResult && hasExtra && (
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">4</div>
            <span className="text-sm font-semibold text-gray-700">추가 근무 포함 급여 상세</span>
            <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">계산 결과 (수정 불가)</span>
          </div>
          <div className="card mb-2">
            {/* 합산 근태 */}
            <div className="mb-3 pb-2 border-b border-gray-100">
              <div className="text-xs font-semibold text-gray-400 mb-2">합산 근무시간 (현재 + 추가)</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {l:'평일 정규', cur:actualWork?.regH||0, add:addWork.regH, rate:'×1.0', c:'text-gray-600', bg:'bg-gray-50'},
                  {l:'평일 시간외', cur:actualWork?.extH||0, add:addWork.extH, rate:'×1.5', c:'text-blue-600', bg:'bg-blue-50'},
                  {l:'평일 야간', cur:actualWork?.nightH||0, add:addWork.nightH, rate:'×2.0', c:'text-amber-600', bg:'bg-amber-50'},
                  {l:'휴일 정규', cur:actualWork?.holH||0, add:addWork.holH, rate:'×1.5', c:'text-blue-600', bg:'bg-blue-50'},
                  {l:'휴일 시간외', cur:actualWork?.holExtH||0, add:addWork.holExtH, rate:'×2.0', c:'text-amber-600', bg:'bg-amber-50'},
                  {l:'휴일 야간', cur:actualWork?.holNightH||0, add:addWork.holNightH, rate:'×2.5', c:'text-rose-600', bg:'bg-rose-50'},
                ].filter(x=>x.cur+x.add>0).map(x=>(
                  <div key={x.l} className={`${x.bg} rounded-lg p-2 text-center`}>
                    <div className="text-xs text-gray-500 mb-0.5">{x.l} <span className={`font-bold ${x.c}`}>{x.rate}</span></div>
                    <div className={`text-sm font-bold ${x.c}`}>
                      {x.cur}{x.add>0&&<span className="text-xs">+{x.add}</span>} = {x.cur+x.add}h
                    </div>
                    <div className="text-xs text-gray-400 font-mono">{x.cur+x.add}h × {x.rate.replace('×','')} = {formatWon(Math.round(rate*(x.cur+x.add)*parseFloat(x.rate.replace('×',''))))}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-0 divide-x divide-gray-100">
              <div className="pr-4">
                <div className="text-xs font-semibold text-gray-400 mb-2">지급</div>
                {[
                  ['기본급', simResult.base],
                  simResult.payExt>0      && ['평일 시간외', simResult.payExt],
                  simResult.payNight>0    && ['평일 야간', simResult.payNight],
                  simResult.payHol>0      && ['휴일 정규', simResult.payHol],
                  simResult.payHolExt>0   && ['휴일 시간외', simResult.payHolExt],
                  simResult.payHolNight>0 && ['휴일 야간', simResult.payHolNight],
                  salary?.meal>0      && ['식대', salary.meal],
                  salary?.transport>0 && ['교통비', salary.transport],
                  salary?.comm>0      && ['통신비', salary.comm],
                ].filter(Boolean).map((item:any,i)=>(
                  <div key={i} className="flex justify-between py-1 border-b border-gray-50 text-xs">
                    <span className="text-gray-500">{item[0]}</span>
                    <span className="text-purple-600 font-semibold">{formatWon(item[1])}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-1.5 text-xs font-bold"><span>합계</span><span className="text-purple-600">{formatWon(simResult.grossTotal)}</span></div>
              </div>
              <div className="pl-4">
                <div className="text-xs font-semibold text-gray-400 mb-2">공제</div>
                {[
                  ['국민연금', simResult.pension],
                  ['건강보험', simResult.health],
                  ['장기요양', simResult.ltc],
                  ['고용보험', simResult.employ],
                  ['소득세', simResult.incomeTax],
                  ['지방세', simResult.localTax],
                ].map(([l,v],i)=>(
                  <div key={i} className="flex justify-between py-1 border-b border-gray-50 text-xs">
                    <span className="text-gray-500">{l}</span>
                    <span className="text-red-500 font-semibold">-{formatWon(v as number)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-1.5 text-xs font-bold"><span>합계</span><span className="text-red-500">-{formatWon(simResult.totalDeduct)}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {simResult && hasExtra && <div className="flex justify-center my-1 text-gray-300 text-lg">↓</div>}

      {/* ⑤ 예상 수령액 2 */}
      {simResult && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">5</div>
            <span className="text-sm font-semibold text-gray-700">추가 근무 시 예상 수령액</span>
          </div>
          <div className="rounded-xl p-4 flex justify-between items-center"
            style={{background:'linear-gradient(135deg,#854F0B,#BA7517)'}}>
            <div>
              <div className="text-white/80 text-sm font-medium">예상 수령액 ②</div>
              <div className="text-white/60 text-xs mt-0.5">
                {hasExtra && actualResult ? `수령액 ① 대비 +${formatWon(simResult.netPay - actualResult.netPay)}` : '추가 근무 없을 시'}
              </div>
            </div>
            <div className="text-white text-2xl font-bold">{formatWon(simResult.netPay)}</div>
          </div>
          <div className="mt-2 p-2.5 bg-gray-50 rounded-lg text-xs text-gray-400">
            ⚠️ 시뮬레이션 결과로 실제 지급액과 다를 수 있습니다 · 기본 시간단가 {rate.toLocaleString()}원/h
          </div>
        </div>
      )}
    </div>
  )
}

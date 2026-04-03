'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { calcSalary, formatWon } from '@/lib/attendance'

export default function PaySimPage() {
  const [profile, setProfile] = useState<any>(null)
  const [salary, setSalary] = useState<any>(null)
  const [thisMonthWork, setThisMonthWork] = useState<any>(null)
  const [simWork, setSimWork] = useState({regH:0,extH:0,nightH:0,holH:0,holExtH:0,holNightH:0})
  const [result, setResult] = useState<any>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const { data: sal } = await supabase.from('salary_info').select('*').eq('user_id', session.user.id).maybeSingle()
    setSalary(sal)
    // 이번달 근태 자동 로드
    const now = new Date()
    const start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
    const end   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-31`
    const { data: recs } = await supabase.from('attendance').select('*')
      .eq('user_id', session.user.id).gte('work_date', start).lte('work_date', end)
    if (recs?.length) {
      const w = recs.reduce((a:any,r:any)=>({
        regH: a.regH+(r.reg_hours||0), extH: a.extH+(r.ext_hours||0),
        nightH: a.nightH+(r.night_hours||0), holH: a.holH+(r.hol_hours||0),
        holExtH: a.holExtH+(r.hol_eve_hours||0), holNightH: a.holNightH+(r.hol_night_hours||0),
      }),{regH:0,extH:0,nightH:0,holH:0,holExtH:0,holNightH:0})
      setThisMonthWork(w)
      setSimWork(w) // 이번달 근태로 초기값 설정
    }
    setLoaded(true)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!salary) { setResult(null); return }
    setResult(calcSalary({
      annual:salary.annual, dependents:salary.dependents,
      meal:salary.meal, transport:salary.transport, comm:salary.comm,
      ...simWork
    }))
  }, [salary, simWork])

  const now = new Date()

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-lg font-semibold text-gray-800">예상 급여 조회</h1>
        <div className="text-xs text-gray-400">{now.getFullYear()}년 {now.getMonth()+1}월 기준</div>
      </div>
      <div className="text-xs text-gray-400 mb-5">
        이번 달 근태 기록이 자동으로 반영됩니다. 근무시간을 수정하면 예상 급여가 실시간으로 계산됩니다.
      </div>

      {!salary ? (
        <div className="card py-16 text-center">
          <div className="text-3xl mb-3">💼</div>
          <div className="text-gray-400 text-sm">급여 정보가 등록되지 않았습니다.</div>
          <div className="text-gray-300 text-xs mt-1">관리자에게 급여 정보 등록을 요청하세요</div>
        </div>
      ) : (
        <div>
          {/* 이번달 실제 근태 현황 */}
          {thisMonthWork && (
            <div className="card mb-4 p-3 bg-blue-50 border-blue-100">
              <div className="text-xs font-semibold text-blue-700 mb-2">📋 이번 달 현재 근태 기록</div>
              <div className="flex gap-4 flex-wrap text-xs">
                <span><span className="text-gray-500">정규 </span><strong className="text-purple-600">{thisMonthWork.regH}h</strong></span>
                {thisMonthWork.extH>0&&<span><span className="text-gray-500">시간외 </span><strong className="text-blue-600">{thisMonthWork.extH}h</strong></span>}
                {thisMonthWork.nightH>0&&<span><span className="text-gray-500">야간 </span><strong className="text-red-600">{thisMonthWork.nightH}h</strong></span>}
                {thisMonthWork.holH>0&&<span><span className="text-gray-500">휴일 </span><strong className="text-teal-600">{thisMonthWork.holH}h</strong></span>}
              </div>
              <button onClick={()=>setSimWork(thisMonthWork)}
                className="mt-2 text-xs text-blue-600 hover:text-blue-800">
                ↺ 이번달 실제 근태로 초기화
              </button>
            </div>
          )}

          {/* 근무시간 입력 */}
          <div className="card mb-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              ⚡ 근무시간 입력 (수정하면 즉시 계산)
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                {label:'평일 정규(h)', key:'regH', color:'text-purple-600'},
                {label:'평일 시간외(h)', key:'extH', color:'text-blue-600'},
                {label:'평일 야간(h)', key:'nightH', color:'text-red-600'},
                {label:'휴일 정규(h)', key:'holH', color:'text-teal-600'},
                {label:'휴일 시간외(h)', key:'holExtH', color:'text-amber-600'},
                {label:'휴일 야간(h)', key:'holNightH', color:'text-rose-600'},
              ].map(f=>(
                <div key={f.key}>
                  <label className={`block text-xs font-medium mb-1 ${f.color}`}>{f.label}</label>
                  <input type="number" step="0.5" min="0" className="input text-sm"
                    value={(simWork as any)[f.key]||0}
                    onChange={e=>setSimWork((p:any)=>({...p,[f.key]:+e.target.value}))} />
                </div>
              ))}
            </div>
          </div>

          {result && (
            <>
              {/* 요약 */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  {label:'기본 시간단가', val:Math.round(result.rate).toLocaleString()+'원/h', c:'text-gray-700'},
                  {label:'총 지급액', val:formatWon(result.grossTotal), c:'text-purple-600'},
                  {label:'총 공제액', val:'-'+formatWon(result.totalDeduct), c:'text-red-600'},
                  {label:'예상 수령액', val:formatWon(result.netPay), c:'text-teal-600'},
                ].map(m=>(
                  <div key={m.label} className="card text-center py-3">
                    <div className="text-xs text-gray-400 mb-1">{m.label}</div>
                    <div className={`text-sm font-semibold ${m.c}`}>{m.val}</div>
                  </div>
                ))}
              </div>

              {/* 지급/공제 */}
              <div className="card mb-4">
                <div className="grid grid-cols-2 gap-0 divide-x divide-gray-100">
                  <div className="pr-6">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">지급 항목</div>
                    {[
                      ['기본급', result.base],
                      result.payExt>0&&['평일 시간외 ×1.5', result.payExt],
                      result.payNight>0&&['평일 야간 ×2.0', result.payNight],
                      result.payHol>0&&['휴일 근무 ×1.5', result.payHol],
                      result.payHolExt>0&&['휴일 시간외 ×2.0', result.payHolExt],
                      result.payHolNight>0&&['휴일 야간 ×2.5', result.payHolNight],
                      salary?.meal>0&&['식대 (비과세)', salary.meal],
                      salary?.transport>0&&['교통비 (비과세)', salary.transport],
                      salary?.comm>0&&['통신비 (비과세)', salary.comm],
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
                      ['국민연금 (4.5%)', result.pension],
                      ['건강보험 (3.545%)', result.health],
                      ['장기요양보험', result.ltc],
                      ['고용보험 (0.9%)', result.employ],
                      [`소득세 (${salary?.dependents}인)`, result.incomeTax],
                      ['지방소득세', result.localTax],
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

              {/* 예상 수령액 배너 */}
              <div className="rounded-xl p-5 flex justify-between items-center"
                style={{background:'linear-gradient(135deg,#854F0B,#BA7517)'}}>
                <div>
                  <div className="text-white/80 text-sm font-medium">⚡ 예상 수령액</div>
                  <div className="text-white/60 text-xs mt-0.5">{now.getFullYear()}년 {now.getMonth()+1}월 · {profile?.name}</div>
                </div>
                <div className="text-white text-2xl font-bold">{formatWon(result.netPay)}</div>
              </div>
              <div className="mt-3 p-3 bg-amber-50 rounded-lg text-xs text-amber-700">
                ⚠️ 시뮬레이션 결과로 실제 지급액과 다를 수 있습니다
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

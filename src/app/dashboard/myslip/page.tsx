'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { calcSalary, formatWon } from '@/lib/attendance'

const MONTHS = Array.from({length:12},(_,i)=>i+1)

export default function MySlipPage() {
  const [profile, setProfile] = useState<any>(null)
  const [salary, setSalary] = useState<any>(null)
  const [work, setWork] = useState<any>(null)
  const [staffList, setStaffList] = useState<any[]>([])
  const [selStaffId, setSelStaffId] = useState('')
  const [selMonth, setSelMonth] = useState(new Date().getMonth()+1)
  const [result, setResult] = useState<any>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)

    const targetId = (p?.role === 'director' && selStaffId) ? selStaffId : session.user.id

    if (p?.role === 'director') {
      const { data: sl } = await supabase.from('profiles').select('id,name').eq('status','active')
      setStaffList(sl || [])
      if (!selStaffId && sl?.[0]) setSelStaffId(sl[0].id)
    }

    const { data: sal } = await supabase.from('salary_info').select('*').eq('user_id', targetId).single()
    setSalary(sal)

    // 해당 월 근태 합산
    const start = `2026-${String(selMonth).padStart(2,'0')}-01`
    const end   = `2026-${String(selMonth).padStart(2,'0')}-31`
    const { data: recs } = await supabase.from('attendance').select('*')
      .eq('user_id', targetId).gte('work_date', start).lte('work_date', end)

    if (recs && recs.length > 0) {
      const w = recs.reduce((a:any, r:any) => ({
        regH:      a.regH      + (r.reg_hours||0),
        extH:      a.extH      + (r.ext_hours||0),
        nightH:    a.nightH    + (r.night_hours||0),
        holH:      a.holH      + (r.hol_hours||0),
        holExtH:   a.holExtH   + (r.hol_eve_hours||0),
        holNightH: a.holNightH + (r.hol_night_hours||0),
      }), {regH:0,extH:0,nightH:0,holH:0,holExtH:0,holNightH:0})
      setWork(w)
    } else {
      setWork(null)
    }
  }, [selStaffId, selMonth])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!salary || !work) { setResult(null); return }
    setResult(calcSalary({
      annual:      salary.annual,
      dependents:  salary.dependents,
      meal:        salary.meal,
      transport:   salary.transport,
      comm:        salary.comm,
      regH:        work.regH,
      extH:        work.extH,
      nightH:      work.nightH,
      holH:        work.holH,
      holExtH:     work.holExtH,
      holNightH:   work.holNightH,
    }))
  }, [salary, work])

  function printSlip() {
    window.print()
  }

  const targetName = profile?.role === 'director'
    ? (staffList.find(s=>s.id===selStaffId)?.name || '')
    : profile?.name

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-lg font-semibold text-gray-800">내 급여명세서</h1>
        <div className="flex gap-2 items-center">
          {profile?.role === 'director' && (
            <select className="input w-auto text-sm" value={selStaffId} onChange={e=>setSelStaffId(e.target.value)}>
              {staffList.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <select className="input w-auto text-sm" value={selMonth} onChange={e=>setSelMonth(+e.target.value)}>
            {MONTHS.map(m=><option key={m} value={m}>{m}월</option>)}
          </select>
          <button onClick={printSlip} className="btn-secondary text-sm">🖨 인쇄 / PDF</button>
        </div>
      </div>

      {!result ? (
        <div className="card py-16 text-center">
          <div className="text-3xl mb-3">📭</div>
          <div className="text-gray-400 text-sm">2026년 {selMonth}월 급여 데이터가 없습니다.</div>
          <div className="text-gray-300 text-xs mt-1">근태가 입력된 월을 선택해 주세요</div>
        </div>
      ) : (
        <div id="slip-print">
          {/* 요약 카드 */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              {label:'기본 시간단가', val:Math.round(result.rate).toLocaleString()+'원/h', color:'text-gray-700'},
              {label:'총 지급액', val:formatWon(result.grossTotal), color:'text-purple-600'},
              {label:'총 공제액', val:'-'+formatWon(result.totalDeduct), color:'text-red-600'},
              {label:'실 수령액', val:formatWon(result.netPay), color:'text-teal-600'},
            ].map(m=>(
              <div key={m.label} className="card text-center py-3">
                <div className="text-xs text-gray-400 mb-1">{m.label}</div>
                <div className={`text-sm font-semibold ${m.color}`}>{m.val}</div>
              </div>
            ))}
          </div>

          {/* 근태 요약 */}
          <div className="card mb-4 p-3">
            <div className="flex gap-5 flex-wrap text-xs">
              <span><span className="text-gray-400">정규 </span><strong className="text-purple-600">{work?.regH}h</strong></span>
              {(work?.extH>0) && <span><span className="text-gray-400">시간외 </span><strong className="text-blue-600">{work.extH}h</strong></span>}
              {(work?.nightH>0) && <span><span className="text-gray-400">야간 </span><strong className="text-red-600">{work.nightH}h</strong></span>}
              {(work?.holH>0) && <span><span className="text-gray-400">휴일 </span><strong className="text-teal-600">{work.holH}h</strong></span>}
              {(work?.holExtH>0) && <span><span className="text-gray-400">휴일 시간외 </span><strong className="text-amber-600">{work.holExtH}h</strong></span>}
            </div>
          </div>

          {/* 지급/공제 상세 */}
          <div className="card mb-4">
            <div className="grid grid-cols-2 gap-0 divide-x divide-gray-100">
              <div className="pr-6">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">지급 항목</div>
                {[
                  ['기본급', result.base],
                  result.payExt>0      && [`평일 시간외 ×1.5 (${work.extH}h)`, result.payExt],
                  result.payNight>0    && [`평일 야간 ×2.0 (${work.nightH}h)`, result.payNight],
                  result.payHol>0      && [`휴일 근무 ×1.5 (${work.holH}h)`, result.payHol],
                  result.payHolExt>0   && [`휴일 시간외 ×2.0 (${work.holExtH}h)`, result.payHolExt],
                  result.payHolNight>0 && [`휴일 야간 ×2.5 (${work.holNightH}h)`, result.payHolNight],
                  salary?.meal>0   && ['식대 (비과세)', salary.meal],
                  salary?.transport>0 && ['교통비 (비과세)', salary.transport],
                  salary?.comm>0   && ['통신비 (비과세)', salary.comm],
                ].filter(Boolean).map((item:any,i)=>(
                  <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                    <span className="text-gray-500">{item[0]}</span>
                    <span className="text-purple-600 font-medium">{formatWon(item[1])}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 text-sm font-semibold">
                  <span>지급 합계</span><span className="text-purple-600">{formatWon(result.grossTotal)}</span>
                </div>
              </div>
              <div className="pl-6">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">공제 항목</div>
                {[
                  ['국민연금 (4.5%)', result.pension],
                  ['건강보험 (3.545%)', result.health],
                  ['장기요양보험 (12.95%)', result.ltc],
                  ['고용보험 (0.9%)', result.employ],
                  [`소득세 (간이·${salary?.dependents}인)`, result.incomeTax],
                  ['지방소득세 (10%)', result.localTax],
                ].map(([l,v],i)=>(
                  <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                    <span className="text-gray-500">{l}</span>
                    <span className="text-red-600 font-medium">-{formatWon(v as number)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 text-sm font-semibold">
                  <span>공제 합계</span><span className="text-red-600">-{formatWon(result.totalDeduct)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 실수령액 */}
          <div className="rounded-xl p-5 flex justify-between items-center" style={{background:'linear-gradient(135deg,#534AB7,#6c63d4)'}}>
            <div>
              <div className="text-white/80 text-sm font-medium">실 수령액</div>
              <div className="text-white/60 text-xs mt-0.5">2026년 {selMonth}월 · {targetName}</div>
            </div>
            <div className="text-white text-2xl font-bold">{formatWon(result.netPay)}</div>
          </div>

          {/* 계산 기준 안내 */}
          <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-400 leading-relaxed">
            📌 연봉 {formatWon(salary?.annual)} ÷ 12 ÷ 209h = 시간단가 {Math.round(result.rate).toLocaleString()}원
            &nbsp;|&nbsp; 평일 시간외 ×1.5 · 야간 ×2.0 · 휴일 ×1.5 · 휴일시간외 ×2.0 · 휴일야간 ×2.5
            &nbsp;|&nbsp; 부양가족 {salary?.dependents}명 기준 소득세
          </div>
        </div>
      )}
    </div>
  )
}

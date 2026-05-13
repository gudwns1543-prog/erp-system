'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { calcSalary, formatWon, sortByGrade } from '@/lib/attendance'

export default function PaySlipPage() {
  const [profile, setProfile] = useState<any>(null)
  const [salary, setSalary] = useState<any>(null)
  const [work, setWork] = useState<any>(null)
  const [staffList, setStaffList] = useState<any[]>([])
  const [selStaffId, setSelStaffId] = useState('')
  const [selYear, setSelYear] = useState(new Date().getFullYear())
  const [selMonth, setSelMonth] = useState(new Date().getMonth()+1)
  const [result, setResult] = useState<any>(null)
  const [payslipFiles, setPayslipFiles] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [alert, setAlert] = useState('')
  const [activeTab, setActiveTab] = useState<'erp'|'office'>('erp')
  const [tripDays, setTripDays] = useState(0)
  const [tripAllowance, setTripAllowance] = useState(0)
  const [deductItems, setDeductItems] = useState<any[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const years = Array.from({length:5},(_,i)=>new Date().getFullYear()-i)

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
    const lastDay = new Date(selYear, selMonth, 0).getDate()
    const end = `${selYear}-${String(selMonth).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
    const { data: recs } = await supabase.from('attendance').select('*')
      .eq('user_id', targetId).gte('work_date', start).lte('work_date', end)
    if (recs?.length) {
      setWork(recs.reduce((a:any,r:any)=>({
        regH: a.regH+(r.reg_hours||0), extH: a.extH+(r.ext_hours||0),
        nightH: a.nightH+(r.night_hours||0), holH: a.holH+(r.hol_hours||0),
        holExtH: a.holExtH+(r.hol_eve_hours||0), holNightH: a.holNightH+(r.hol_night_hours||0),
      }),{regH:0,extH:0,nightH:0,holH:0,holExtH:0,holNightH:0}))

      // 출장일 수 계산
      const trips = recs.filter((r:any)=>r.note==='출장').length
      setTripDays(trips)
    } else { setWork(null); setTripDays(0) }

    // 회사설정에서 출장일비 + 공제항목 로드
    const { data: settings } = await supabase.from('company_settings').select('key,value')
      .in('key',['trip_allowance','deduct_items'])
    settings?.forEach((s:any)=>{
      if (s.key==='trip_allowance') setTripAllowance(Number(s.value)||0)
      if (s.key==='deduct_items') { try { setDeductItems(JSON.parse(s.value)) } catch {} }
    })

    // 급여명세 첨부파일 로드
    const { data: files } = await supabase.from('payslip_files')
      .select('*').eq('user_id', targetId)
      .eq('year', selYear).eq('month', selMonth)
      .order('created_at', {ascending:false})
    setPayslipFiles(files||[])
  }, [selStaffId, selYear, selMonth])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!salary||!work) { setResult(null); return }
    setResult(calcSalary({annual:salary.annual,dependents:salary.dependents,
      meal:salary.meal,transport:salary.transport,comm:salary.comm,...work}))
  }, [salary, work])

  async function handleFileUpload(file: File) {
    if (!profile) return
    setUploading(true)
    const supabase = createClient()
    const targetId = (profile?.role==='director'&&selStaffId) ? selStaffId : profile.id
    const ext = file.name.split('.').pop()
    const path = `payslips/${targetId}/${selYear}-${selMonth}-${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('payslip-files').upload(path, file)
    if (uploadErr) { setAlert('업로드 실패: '+uploadErr.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('payslip-files').getPublicUrl(path)
    await supabase.from('payslip_files').insert({
      user_id: targetId, year: selYear, month: selMonth,
      file_name: file.name, file_url: urlData.publicUrl,
      file_path: path, uploaded_by: profile.id,
    })
    setAlert('급여명세서가 등록되었습니다.')
    setTimeout(()=>setAlert(''),3000)
    setUploading(false); load()
  }

  async function handleFileDelete(fileId: string, filePath: string) {
    if (!confirm('이 파일을 삭제하시겠습니까?')) return
    const supabase = createClient()
    await supabase.storage.from('payslip-files').remove([filePath])
    await supabase.from('payslip_files').delete().eq('id', fileId)
    setAlert('삭제되었습니다.')
    setTimeout(()=>setAlert(''),2000); load()
  }

  const targetName = profile?.role==='director'
    ? (staffList.find(s=>s.id===selStaffId)?.name||'') : profile?.name

  const tripPay = tripDays * tripAllowance

  // 커스텀 공제 계산
  const customDeducts = deductItems.filter(d=>d.enabled && !['pension','health','ltc','employ','incomeTax','localTax'].includes(d.id))
  const customDeductTotal = result ? customDeducts.reduce((sum:number,d:any)=>{
    if (d.rateType==='percent') return sum + Math.round(result.grossTaxable * d.rate / 100)
    return sum + (d.rate||0)
  }, 0) : 0

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {alert && <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg text-sm z-50 shadow-lg">{alert}</div>}

      {/* 상단 컨트롤 */}
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-lg font-semibold text-gray-800">급여명세 조회</h1>
        <div className="flex gap-2 flex-wrap justify-end">
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

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200 mb-5">
        <button onClick={()=>setActiveTab('erp')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
            ${activeTab==='erp'?'border-purple-600 text-purple-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
          📊 ERP 내 자체 계산
        </button>
        <button onClick={()=>setActiveTab('office')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
            ${activeTab==='office'?'border-green-600 text-green-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
          📎 세무사무실 계산
        </button>
      </div>

      {/* ERP 자체 계산 탭 */}
      {activeTab==='erp' && (
        <>
          {!result ? (
            <div className="card py-16 text-center">
              <div className="text-3xl mb-3">📭</div>
              <div className="text-gray-400 text-sm">{selYear}년 {selMonth}월 급여 데이터가 없습니다.</div>
              <div className="text-gray-300 text-xs mt-1">근태가 입력된 년월을 선택해 주세요</div>
            </div>
          ) : (
            <>
              {/* 출장일비 입력 (관리자 또는 직원이 직접 확인) */}
              {tripAllowance > 0 && (
                <div className="card mb-4 bg-amber-50 border-amber-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🚗</span>
                      <span className="text-sm font-medium text-amber-800">이번달 출장일수</span>
                      <span className="text-xs text-amber-600">(근태기록의 '출장' 기준)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} value={tripDays}
                        onChange={e=>setTripDays(Number(e.target.value))}
                        className="input w-16 text-center text-sm py-1" />
                      <span className="text-sm text-amber-700">일 × {tripAllowance.toLocaleString()}원 = <strong className="text-amber-800">{tripPay.toLocaleString()}원</strong></span>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  {label:'기본 시간단가', val:Math.round(result.rate).toLocaleString()+'원/h', c:'text-gray-700'},
                  {label:'총 지급액', val:formatWon(result.grossTotal + tripPay), c:'text-purple-600'},
                  {label:'총 공제액', val:'-'+formatWon(result.totalDeduct + customDeductTotal), c:'text-red-600'},
                  {label:'실 수령액', val:formatWon(result.netPay + tripPay - customDeductTotal), c:'text-teal-600'},
                ].map(m=>(
                  <div key={m.label} className="card text-center py-3">
                    <div className="text-xs text-gray-400 mb-1">{m.label}</div>
                    <div className={`text-sm font-semibold ${m.c}`}>{m.val}</div>
                  </div>
                ))}
              </div>

              {work && (
                <div className="card mb-4 p-3">
                  <div className="flex gap-4 flex-wrap text-xs">
                    <span><span className="text-gray-400">정규 </span><strong className="text-purple-600">{work.regH}h</strong></span>
                    {work.extH>0&&<span><span className="text-gray-400">시간외 </span><strong className="text-blue-600">{work.extH}h</strong></span>}
                    {work.nightH>0&&<span><span className="text-gray-400">야간 </span><strong className="text-red-600">{work.nightH}h</strong></span>}
                    {work.holH>0&&<span><span className="text-gray-400">휴일 </span><strong className="text-teal-600">{work.holH}h</strong></span>}
                    {tripDays>0&&<span><span className="text-gray-400">출장 </span><strong className="text-amber-600">{tripDays}일</strong></span>}
                  </div>
                </div>
              )}

              <div className="card mb-4">
                <div className="grid grid-cols-2 gap-0 divide-x divide-gray-100">
                  <div className="pr-6">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">지급 항목</div>
                    {[
                      ['기본급', result.base],
                      result.payExt>0&&work?.extH>0&&[`평일 시간외 ${work.extH}h × 1.5`, result.payExt],
                      result.payNight>0&&work?.nightH>0&&[`평일 야간 ${work.nightH}h × 2.0`, result.payNight],
                      result.payHol>0&&work?.holH>0&&[`휴일 정규 ${work.holH}h × 1.5`, result.payHol],
                      result.payHolExt>0&&work?.holExtH>0&&[`휴일 시간외 ${work.holExtH}h × 2.0`, result.payHolExt],
                      result.payHolNight>0&&work?.holNightH>0&&[`휴일 야간 ${work.holNightH}h × 2.5`, result.payHolNight],
                      tripPay>0&&[`출장 일비 ${tripDays}일 × ${tripAllowance.toLocaleString()}원`, tripPay],
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
                      <span>합계</span><span className="text-purple-600">{formatWon(result.grossTotal + tripPay)}</span>
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
                      ...customDeducts.map(d=>([
                        d.name + (d.rateType==='percent'?` (${d.rate}%)`:''),
                        d.rateType==='percent' ? Math.round(result.grossTaxable * d.rate / 100) : d.rate
                      ]))
                    ].map(([l,v]:any,i)=>(
                      <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                        <span className="text-gray-500">{l}</span>
                        <span className="text-red-600 font-medium">-{formatWon(v)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 text-sm font-semibold">
                      <span>합계</span><span className="text-red-600">-{formatWon(result.totalDeduct + customDeductTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl p-5 flex justify-between items-center mb-4" style={{background:'linear-gradient(135deg,#534AB7,#6c63d4)'}}>
                <div>
                  <div className="text-white/80 text-sm font-medium">실 수령액</div>
                  <div className="text-white/60 text-xs mt-0.5">{selYear}년 {selMonth}월 · {targetName}</div>
                </div>
                <div className="text-white text-2xl font-bold">{formatWon(result.netPay + tripPay - customDeductTotal)}</div>
              </div>

              <div className="p-4 bg-gray-50 rounded-xl text-xs space-y-1.5">
                <div className="font-semibold text-gray-600 mb-2">📐 급여 계산 기준</div>
                <div className="text-gray-500">기본 시간단가: 연봉 {formatWon(salary?.annual)} ÷ 12 ÷ 209h = <span className="font-semibold text-purple-600">{Math.round(result.rate).toLocaleString()}원/h</span></div>
              </div>
            </>
          )}
        </>
      )}

      {/* 세무사무실 계산 탭 */}
      {activeTab==='office' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-gray-700">세무사무실 급여명세서</div>
              <div className="text-xs text-gray-400 mt-0.5">{selYear}년 {selMonth}월 · {targetName}</div>
            </div>
            {profile?.role==='director' && (
              <>
                <input type="file" ref={fileInputRef} className="hidden"
                  accept=".pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg"
                  onChange={e=>{ if(e.target.files?.[0]) handleFileUpload(e.target.files[0]) }} />
                <button onClick={()=>fileInputRef.current?.click()} disabled={uploading}
                  className="btn-primary text-sm px-4 py-2">
                  {uploading ? '⏳ 업로드 중...' : '+ 명세서 파일 등록'}
                </button>
              </>
            )}
          </div>

          {payslipFiles.length === 0 ? (
            <div className="card py-16 text-center">
              <div className="text-4xl mb-3">📂</div>
              <div className="text-gray-400 text-sm mb-1">등록된 급여명세서가 없습니다.</div>
              <div className="text-gray-300 text-xs">
                {profile?.role==='director'
                  ? '우측 상단 [+ 명세서 파일 등록] 버튼으로 파일을 업로드하세요.'
                  : '관리자에게 급여명세서 등록을 요청하세요.'}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {payslipFiles.map((f:any) => (
                <div key={f.id} className="card flex items-center justify-between hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-xl flex-shrink-0">
                      {f.file_name.endsWith('.pdf') ? '📄' : f.file_name.match(/\.(xlsx?|csv)$/i) ? '📊' : f.file_name.match(/\.(png|jpe?g)$/i) ? '🖼' : '📎'}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-gray-700 truncate font-medium">{f.file_name}</div>
                      <div className="text-xs text-gray-400">{new Date(f.created_at).toLocaleDateString('ko-KR', {year:'numeric',month:'long',day:'numeric'})} 등록</div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 ml-4">
                    <a href={f.file_url} target="_blank" rel="noreferrer"
                      className="btn-primary text-xs px-3 py-1.5">⬇ 다운로드</a>
                    {profile?.role==='director' && (
                      <button onClick={()=>handleFileDelete(f.id, f.file_path)}
                        className="btn-danger text-xs px-3 py-1.5">삭제</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

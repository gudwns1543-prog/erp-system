'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { calcSalary, formatWon, sortByGrade, getLatestPayMonth, formatPayLabel, getPayDate } from '@/lib/attendance'

export default function PaySlipPage() {
  const [profile, setProfile] = useState<any>(null)
  const [salary, setSalary] = useState<any>(null)
  const [work, setWork] = useState<any>(null)
  const [staffList, setStaffList] = useState<any[]>([])
  const [selStaffId, setSelStaffId] = useState('')
  // 기본값: 최신 지급된 명세서의 근무월 (예: 5/14 → 4월)
  const initPayMonth = getLatestPayMonth()
  const [selYear, setSelYear] = useState(initPayMonth.year)
  const [selMonth, setSelMonth] = useState(initPayMonth.month)
  const [result, setResult] = useState<any>(null)
  const [payslipFiles, setPayslipFiles] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [alert, setAlert] = useState('')
  const [activeTab, setActiveTab] = useState<'erp'|'office'|'compare'>('erp')
  const [tripDays, setTripDays] = useState(0)
  const [tripAllowance, setTripAllowance] = useState(0)
  const [deductItems, setDeductItems] = useState<any[]>([])
  // 비교 - 사무실 명세서 추출값 (수동/AI 둘 다 가능)
  const [officeData, setOfficeData] = useState<Record<string, number | null>>({})
  const [extracting, setExtracting] = useState(false)
  const [officeFileId, setOfficeFileId] = useState<string>('') // 어떤 파일에서 가져온 값인지
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

  // PDF에서 AI로 자동 추출
  async function handleExtractFile(file: any) {
    setExtracting(true)
    setOfficeFileId(file.id)
    try {
      const res = await fetch('/api/payslip-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_url: file.file_url }),
      })
      const data = await res.json()
      if (!data.success) {
        window.alert('AI 추출 실패: ' + (data.error || '알 수 없는 오류'))
        setExtracting(false)
        return
      }
      // DB에 추출 결과 저장
      const supabase = createClient()
      await supabase.from('payslip_files')
        .update({ extracted_data: data.extracted, extracted_at: new Date().toISOString() })
        .eq('id', file.id)
      setOfficeData(data.extracted)
      setAlert('✅ AI 추출 완료. 비교 탭으로 이동합니다.')
      setTimeout(()=>setAlert(''),2500)
      setActiveTab('compare')
      load()
    } catch (e:any) {
      window.alert('오류: ' + e.message)
    } finally {
      setExtracting(false)
    }
  }

  // 추출된 파일이 있으면 비교 탭에서 자동 로드
  function loadOfficeFromFile(file: any) {
    if (file.extracted_data) {
      setOfficeData(file.extracted_data)
      setOfficeFileId(file.id)
    }
  }

  async function saveOfficeData() {
    if (!officeFileId) return
    const supabase = createClient()
    await supabase.from('payslip_files')
      .update({ extracted_data: officeData })
      .eq('id', officeFileId)
    setAlert('✅ 사무실 명세서 값 저장 완료')
    setTimeout(()=>setAlert(''),2000)
    load()
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
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">급여명세 조회</h1>
          <div className="text-xs text-gray-500 mt-0.5">
            📅 <strong>{formatPayLabel(selYear, selMonth)}</strong>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {profile?.role==='director' && (
            <select className="input w-auto text-sm" value={selStaffId} onChange={e=>setSelStaffId(e.target.value)}>
              {staffList.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <span className="text-xs text-gray-500">근무월:</span>
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
        <button onClick={()=>setActiveTab('compare')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
            ${activeTab==='compare'?'border-amber-600 text-amber-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
          ⚖️ 비교
        </button>
      </div>

      {/* ERP 자체 계산 탭 */}
      {activeTab==='erp' && (
        <>
          {!result ? (
            <div className="card py-16 text-center">
              <div className="text-3xl mb-3">📭</div>
              <div className="text-gray-400 text-sm">{selYear}년 {selMonth}월 ({formatPayLabel(selYear, selMonth)}) 근무 데이터가 없습니다.</div>
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
                  <div className="text-white/60 text-xs mt-0.5">{formatPayLabel(selYear, selMonth)} · {targetName}</div>
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
              <div className="text-xs text-gray-400 mt-0.5">{formatPayLabel(selYear, selMonth)} · {targetName}</div>
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
                    <button onClick={()=>handleExtractFile(f)}
                      disabled={extracting}
                      className="btn-secondary text-xs px-3 py-1.5 text-amber-700 border-amber-300 hover:bg-amber-50 disabled:opacity-50">
                      {extracting && officeFileId === f.id ? '⏳ 추출 중...' : f.extracted_data ? '✅ 추출됨' : '🤖 AI 추출'}
                    </button>
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

      {/* 비교 탭 - 세로표로 ERP vs 사무실 */}
      {activeTab==='compare' && (
        <CompareTab
          result={result}
          salary={salary}
          tripPay={tripPay}
          payslipFiles={payslipFiles}
          officeData={officeData}
          setOfficeData={setOfficeData}
          officeFileId={officeFileId}
          loadOfficeFromFile={loadOfficeFromFile}
          saveOfficeData={saveOfficeData}
          selYear={selYear}
          selMonth={selMonth}
          targetName={targetName}
        />
      )}
    </div>
  )
}

// ─── 비교 탭 컴포넌트 ──────
function CompareTab({
  result, salary, tripPay, payslipFiles, officeData, setOfficeData,
  officeFileId, loadOfficeFromFile, saveOfficeData,
  selYear, selMonth, targetName
}: any) {
  // ERP 자체 계산값 → 표준 키로 매핑 (calcSalary 결과 + input 합쳐서)
  const erpData: Record<string, number | null> = {
    basic_pay: result?.base ? Math.round(result.base) : null,
    overtime_pay: result?.payExt ? Math.round(result.payExt) : null,
    night_pay: result?.payNight ? Math.round(result.payNight) : null,
    holiday_pay: result ? Math.round((result.payHol || 0) + (result.payHolExt || 0) + (result.payHolNight || 0)) || null : null,
    annual_leave_pay: null,
    meal_allowance: salary?.meal || null,
    comm_allowance: salary?.comm || null,
    trip_allowance: tripPay || null,
    other_pay: null,
    income_tax: result?.incomeTax || null,
    local_tax: result?.localTax || null,
    national_pension: result?.pension || null,
    health_insurance: result?.health || null,
    longterm_care: result?.ltc || null,
    employment_insurance: result?.employ || null,
    other_deduct: null,
    total_pay: result?.grossTotal ? Math.round(result.grossTotal) : null,
    total_deduct: result?.totalDeduct || null,
    net_pay: result?.netPay ? Math.round(result.netPay) : null,
  }

  const ROWS = [
    { key: 'basic_pay', label: '기본급', section: '지급' },
    { key: 'overtime_pay', label: '시간외수당', section: '지급' },
    { key: 'night_pay', label: '야간근로수당', section: '지급' },
    { key: 'holiday_pay', label: '휴일근로수당', section: '지급' },
    { key: 'annual_leave_pay', label: '연차수당', section: '지급' },
    { key: 'meal_allowance', label: '급량비(식대)', section: '지급' },
    { key: 'comm_allowance', label: '통신비', section: '지급' },
    { key: 'trip_allowance', label: '출장수당', section: '지급' },
    { key: 'other_pay', label: '기타수당', section: '지급' },
    { key: 'income_tax', label: '근로소득세', section: '공제' },
    { key: 'local_tax', label: '지방소득세', section: '공제' },
    { key: 'national_pension', label: '국민연금', section: '공제' },
    { key: 'health_insurance', label: '건강보험', section: '공제' },
    { key: 'longterm_care', label: '장기요양보험', section: '공제' },
    { key: 'employment_insurance', label: '고용보험', section: '공제' },
    { key: 'other_deduct', label: '기타공제', section: '공제' },
    { key: 'total_pay', label: '지급항목 합계', section: '합계' },
    { key: 'total_deduct', label: '공제항목 합계', section: '합계' },
    { key: 'net_pay', label: '실수령액', section: '합계' },
  ]

  function fmt(v: number | null | undefined) {
    if (v === null || v === undefined) return '-'
    return v.toLocaleString('ko-KR') + '원'
  }

  function diffClass(diff: number) {
    if (diff === 0) return 'text-gray-400'
    const absDiff = Math.abs(diff)
    if (absDiff < 1000) return 'text-amber-600 font-medium'
    return 'text-red-600 font-bold'
  }

  // 추출된 파일들 (해당 월)
  const extractedFiles = payslipFiles.filter((f:any) => f.extracted_data)

  // 모든 차이 합계 계산 (참고용)
  const totalDiff = ROWS.filter(r => r.section !== '합계').reduce((sum, r) => {
    const erp = erpData[r.key] || 0
    const office = officeData[r.key] || 0
    return sum + (office - erp)
  }, 0)

  return (
    <div className="space-y-4">
      {/* 파일 선택 & AI 추출 안내 */}
      <div className="card p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-gray-600">
          📌 <strong>{formatPayLabel(selYear, selMonth)} · {targetName}</strong> · ERP 자체 계산값과 세무사무실 명세서를 비교합니다.
        </div>
        <div className="flex items-center gap-2">
          {extractedFiles.length > 0 && (
            <select className="text-xs border border-gray-200 rounded px-2 py-1"
              value={officeFileId}
              onChange={e=>{
                const f = extractedFiles.find((x:any)=>x.id===e.target.value)
                if (f) loadOfficeFromFile(f)
              }}>
              <option value="">📂 추출된 파일 선택...</option>
              {extractedFiles.map((f:any) => (
                <option key={f.id} value={f.id}>{f.file_name}</option>
              ))}
            </select>
          )}
          {officeFileId && (
            <button onClick={saveOfficeData} className="text-xs btn-primary px-3 py-1">💾 저장</button>
          )}
        </div>
      </div>

      {extractedFiles.length === 0 && Object.keys(officeData).length === 0 && (
        <div className="card py-8 text-center">
          <div className="text-3xl mb-2">📋</div>
          <div className="text-sm text-gray-600 mb-1">세무사무실 명세서가 없습니다.</div>
          <div className="text-xs text-gray-400">
            <strong>세무사무실 계산</strong> 탭에서 PDF 등록 후, <strong>🤖 AI 추출</strong> 버튼을 눌러주세요.<br />
            추출된 값은 아래 표에서 수동으로 수정도 가능합니다.
          </div>
        </div>
      )}

      {/* 비교 세로표 */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="border-b border-gray-200">
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-24"></th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">항목</th>
              <th className="text-right px-3 py-2.5 text-xs font-semibold text-purple-700 w-32">📊 ERP 계산</th>
              <th className="text-right px-3 py-2.5 text-xs font-semibold text-green-700 w-40">📎 사무실 명세서</th>
              <th className="text-right px-3 py-2.5 text-xs font-semibold text-amber-700 w-32">차이</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, idx) => {
              const erp = erpData[row.key]
              const office = officeData[row.key]
              const hasErp = erp !== null && erp !== undefined
              const hasOffice = office !== null && office !== undefined
              const diff = hasErp && hasOffice ? (office! - erp!) : null
              const prevSection = idx > 0 ? ROWS[idx-1].section : ''
              const sectionChanged = row.section !== prevSection
              const isTotal = row.section === '합계'
              return (
                <tr key={row.key} className={`border-b border-gray-50 ${isTotal ? 'bg-gray-50' : ''}`}>
                  <td className="px-3 py-2 text-xs">
                    {sectionChanged && (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        row.section === '지급' ? 'bg-purple-100 text-purple-700' :
                        row.section === '공제' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>{row.section}</span>
                    )}
                  </td>
                  <td className={`px-3 py-2 ${isTotal ? 'font-bold text-gray-800' : 'text-gray-700'}`}>
                    {row.label}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700 tabular-nums">
                    {fmt(erp)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {/* 사무실 값 - 인라인 편집 가능 */}
                    <input
                      type="text"
                      value={hasOffice ? office!.toLocaleString('ko-KR') : ''}
                      onChange={e=>{
                        const raw = e.target.value.replace(/[^\d-]/g, '')
                        const num = raw === '' ? null : parseInt(raw, 10)
                        setOfficeData((d:any) => ({ ...d, [row.key]: num }))
                      }}
                      placeholder="-"
                      className="w-full text-right text-sm bg-transparent border-0 hover:bg-green-50 focus:bg-green-50 focus:outline-none focus:ring-1 focus:ring-green-300 rounded px-1.5 py-0.5"
                    />
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${diff !== null ? diffClass(diff) : 'text-gray-300'}`}>
                    {diff === null ? '-' : (diff === 0 ? '✓ 일치' : (diff > 0 ? '+' : '') + diff.toLocaleString('ko-KR') + '원')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 차이 요약 */}
      <div className="card p-4 bg-amber-50 border-amber-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-amber-800">📊 검증 결과</div>
            <div className="text-xs text-amber-600 mt-0.5">
              ERP 계산값과 사무실 명세서의 차이를 확인하세요. 1,000원 이상 차이나면 빨간색으로 강조됩니다.
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-amber-700">전체 차이 (지급-공제, 사무실 - ERP)</div>
            <div className={`text-xl font-bold ${Math.abs(totalDiff) < 1000 ? 'text-green-600' : 'text-red-600'}`}>
              {totalDiff === 0 ? '✓ 완전 일치' : (totalDiff > 0 ? '+' : '') + totalDiff.toLocaleString('ko-KR') + '원'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

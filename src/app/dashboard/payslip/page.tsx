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
    } else { setWork(null) }

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
    if (uploadErr) { setAlert('업로드 실패: ' + uploadErr.message); setUploading(false); return }
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

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {alert && <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg text-sm z-50 shadow-lg">{alert}</div>}
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

      {/* 급여명세서 파일 첨부 */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">📎</span>
            <span className="text-sm font-semibold text-gray-700">급여명세서 파일</span>
            <span className="text-xs text-gray-400">{selYear}년 {selMonth}월 · {targetName}</span>
          </div>
          {profile?.role==='director' && (
            <>
              <input type="file" ref={fileInputRef} className="hidden"
                accept=".pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg"
                onChange={e=>{ if(e.target.files?.[0]) handleFileUpload(e.target.files[0]) }} />
              <button onClick={()=>fileInputRef.current?.click()} disabled={uploading}
                className="btn-primary text-xs px-3 py-1.5">
                {uploading ? '⏳ 업로드 중...' : '+ 파일 등록'}
              </button>
            </>
          )}
        </div>
        {payslipFiles.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-4 bg-gray-50 rounded-lg">
            {profile?.role==='director'
              ? '회계사무실에서 받은 급여명세서 파일을 등록해주세요. (PDF, Excel 등)'
              : '아직 등록된 급여명세서가 없습니다. 관리자에게 문의하세요.'}
          </div>
        ) : (
          <div className="space-y-2">
            {payslipFiles.map((f:any) => (
              <div key={f.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-lg flex-shrink-0">
                    {f.file_name.endsWith('.pdf') ? '📄' : f.file_name.match(/\.(xlsx?|csv)$/i) ? '📊' : f.file_name.match(/\.(png|jpe?g)$/i) ? '🖼' : '📎'}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm text-gray-700 truncate font-medium">{f.file_name}</div>
                    <div className="text-xs text-gray-400">{new Date(f.created_at).toLocaleDateString('ko-KR', {year:'numeric',month:'long',day:'numeric'})} 등록</div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0 ml-2">
                  <a href={f.file_url} target="_blank" rel="noreferrer"
                    className="btn-secondary text-xs px-2.5 py-1">⬇ 다운로드</a>
                  {profile?.role==='director' && (
                    <button onClick={()=>handleFileDelete(f.id, f.file_path)}
                      className="btn-danger text-xs px-2.5 py-1">삭제</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 기존 급여 계산 내용 */}
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
          {work && (
            <div className="card mb-4 p-3">
              <div className="flex gap-4 flex-wrap text-xs">
                <span><span className="text-gray-400">정규 </span><strong className="text-purple-600">{work.regH}h</strong></span>
                {work.extH>0&&<span><span className="text-gray-400">시간외 </span><strong className="text-blue-600">{work.extH}h</strong></span>}
                {work.nightH>0&&<span><span className="text-gray-400">야간 </span><strong className="text-red-600">{work.nightH}h</strong></span>}
                {work.holH>0&&<span><span className="text-gray-400">휴일 </span><strong className="text-teal-600">{work.holH}h</strong></span>}
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
          <div className="rounded-xl p-5 flex justify-between items-center" style={{background:'linear-gradient(135deg,#534AB7,#6c63d4)'}}>
            <div>
              <div className="text-white/80 text-sm font-medium">실 수령액</div>
              <div className="text-white/60 text-xs mt-0.5">{selYear}년 {selMonth}월 · {targetName}</div>
            </div>
            <div className="text-white text-2xl font-bold">{formatWon(result.netPay)}</div>
          </div>
          <div className="mt-3 p-4 bg-gray-50 rounded-xl text-xs space-y-1.5">
            <div className="font-semibold text-gray-600 mb-2">📐 급여 계산 기준</div>
            <div className="text-gray-500">
              기본 시간단가: 연봉 {formatWon(salary?.annual)} ÷ 12 ÷ 209h = <span className="font-semibold text-purple-600">{Math.round(result.rate).toLocaleString()}원/h</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2 text-gray-400">
              <div>✅ 평일 정규: 기본단가 × 1.0</div>
              <div>✅ 평일 시간외: 기본단가 × <span className="text-blue-600 font-medium">1.5배</span></div>
              <div>✅ 평일 야간: 기본단가 × <span className="text-red-600 font-medium">2.0배</span></div>
              <div>✅ 휴일 정규: 기본단가 × <span className="text-teal-600 font-medium">1.5배</span></div>
              <div>✅ 휴일 시간외: 기본단가 × <span className="text-amber-600 font-medium">2.0배</span></div>
              <div>✅ 휴일 야간: 기본단가 × <span className="text-rose-600 font-medium">2.5배</span></div>
            </div>
            <div className="pt-1.5 border-t border-gray-200 text-gray-400">
              부양가족 {salary?.dependents}명 기준 간이세액 적용 · 4대보험 공제 포함
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

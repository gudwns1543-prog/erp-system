'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const TYPES = ['연차','반차(오전)','반차(오후)','반반차','병가','출장','외근','특별휴가']

// 유형별 시간 기본값
const TYPE_TIMES: Record<string, {startTime:string, endTime:string}> = {
  '연차':       { startTime:'09:00', endTime:'18:00' },
  '반차(오전)': { startTime:'09:00', endTime:'13:00' },
  '반차(오후)': { startTime:'13:00', endTime:'18:00' },
  '반반차':     { startTime:'09:00', endTime:'11:00' },
  '병가':       { startTime:'09:00', endTime:'18:00' },
  '출장':       { startTime:'09:00', endTime:'18:00' },
  '외근':       { startTime:'09:00', endTime:'18:00' },
  '특별휴가':   { startTime:'09:00', endTime:'18:00' },
}

export default function LeavePage() {
  const [profile, setProfile] = useState<any>(null)
  const [approvers, setApprovers] = useState<any[]>([])
  const [myRequests, setMyRequests] = useState<any[]>([])
  const [allRequests, setAllRequests] = useState<any[]>([])
  const [tab, setTab] = useState<'apply'|'all'|'mine'>('apply')
  const [form, setForm] = useState({
    type:'연차', start:'', startTime:'09:00', end:'', endTime:'18:00',
    approverId:'', reason:''
  })
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [showDetail, setShowDetail] = useState<any>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const { data: dirs } = await supabase.from('profiles').select('id,name').eq('role','director')
    setApprovers(dirs||[])
    if (dirs?.[0] && !form.approverId) setForm(f=>({...f, approverId: dirs[0].id}))
    const { data: mine } = await supabase.from('approvals')
      .select('*, approver:approver_id(name), requester:requester_id(name,dept,color,tc)')
      .eq('requester_id', session.user.id).order('created_at',{ascending:false})
    setMyRequests(mine||[])
    if (p?.role === 'director') {
      const { data: a } = await supabase.from('approvals')
        .select('*, requester:requester_id(name,dept,color,tc), approver:approver_id(name)')
        .order('created_at',{ascending:false})
      setAllRequests(a||[])
    }
  }, [form.approverId])

  useEffect(() => { load() }, [load])

  // 유형 변경 시 시간 자동 설정
  function handleTypeChange(type: string) {
    const times = TYPE_TIMES[type] || { startTime:'09:00', endTime:'18:00' }
    setForm(f=>({...f, type, startTime:times.startTime, endTime:times.endTime}))
  }

  function handleApplyClick(e: React.FormEvent) {
    e.preventDefault()
    if (!form.start || !form.approverId) return
    setShowConfirm(true)
  }

  async function handleSubmit() {
    setLoading(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await supabase.from('approvals').insert({
      requester_id: session.user.id, approver_id: form.approverId,
      type: form.type,
      start_date: form.start,
      end_date: form.end || form.start,
      start_time: form.startTime,
      end_time: form.endTime,
      reason: form.reason,
    })
    setAlert('결재 상신 완료')
    setForm(f=>({...f, reason:'', start:'', end:''}))
    setShowConfirm(false); load(); setLoading(false)
    setTimeout(()=>setAlert(''), 3000)
  }

  async function handleApprove(id: string, status: 'approved'|'rejected') {
    const supabase = createClient()
    await supabase.from('approvals').update({status, updated_at: new Date().toISOString()}).eq('id', id)
    setAlert(status==='approved'?'승인되었습니다.':'반려되었습니다.')
    setShowDetail(null); load()
    setTimeout(()=>setAlert(''), 3000)
  }

  async function handleCancel(id: string) {
    if (!confirm('결재 신청을 취소하시겠습니까?')) return
    const supabase = createClient()
    await supabase.from('approvals').delete().eq('id', id)
    load()
  }

  const Badge = ({s}: {s:string}) => (
    <span className={s==='pending'?'badge-pending':s==='approved'?'badge-approved':'badge-rejected'}>
      {s==='pending'?'대기':s==='approved'?'승인':'반려'}
    </span>
  )

  const RequestTable = ({data, showRequester=false}: {data:any[], showRequester?:boolean}) => (
    <div className="card overflow-x-auto">
      {data.length===0 ? (
        <div className="py-12 text-center text-gray-300 text-sm">내역이 없습니다</div>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100">
            {[showRequester?'신청자':'신청일','유형','기간','시간','사유','상태',''].filter(Boolean).map(h=>(
              <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-4 text-xs whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {data.map(r=>(
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                {showRequester
                  ? <td className="py-2 pr-4 font-medium">{(r.requester as any)?.name}</td>
                  : <td className="py-2 pr-4 text-xs text-gray-500">{r.created_at?.slice(0,10)}</td>
                }
                <td className="py-2 pr-4 text-xs">{r.type}</td>
                <td className="py-2 pr-4 text-xs whitespace-nowrap">{r.start_date}{r.end_date&&r.end_date!==r.start_date?' ~ '+r.end_date:''}</td>
                <td className="py-2 pr-4 text-xs text-gray-500 whitespace-nowrap">
                  {r.start_time&&r.end_time ? `${r.start_time}~${r.end_time}` : '-'}
                </td>
                <td className="py-2 pr-4 text-xs text-gray-500 max-w-[120px] truncate">{r.reason||'-'}</td>
                <td className="py-2 pr-4"><Badge s={r.status} /></td>
                <td className="py-2">
                  <div className="flex gap-1">
                    <button onClick={()=>setShowDetail(r)} className="btn-secondary text-xs px-2 py-1">조회</button>
                    {r.status==='pending' && r.requester_id===profile?.id && (
                      <button onClick={()=>handleCancel(r.id)} className="btn-danger text-xs px-2 py-1">취소</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )

  const approverName = approvers.find(a=>a.id===form.approverId)?.name || '-'
  const isMultiDay = ['연차','병가','출장','특별휴가'].includes(form.type)

  const tabs = [
    {key:'apply', label:'신청하기'},
    ...(profile?.role==='director' ? [{key:'all', label:'전체 신청현황'}] : []),
    {key:'mine', label:'내 신청현황'},
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">휴가·출장 신청</h1>
      {alert && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{alert}</div>}

      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {tabs.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${tab===t.key?'border-purple-600 text-purple-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==='apply' && (
        <div className="card max-w-lg">
          <div className="text-sm font-medium text-gray-700 mb-4">휴가·출장 신청서</div>
          <form onSubmit={handleApplyClick} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">신청 유형</label>
              <select className="input" value={form.type} onChange={e=>handleTypeChange(e.target.value)}>
                {TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>

            {/* 시작일 + 시작시간 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">시작일 *</label>
                <input type="date" className="input" value={form.start}
                  onChange={e=>setForm(f=>({...f,start:e.target.value,end:f.end||e.target.value}))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">시작 시간</label>
                <input type="time" className="input" value={form.startTime}
                  onChange={e=>setForm(f=>({...f,startTime:e.target.value}))} />
              </div>
            </div>

            {/* 종료일 + 종료시간 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  종료일 {!isMultiDay && <span className="text-gray-300">(당일이면 생략)</span>}
                </label>
                <input type="date" className="input" value={form.end}
                  onChange={e=>setForm(f=>({...f,end:e.target.value}))}
                  min={form.start} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">종료 시간</label>
                <input type="time" className="input" value={form.endTime}
                  onChange={e=>setForm(f=>({...f,endTime:e.target.value}))} />
              </div>
            </div>

            {/* 유형별 안내 */}
            {['반반차','반차(오전)','반차(오후)'].includes(form.type) && (
              <div className="text-xs text-purple-600 bg-purple-50 px-3 py-2 rounded-lg">
                {form.type === '반반차' && '⏰ 반반차: 09:00 ~ 11:00 (2시간)'}
                {form.type === '반차(오전)' && '⏰ 오전반차: 09:00 ~ 13:00 (4시간)'}
                {form.type === '반차(오후)' && '⏰ 오후반차: 13:00 ~ 18:00 (4시간)'}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">결재자</label>
              <select className="input" value={form.approverId}
                onChange={e=>setForm(f=>({...f,approverId:e.target.value}))}>
                {approvers.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">사유</label>
              <textarea className="input resize-none" rows={3}
                placeholder="사유를 상세히 입력해 주세요..."
                value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))} />
            </div>
            <div className="flex justify-end">
              <button type="submit" className="btn-primary">결재 상신</button>
            </div>
          </form>
        </div>
      )}

      {tab==='all' && profile?.role==='director' && <RequestTable data={allRequests} showRequester />}
      {tab==='mine' && <RequestTable data={myRequests} />}

      {/* 상신 확인 모달 */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
            <div className="p-5 border-b border-gray-100">
              <div className="text-base font-semibold text-gray-800">결재 상신 확인</div>
              <div className="text-xs text-gray-400 mt-1">아래 내용을 확인 후 상신해 주세요</div>
            </div>
            <div className="p-5 space-y-3">
              {[
                {label:'신청 유형', val:form.type},
                {label:'시작', val:`${form.start} ${form.startTime}`},
                {label:'종료', val:`${form.end||form.start} ${form.endTime}`},
                {label:'결재자', val:approverName},
                {label:'사유', val:form.reason||'(없음)'},
              ].map(item=>(
                <div key={item.label} className="flex gap-3">
                  <span className="text-xs font-medium text-gray-400 w-16 flex-shrink-0 pt-0.5">{item.label}</span>
                  <span className="text-sm text-gray-800 flex-1 whitespace-pre-wrap">{item.val}</span>
                </div>
              ))}
              <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
                ⚠️ 상신 후에는 결재자가 처리하기 전까지 취소 가능합니다
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={()=>setShowConfirm(false)} className="btn-secondary text-sm">다시 확인</button>
              <button onClick={handleSubmit} disabled={loading} className="btn-primary text-sm">
                {loading ? '처리 중...' : '확인, 상신합니다'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 문서 상세 모달 */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-base font-semibold text-gray-800">결재 문서 조회</div>
                <div className="text-xs text-gray-400 mt-0.5">{showDetail.created_at?.slice(0,16).replace('T',' ')} 신청</div>
              </div>
              <span className={showDetail.status==='pending'?'badge-pending':showDetail.status==='approved'?'badge-approved':'badge-rejected'}>
                {showDetail.status==='pending'?'대기':showDetail.status==='approved'?'승인':'반려'}
              </span>
            </div>
            <div className="p-5 space-y-3">
              {[
                {label:'신청자', val:(showDetail.requester as any)?.name || profile?.name},
                {label:'신청 유형', val:showDetail.type},
                {label:'시작', val:`${showDetail.start_date} ${showDetail.start_time||''}`},
                {label:'종료', val:`${showDetail.end_date||showDetail.start_date} ${showDetail.end_time||''}`},
                {label:'결재자', val:(showDetail.approver as any)?.name},
              ].map(item=>(
                <div key={item.label} className="flex gap-4 pb-3 border-b border-gray-50">
                  <span className="text-xs font-medium text-gray-400 w-16 flex-shrink-0 pt-0.5">{item.label}</span>
                  <span className="text-sm text-gray-800">{item.val}</span>
                </div>
              ))}
              <div>
                <div className="text-xs font-medium text-gray-400 mb-2">신청 사유</div>
                <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-800 whitespace-pre-wrap min-h-[60px] leading-relaxed">
                  {showDetail.reason || '(사유 없음)'}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={()=>setShowDetail(null)} className="btn-secondary text-sm">닫기</button>
              {profile?.role==='director' && showDetail.status==='pending' && (
                <>
                  <button onClick={()=>handleApprove(showDetail.id,'rejected')} className="btn-danger text-sm">반려</button>
                  <button onClick={()=>handleApprove(showDetail.id,'approved')}
                    className="btn-secondary text-sm text-green-700 border-green-200 hover:bg-green-50">승인</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

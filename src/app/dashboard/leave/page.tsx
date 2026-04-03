'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const TYPES = ['연차','반차(오전)','반차(오후)','병가','출장','외근','특별휴가']

export default function LeavePage() {
  const [profile, setProfile] = useState<any>(null)
  const [approvers, setApprovers] = useState<any[]>([])
  const [myRequests, setMyRequests] = useState<any[]>([])
  const [allRequests, setAllRequests] = useState<any[]>([])
  const [tab, setTab] = useState<'apply'|'mine'|'all'>('apply')
  const [form, setForm] = useState({type:'연차',start:'',end:'',approverId:'',reason:''})
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)  // 송신 확인 모달
  const [showDetail, setShowDetail] = useState<any>(null) // 문서 상세 조회

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
      .select('*, approver:approver_id(name)')
      .eq('requester_id', session.user.id).order('created_at',{ascending:false})
    setMyRequests(mine||[])
    if (p?.role === 'director') {
      const { data: all } = await supabase.from('approvals')
        .select('*, requester:requester_id(name,dept,color,tc), approver:approver_id(name)')
        .order('created_at',{ascending:false})
      setAllRequests(all||[])
    }
  }, [form.approverId])

  useEffect(() => { load() }, [load])

  function handleApplyClick(e: React.FormEvent) {
    e.preventDefault()
    if (!form.start || !form.approverId) return
    setShowConfirm(true) // 확인 모달 표시
  }

  async function handleSubmit() {
    setLoading(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await supabase.from('approvals').insert({
      requester_id: session.user.id, approver_id: form.approverId,
      type: form.type, start_date: form.start,
      end_date: form.end || form.start, reason: form.reason,
    })
    setAlert('결재 상신 완료')
    setForm(f=>({...f, reason:'', start:'', end:''}))
    setShowConfirm(false)
    load(); setLoading(false)
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

  const StatusBadge = ({s}: {s:string}) => (
    <span className={s==='pending'?'badge-pending':s==='approved'?'badge-approved':'badge-rejected'}>
      {s==='pending'?'대기':s==='approved'?'승인':'반려'}
    </span>
  )

  const approverName = approvers.find(a=>a.id===form.approverId)?.name || '-'

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">휴가·출장 신청</h1>
      {alert && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{alert}</div>}

      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {(['apply','mine', ...(profile?.role==='director'?['all']:[])] as const).map((t)=>(
          <button key={t} onClick={()=>setTab(t as 'apply'|'mine'|'all')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${tab===t?'border-purple-600 text-purple-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t==='apply'?'신청':t==='mine'?'내 신청 현황':'전체 현황'}
          </button>
        ))}
      </div>

      {tab === 'apply' && (
        <div className="card max-w-lg">
          <div className="text-sm font-medium text-gray-700 mb-4">휴가·출장 신청</div>
          <form onSubmit={handleApplyClick} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">신청 유형</label>
              <select className="input" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                {TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">시작일 *</label>
                <input type="date" className="input" value={form.start} onChange={e=>setForm(f=>({...f,start:e.target.value}))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">종료일</label>
                <input type="date" className="input" value={form.end} onChange={e=>setForm(f=>({...f,end:e.target.value}))} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">결재자</label>
              <select className="input" value={form.approverId} onChange={e=>setForm(f=>({...f,approverId:e.target.value}))}>
                {approvers.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">사유</label>
              <textarea className="input resize-none" rows={4} placeholder="사유를 상세히 입력해 주세요..."
                value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))} />
            </div>
            <div className="flex justify-end">
              <button type="submit" className="btn-primary">결재 상신</button>
            </div>
          </form>
        </div>
      )}

      {tab === 'mine' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">
              {['신청일','유형','기간','결재자','사유','상태',''].map(h=>(
                <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-4 text-xs">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {myRequests.length===0 && <tr><td colSpan={7} className="py-8 text-center text-gray-300 text-sm">신청 내역이 없습니다</td></tr>}
              {myRequests.map(r=>(
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 pr-4 text-xs text-gray-500">{r.created_at?.slice(0,10)}</td>
                  <td className="py-2 pr-4">{r.type}</td>
                  <td className="py-2 pr-4 text-xs">{r.start_date}{r.end_date!==r.start_date?' ~ '+r.end_date:''}</td>
                  <td className="py-2 pr-4 text-xs">{(r.approver as any)?.name}</td>
                  <td className="py-2 pr-4 text-xs text-gray-500 max-w-xs truncate">{r.reason||'-'}</td>
                  <td className="py-2 pr-4"><StatusBadge s={r.status} /></td>
                  <td className="py-2 flex gap-1">
                    <button onClick={()=>setShowDetail(r)} className="btn-secondary text-xs px-2 py-1">조회</button>
                    {r.status==='pending' && (
                      <button onClick={()=>handleCancel(r.id)} className="btn-danger text-xs px-2 py-1">취소</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'all' && profile?.role==='director' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">
              {['신청자','유형','기간','사유','상태',''].map(h=>(
                <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-4 text-xs">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {allRequests.length===0 && <tr><td colSpan={6} className="py-8 text-center text-gray-300 text-sm">신청 내역이 없습니다</td></tr>}
              {allRequests.map(r=>(
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 pr-4 font-medium">{(r.requester as any)?.name}</td>
                  <td className="py-2 pr-4">{r.type}</td>
                  <td className="py-2 pr-4 text-xs">{r.start_date}{r.end_date!==r.start_date?' ~ '+r.end_date:''}</td>
                  <td className="py-2 pr-4 text-xs text-gray-500 max-w-xs truncate">{r.reason||'-'}</td>
                  <td className="py-2 pr-4"><StatusBadge s={r.status} /></td>
                  <td className="py-2">
                    <button onClick={()=>setShowDetail(r)} className="btn-secondary text-xs px-2 py-1">조회</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ━━━ 송신 확인 모달 ━━━ */}
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
                {label:'기간', val:`${form.start}${form.end&&form.end!==form.start?' ~ '+form.end:''}`},
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

      {/* ━━━ 결재 문서 상세 조회 모달 ━━━ */}
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
            <div className="p-5 space-y-4">
              {[
                {label:'신청자', val:(showDetail.requester as any)?.name || profile?.name},
                {label:'신청 유형', val:showDetail.type},
                {label:'기간', val:`${showDetail.start_date}${showDetail.end_date!==showDetail.start_date?' ~ '+showDetail.end_date:''}`},
                {label:'결재자', val:(showDetail.approver as any)?.name},
              ].map(item=>(
                <div key={item.label} className="flex gap-4 pb-3 border-b border-gray-50 last:border-0">
                  <span className="text-xs font-medium text-gray-400 w-16 flex-shrink-0 pt-0.5">{item.label}</span>
                  <span className="text-sm text-gray-800">{item.val}</span>
                </div>
              ))}
              <div>
                <div className="text-xs font-medium text-gray-400 mb-2">신청 사유</div>
                <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-800 whitespace-pre-wrap min-h-[60px]">
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

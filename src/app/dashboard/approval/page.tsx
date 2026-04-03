'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

export default function ApprovalPage() {
  const [profile, setProfile] = useState<any>(null)
  const [inbox, setInbox] = useState<any[]>([])
  const [sent, setSent] = useState<any[]>([])
  const [tab, setTab] = useState<'inbox'|'sent'>('inbox')
  const [alert, setAlert] = useState('')
  const [showDetail, setShowDetail] = useState<any>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    if (p?.role === 'director') {
      const { data } = await supabase.from('approvals')
        .select('*, requester:requester_id(name,dept,color,tc)')
        .eq('approver_id', session.user.id).eq('status','pending')
        .order('created_at',{ascending:false})
      setInbox(data||[])
    }
    const { data: s } = await supabase.from('approvals')
      .select('*, approver:approver_id(name)')
      .eq('requester_id', session.user.id).order('created_at',{ascending:false})
    setSent(s||[])
  }, [])

  useEffect(() => { load() }, [load])

  async function handle(id: string, status: 'approved'|'rejected') {
    const supabase = createClient()
    await supabase.from('approvals').update({status, updated_at: new Date().toISOString()}).eq('id',id)
    setAlert(status==='approved'?'승인되었습니다.':'반려되었습니다.')
    setShowDetail(null); load()
    setTimeout(()=>setAlert(''),3000)
  }

  const Badge = ({s}:{s:string}) => (
    <span className={s==='pending'?'badge-pending':s==='approved'?'badge-approved':'badge-rejected'}>
      {s==='pending'?'대기':s==='approved'?'승인':'반려'}
    </span>
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">결재함</h1>
      {alert && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{alert}</div>}

      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {(['inbox','sent'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors relative
              ${tab===t?'border-purple-600 text-purple-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t==='inbox'?'받은 결재':'보낸 결재'}
            {t==='inbox' && inbox.length>0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{inbox.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'inbox' && (
        <div className="card overflow-x-auto">
          {profile?.role !== 'director' ? (
            <div className="py-12 text-center text-gray-300 text-sm">결재 권한이 없습니다</div>
          ) : inbox.length === 0 ? (
            <div className="py-12 text-center text-gray-300 text-sm">대기 중인 결재가 없습니다</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                {['신청자','부서','유형','기간','신청일',''].map(h=>(
                  <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-4 text-xs">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {inbox.map(r=>(
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-4 font-medium">{(r.requester as any)?.name}</td>
                    <td className="py-2 pr-4 text-xs text-gray-500">{(r.requester as any)?.dept}</td>
                    <td className="py-2 pr-4">{r.type}</td>
                    <td className="py-2 pr-4 text-xs">{r.start_date}{r.end_date!==r.start_date?' ~ '+r.end_date:''}</td>
                    <td className="py-2 pr-4 text-xs text-gray-400">{r.created_at?.slice(0,10)}</td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        <button onClick={()=>setShowDetail(r)} className="btn-secondary text-xs px-2 py-1">문서 열기</button>
                        <button onClick={()=>handle(r.id,'approved')} className="btn-secondary text-xs px-2 py-1 text-green-700 border-green-200 hover:bg-green-50">승인</button>
                        <button onClick={()=>handle(r.id,'rejected')} className="btn-danger text-xs px-2 py-1">반려</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'sent' && (
        <div className="card overflow-x-auto">
          {sent.length === 0 ? (
            <div className="py-12 text-center text-gray-300 text-sm">상신 내역이 없습니다</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                {['신청일','유형','기간','결재자','상태',''].map(h=>(
                  <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-4 text-xs">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {sent.map(r=>(
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-4 text-xs text-gray-500">{r.created_at?.slice(0,10)}</td>
                    <td className="py-2 pr-4">{r.type}</td>
                    <td className="py-2 pr-4 text-xs">{r.start_date}{r.end_date!==r.start_date?' ~ '+r.end_date:''}</td>
                    <td className="py-2 pr-4 text-xs">{(r.approver as any)?.name}</td>
                    <td className="py-2 pr-4"><Badge s={r.status} /></td>
                    <td className="py-2">
                      <button onClick={()=>setShowDetail(r)} className="btn-secondary text-xs px-2 py-1">문서 열기</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 결재 문서 상세 모달 */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-base font-semibold text-gray-800">결재 문서</div>
                <div className="text-xs text-gray-400 mt-0.5">{showDetail.created_at?.slice(0,16).replace('T',' ')} 신청</div>
              </div>
              <Badge s={showDetail.status} />
            </div>
            <div className="p-5 space-y-3">
              {[
                {label:'신청자', val:(showDetail.requester as any)?.name || profile?.name},
                {label:'부서', val:(showDetail.requester as any)?.dept || profile?.dept},
                {label:'유형', val:showDetail.type},
                {label:'기간', val:`${showDetail.start_date}${showDetail.end_date!==showDetail.start_date?' ~ '+showDetail.end_date:''}`},
                {label:'결재자', val:(showDetail.approver as any)?.name},
              ].map(item=>(
                <div key={item.label} className="flex gap-4 pb-3 border-b border-gray-50">
                  <span className="text-xs font-medium text-gray-400 w-14 flex-shrink-0 pt-0.5">{item.label}</span>
                  <span className="text-sm text-gray-800">{item.val}</span>
                </div>
              ))}
              <div>
                <div className="text-xs font-medium text-gray-400 mb-2">신청 사유</div>
                <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-800 whitespace-pre-wrap min-h-[80px] leading-relaxed">
                  {showDetail.reason || '(사유 없음)'}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={()=>setShowDetail(null)} className="btn-secondary text-sm">닫기</button>
              {profile?.role==='director' && showDetail.status==='pending' && (
                <>
                  <button onClick={()=>handle(showDetail.id,'rejected')} className="btn-danger text-sm">반려</button>
                  <button onClick={()=>handle(showDetail.id,'approved')}
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

'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

export default function ApprovalPage() {
  const [profile, setProfile] = useState<any>(null)
  const [all, setAll] = useState<any[]>([])
  const [inbox, setInbox] = useState<any[]>([])
  const [sent, setSent] = useState<any[]>([])
  const [tab, setTab] = useState<'all'|'inbox'|'sent'>('inbox')
  const [alert, setAlert] = useState('')
  const [showDetail, setShowDetail] = useState<any>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    // 보낸 결재
    const { data: s } = await supabase.from('approvals')
      .select('*, requester:requester_id(name,dept,color,tc), approver:approver_id(name)')
      .eq('requester_id', session.user.id).order('created_at',{ascending:false})
    setSent(s||[])
    if (p?.role === 'director') {
      // 받은 결재 (대기)
      const { data: ib } = await supabase.from('approvals')
        .select('*, requester:requester_id(name,dept,color,tc), approver:approver_id(name)')
        .eq('approver_id', session.user.id).eq('status','pending').order('created_at',{ascending:false})
      setInbox(ib||[])
      // 전체 결재
      const { data: a } = await supabase.from('approvals')
        .select('*, requester:requester_id(name,dept,color,tc), approver:approver_id(name)')
        .order('created_at',{ascending:false})
      setAll(a||[])
      setTab('inbox')
    } else {
      setTab('sent')
    }
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

  const ApprovalTable = ({data, showRequester=false}: {data:any[], showRequester?:boolean}) => (
    <div className="card overflow-x-auto">
      {data.length===0 ? (
        <div className="py-12 text-center text-gray-300 text-sm">내역이 없습니다</div>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100">
            {[showRequester?'신청자':'', '유형','기간','사유','결재자','상태',''].filter(Boolean).map(h=>(
              <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-4 text-xs whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {data.map(r=>(
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                {showRequester && <td className="py-2 pr-4 font-medium text-sm">{(r.requester as any)?.name}</td>}
                <td className="py-2 pr-4 text-xs">{r.type}</td>
                <td className="py-2 pr-4 text-xs whitespace-nowrap">{r.start_date}{r.end_date!==r.start_date?' ~ '+r.end_date:''}</td>
                <td className="py-2 pr-4 text-xs text-gray-500 max-w-[160px] truncate">{r.reason||'-'}</td>
                <td className="py-2 pr-4 text-xs">{(r.approver as any)?.name}</td>
                <td className="py-2 pr-4"><Badge s={r.status} /></td>
                <td className="py-2">
                  <div className="flex gap-1">
                    <button onClick={()=>setShowDetail(r)} className="btn-secondary text-xs px-2 py-1">문서 열기</button>
                    {profile?.role==='director' && r.status==='pending' && (
                      <>
                        <button onClick={()=>handle(r.id,'approved')} className="btn-secondary text-xs px-2 py-1 text-green-700 border-green-200 hover:bg-green-50">승인</button>
                        <button onClick={()=>handle(r.id,'rejected')} className="btn-danger text-xs px-2 py-1">반려</button>
                      </>
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

  const tabs = profile?.role==='director'
    ? [{key:'inbox',label:'받은 결재',count:inbox.length},{key:'sent',label:'보낸 결재',count:0},{key:'all',label:'전체 결재',count:0}]
    : [{key:'sent',label:'내 결재 현황',count:0}]

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">결재함</h1>
      {alert && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{alert}</div>}

      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {tabs.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5
              ${tab===t.key?'border-purple-600 text-purple-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            {t.count>0 && <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab==='inbox' && <ApprovalTable data={inbox} showRequester />}
      {tab==='sent'  && <ApprovalTable data={sent} />}
      {tab==='all'   && <ApprovalTable data={all} showRequester />}

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

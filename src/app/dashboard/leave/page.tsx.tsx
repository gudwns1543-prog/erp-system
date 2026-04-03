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

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const { data: dirs } = await supabase.from('profiles').select('id,name').eq('role','director')
    setApprovers(dirs || [])
    if (dirs?.[0] && !form.approverId) setForm(f=>({...f, approverId: dirs[0].id}))
    const { data: mine } = await supabase.from('approvals')
      .select('*, approver:approver_id(name)')
      .eq('requester_id', session.user.id).order('created_at',{ascending:false})
    setMyRequests(mine || [])
    if (p?.role === 'director') {
      const { data: all } = await supabase.from('approvals')
        .select('*, requester:requester_id(name), approver:approver_id(name)')
        .order('created_at',{ascending:false})
      setAllRequests(all || [])
    }
  }, [form.approverId])

  useEffect(() => { load() }, [load])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.start || !form.approverId) return
    setLoading(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await supabase.from('approvals').insert({
      requester_id: session.user.id,
      approver_id:  form.approverId,
      type: form.type, start_date: form.start,
      end_date: form.end || form.start, reason: form.reason,
    })
    setAlert('결재 상신 완료')
    setForm(f=>({...f, reason:'', start:'', end:''}))
    load()
    setLoading(false)
    setTimeout(()=>setAlert(''), 3000)
  }

  async function handleApprove(id: string, status: 'approved'|'rejected') {
    const supabase = createClient()
    await supabase.from('approvals').update({status, updated_at: new Date().toISOString()}).eq('id', id)
    setAlert(status === 'approved' ? '승인되었습니다.' : '반려되었습니다.')
    load()
    setTimeout(()=>setAlert(''), 3000)
  }

  async function handleCancel(id: string) {
    const supabase = createClient()
    await supabase.from('approvals').delete().eq('id', id)
    load()
  }

  const StatusBadge = ({s}: {s:string}) => (
    <span className={s==='pending'?'badge-pending':s==='approved'?'badge-approved':'badge-rejected'}>
      {s==='pending'?'대기':s==='approved'?'승인':'반려'}
    </span>
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">휴가·출장 신청</h1>
      {alert && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{alert}</div>}

      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {(['apply','mine', ...(profile?.role==='director'?['all']:[])]).map((t)=>(
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
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">신청 유형</label>
              <select className="input" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                {TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">시작일</label>
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
              <textarea className="input resize-none" rows={3} placeholder="사유를 입력하세요..."
                value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))} />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={loading} className="btn-primary">결재 상신</button>
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
              {myRequests.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-gray-300 text-sm">신청 내역이 없습니다</td></tr>}
              {myRequests.map(r=>(
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="py-2 pr-4 text-xs text-gray-500">{r.created_at?.slice(0,10)}</td>
                  <td className="py-2 pr-4">{r.type}</td>
                  <td className="py-2 pr-4 text-xs">{r.start_date}{r.end_date!==r.start_date?' ~ '+r.end_date:''}</td>
                  <td className="py-2 pr-4 text-xs">{(r.approver as any)?.name}</td>
                  <td className="py-2 pr-4 text-xs text-gray-500 max-w-xs truncate">{r.reason}</td>
                  <td className="py-2 pr-4"><StatusBadge s={r.status} /></td>
                  <td className="py-2">
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

      {tab === 'all' && profile?.role === 'director' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">
              {['신청자','유형','기간','결재자','사유','상태','결재'].map(h=>(
                <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-4 text-xs">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {allRequests.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-gray-300 text-sm">신청 내역이 없습니다</td></tr>}
              {allRequests.map(r=>(
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="py-2 pr-4">{(r.requester as any)?.name}</td>
                  <td className="py-2 pr-4">{r.type}</td>
                  <td className="py-2 pr-4 text-xs">{r.start_date}{r.end_date!==r.start_date?' ~ '+r.end_date:''}</td>
                  <td className="py-2 pr-4 text-xs">{(r.approver as any)?.name}</td>
                  <td className="py-2 pr-4 text-xs text-gray-500 max-w-xs truncate">{r.reason}</td>
                  <td className="py-2 pr-4"><StatusBadge s={r.status} /></td>
                  <td className="py-2">
                    {r.status==='pending' && (
                      <div className="flex gap-1">
                        <button onClick={()=>handleApprove(r.id,'approved')} className="btn-secondary text-xs px-2 py-1 text-green-700 border-green-200">승인</button>
                        <button onClick={()=>handleApprove(r.id,'rejected')} className="btn-danger text-xs px-2 py-1">반려</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

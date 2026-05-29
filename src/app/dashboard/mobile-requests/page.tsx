
'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

function label(t:string) {
  if (t === 'business_trip') return '🚗 출장'
  if (t === 'training') return '🎓 교육'
  if (t === 'exception') return '⚠️ 예외'
  return '🏃 외근'
}
export default function MobileRequestsPage() {
  const [rows, setRows] = useState<any[]>([])
  const [tab, setTab] = useState<'pending'|'approved'|'rejected'>('pending')
  const [loading, setLoading] = useState(true)
  const [alert, setAlert] = useState('')
  const [memo, setMemo] = useState('')
  async function token() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || null
  }
  async function load(status = tab) {
    setLoading(true)
    const t = await token()
    if (!t) return
    const res = await fetch(`/api/mobile-attendance/admin?status=${status}`, { headers: { Authorization: `Bearer ${t}` } })
    const json = await res.json()
    if (!res.ok) setAlert(json.error || '조회 실패')
    else setRows(json.requests || [])
    setLoading(false)
  }
  useEffect(() => { load(tab) }, [tab])
  async function handle(id: string, action: 'approve'|'reject') {
    if (action === 'approve' && !confirm('승인하면 신청 시각으로 근태 출근 기록이 생성됩니다. 승인할까요?')) return
    if (action === 'reject' && !confirm('이 모바일 출근 신청을 반려할까요?')) return
    const t = await token(); if (!t) return
    const res = await fetch('/api/mobile-attendance/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ id, action, adminNote: memo }) })
    const json = await res.json()
    if (!res.ok) setAlert('⚠️ ' + (json.error || '처리 실패'))
    else { setAlert('✅ ' + json.message); setMemo(''); load() }
    setTimeout(()=>setAlert(''),4000)
  }
  return <div className="p-6 max-w-6xl mx-auto">
    <h1 className="text-lg font-semibold text-gray-800 mb-1">모바일 출근 승인</h1>
    <p className="text-xs text-gray-400 mb-5">회사 밖 모바일 출근 신청의 유형, GPS, IP, 사유를 확인하고 승인/반려합니다.</p>
    {alert && <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">{alert}</div>}
    <div className="card p-4 mb-4">
      <div className="flex gap-2 mb-4">{[['pending','승인 대기'],['approved','승인 완료'],['rejected','반려']].map(([k,l]) => <button key={k} onClick={()=>setTab(k as any)} className={`px-4 py-2 rounded-xl text-sm ${tab===k?'bg-purple-600 text-white':'bg-gray-100 text-gray-500'}`}>{l}</button>)}</div>
      <input value={memo} onChange={e=>setMemo(e.target.value)} placeholder="관리자 메모 선택 입력" className="input" />
    </div>
    <div className="space-y-3">
      {loading && <div className="card p-6 text-center text-gray-400 text-sm">조회 중...</div>}
      {!loading && rows.length===0 && <div className="card p-8 text-center text-gray-400 text-sm">표시할 신청 건이 없습니다.</div>}
      {rows.map(r => <div key={r.id} className="card p-4">
        <div className="flex justify-between gap-4">
          <div><div className="font-semibold text-gray-800">{r.user?.name || '-'} <span className="text-xs text-gray-400 font-normal">{r.user?.dept} · {r.user?.grade}</span></div>
          <div className="text-sm text-gray-600 mt-1">{r.work_date} {r.requested_time?.slice(0,5)} · {label(r.request_type)} 출근</div>
          <div className="mt-2 text-sm bg-gray-50 rounded-xl p-3 text-gray-700 whitespace-pre-line">{r.reason}</div></div>
          <span className={`text-xs px-3 py-1 rounded-full h-fit ${r.status==='pending'?'bg-amber-100 text-amber-700':r.status==='approved'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{r.status}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4 text-xs">
          <Info label="IP" value={r.source_ip || '-'} /><Info label="거리" value={r.distance_meters == null ? '-' : `${r.distance_meters}m`} /><Info label="GPS" value={r.accuracy ? `±${Math.round(r.accuracy)}m` : '-'} /><Info label="판단" value={r.decision_reason || '-'} />
        </div>
        {r.status==='pending' && <div className="flex justify-end gap-2 mt-4"><button onClick={()=>handle(r.id,'reject')} className="btn-danger text-xs px-3 py-1.5">반려</button><button onClick={()=>handle(r.id,'approve')} className="btn-secondary text-xs px-3 py-1.5 text-green-700 border-green-200 hover:bg-green-50">승인</button></div>}
      </div>)}
    </div>
  </div>
}
function Info({label,value}:{label:string,value:any}) { return <div className="bg-gray-50 rounded-lg p-2"><div className="text-gray-400 mb-0.5">{label}</div><div className="text-gray-700 break-all">{value}</div></div> }

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

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
    if (action === 'reject' && !confirm('이 모바일 출근 신청을 반려할까요?')) return
    if (action === 'approve' && !confirm('승인하면 해당 시간으로 근태 출근 기록이 생성됩니다. 승인할까요?')) return
    const t = await token()
    if (!t) return
    const res = await fetch('/api/mobile-attendance/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ id, action, adminNote: memo }),
    })
    const json = await res.json()
    if (!res.ok) setAlert('⚠️ ' + (json.error || '처리 실패'))
    else {
      setAlert('✅ ' + json.message)
      setMemo('')
      load()
    }
    setTimeout(() => setAlert(''), 4000)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">모바일 출근 승인</h1>
          <p className="text-xs text-gray-400 mt-1">회사 밖 모바일 출근 신청의 GPS, IP, 기기정보, 사유를 확인하고 승인/반려합니다.</p>
        </div>
      </div>
      {alert && <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">{alert}</div>}

      <div className="card p-4 mb-4">
        <div className="flex gap-2 mb-4">
          {[
            ['pending','승인 대기'], ['approved','승인 완료'], ['rejected','반려']
          ].map(([k,l]) => <button key={k} onClick={() => setTab(k as any)} className={`px-4 py-2 rounded-xl text-sm ${tab===k?'bg-purple-600 text-white':'bg-gray-100 text-gray-500'}`}>{l}</button>)}
        </div>
        <input value={memo} onChange={e=>setMemo(e.target.value)} placeholder="관리자 메모 선택 입력" className="input mb-2" />
        <div className="text-xs text-gray-400">승인 시 신청 시각이 출근 시각으로 근태 기록에 반영됩니다.</div>
      </div>

      <div className="space-y-3">
        {loading && <div className="card p-6 text-center text-gray-400 text-sm">조회 중...</div>}
        {!loading && rows.length === 0 && <div className="card p-8 text-center text-gray-400 text-sm">표시할 신청 건이 없습니다.</div>}
        {rows.map(r => (
          <div key={r.id} className="card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: r.user?.color || '#EEEDFE', color: r.user?.tc || '#3C3489' }}>
                  {r.user?.name?.[0] || '?'}
                </div>
                <div>
                  <div className="font-semibold text-gray-800">{r.user?.name || '-'} <span className="text-xs text-gray-400 font-normal">{r.user?.dept} · {r.user?.grade}</span></div>
                  <div className="text-sm text-gray-600 mt-1">{r.work_date} {r.requested_time?.slice(0,5)} · {r.request_type === 'business_trip' ? '출장' : r.request_type === 'exception' ? '예외' : '외근'} 출근</div>
                  <div className="mt-2 text-sm bg-gray-50 rounded-xl p-3 text-gray-700 whitespace-pre-line">{r.reason}</div>
                </div>
              </div>
              <span className={`text-xs px-3 py-1 rounded-full ${r.status==='pending'?'bg-amber-100 text-amber-700':r.status==='approved'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{r.status}</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4 text-xs">
              <Info label="IP" value={r.source_ip || '-'} />
              <Info label="모바일" value={r.is_mobile ? '예' : '아니오'} />
              <Info label="회사와 거리" value={r.distance_meters === null || r.distance_meters === undefined ? '-' : `${r.distance_meters}m`} />
              <Info label="GPS 정확도" value={r.accuracy ? `약 ${Math.round(r.accuracy)}m` : '-'} />
              <Info label="판단 사유" value={r.decision_reason || '-'} wide />
              <Info label="기기정보" value={r.user_agent || '-'} wide />
            </div>
            {r.latitude && r.longitude && <a className="inline-block mt-3 text-xs text-blue-600 hover:underline" target="_blank" href={`https://maps.google.com/?q=${r.latitude},${r.longitude}`}>지도에서 위치 보기</a>}
            {tab === 'pending' && <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => handle(r.id, 'reject')} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm">반려</button>
              <button onClick={() => handle(r.id, 'approve')} className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm">승인</button>
            </div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function Info({ label, value, wide }: { label: string, value: any, wide?: boolean }) {
  return <div className={`bg-gray-50 rounded-xl p-2 ${wide ? 'col-span-2' : ''}`}>
    <div className="text-gray-400 mb-1">{label}</div>
    <div className="text-gray-700 break-all">{value}</div>
  </div>
}

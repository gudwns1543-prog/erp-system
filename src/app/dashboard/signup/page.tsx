'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

export default function SignupPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [approved, setApproved] = useState<any[]>([])
  const [alert, setAlert] = useState('')
  const [alertType, setAlertType] = useState<'success'|'error'>('success')
  const [loading, setLoading] = useState<string|null>(null)
  const [tab, setTab] = useState<'pending'|'done'>('pending')

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: pending } = await supabase.from('signup_requests').select('*')
      .eq('status','pending').order('created_at',{ascending:false})
    setRequests(pending||[])
    const { data: done } = await supabase.from('signup_requests').select('*')
      .in('status',['approved','rejected']).order('created_at',{ascending:false}).limit(20)
    setApproved(done||[])
  }, [])

  useEffect(() => { load() }, [load])

  async function approve(req: any) {
    setLoading(req.id)
    try {
      const res = await fetch('/api/approve-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: req.id,
          email: req.email,
          name: req.name,
          dept: req.dept,
          tel: req.tel,
        })
      })
      const data = await res.json()
      if (data.error) {
        setAlert(`오류: ${data.error}`)
        setAlertType('error')
      } else if (data.existing) {
        setAlert(`✅ ${req.name}님 기존 계정 활성화 완료!`)
        setAlertType('success')
      } else {
        setAlert(`✅ ${req.name}님 승인 완료!\n\n임시 비밀번호: ${data.tempPassword}\n\n직원에게 전달해 주세요.`)
        setAlertType('success')
      }
      load()
    } catch (e) {
      setAlert('네트워크 오류가 발생했습니다.')
      setAlertType('error')
    }
    setLoading(null)
    setTimeout(()=>setAlert(''), 15000)
  }

  async function reject(id: string, name: string) {
    if (!confirm(`${name}님의 가입 신청을 거절하시겠습니까?`)) return
    const supabase = createClient()
    await supabase.from('signup_requests').update({status:'rejected'}).eq('id',id)
    load()
  }

  const StatusBadge = ({s}:{s:string}) => (
    <span className={s==='pending'?'badge-pending':s==='approved'?'badge-approved':'badge-rejected'}>
      {s==='pending'?'대기':s==='approved'?'승인':'거절'}
    </span>
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">가입 승인</h1>

      {alert && (
        <div className={`mb-4 p-4 rounded-lg text-sm whitespace-pre-line border
          ${alertType==='success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-700'}`}>
          {alert}
        </div>
      )}

      <div className="card mb-4 p-4 bg-blue-50 border-blue-200">
        <div className="text-xs text-blue-700 leading-relaxed">
          <strong>📌 자동 승인 안내</strong><br/>
          승인 버튼 클릭 시 자동으로 계정이 생성되고 임시 비밀번호가 발급됩니다.<br/>
          임시 비밀번호를 직원에게 전달하면 바로 로그인 가능합니다.
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {(['pending','done'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors relative
              ${tab===t?'border-purple-600 text-purple-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t==='pending'?'대기 중':'처리 완료'}
            {t==='pending' && requests.length>0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{requests.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab==='pending' && (
        <div className="card overflow-x-auto">
          {requests.length===0 ? (
            <div className="py-12 text-center text-gray-300 text-sm">대기 중인 가입 신청이 없습니다</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                {['이름','이메일','연락처','희망 부서','신청일','처리'].map(h=>(
                  <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-4 text-xs">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {requests.map(r=>(
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-4 font-medium">{r.name}</td>
                    <td className="py-2 pr-4 text-xs text-gray-500">{r.email}</td>
                    <td className="py-2 pr-4 text-xs text-gray-500">{r.tel||'-'}</td>
                    <td className="py-2 pr-4">{r.dept}</td>
                    <td className="py-2 pr-4 text-xs text-gray-400">{r.created_at?.slice(0,10)}</td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={()=>approve(r)}
                          disabled={loading===r.id}
                          className="btn-secondary text-xs px-3 py-1 text-green-700 border-green-200 hover:bg-green-50 disabled:opacity-50">
                          {loading===r.id ? '처리 중...' : '✅ 승인'}
                        </button>
                        <button onClick={()=>reject(r.id, r.name)} className="btn-danger text-xs px-2 py-1">거절</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab==='done' && (
        <div className="card overflow-x-auto">
          {approved.length===0 ? (
            <div className="py-12 text-center text-gray-300 text-sm">처리된 신청이 없습니다</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                {['이름','이메일','부서','신청일','상태'].map(h=>(
                  <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-4 text-xs">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {approved.map(r=>(
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="py-2 pr-4 font-medium">{r.name}</td>
                    <td className="py-2 pr-4 text-xs text-gray-500">{r.email}</td>
                    <td className="py-2 pr-4">{r.dept}</td>
                    <td className="py-2 pr-4 text-xs text-gray-400">{r.created_at?.slice(0,10)}</td>
                    <td className="py-2"><StatusBadge s={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

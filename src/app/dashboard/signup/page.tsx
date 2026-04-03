'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

export default function SignupPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [alert, setAlert] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('signup_requests').select('*')
      .eq('status','pending').order('created_at',{ascending:false})
    setRequests(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  async function approve(req: any) {
    const supabase = createClient()
    // Supabase Auth에 사용자 생성 (Admin API - 서버사이드에서 해야 하나 여기선 안내)
    // 실제로는 API Route에서 처리
    await supabase.from('signup_requests').update({status:'approved'}).eq('id', req.id)
    setAlert(`${req.name}님 승인 완료. Supabase에서 직접 계정 생성 후 profiles 테이블에서 status를 active로 변경해 주세요.`)
    load()
    setTimeout(()=>setAlert(''), 8000)
  }

  async function reject(id: string) {
    const supabase = createClient()
    await supabase.from('signup_requests').update({status:'rejected'}).eq('id', id)
    load()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">가입 승인</h1>
      {alert && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 leading-relaxed">{alert}</div>
      )}
      <div className="card mb-4 p-4 bg-amber-50 border-amber-200">
        <div className="text-xs text-amber-700 leading-relaxed">
          <strong>📌 가입 승인 절차</strong><br/>
          1. 아래 신청자 확인 후 승인 클릭<br/>
          2. Supabase 대시보드 → Authentication → Users → Invite user (이메일 입력)<br/>
          3. profiles 테이블에서 해당 사용자 status를 <code>active</code>로 변경<br/>
          4. salary_info 테이블에 급여 정보 등록
        </div>
      </div>
      <div className="card overflow-x-auto">
        {requests.length === 0 ? (
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
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="py-2 pr-4 font-medium">{r.name}</td>
                  <td className="py-2 pr-4 text-xs text-gray-500">{r.email}</td>
                  <td className="py-2 pr-4 text-xs text-gray-500">{r.tel}</td>
                  <td className="py-2 pr-4">{r.dept}</td>
                  <td className="py-2 pr-4 text-xs text-gray-400">{r.created_at?.slice(0,10)}</td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <button onClick={()=>approve(r)} className="btn-secondary text-xs px-2 py-1 text-green-700 border-green-200 hover:bg-green-50">승인</button>
                      <button onClick={()=>reject(r.id)} className="btn-danger text-xs px-2 py-1">거절</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

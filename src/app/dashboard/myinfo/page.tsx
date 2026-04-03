'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { formatWon } from '@/lib/attendance'

export default function MyInfoPage() {
  const [profile, setProfile] = useState<any>(null)
  const [salary, setSalary] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      setProfile(p)
      const { data: s } = await supabase.from('salary_info').select('*').eq('user_id', session.user.id).single()
      setSalary(s)
    })
  }, [])

  if (!profile) return <div className="p-6 text-gray-400 text-sm">로딩 중...</div>

  const fields = [
    ['이름', profile.name], ['직급', profile.grade],
    ['부서', profile.dept], ['입사일', profile.join_date],
    ['이메일', profile.email], ['연락처', profile.tel||'-'],
    ['권한', profile.role==='director'?'관리자':'일반직원'], ['상태', '재직'],
  ]

  const payFields = salary ? [
    ['연봉', formatWon(salary.annual)],
    ['월 기본급', formatWon(salary.annual/12)],
    ['기본 시간단가', Math.round(salary.annual/12/209).toLocaleString()+'원/h'],
    ['부양가족', salary.dependents+'명'],
    ['식대', formatWon(salary.meal)],
    ['교통비', formatWon(salary.transport)],
    ['통신비', formatWon(salary.comm)],
  ] : null

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">내 정보</h1>
      <div className="grid grid-cols-3 gap-4 items-start">
        {/* 프로필 카드 */}
        <div className="card text-center py-6">
          <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center text-2xl font-bold"
            style={{background:profile.color||'#EEEDFE', color:profile.tc||'#3C3489'}}>
            {profile.name?.[0]}
          </div>
          <div className="text-base font-semibold text-gray-800">{profile.name}</div>
          <div className="text-xs text-gray-400 mt-1">{profile.grade} · {profile.dept}</div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="text-xs text-gray-400 mb-1">잔여 연차</div>
            <div className="text-2xl font-bold text-purple-600">{profile.annual_leave}</div>
            <div className="text-xs text-gray-400">일</div>
          </div>
          <div className="mt-4 p-2.5 bg-amber-50 rounded-lg">
            <div className="text-xs text-amber-700">정보 수정이 필요하면<br/>관리자에게 문의하세요</div>
          </div>
        </div>
        {/* 상세 정보 */}
        <div className="col-span-2 space-y-4">
          <div className="card">
            <div className="text-sm font-medium text-gray-700 mb-3">기본 인사정보</div>
            <div className="grid grid-cols-2 gap-0">
              {fields.map(([l,v])=>(
                <div key={l} className="py-2.5 border-b border-gray-50 pr-4">
                  <div className="text-xs text-gray-400 mb-0.5">{l}</div>
                  <div className="text-sm font-medium text-gray-800">{v}</div>
                </div>
              ))}
            </div>
          </div>
          {payFields && (
            <div className="card">
              <div className="text-sm font-medium text-gray-700 mb-1">급여 정보</div>
              <div className="text-xs text-gray-400 mb-3">💡 상세 내역은 내 급여명세서에서 확인하세요</div>
              <div className="grid grid-cols-2 gap-0">
                {payFields.map(([l,v])=>(
                  <div key={l} className="py-2.5 border-b border-gray-50 pr-4">
                    <div className="text-xs text-gray-400 mb-0.5">{l}</div>
                    <div className="text-sm font-medium text-gray-800">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

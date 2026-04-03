'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
      setLoading(false)
    } else {
      router.replace('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60" width="48" height="24">
              <rect x="2" y="2" width="54" height="54" rx="6" fill="#2E7FA3"/>
              <rect x="16" y="14" width="7" height="10" rx="3.5" fill="white"/>
              <rect x="35" y="14" width="7" height="10" rx="3.5" fill="white"/>
              <path d="M14 34 Q29 48 44 34" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round"/>
              <rect x="64" y="2" width="54" height="54" rx="6" fill="#A8D4E8"/>
              <rect x="78" y="14" width="7" height="10" rx="3.5" fill="white"/>
              <rect x="97" y="14" width="7" height="10" rx="3.5" fill="white"/>
              <path d="M76 34 Q91 48 106 34" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round"/>
            </svg>
            <div className="text-2xl font-bold text-gray-900 tracking-tight">(주)솔루션 ERP</div>
          </div>
          <div className="text-sm text-gray-500 mt-1">인사·급여 통합 관리 시스템</div>
        </div>
        <div className="card p-7">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">이메일</label>
              <input type="email" className="input" placeholder="example@company.com"
                value={email} onChange={e=>setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">비밀번호</label>
              <div className="relative">
                <input type={showPw?'text':'password'} className="input pr-16"
                  placeholder="비밀번호를 입력하세요"
                  value={password} onChange={e=>setPassword(e.target.value)} required />
                <button type="button" onClick={()=>setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">
                  {showPw?'숨기기':'보기'}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-2">
              {loading?'로그인 중...':'로그인'}
            </button>
          </form>
          <div className="mt-4 text-center text-sm text-gray-400">
            계정이 없으신가요?{' '}
            <Link href="/register" className="text-purple-600 font-medium hover:text-purple-800">회원가입 신청 →</Link>
          </div>
          <div className="mt-2 text-center">
            <Link href="/forgot-password" className="text-xs text-gray-400 hover:text-purple-600">비밀번호를 잊으셨나요?</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

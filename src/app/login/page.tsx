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
    setError('')
    setLoading(true)
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-purple-600 tracking-tight">📊 근태 ERP</div>
          <div className="text-sm text-gray-500 mt-1">인사·급여 통합 관리 시스템</div>
        </div>

        <div className="card p-7">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">이메일</label>
              <input
                type="email" className="input" placeholder="example@company.com"
                value={email} onChange={e => setEmail(e.target.value)} required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">비밀번호</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} className="input pr-16"
                  placeholder="비밀번호를 입력하세요"
                  value={password} onChange={e => setPassword(e.target.value)} required
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">
                  {showPw ? '숨기기' : '보기'}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-2">
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>

          <div className="text-center mt-4 text-sm text-gray-400">
            계정이 없으신가요?{' '}
            <Link href="/register" className="text-purple-600 font-medium hover:text-purple-800">
              회원가입 신청 →
            </Link>
          </div>
        </div>

        <div className="mt-4 card p-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            초기 관리자 계정 설정 안내
          </div>
          <div className="text-xs text-gray-500 leading-relaxed">
            1. Supabase Authentication에서 첫 사용자 직접 생성<br />
            2. profiles 테이블에서 role을 &apos;director&apos;로 변경<br />
            3. salary_info 테이블에 급여 정보 등록
          </div>
        </div>
      </div>
    </div>
  )
}

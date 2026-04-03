'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!email) { setError('이메일을 입력해주세요.'); return }
    setLoading(true); setError('')
    const supabase = createClient()
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (err) {
      setError('이메일 전송에 실패했습니다. 이메일 주소를 확인해주세요.')
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
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
            <div className="text-2xl font-bold text-gray-900">(주)솔루션 ERP</div>
          </div>
          <div className="text-sm text-gray-500 mt-1">비밀번호 찾기</div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {!sent ? (
            <>
              <p className="text-sm text-gray-600 mb-4">
                가입 시 사용한 이메일 주소를 입력하시면<br/>비밀번호 재설정 링크를 보내드립니다.
              </p>
              {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">이메일</label>
                <input type="email" className="input" placeholder="등록된 이메일 주소"
                  value={email} onChange={e=>setEmail(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&handleSubmit()} />
              </div>
              <button onClick={handleSubmit} disabled={loading}
                className="btn-primary w-full py-2.5">
                {loading ? '전송 중...' : '재설정 링크 보내기'}
              </button>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">📧</div>
              <div className="text-sm font-semibold text-gray-800 mb-2">이메일을 확인해주세요!</div>
              <div className="text-xs text-gray-500 leading-relaxed">
                <span className="font-medium text-purple-600">{email}</span>로<br/>
                비밀번호 재설정 링크를 보냈어요.<br/>
                메일함을 확인해주세요 (스팸함도 확인)
              </div>
              <button onClick={()=>{setSent(false);setEmail('')}}
                className="mt-4 text-xs text-gray-400 hover:text-purple-600">
                다른 이메일로 다시 시도
              </button>
            </div>
          )}
          <div className="mt-4 text-center">
            <a href="/login" className="text-xs text-gray-400 hover:text-purple-600">← 로그인으로 돌아가기</a>
          </div>
        </div>
        <div className="mt-4 p-3 bg-blue-50 rounded-xl text-xs text-blue-600 text-center">
          💡 이메일을 기억 못하시면 관리자(박팔주 이사님)에게 문의해주세요
        </div>
      </div>
    </div>
  )
}

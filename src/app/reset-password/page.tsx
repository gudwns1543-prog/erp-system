'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleReset() {
    setError('')
    if (pw.length < 8) { setError('8자 이상 입력해주세요.'); return }
    if (pw !== confirm) { setError('비밀번호가 일치하지 않습니다.'); return }
    setLoading(true)
    const supabase = createClient()
    const { error: err } = await supabase.auth.updateUser({ password: pw })
    if (err) {
      setError('재설정 실패: ' + err.message)
    } else {
      alert('비밀번호가 변경되었습니다! 다시 로그인해주세요.')
      router.replace('/login')
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
          <div className="text-sm text-gray-500 mt-1">새 비밀번호 설정</div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">새 비밀번호</label>
              <div className="relative">
                <input type={showPw?'text':'password'} className="input pr-10"
                  placeholder="8자 이상" value={pw}
                  onChange={e=>setPw(e.target.value)} />
                <button type="button" onClick={()=>setShowPw(p=>!p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">
                  {showPw?'숨기기':'보기'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">새 비밀번호 확인</label>
              <input type={showPw?'text':'password'} className="input"
                placeholder="비밀번호 재입력" value={confirm}
                onChange={e=>setConfirm(e.target.value)} />
            </div>
            <button onClick={handleReset} disabled={loading}
              className="btn-primary w-full py-2.5">
              {loading ? '변경 중...' : '비밀번호 변경 완료'}
            </button>
          </div>
          <div className="mt-4 text-xs text-gray-400 space-y-1">
            <div>• 8자 이상으로 설정해주세요</div>
            <div>• 영문, 숫자, 특수문자 조합을 권장합니다</div>
          </div>
        </div>
      </div>
    </div>
  )
}

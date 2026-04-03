'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function RegisterPage() {
  const [form, setForm] = useState({ name:'', email:'', tel:'', dept:'영업팀', pw:'', pwc:'' })
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  function set(k: string, v: string) { setForm(f => ({...f, [k]:v})) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.pw.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return }
    if (form.pw !== form.pwc) { setError('비밀번호가 일치하지 않습니다.'); return }
    setLoading(true)
    const supabase = createClient()

    // 가입 신청 테이블에 저장 (관리자 승인 대기)
    const { error: err } = await supabase.from('signup_requests').insert({
      name: form.name, email: form.email, tel: form.tel, dept: form.dept
    })
    if (err) {
      if (err.code === '23505') setError('이미 신청된 이메일입니다.')
      else setError('신청 중 오류가 발생했습니다. 다시 시도해 주세요.')
      setLoading(false)
      return
    }
    setDone(true)
    setLoading(false)
  }

  if (done) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md card p-8 text-center">
        <div className="text-4xl mb-4">✅</div>
        <div className="text-lg font-semibold text-gray-800 mb-2">가입 신청 완료!</div>
        <p className="text-sm text-gray-500 mb-6">
          <strong>{form.name}</strong>님의 신청이 접수되었습니다.<br />
          관리자 승인 후 로그인하실 수 있습니다.
        </p>
        <Link href="/login" className="btn-primary inline-block px-8 py-2">
          로그인 화면으로
        </Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="text-xl font-bold text-purple-600">회원가입 신청</div>
          <div className="text-sm text-gray-500 mt-1">관리자 승인 후 서비스 이용이 가능합니다</div>
        </div>
        <div className="card p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">이름 *</label>
                <input className="input" placeholder="홍길동" value={form.name} onChange={e=>set('name',e.target.value)} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">연락처</label>
                <input className="input" placeholder="010-0000-0000" value={form.tel} onChange={e=>set('tel',e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">이메일 *</label>
              <input type="email" className="input" placeholder="hong@company.com" value={form.email} onChange={e=>set('email',e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">비밀번호 *</label>
                <input type="password" className="input" placeholder="8자 이상" value={form.pw} onChange={e=>set('pw',e.target.value)} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">비밀번호 확인 *</label>
                <input type="password" className="input" placeholder="동일하게 입력" value={form.pwc} onChange={e=>set('pwc',e.target.value)} required />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">희망 부서</label>
              <select className="input" value={form.dept} onChange={e=>set('dept',e.target.value)}>
                <option>경영지원팀</option><option>영업팀</option><option>개발팀</option><option>운영팀</option>
              </select>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-2">
              {loading ? '신청 중...' : '가입 신청하기'}
            </button>
          </form>
          <div className="text-center mt-3">
            <Link href="/login" className="text-sm text-purple-600 hover:text-purple-800">← 로그인으로 돌아가기</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

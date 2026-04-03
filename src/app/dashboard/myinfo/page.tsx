'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { formatWon } from '@/lib/attendance'

export default function MyInfoPage() {
  const [profile, setProfile] = useState<any>(null)
  const [salary, setSalary] = useState<any>(null)
  const [tab, setTab] = useState<'info'|'password'>('info')
  const [pwForm, setPwForm] = useState({current:'', next:'', confirm:''})
  const [pwAlert, setPwAlert] = useState('')
  const [pwError, setPwError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState({current:false, next:false, confirm:false})

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      setProfile(p)
      const { data: s } = await supabase.from('salary_info').select('*').eq('user_id', session.user.id).maybeSingle()
      setSalary(s)
    })
  }, [])

  async function handlePasswordChange() {
    setPwAlert(''); setPwError('')
    if (!pwForm.current || !pwForm.next || !pwForm.confirm) {
      setPwError('모든 항목을 입력해주세요.'); return
    }
    if (pwForm.next.length < 8) {
      setPwError('새 비밀번호는 8자 이상이어야 합니다.'); return
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwError('새 비밀번호가 일치하지 않습니다.'); return
    }
    setLoading(true)
    const supabase = createClient()
    // 현재 비밀번호 확인
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.email) { setPwError('로그인 정보를 확인할 수 없습니다.'); setLoading(false); return }
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: session.user.email, password: pwForm.current
    })
    if (signInError) {
      setPwError('현재 비밀번호가 올바르지 않습니다.'); setLoading(false); return
    }
    // 비밀번호 변경
    const { error } = await supabase.auth.updateUser({ password: pwForm.next })
    if (error) {
      setPwError('비밀번호 변경 실패: ' + error.message)
    } else {
      setPwAlert('비밀번호가 성공적으로 변경되었습니다!')
      setPwForm({current:'', next:'', confirm:''})
      setTimeout(()=>setPwAlert(''), 5000)
    }
    setLoading(false)
  }

  if (!profile) return <div className="p-6 text-gray-400 text-sm">로딩 중...</div>

  const fields = [
    ['이름', profile.name], ['직급', profile.grade],
    ['부서', profile.dept], ['입사일', profile.join_date],
    ['이메일', profile.email], ['연락처', profile.tel||'-'],
    ['생년월일', profile.birth_date||'-'], ['성별', profile.gender||'-'],
    ['주소', profile.address||'-'], ['권한', profile.role==='director'?'관리자':'일반직원'],
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">내 정보</h1>

      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {(['info','password'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${tab===t?'border-purple-600 text-purple-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t==='info'?'기본 정보':'비밀번호 변경'}
          </button>
        ))}
      </div>

      {tab==='info' && (
        <div className="grid grid-cols-3 gap-4 items-start">
          <div className="card text-center py-6">
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt={profile.name} className="w-20 h-20 rounded-full object-cover mx-auto mb-3" />
              : <div className="w-20 h-20 rounded-full mx-auto mb-3 flex items-center justify-center text-3xl font-bold"
                  style={{background:profile.color||'#EEEDFE',color:profile.tc||'#3C3489'}}>{profile.name?.[0]}</div>
            }
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
            {salary && (
              <div className="card">
                <div className="text-sm font-medium text-gray-700 mb-1">급여 정보</div>
                <div className="text-xs text-gray-400 mb-3">💡 상세 내역은 급여명세 조회에서 확인하세요</div>
                <div className="grid grid-cols-2 gap-0">
                  {[
                    ['연봉', formatWon(salary.annual)],
                    ['월 기본급', formatWon(salary.annual/12)],
                    ['기본 시간단가', Math.round(salary.annual/12/209).toLocaleString()+'원/h'],
                    ['부양가족', salary.dependents+'명'],
                  ].map(([l,v])=>(
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
      )}

      {tab==='password' && (
        <div className="max-w-md">
          {pwAlert && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{pwAlert}</div>}
          {pwError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{pwError}</div>}
          <div className="card space-y-4">
            <div className="text-sm font-medium text-gray-700">비밀번호 변경</div>
            {[
              {label:'현재 비밀번호', key:'current', placeholder:'현재 비밀번호 입력'},
              {label:'새 비밀번호', key:'next', placeholder:'8자 이상'},
              {label:'새 비밀번호 확인', key:'confirm', placeholder:'새 비밀번호 재입력'},
            ].map(f=>(
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
                <div className="relative">
                  <input
                    type={(showPw as any)[f.key] ? 'text' : 'password'}
                    className="input pr-10"
                    placeholder={f.placeholder}
                    value={(pwForm as any)[f.key]}
                    onChange={e=>setPwForm(p=>({...p,[f.key]:e.target.value}))}
                  />
                  <button type="button"
                    onClick={()=>setShowPw(p=>({...p,[f.key]:!(p as any)[f.key]}))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
                    {(showPw as any)[f.key] ? '숨기기' : '보기'}
                  </button>
                </div>
              </div>
            ))}
            <div className="pt-2">
              <button onClick={handlePasswordChange} disabled={loading}
                className="btn-primary w-full py-2.5">
                {loading ? '변경 중...' : '비밀번호 변경'}
              </button>
            </div>
            <div className="text-xs text-gray-400 space-y-1">
              <div>• 8자 이상으로 설정해주세요</div>
              <div>• 영문, 숫자, 특수문자 조합을 권장합니다</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

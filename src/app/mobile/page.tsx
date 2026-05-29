
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Logo } from '@/components/Logo'

function formatDate(ds: string) {
  if (!ds) return ''
  const d = new Date(ds + 'T00:00:00')
  const days = ['일','월','화','수','목','금','토']
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`
}

const TYPES = [
  { key: 'normal', icon: '🏢', title: '회사 출근', desc: '회사/사무실에서 출근' },
  { key: 'business_trip', icon: '🚗', title: '출장', desc: '출장수당 검토 대상' },
  { key: 'training', icon: '🎓', title: '교육', desc: '외부 교육, 출장수당 없음' },
  { key: 'outside_work', icon: '🏃', title: '외근', desc: '외부 업무, 출장수당 없음' },
  { key: 'exception', icon: '⚠️', title: '예외', desc: '관리자 별도 확인' },
] as const

export default function MobileAttendancePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [pending, setPending] = useState<any[]>([])
  const [today, setToday] = useState('')
  const [time, setTime] = useState('--:--:--')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [selectedType, setSelectedType] = useState<string>('normal')
  const [memo, setMemo] = useState('')
  const [gps, setGps] = useState<any>(null)
  const [gpsState, setGpsState] = useState('위치 확인 전')

  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date()
      setTime(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  async function token() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    return session.access_token
  }
  async function load() {
    setLoading(true)
    const t = await token()
    if (!t) { router.replace('/login'); return }
    const res = await fetch('/api/mobile-attendance', { headers: { Authorization: `Bearer ${t}` } })
    const json = await res.json()
    if (!res.ok) setMessage(json.error || '조회 실패')
    else {
      setProfile(json.profile)
      setSessions(json.sessions || [])
      setPending(json.pending || [])
      setToday(json.today)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function requestGps() {
    setGpsState('위치 확인 중...')
    if (!navigator.geolocation) { setGpsState('GPS 미지원'); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const g = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }
        setGps(g)
        setGpsState(`위치 확인 완료 ±${Math.round(pos.coords.accuracy)}m`)
      },
      err => setGpsState('위치 확인 실패: ' + err.message),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    )
  }
  useEffect(() => { requestGps() }, [])

  const openSession = sessions.find((s:any) => s.check_in && !s.check_out)
  const hasPending = pending.length > 0

  async function submitCheckin() {
    setBusy(true)
    setMessage('')
    const t = await token()
    if (!t) { router.replace('/login'); return }
    const chosen = TYPES.find(x => x.key === selectedType)
    const needsMemo = selectedType !== 'normal'
    if (needsMemo && !memo.trim()) {
      setMessage(`${chosen?.title || '외부'} 출근 사유를 입력해 주세요.`)
      setBusy(false)
      return
    }
    const res = await fetch('/api/mobile-attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ action: 'checkin', attendanceType: selectedType, memo, gps }),
    })
    const json = await res.json()
    if (!res.ok) setMessage(json.error || '처리 실패')
    else {
      setMessage(json.message || '처리되었습니다.')
      setShowTypeModal(false)
      setMemo('')
      await load()
    }
    setBusy(false)
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <Logo size={44} />
          <div>
            <div className="font-bold text-gray-800">(주)솔루션 ERP</div>
            <div className="text-xs text-gray-400">모바일 출퇴근</div>
          </div>
        </div>
        <section className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 text-center">
          <div className="text-sm text-gray-400 mb-2">{formatDate(today)}</div>
          <div className="text-4xl font-bold tracking-widest text-gray-900 mb-2">{time}</div>
          <div className="text-sm text-gray-600 mb-3">{profile?.name} {profile?.grade}</div>
          <div className="text-xs text-gray-400 mb-4">{gpsState}</div>
          {message && <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 whitespace-pre-line">{message}</div>}
          {loading ? <div className="text-sm text-gray-400 py-8">조회 중...</div> : (
            <>
              {openSession ? (
                <div className="p-4 rounded-2xl bg-green-50 text-green-700 text-sm">현재 근무 중입니다. 출근 {openSession.check_in?.slice(0,5)}</div>
              ) : hasPending ? (
                <div className="p-4 rounded-2xl bg-amber-50 text-amber-700 text-sm">모바일 출근 승인 대기 중입니다.</div>
              ) : (
                <button onClick={() => setShowTypeModal(true)} disabled={busy} className="w-full rounded-2xl bg-purple-600 text-white font-bold py-4 disabled:opacity-50">출근 찍기</button>
              )}
              <div className="mt-5 text-left">
                <div className="text-xs font-semibold text-gray-400 mb-2">오늘 기록</div>
                {sessions.length === 0 ? <div className="text-xs text-gray-300">기록 없음</div> : sessions.map((s:any) => (
                  <div key={s.id} className="text-sm py-2 border-b border-gray-50 flex justify-between">
                    <span>{s.seq || '-'}회차 · {s.note || '출근'}</span>
                    <span>{s.check_in?.slice(0,5)} ~ {s.check_out?.slice(0,5) || '근무중'}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
      {showTypeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-5 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <div className="font-bold text-gray-800">어떤 출근인가요?</div>
              <button onClick={() => setShowTypeModal(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-1 gap-2 mb-4">
              {TYPES.map(t => (
                <button key={t.key} onClick={() => setSelectedType(t.key)} className={`p-3 rounded-2xl border text-left ${selectedType===t.key?'border-purple-500 bg-purple-50':'border-gray-100 bg-gray-50'}`}>
                  <div className="font-semibold text-gray-800">{t.icon} {t.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
            {selectedType !== 'normal' && (
              <textarea value={memo} onChange={e=>setMemo(e.target.value)} placeholder="사유를 입력하세요. 예: 외부 교육 참석, 거래처 미팅 등" className="w-full rounded-2xl border border-gray-200 p-3 text-sm h-24 mb-4" />
            )}
            <button onClick={submitCheckin} disabled={busy} className="w-full rounded-2xl bg-purple-600 text-white font-bold py-3 disabled:opacity-50">{busy ? '처리 중...' : '출근 신청/처리'}</button>
          </div>
        </div>
      )}
    </main>
  )
}

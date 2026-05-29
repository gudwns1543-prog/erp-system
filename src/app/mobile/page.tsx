'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function isMobile() {
  if (typeof navigator === 'undefined') return true
  return /Mobile|Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent)
}
function todayLabel() {
  const d = new Date()
  const days = ['일','월','화','수','목','금','토']
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`
}

export default function MobileAttendancePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [pending, setPending] = useState<any[]>([])
  const [time, setTime] = useState('--:--:--')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [memo, setMemo] = useState('')
  const [attendanceType, setAttendanceType] = useState<'outside_work'|'business_trip'|'training'|'exception'>('outside_work')
  const [showCheckinModal, setShowCheckinModal] = useState(false)
  const [gpsState, setGpsState] = useState('위치 미확인')

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
    if (!res.ok) {
      setMessage(json.error || '조회 실패')
      setLoading(false)
      return
    }
    setProfile(json.profile)
    setSessions(json.sessions || [])
    setPending(json.pending || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function getLocation(): Promise<any> {
    return new Promise(resolve => {
      if (!navigator.geolocation) {
        setGpsState('이 브라우저는 위치 확인을 지원하지 않습니다.')
        resolve(null)
        return
      }
      setGpsState('위치 확인 중...')
      navigator.geolocation.getCurrentPosition(
        pos => {
          const gps = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }
          setGpsState(`위치 확인 완료 · 정확도 약 ${Math.round(pos.coords.accuracy)}m`)
          resolve(gps)
        },
        () => {
          setGpsState('위치 권한 거부 또는 확인 실패')
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      )
    })
  }

  async function action(kind: 'checkin'|'checkout') {
    setBusy(true); setMessage('')
    const t = await token()
    if (!t) { router.replace('/login'); return }
    const gps = await getLocation()
    const res = await fetch('/api/mobile-attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ action: kind, gps, memo, attendanceType }),
    })
    const json = await res.json()
    if (!res.ok) {
      setMessage('⚠️ ' + (json.error || '처리 실패'))
    } else {
      setMessage((json.mode === 'pending' ? '🟠 ' : '✅ ') + (json.message || '처리 완료'))
      setMemo('')
      setShowCheckinModal(false)
      await load()
    }
    setBusy(false)
  }

  function openCheckinModal() {
    setMessage('')
    setShowCheckinModal(true)
  }

  const active = sessions.find(s => s.check_in && !s.check_out)
  const done = sessions.length > 0 && sessions.every(s => s.check_out)
  const hasPending = pending.length > 0

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-400">모바일 ERP 로딩 중...</div>

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-md mx-auto min-h-screen bg-white shadow-sm">
        <header className="px-5 pt-5 pb-4 bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-b-[28px]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs opacity-80">(주)솔루션 ERP</div>
              <h1 className="text-xl font-bold mt-0.5">모바일 출퇴근</h1>
            </div>
            <button onClick={() => router.push('/dashboard/home')} className="text-xs bg-white/15 px-3 py-1.5 rounded-full">PC 화면</button>
          </div>
          <div className="mt-5 bg-white/15 rounded-2xl p-4">
            <div className="text-4xl font-bold tabular-nums tracking-wider">{time}</div>
            <div className="text-xs opacity-80 mt-1">{todayLabel()}</div>
            <div className="mt-3 text-sm font-medium">{profile?.name} · {profile?.dept} · {profile?.grade}</div>
          </div>
        </header>

        <main className="px-5 py-5 space-y-4">
          {message && <div className="rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 whitespace-pre-line">{message}</div>}
          {!isMobile() && <div className="rounded-2xl bg-blue-50 border border-blue-100 text-blue-700 text-xs p-3">현재 PC 브라우저로 접속 중입니다. 모바일 테스트는 휴대폰에서 접속하면 더 정확합니다.</div>}

          <section className="rounded-3xl border border-slate-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">오늘 상태</div>
              <span className={`text-xs px-3 py-1 rounded-full ${hasPending ? 'bg-amber-100 text-amber-700' : active ? 'bg-green-100 text-green-700' : done ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500'}`}>
                {hasPending ? '승인 대기' : active ? '근무 중' : done ? '퇴근 완료' : '미출근'}
              </span>
            </div>
            <div className="space-y-2 text-sm">
              {sessions.length === 0 && !hasPending && <div className="text-slate-400">오늘 출근 기록이 없습니다.</div>}
              {sessions.map((s, i) => (
                <div key={s.id} className="flex items-center justify-between bg-slate-50 rounded-2xl px-3 py-2">
                  <span className="text-slate-500">{i+1}번째</span>
                  <span className="font-medium">{s.check_in?.slice(0,5) || '--:--'} → {s.check_out?.slice(0,5) || '근무중'}</span>
                </div>
              ))}
              {pending.map(p => (
                <div key={p.id} className="bg-amber-50 border border-amber-100 rounded-2xl px-3 py-2">
                  <div className="font-medium text-amber-800">승인 대기 · {p.requested_time?.slice(0,5)}</div>
                  <div className="text-xs text-amber-700 mt-1">{p.reason}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-100 p-4 shadow-sm space-y-3">
            <div>
              <div className="font-semibold mb-1">모바일 출근 확인</div>
              <div className="text-xs text-slate-400 mb-2">회사 밖에서 출근을 찍는 경우 출장/교육/외근을 구분해 관리자 승인 대기로 접수합니다.</div>
            </div>
            <div className="text-xs text-slate-400">📍 {gpsState}</div>
            <button onClick={openCheckinModal} disabled={busy || !!active || hasPending} className="w-full h-14 rounded-2xl bg-purple-600 text-white font-bold disabled:opacity-40">
              {sessions.length > 0 && !active ? '복귀 출근' : '출근하기'}
            </button>
            <button onClick={() => action('checkout')} disabled={busy || !active} className="w-full h-14 rounded-2xl bg-slate-900 text-white font-bold disabled:opacity-40">
              퇴근하기
            </button>
          </section>

          <section className="rounded-3xl bg-slate-50 p-4 text-xs text-slate-500 leading-relaxed">
            <div className="font-semibold text-slate-700 mb-1">부정출근 방지 기준</div>
            회사 허용 IP 또는 회사 위치 반경 내 출근은 정상 처리됩니다. 그 외 모바일 출근은 IP, GPS, 기기정보, 위치 정확도, 사유를 기록하고 관리자 승인 후 근태에 반영됩니다.
          </section>

          {showCheckinModal && (
            <div className="fixed inset-0 bg-black/45 z-50 flex items-end sm:items-center justify-center p-4">
              <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold text-slate-900">회사 밖 출근인가요?</div>
                    <div className="text-xs text-slate-500 mt-1">출장은 수당 산정 대상, 교육/외근/예외는 출장수당 대상이 아닙니다.</div>
                  </div>
                  <button onClick={() => setShowCheckinModal(false)} className="text-slate-400 text-xl leading-none">×</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['business_trip','🚗 출장','출장수당 대상'],
                    ['training','🎓 교육','출장수당 없음'],
                    ['outside_work','🏢 외근','출장수당 없음'],
                    ['exception','⚠️ 예외','관리자 확인'],
                  ].map(([v, label, desc]) => (
                    <button key={v} onClick={() => setAttendanceType(v as any)}
                      className={`rounded-2xl border px-3 py-3 text-left ${attendanceType===v ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 bg-white text-slate-700'}`}>
                      <div className="font-bold text-sm">{label}</div>
                      <div className="text-[11px] opacity-70 mt-0.5">{desc}</div>
                    </button>
                  ))}
                </div>
                <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={3}
                  placeholder="예: 거래처 방문 / 외부 교육 참석 / 현장 미팅 등 사유를 입력하세요."
                  className="w-full border border-slate-200 rounded-2xl px-3 py-3 text-sm resize-none" />
                <div className="text-xs text-slate-400">📍 {gpsState}</div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setShowCheckinModal(false)} className="h-12 rounded-2xl bg-slate-100 text-slate-600 font-bold">취소</button>
                  <button onClick={() => action('checkin')} disabled={busy} className="h-12 rounded-2xl bg-purple-600 text-white font-bold disabled:opacity-40">출근 접수</button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  )
}

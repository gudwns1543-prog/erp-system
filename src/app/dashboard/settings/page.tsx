'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function SettingsPage() {
  const [profile, setProfile] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // 기본 설정
  const [payDay, setPayDay] = useState(10)
  const [companyName, setCompanyName] = useState('(주)솔루션')
  const [workStartTime, setWorkStartTime] = useState('09:00')
  const [workEndTime, setWorkEndTime] = useState('18:00')
  const [lunchStart, setLunchStart] = useState('12:00')
  const [lunchEnd, setLunchEnd] = useState('13:00')
  const [annualLeave, setAnnualLeave] = useState(15)

  // 출장일비 정책 - 4시간 기준
  const [tripShort, setTripShort] = useState(15000)
  const [tripLong, setTripLong] = useState(25000)

  useEffect(() => { loadSettings() }, [])

  async function loadSettings() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    if (p?.role !== 'director') return
    const { data } = await supabase.from('company_settings').select('*')
    if (data) {
      data.forEach((row: any) => {
        switch (row.key) {
          case 'pay_day':          setPayDay(Number(row.value)); break
          case 'company_name':     setCompanyName(row.value); break
          case 'work_start_time':  setWorkStartTime(row.value); break
          case 'work_end_time':    setWorkEndTime(row.value); break
          case 'lunch_start':      setLunchStart(row.value); break
          case 'lunch_end':        setLunchEnd(row.value); break
          case 'annual_leave_days': setAnnualLeave(Number(row.value)); break
          case 'trip_short_amount': setTripShort(Number(row.value)); break
          case 'trip_long_amount':  setTripLong(Number(row.value)); break
        }
      })
    }
  }

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    const settings = [
      { key:'pay_day',           value:String(payDay) },
      { key:'company_name',      value:companyName },
      { key:'work_start_time',   value:workStartTime },
      { key:'work_end_time',     value:workEndTime },
      { key:'lunch_start',       value:lunchStart },
      { key:'lunch_end',         value:lunchEnd },
      { key:'annual_leave_days', value:String(annualLeave) },
      { key:'trip_short_amount', value:String(tripShort) },
      { key:'trip_long_amount',  value:String(tripLong) },
    ]
    for (const s of settings) {
      await supabase.from('company_settings').upsert(
        { key:s.key, value:s.value, updated_at:new Date().toISOString() },
        { onConflict:'key' }
      )
    }
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (!profile) return <div className="p-6 flex items-center justify-center"><div className="text-gray-400 text-sm">로딩 중...</div></div>
  if (profile.role !== 'director') return <div className="p-6 flex items-center justify-center"><div className="text-gray-400 text-sm">관리자만 접근할 수 있습니다.</div></div>

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-gray-800">회사 설정</h1>
        {saved && <div className="text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">✅ 저장되었습니다</div>}
      </div>

      {/* 급여 설정 */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">💰</span>
          <h2 className="text-sm font-semibold text-gray-700">급여 설정</h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-700">급여 지급일</div>
              <div className="text-xs text-gray-400 mt-0.5">매월 몇 일에 급여를 지급하나요?</div>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={31} value={payDay}
                onChange={e=>setPayDay(Math.min(31,Math.max(1,Number(e.target.value))))}
                className="input w-20 text-center text-sm font-semibold" />
              <span className="text-sm text-gray-500">일</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-700">기본 연차 일수</div>
              <div className="text-xs text-gray-400 mt-0.5">신규 직원 기본 연차 지급 일수</div>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={30} value={annualLeave}
                onChange={e=>setAnnualLeave(Math.min(30,Math.max(1,Number(e.target.value))))}
                className="input w-20 text-center text-sm font-semibold" />
              <span className="text-sm text-gray-500">일</span>
            </div>
          </div>
          {/* 출장일비 */}
          <div className="pt-3 border-t border-gray-100">
            <div className="text-sm font-medium text-gray-700 mb-2">🚗 출장 일비 정책</div>
            <div className="text-xs text-gray-400 mb-3">출장 시간에 따라 지급되는 일비. 출장 보고서 작성 시 자동 적용됩니다.</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                <div className="text-xs font-medium text-amber-700 mb-1">4시간 미만 출장</div>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} step={1000} value={tripShort}
                    onChange={e=>setTripShort(Number(e.target.value))}
                    className="input text-right text-sm font-semibold tabular-nums flex-1" />
                  <span className="text-sm text-amber-700">원</span>
                </div>
                <div className="text-[10px] text-amber-600 mt-1 tabular-nums">{tripShort.toLocaleString('ko-KR')}원</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                <div className="text-xs font-medium text-amber-700 mb-1">4시간 이상 출장</div>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} step={1000} value={tripLong}
                    onChange={e=>setTripLong(Number(e.target.value))}
                    className="input text-right text-sm font-semibold tabular-nums flex-1" />
                  <span className="text-sm text-amber-700">원</span>
                </div>
                <div className="text-[10px] text-amber-600 mt-1 tabular-nums">{tripLong.toLocaleString('ko-KR')}원</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 근무시간 설정 */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">⏰</span>
          <h2 className="text-sm font-semibold text-gray-700">근무시간 설정</h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-700">정규 근무시간</div>
              <div className="text-xs text-gray-400 mt-0.5">출근 ~ 퇴근 기준 시간</div>
            </div>
            <div className="flex items-center gap-2">
              <input type="time" value={workStartTime} onChange={e=>setWorkStartTime(e.target.value)} className="input text-sm w-28" />
              <span className="text-gray-400">~</span>
              <input type="time" value={workEndTime} onChange={e=>setWorkEndTime(e.target.value)} className="input text-sm w-28" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-700">점심시간 (미인정 시간)</div>
              <div className="text-xs text-gray-400 mt-0.5">근무시간에서 제외되는 시간</div>
            </div>
            <div className="flex items-center gap-2">
              <input type="time" value={lunchStart} onChange={e=>setLunchStart(e.target.value)} className="input text-sm w-28" />
              <span className="text-gray-400">~</span>
              <input type="time" value={lunchEnd} onChange={e=>setLunchEnd(e.target.value)} className="input text-sm w-28" />
            </div>
          </div>
        </div>
      </div>

      {/* 회사 정보 */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🏢</span>
          <h2 className="text-sm font-semibold text-gray-700">회사 정보</h2>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-700">회사명</div>
            <div className="text-xs text-gray-400 mt-0.5">ERP 시스템에 표시되는 회사 이름</div>
          </div>
          <input type="text" value={companyName} onChange={e=>setCompanyName(e.target.value)} className="input text-sm w-48" />
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-2.5 text-sm font-medium">
        {saving ? '저장 중...' : '💾 설정 저장'}
      </button>
    </div>
  )
}

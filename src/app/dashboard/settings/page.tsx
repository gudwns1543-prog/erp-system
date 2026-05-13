'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface DeductItem { id: string; name: string; rate: number; rateType: 'percent'|'fixed'; enabled: boolean }

const DEFAULT_DEDUCTS: DeductItem[] = [
  { id:'pension',   name:'국민연금',     rate:4.5,    rateType:'percent', enabled:true },
  { id:'health',    name:'건강보험',     rate:3.545,  rateType:'percent', enabled:true },
  { id:'ltc',       name:'장기요양보험', rate:12.95,  rateType:'percent', enabled:true },
  { id:'employ',    name:'고용보험',     rate:0.9,    rateType:'percent', enabled:true },
  { id:'incomeTax', name:'소득세',       rate:0,      rateType:'fixed',   enabled:true },
  { id:'localTax',  name:'지방소득세',   rate:10,     rateType:'percent', enabled:true },
]

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

  // 출장일비
  const [tripAllowance, setTripAllowance] = useState(0)

  // 공제항목
  const [deducts, setDeducts] = useState<DeductItem[]>(DEFAULT_DEDUCTS)
  const [newDeductName, setNewDeductName] = useState('')
  const [newDeductRate, setNewDeductRate] = useState(0)
  const [newDeductType, setNewDeductType] = useState<'percent'|'fixed'>('percent')

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
          case 'trip_allowance':   setTripAllowance(Number(row.value)); break
          case 'deduct_items':
            try { setDeducts(JSON.parse(row.value)) } catch {}
            break
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
      { key:'trip_allowance',    value:String(tripAllowance) },
      { key:'deduct_items',      value:JSON.stringify(deducts) },
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

  function updateDeduct(id: string, field: keyof DeductItem, value: any) {
    setDeducts(prev => prev.map(d => d.id === id ? {...d, [field]: value} : d))
  }

  function addDeduct() {
    if (!newDeductName.trim()) return
    setDeducts(prev => [...prev, {
      id: 'custom_' + Date.now(),
      name: newDeductName, rate: newDeductRate,
      rateType: newDeductType, enabled: true
    }])
    setNewDeductName(''); setNewDeductRate(0)
  }

  function removeDeduct(id: string) {
    if (DEFAULT_DEDUCTS.find(d=>d.id===id)) {
      setDeducts(prev=>prev.map(d=>d.id===id?{...d,enabled:false}:d))
    } else {
      setDeducts(prev=>prev.filter(d=>d.id!==id))
    }
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
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <div>
              <div className="text-sm font-medium text-gray-700">출장 일비</div>
              <div className="text-xs text-gray-400 mt-0.5">출장 시 하루에 추가 지급하는 금액</div>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min={0} step={1000} value={tripAllowance}
                onChange={e=>setTripAllowance(Number(e.target.value))}
                className="input w-32 text-right text-sm font-semibold" />
              <span className="text-sm text-gray-500">원/일</span>
            </div>
          </div>
        </div>
      </div>

      {/* 공제항목 설정 */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">📉</span>
          <h2 className="text-sm font-semibold text-gray-700">공제항목 설정</h2>
          <span className="text-xs text-gray-400">요율 수정 및 항목 추가/삭제 가능</span>
        </div>
        <div className="space-y-2 mb-4">
          {deducts.map(d => (
            <div key={d.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${d.enabled?'border-gray-100 bg-gray-50':'border-gray-100 bg-gray-50 opacity-40'}`}>
              <input type="checkbox" checked={d.enabled}
                onChange={e=>updateDeduct(d.id,'enabled',e.target.checked)}
                className="accent-purple-600 flex-shrink-0" />
              <span className="text-sm text-gray-700 w-28 flex-shrink-0">{d.name}</span>
              <div className="flex items-center gap-1.5 flex-1">
                <input type="number" step="0.001" min={0} value={d.rate}
                  onChange={e=>updateDeduct(d.id,'rate',Number(e.target.value))}
                  disabled={!d.enabled || d.id==='incomeTax'}
                  className="input w-24 text-right text-sm py-1" />
                <select value={d.rateType}
                  onChange={e=>updateDeduct(d.id,'rateType',e.target.value)}
                  disabled={!d.enabled || d.id==='incomeTax'}
                  className="input w-20 text-xs py-1">
                  <option value="percent">%</option>
                  <option value="fixed">원(고정)</option>
                </select>
              </div>
              {!DEFAULT_DEDUCTS.find(dd=>dd.id===d.id) && (
                <button onClick={()=>removeDeduct(d.id)}
                  className="text-xs text-red-400 hover:text-red-600 flex-shrink-0 px-1">✕ 삭제</button>
              )}
              {d.id==='incomeTax' && <span className="text-xs text-gray-400 flex-shrink-0">간이세액표 자동</span>}
            </div>
          ))}
        </div>

        {/* 공제항목 추가 */}
        <div className="border border-dashed border-gray-200 rounded-lg p-3">
          <div className="text-xs font-medium text-gray-500 mb-2">+ 공제항목 추가</div>
          <div className="flex gap-2">
            <input type="text" placeholder="항목명 (예: 조합비)" value={newDeductName}
              onChange={e=>setNewDeductName(e.target.value)}
              className="input flex-1 text-sm py-1.5" />
            <input type="number" step="0.1" min={0} value={newDeductRate}
              onChange={e=>setNewDeductRate(Number(e.target.value))}
              className="input w-24 text-right text-sm py-1.5" />
            <select value={newDeductType} onChange={e=>setNewDeductType(e.target.value as any)}
              className="input w-20 text-xs py-1.5">
              <option value="percent">%</option>
              <option value="fixed">원(고정)</option>
            </select>
            <button onClick={addDeduct} className="btn-secondary text-xs px-3 py-1.5 whitespace-nowrap">추가</button>
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

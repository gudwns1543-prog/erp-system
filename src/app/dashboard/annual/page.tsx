\
'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { sortByGrade, isHoliday } from '@/lib/attendance'

type Grant = {
  id: string
  type: 'monthly' | 'annual'
  label: string
  sequence: number
  grantDate: string
  expiresAt: string
  hours: number
  usedApprovedH: number
  usedPendingH: number
  remainingH: number
  status: 'active' | 'expired' | 'future'
}

type Usage = {
  requester_id: string
  type: string
  start_date: string
  end_date?: string | null
  status: 'approved' | 'pending'
  hours: number
}

type LeaveSummary = {
  user: any
  grants: Grant[]
  activeGrants: Grant[]
  totalGeneratedH: number
  usedApprovedH: number
  usedPendingH: number
  remainingH: number
  mode: string
  nextGrantText: string
  usageHistory: Usage[]
}

const DAY = 24 * 60 * 60 * 1000

function parseDate(ds: string) { return new Date(ds + 'T12:00:00') }
function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function addDays(d: Date, days: number) { const x = new Date(d); x.setDate(x.getDate()+days); return x }
function addMonths(d: Date, months: number) { const x = new Date(d); x.setMonth(x.getMonth()+months); return x }
function addYears(d: Date, years: number) { const x = new Date(d); x.setFullYear(x.getFullYear()+years); return x }
function isBetween(ds: string, start: string, end: string) { return ds >= start && ds <= end }
function hToDay(h: number) { return Number((h / 8).toFixed(2)) }
function leaveHours(l: any) {
  if (l.type === '반반차') return 2
  if (l.type === '반차(오전)' || l.type === '반차(오후)') return 4
  const start = parseDate(l.start_date)
  const end = parseDate(l.end_date || l.start_date)
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const dow = cur.getDay()
    const ds = fmt(cur)
    if (dow !== 0 && dow !== 6 && !isHoliday(ds)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count * 8
}
function annualDays(yearNo: number) {
  if (yearNo < 1) return 0
  return Math.min(25, 15 + Math.floor((yearNo - 1) / 2))
}

function buildGrants(user: any, asOf: Date): Grant[] {
  if (!user?.join_date) return []
  const join = parseDate(user.join_date)
  const today = fmt(asOf)
  const grants: Grant[] = []

  // 1년 미만자는 1개월 만근 후 다음 한 달 동안 사용할 수 있는 휴가 1일 발생
  for (let n = 1; n <= 11; n++) {
    const gd = addMonths(join, n)
    if (gd > asOf) break
    const exp = addDays(addMonths(gd, 1), -1)
    const gs = fmt(gd)
    const es = fmt(exp)
    grants.push({
      id: `monthly-${n}`,
      type: 'monthly',
      label: `${n}개월 만근휴가`,
      sequence: n,
      grantDate: gs,
      expiresAt: es,
      hours: 8,
      usedApprovedH: 0,
      usedPendingH: 0,
      remainingH: 8,
      status: today < gs ? 'future' : today > es ? 'expired' : 'active',
    })
  }

  // 입사 1주년부터는 월단위 휴가가 아니라 입사일 기준 연차가 매년 발생
  for (let yearNo = 1; yearNo <= 40; yearNo++) {
    const gd = addYears(join, yearNo)
    if (gd > asOf) break
    const exp = addDays(addYears(gd, 1), -1)
    const gs = fmt(gd)
    const es = fmt(exp)
    const days = annualDays(yearNo)
    grants.push({
      id: `annual-${yearNo}`,
      type: 'annual',
      label: `${yearNo}년차 연차`,
      sequence: yearNo,
      grantDate: gs,
      expiresAt: es,
      hours: days * 8,
      usedApprovedH: 0,
      usedPendingH: 0,
      remainingH: days * 8,
      status: today < gs ? 'future' : today > es ? 'expired' : 'active',
    })
  }

  return grants
}

function buildSummary(user: any, usages: Usage[], asOf: Date): LeaveSummary {
  const grants = buildGrants(user, asOf)
  const sortedGrants = [...grants].sort((a,b) => a.expiresAt.localeCompare(b.expiresAt))
  const usageHistory = usages.filter(u => u.requester_id === user.id)
    .sort((a,b) => a.start_date.localeCompare(b.start_date))

  for (const usage of usageHistory) {
    let remainUse = usage.hours
    const candidates = sortedGrants.filter(g => g.status !== 'expired' && isBetween(usage.start_date, g.grantDate, g.expiresAt))
    for (const g of candidates) {
      if (remainUse <= 0) break
      const canUse = Math.max(0, g.hours - g.usedApprovedH - g.usedPendingH)
      const use = Math.min(canUse, remainUse)
      if (usage.status === 'approved') g.usedApprovedH += use
      else g.usedPendingH += use
      remainUse -= use
    }
  }

  for (const g of grants) {
    g.remainingH = Math.max(0, g.hours - g.usedApprovedH - g.usedPendingH)
  }

  const activeGrants = grants.filter(g => g.status === 'active')
  const totalGeneratedH = activeGrants.reduce((s,g)=>s+g.hours,0)
  const usedApprovedH = activeGrants.reduce((s,g)=>s+g.usedApprovedH,0)
  const usedPendingH = activeGrants.reduce((s,g)=>s+g.usedPendingH,0)
  const remainingH = activeGrants.reduce((s,g)=>s+g.remainingH,0)

  const join = user?.join_date ? parseDate(user.join_date) : null
  let mode = '입사일 미등록'
  let nextGrantText = '-'
  if (join) {
    const firstAnniv = addYears(join, 1)
    if (asOf < firstAnniv) {
      mode = '1년 미만 · 월단위 휴가'
      const nextN = Math.min(12, Math.max(1, Math.floor((asOf.getTime() - join.getTime()) / (30 * DAY)) + 1))
      const next = addMonths(join, nextN)
      nextGrantText = next <= firstAnniv ? `${fmt(next)} 1일` : `${fmt(firstAnniv)} 15일`
    } else {
      const years = grants.filter(g=>g.type==='annual').length
      const nextYear = years + 1
      mode = `${years}년차 · 연차 ${annualDays(years)}일`
      nextGrantText = `${fmt(addYears(join, nextYear))} ${annualDays(nextYear)}일`
    }
  }

  return { user, grants, activeGrants, totalGeneratedH, usedApprovedH, usedPendingH, remainingH, mode, nextGrantText, usageHistory }
}

export default function AnnualPage() {
  const [profile, setProfile] = useState<any>(null)
  const [staff, setStaff] = useState<any[]>([])
  const [summaries, setSummaries] = useState<Record<string, LeaveSummary>>({})
  const [tab, setTab] = useState<'mine'|'all'>('mine')
  const [detail, setDetail] = useState<LeaveSummary|null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)

    const isDirector = p?.role === 'director'
    const { data: users } = isDirector
      ? await supabase.from('profiles').select('id,name,grade,dept,status,join_date,annual_leave,color,tc,avatar_url').eq('status','active')
      : await supabase.from('profiles').select('id,name,grade,dept,status,join_date,annual_leave,color,tc,avatar_url').eq('id', session.user.id)

    const userList = sortByGrade(users || [])
    setStaff(userList)
    const targetIds = userList.map((u:any)=>u.id)

    const { data: leaves } = targetIds.length
      ? await supabase.from('approvals')
          .select('requester_id,type,start_date,end_date,status')
          .in('requester_id', targetIds)
          .in('type', ['연차','반차(오전)','반차(오후)','반반차'])
          .in('status', ['approved','pending'])
          .order('start_date', { ascending: true })
      : { data: [] as any[] }

    const usages: Usage[] = (leaves || []).map((l:any)=>({ ...l, hours: leaveHours(l) }))
    const today = new Date()
    const map: Record<string, LeaveSummary> = {}
    for (const u of userList) map[u.id] = buildSummary(u, usages, today)
    setSummaries(map)
  }, [])

  useEffect(() => { load() }, [load])

  const Avatar = ({u}:{u:any}) => (
    u?.avatar_url
      ? <img src={u.avatar_url} className="w-12 h-12 rounded-full object-cover object-top flex-shrink-0" alt="" />
      : <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
          style={{background:u?.color||'#EEEDFE',color:u?.tc||'#3C3489'}}>{u?.name?.[0]}</div>
  )

  const mySummary = profile ? summaries[profile.id] : null

  const SummaryCards = ({s}:{s: LeaveSummary}) => (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {[
        { label:'입사일', val:s.user.join_date || '미등록', sub:s.mode, c:'text-gray-800' },
        { label:'유효 발생', val:`${hToDay(s.totalGeneratedH)}일`, sub:`${s.totalGeneratedH}H`, c:'text-blue-700' },
        { label:'사용완료', val:`${hToDay(s.usedApprovedH)}일`, sub:`${s.usedApprovedH}H`, c:'text-amber-600' },
        { label:'신청중', val:`${hToDay(s.usedPendingH)}일`, sub:`${s.usedPendingH}H`, c:'text-purple-600' },
        { label:'잔여', val:`${hToDay(s.remainingH)}일`, sub:`${s.remainingH}H`, c:s.remainingH <= 16 ? 'text-red-600' : 'text-teal-600' },
      ].map(card => (
        <div key={card.label} className="card text-center py-4">
          <div className="text-xs text-gray-400 mb-1">{card.label}</div>
          <div className={`text-2xl font-bold ${card.c}`}>{card.val}</div>
          <div className="text-[11px] text-gray-400 mt-1 truncate">{card.sub}</div>
        </div>
      ))}
    </div>
  )

  const GrantTable = ({s}:{s: LeaveSummary}) => (
    <div className="card overflow-x-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-gray-800">발생/사용 상세</div>
        <div className="text-xs text-gray-400">다음 발생: {s.nextGrantText}</div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {['구분','생성일','유효기간','발생','사용완료','신청중','잔여','상태'].map(h=>(
              <th key={h} className="pb-2 text-left text-xs font-medium text-gray-400 pr-4 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {s.grants.length === 0 && (
            <tr><td colSpan={8} className="py-8 text-center text-sm text-gray-400">입사일이 등록되지 않았습니다.</td></tr>
          )}
          {s.grants.slice().reverse().map(g => (
            <tr key={g.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-2 pr-4 whitespace-nowrap">
                <span className={`text-xs px-2 py-1 rounded-full ${g.type==='annual'?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>
                  {g.label}
                </span>
              </td>
              <td className="py-2 pr-4 text-xs text-gray-600 whitespace-nowrap">{g.grantDate}</td>
              <td className="py-2 pr-4 text-xs text-gray-600 whitespace-nowrap">{g.grantDate} ~ {g.expiresAt}</td>
              <td className="py-2 pr-4 font-semibold whitespace-nowrap">{hToDay(g.hours)}일</td>
              <td className="py-2 pr-4 text-amber-600 whitespace-nowrap">{hToDay(g.usedApprovedH)}일</td>
              <td className="py-2 pr-4 text-purple-600 whitespace-nowrap">{hToDay(g.usedPendingH)}일</td>
              <td className={`py-2 pr-4 font-semibold whitespace-nowrap ${g.remainingH<=0?'text-gray-400':'text-teal-600'}`}>{hToDay(g.remainingH)}일</td>
              <td className="py-2 pr-4 whitespace-nowrap">
                <span className={`text-xs px-2 py-1 rounded-full ${g.status==='active'?'bg-green-100 text-green-700':g.status==='expired'?'bg-gray-100 text-gray-400':'bg-yellow-100 text-yellow-700'}`}>
                  {g.status==='active'?'사용가능':g.status==='expired'?'소멸':'예정'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
        <h1 className="text-lg font-semibold text-gray-800">내 연차</h1>
        <a href="/dashboard/leave" className="btn-primary text-sm px-4 py-2 inline-flex items-center gap-1">📝 휴가 신청</a>
      </div>

      {profile?.role === 'director' && (
        <div className="flex gap-1 border-b border-gray-200 mb-5">
          {[{key:'mine',label:'내 연차'},{key:'all',label:'전체 직원 연차'}].map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key as any)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab===t.key?'border-purple-600 text-purple-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {(tab === 'mine' || profile?.role !== 'director') && mySummary && (
        <div className="space-y-4">
          <SummaryCards s={mySummary} />
          <GrantTable s={mySummary} />
        </div>
      )}

      {tab === 'all' && profile?.role === 'director' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['','이름','부서/직급','입사일','현재구분','유효발생','사용/신청','잔여','상세'].map(h=>(
                  <th key={h} className="pb-2 text-left text-xs font-medium text-gray-400 pr-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map(u => {
                const s = summaries[u.id]
                if (!s) return null
                return (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-3"><Avatar u={u} /></td>
                    <td className="py-2 pr-4 font-medium whitespace-nowrap">{u.name}</td>
                    <td className="py-2 pr-4 text-xs text-gray-500 whitespace-nowrap">{u.dept} · {u.grade}</td>
                    <td className="py-2 pr-4 text-xs text-gray-500 whitespace-nowrap">{u.join_date || '미등록'}</td>
                    <td className="py-2 pr-4 text-xs text-gray-600 whitespace-nowrap">{s.mode}</td>
                    <td className="py-2 pr-4 font-semibold text-blue-700 whitespace-nowrap">{hToDay(s.totalGeneratedH)}일</td>
                    <td className="py-2 pr-4 text-xs whitespace-nowrap">
                      <span className="text-amber-600">{hToDay(s.usedApprovedH)}일</span>
                      <span className="text-gray-300 mx-1">/</span>
                      <span className="text-purple-600">{hToDay(s.usedPendingH)}일</span>
                    </td>
                    <td className={`py-2 pr-4 font-semibold whitespace-nowrap ${s.remainingH<=16?'text-red-600':'text-teal-600'}`}>{hToDay(s.remainingH)}일</td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <button onClick={()=>setDetail(s)} className="btn-secondary text-xs px-2 py-1">조회</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={()=>setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto p-5" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-gray-800">{detail.user.name}님 연차 상세</div>
                <div className="text-xs text-gray-400 mt-0.5">{detail.user.dept} · {detail.user.grade}</div>
              </div>
              <button onClick={()=>setDetail(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-4">
              <SummaryCards s={detail} />
              <GrantTable s={detail} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { isHoliday, classifyWork, minutesToHours } from '@/lib/attendance'

const TYPES = ['연차','반차(오전)','반차(오후)','반반차','병가','공가','출장','외근','특별휴가']

// 공휴일 이름 (캘린더 셀 표시용) - calendar 페이지와 동일
const HOLIDAY_NAMES_LEAVE: Record<string,string> = {
  '2026-01-01':'신정','2026-02-16':'설날연휴','2026-02-17':'설날',
  '2026-02-18':'설날연휴','2026-03-01':'삼일절','2026-05-05':'어린이날',
  '2026-05-25':'부처님오신날','2026-06-03':'현충일',
  '2026-08-17':'광복절대체','2026-09-24':'추석연휴','2026-09-25':'추석',
  '2026-09-26':'추석연휴','2026-10-05':'개천절대체','2026-10-09':'한글날','2026-12-25':'성탄절',
}

const TYPE_TIMES: Record<string, {startTime:string, endTime:string}> = {
  '연차':       { startTime:'09:00', endTime:'18:00' },
  '반차(오전)': { startTime:'09:00', endTime:'13:00' },
  '반차(오후)': { startTime:'14:00', endTime:'18:00' },
  '반반차':     { startTime:'09:00', endTime:'11:00' },
  '병가':       { startTime:'09:00', endTime:'18:00' },
  '공가':       { startTime:'09:00', endTime:'18:00' },
  '출장':       { startTime:'09:00', endTime:'18:00' },
  '외근':       { startTime:'09:00', endTime:'18:00' },
  '특별휴가':   { startTime:'09:00', endTime:'18:00' },
}

// 날짜별 이미 사용한 연차 시간 계산 (연차=8H, 반차=4H, 반반차=2H)
function getDayUsage(date: string, requests: any[]): number {
  const typeDay: Record<string,number> = {
    '연차':8,'반차(오전)':4,'반차(오후)':4,'반반차':2
  }
  return requests
    .filter((r:any) => ['approved','pending'].includes(r.status) && typeDay[r.type])
    .filter((r:any) => {
      const dates = []
      const cur = new Date(r.start_date + 'T12:00:00')
      const end = new Date((r.end_date||r.start_date) + 'T12:00:00')
      while (cur <= end) {
        dates.push(cur.toISOString().slice(0,10))
        cur.setDate(cur.getDate()+1)
      }
      return dates.includes(date)
    })
    .reduce((sum:number, r:any) => sum + (typeDay[r.type]||0), 0)
}

function getDateRange(start: string, end: string): string[] {
  const dates: string[] = []
  const cur = new Date(start + 'T12:00:00')  // 정오 기준 - 타임존 버그 방지
  const endD = new Date(end + 'T12:00:00')
  while (cur <= endD) {
    // toISOString() 대신 로컬 날짜 직접 조합
    const y = cur.getFullYear()
    const m = String(cur.getMonth()+1).padStart(2,'0')
    const d = String(cur.getDate()).padStart(2,'0')
    dates.push(`${y}-${m}-${d}`)
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function isWeekend(ds: string): boolean {
  const d = new Date(ds + 'T00:00:00').getDay()
  return d === 0 || d === 6
}

// 컴포넌트 외부 - Badge
function Badge({ s }: { s: string }) {
  return (
    <span className={s==='pending'?'badge-pending':s==='approved'?'badge-approved':'badge-rejected'}>
      {s==='pending'?'대기':s==='approved'?'승인':'반려'}
    </span>
  )
}

export default function LeavePage() {
  const [profile, setProfile] = useState<any>(null)
  const [approvers, setApprovers] = useState<any[]>([])
  const [myRequests, setMyRequests] = useState<any[]>([])
  const [allRequests, setAllRequests] = useState<any[]>([])
  const [tab, setTab] = useState<'apply'|'all'|'mine'>('apply')
  const [form, setForm] = useState({
    type:'연차', start:'', startTime:'09:00', end:'', endTime:'18:00',
    approverId:'', reason:''
  })
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [showDetail, setShowDetail] = useState<any>(null)
  const [sortKey, setSortKey] = useState<'created_at'|'start_date'|'type'>('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [conflictModal, setConflictModal] = useState<any>(null)
  const [pendingCancelIds, setPendingCancelIds] = useState<string[]>([])
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calEvents, setCalEvents] = useState<any[]>([])
  const [remainLeave, setRemainLeave] = useState(0)
  const [usedLeave, setUsedLeave] = useState(0)
  const [usedApprovedLeave, setUsedApprovedLeave] = useState(0)
  const [usedPendingLeave, setUsedPendingLeave] = useState(0)
  const [totalLeave, setTotalLeave] = useState(0)
  const [leaveError, setLeaveError] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const { data: dirs } = await supabase.from('profiles').select('id,name').eq('role','director')
    // 박팔주를 기본 결재자로 우선 배치 (있으면 맨 앞으로)
    const sortedDirs = (dirs||[]).slice().sort((a:any, b:any) => {
      if (a.name === '박팔주') return -1
      if (b.name === '박팔주') return 1
      return (a.name||'').localeCompare(b.name||'')
    })
    setApprovers(sortedDirs)
    if (sortedDirs[0] && !form.approverId) setForm(f=>({...f, approverId: sortedDirs[0].id}))
    const { data: mine } = await supabase.from('approvals')
      .select('*, approver:approver_id(name), requester:requester_id(name,dept,color,tc)')
      .eq('requester_id', session.user.id).order('created_at',{ascending:false})
    setMyRequests(mine||[])
    if (p?.role === 'director') {
      const { data: a } = await supabase.from('approvals')
        .select('*, requester:requester_id(name,dept,color,tc), approver:approver_id(name)')
        .order('created_at',{ascending:false})
      setAllRequests(a||[])
    }
    // 잔여 연차 계산
    const annualLeave = p?.annual_leave || 120
    setTotalLeave(annualLeave)
    const thisYear = new Date().getFullYear()
    const { data: usedApprovals } = await supabase.from('approvals')
      .select('type, start_date, end_date, status')
      .eq('requester_id', session.user.id)
      .in('status', ['approved', 'pending'])  // 신청중도 포함
      .in('type', ['연차','반차(오전)','반차(오후)','반반차'])
      .gte('start_date', `${thisYear}-01-01`)
    let usedApproved = 0
    let usedPending = 0
    ;(usedApprovals||[]).forEach((a:any) => {
      let hours = 0
      if (a.type === '연차') {
        const dates = getDateRange(a.start_date, a.end_date || a.start_date)
        const workDays = dates.filter(d => !isWeekend(d) && !isHoliday(d)).length
        hours = workDays * 8  // 1일 = 8H
      } else if (a.type === '반차(오전)' || a.type === '반차(오후)') {
        hours = 4  // 반차 = 4H
      } else if (a.type === '반반차') {
        hours = 2  // 반반차 = 2H
      }
      if (a.status === 'approved') usedApproved += hours
      else if (a.status === 'pending') usedPending += hours
    })
    const used = usedApproved + usedPending
    setUsedLeave(used)
    setUsedApprovedLeave(usedApproved)
    setUsedPendingLeave(usedPending)
    setRemainLeave(annualLeave - used)
    // 캘린더 이벤트 - 승인된 events 테이블 + 전체 직원 결재(신청중+승인됨) 통합
    const { data: evs } = await supabase.from('events')
      .select('id,title,start_at,end_at,color,calendar_type,creator_id')
      .or('calendar_type.eq.company,creator_id.eq.' + session.user.id)
    const { data: allApprovals } = await supabase.from('approvals')
      .select('id,type,start_date,end_date,requester_id,status,requester:requester_id(name)')
      .in('status',['pending','approved'])
      .in('type',['연차','반차(오전)','반차(오후)','반반차','출장','병가','외근','특별휴가'])
    const typeColors: Record<string,string> = {
      '연차':'#EF4444','반차(오전)':'#F97316','반차(오후)':'#F97316',
      '반반차':'#F59E0B','출장':'#3B82F6','병가':'#8B5CF6','외근':'#06B6D4','특별휴가':'#EC4899',
    }
    const approvalEvs = (allApprovals||[]).flatMap((a:any) => {
      const name = (a.requester as any)?.name || ''
      const statusLabel = a.status === 'pending' ? '[신청중]' : '[승인]'
      const dates: string[] = []
      const cur = new Date(a.start_date + 'T12:00:00')
      const end = new Date((a.end_date||a.start_date) + 'T12:00:00')
      while (cur <= end) {
        const dw = cur.getDay()
        const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`
        if (dw !== 0 && dw !== 6 && !isHoliday(ds)) dates.push(ds)
        cur.setDate(cur.getDate()+1)
      }
      return dates.map(d => ({
        id: `appr-${a.id}-${d}`,
        title: `${statusLabel} ${a.type} ${name}`,
        start_at: `${d}T09:00:00+09:00`,
        end_at: `${d}T18:00:00+09:00`,
        color: typeColors[a.type] || '#6B7280',
        calendar_type: a.status === 'pending' ? 'pending' : 'company',
        requester_id: a.requester_id,
        isMe: a.requester_id === session.user.id,
        isPending: a.status === 'pending',
        approvalType: a.type,
        requesterName: name,
      }))
    })
    // events 테이블에서 결재 관련 이벤트 제외 (approvalEvs로 대체하여 중복 방지)
    const filteredEvs = (evs||[]).filter((e:any) => {
      const t = e.title || ''
      return !t.startsWith('[연차]') && !t.startsWith('[반차') && !t.startsWith('[반반차') &&
             !t.startsWith('[출장]') && !t.startsWith('[병가]') && !t.startsWith('[외근]') &&
             !t.startsWith('[특별휴가]') && !t.startsWith('[신청중]') && !t.startsWith('[승인]')
    })
    setCalEvents([...filteredEvs, ...approvalEvs])
  }, [form.approverId])

  useEffect(() => { load() }, [load])

  // 신청 연차 시간 계산 (승인됨/대기중 제외)
  function calcRequestHours(type: string, start: string, end: string): number {
    if (!start) return 0
    const typeDay: Record<string,number> = {'연차':8,'반차(오전)':4,'반차(오후)':4,'반반차':2}
    const requestingHours = typeDay[type] || 0
    if (type === '연차') {
      const dates = getDateRange(start, end || start)
      const workDays = dates.filter(d => {
        const dw = new Date(d + 'T00:00:00').getDay()
        if (dw === 0 || dw === 6 || isHoliday(d)) return false
        const existing = getDayUsage(d, myRequests)
        return existing + requestingHours <= 8
      }).length
      return workDays * 8
    } else if (type === '반차(오전)' || type === '반차(오후)') {
      return 4
    } else if (type === '반반차') {
      return 2
    }
    return 0
  }

  function handleTypeChange(type: string) {
    const times = TYPE_TIMES[type] || { startTime:'09:00', endTime:'18:00' }
    setForm(f=>({...f, type, startTime:times.startTime, endTime:times.endTime}))
    setLeaveError('')
  }

  function handleApplyClick(e: React.FormEvent) {
    e.preventDefault()
    if (!form.start || !form.approverId) return
    const leaveTypes = ['연차','반차(오전)','반차(오후)','반반차']
    if (leaveTypes.includes(form.type)) {
      const reqDays = calcRequestHours(form.type, form.start, form.end)
      if (reqDays > remainLeave) {
        setLeaveError(`잔여 연차가 부족합니다. (신청: ${reqDays}H, 잔여: ${remainLeave}H)`)
        return
      }
      setLeaveError('')
      // 겹치는 기존 pending 건 찾기
      const typeDay: Record<string,number> = {'연차':8,'반차(오전)':4,'반차(오후)':4,'반반차':2}
      const requestingHours = typeDay[form.type] || 0
      const reqDates = getDateRange(form.start, form.end || form.start)
        .filter(d => { const dw=new Date(d+'T00:00:00').getDay(); return dw!==0&&dw!==6&&!isHoliday(d) })
      const conflictingRequests = myRequests.filter((r:any) => {
        if (r.status !== 'pending') return false
        const rDates = getDateRange(r.start_date, r.end_date||r.start_date)
          .filter(d => { const dw=new Date(d+'T00:00:00').getDay(); return dw!==0&&dw!==6&&!isHoliday(d) })
        return rDates.some(d => reqDates.includes(d) && getDayUsage(d, myRequests) + requestingHours > 8)
      })
      if (conflictingRequests.length > 0) {
        setConflictModal({ conflicts: conflictingRequests, proceed: false })
        return
      }
    }
    setShowConfirm(true)
  }

  async function handleSubmit(cancelIds: string[] = []) {
    setLoading(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    // 기존 겹치는 건 취소
    for (const id of cancelIds) {
      await supabase.from('approvals').delete().eq('id', id)
    }
    await supabase.from('approvals').insert({
      requester_id: session.user.id, approver_id: form.approverId,
      type: form.type,
      start_date: form.start,
      end_date: form.end || form.start,
      start_time: form.startTime,
      end_time: form.endTime,
      reason: form.reason,
    })
    setAlert('결재 상신 완료')
    setForm(f=>({...f, reason:'', start:'', end:''}))
    setPendingCancelIds([])
    setConflictModal(null)
    setShowConfirm(false); load(); setLoading(false)
    setTimeout(()=>setAlert(''), 3000)
  }

  async function handleApprove(id: string, status: 'approved'|'rejected') {
    const supabase = createClient()
    await supabase.from('approvals').update({status, updated_at: new Date().toISOString()}).eq('id', id)
    setAlert(status==='approved'?'승인되었습니다.':'반려되었습니다.')
    setShowDetail(null); load()
    setTimeout(()=>setAlert(''), 3000)
  }

  async function handleCancel(id: string, isApproved = false) {
    const msg = isApproved
      ? '승인된 결재를 취소하시겠습니까?\n\n관련 근태기록과 캘린더 일정도 함께 삭제됩니다.'
      : '결재 신청을 취소하시겠습니까?'
    if (!confirm(msg)) return
    const supabase = createClient()
    if (isApproved) {
      // 승인 취소 시 근태기록 + 캘린더 이벤트 삭제
      const { data: approval } = await supabase.from('approvals')
        .select('*').eq('id', id).single()
      if (approval) {
        const dates = getDateRange(approval.start_date, approval.end_date || approval.start_date)
        for (const dateStr of dates) {
          await supabase.from('attendance').delete()
            .eq('user_id', approval.requester_id).eq('work_date', dateStr).eq('note', approval.type)
        }
        await supabase.from('events').delete()
          .eq('creator_id', approval.requester_id).eq('is_locked', true)
          .like('title', `[${approval.type}]%`)
          .gte('start_at', `${approval.start_date}T00:00:00`)
          .lte('start_at', `${(approval.end_date||approval.start_date)}T23:59:59`)
      }
    }
    await supabase.from('approvals').delete().eq('id', id)
    setAlert('취소되었습니다.')
    setTimeout(()=>setAlert(''), 2000)
    load()
  }

  // 테이블 렌더링 함수 (화살표 함수 - 중첩 함수 문법 오류 방지)
  const renderTable = (data: any[], showRequester = false) => (
    <div className="card overflow-x-auto">
      {data.length===0 ? (
        <div className="py-12 text-center text-gray-300 text-sm">내역이 없습니다</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {[showRequester?'신청자':'신청일','유형','기간','시간','사유','상태',''].filter(Boolean).map(h=>(
                <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-4 text-xs whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((r:any)=>(
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                {showRequester
                  ? <td className="py-2 pr-4 font-medium">{(r.requester as any)?.name}</td>
                  : <td className="py-2 pr-4 text-xs text-gray-500">{r.created_at?.slice(0,10)}</td>
                }
                <td className="py-2 pr-4 text-xs">{r.type}</td>
                <td className="py-2 pr-4 text-xs whitespace-nowrap">{r.start_date}{r.end_date&&r.end_date!==r.start_date?' ~ '+r.end_date:''}</td>
                <td className="py-2 pr-4 text-xs text-gray-500 whitespace-nowrap">
                  {(() => {
                    const typeH: Record<string,string> = {'연차':'8H/일','반차(오전)':'4H','반차(오후)':'4H','반반차':'2H'}
                    const hLabel = typeH[r.type] || ''
                    if (r.type === '연차') {
                      // 연차는 날짜 수 계산
                      const dates = getDateRange(r.start_date, r.end_date||r.start_date)
                      const workDays = dates.filter((d:string) => {
                        const dw = new Date(d+'T00:00:00').getDay()
                        return dw !== 0 && dw !== 6
                      }).length
                      return <span className="text-purple-600 font-medium">{workDays * 8}H ({workDays}일)</span>
                    }
                    return <span className="text-purple-600 font-medium">{hLabel}{r.start_time&&r.end_time?` (${r.start_time}~${r.end_time})`:''}</span>
                  })()}
                </td>
                <td className="py-2 pr-4 text-xs text-gray-500 max-w-[120px] truncate">{r.reason||'-'}</td>
                <td className="py-2 pr-4"><Badge s={r.status} /></td>
                <td className="py-2">
                  <div className="flex gap-1">
                    <button onClick={()=>setShowDetail(r)} className="btn-secondary text-xs px-2 py-1">조회</button>
                    {r.status==='pending' && r.requester_id===profile?.id && (
                      <button onClick={()=>handleCancel(r.id)} className="btn-danger text-xs px-2 py-1">취소</button>
                    )}
                    {r.status==='approved' && r.requester_id===profile?.id && (
                      <button onClick={()=>handleCancel(r.id, true)} className="btn-secondary text-xs px-2 py-1 text-orange-600 border-orange-200 hover:bg-orange-50">취소 요청</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )

  const approverName = approvers.find(a=>a.id===form.approverId)?.name || '-'
  const isMultiDay = ['연차','병가','출장','특별휴가'].includes(form.type)
  const needsTime = ['출장','외근','반반차'].includes(form.type)
  const leaveTypeSelected = ['연차','반차(오전)','반차(오후)','반반차'].includes(form.type)
  const reqDays = calcRequestHours(form.type, form.start, form.end)
  const afterLeave = remainLeave - reqDays
  // state에서 직접 사용

  const tabs = [
    {key:'apply', label:'신청하기'},
    ...(profile?.role==='director' ? [{key:'all', label:'전체 신청현황'}] : []),
    {key:'mine', label:'내 신청현황'},
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">휴가·출장 신청</h1>
      {alert && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{alert}</div>}

      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {tabs.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${tab===t.key?'border-purple-600 text-purple-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==='apply' && (
        <div className="space-y-4">
          {/* 상단: 연차 현황 카드 + 신청서 (좌우 2단) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* 연차 잔여 현황 카드 - 컴팩트 1줄 */}
          <div className="card border-purple-100 bg-purple-50/50 py-2.5 px-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-gray-700">📅 내 연차</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-500">총 <strong className="text-gray-700 text-sm">{totalLeave}</strong>H</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-500">승인 <strong className="text-red-500 text-sm">{usedApprovedLeave}</strong>H</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-500">신청중 <strong className="text-amber-500 text-sm">{usedPendingLeave}</strong>H</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-500">잔여 <strong className={`text-sm ${remainLeave <= 0 ? 'text-red-500' : 'text-green-600'}`}>{remainLeave}</strong>H</span>
                </div>
              </div>
              {leaveTypeSelected && form.start && reqDays > 0 && (
                <div className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded mt-2 ${afterLeave < 0 ? 'bg-red-100 text-red-700' : 'bg-green-50 text-green-700'}`}>
                  <span>이번 신청: <strong>{reqDays}H</strong></span>
                  <span>신청 후 잔여: <strong>{afterLeave}H</strong> {afterLeave < 0 ? '⚠️ 부족' : '✅'}</span>
                </div>
              )}
              {!leaveTypeSelected && (
                <div className="text-xs text-gray-500 mt-1.5">
                  💡 {form.type}은 연차에서 차감되지 않습니다.
                </div>
              )}
              {leaveError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2.5 py-1.5 mt-1.5">
                  ⚠️ {leaveError}
                </div>
              )}
            </div>

          <div className="card py-3 px-3">
            <div className="text-sm font-semibold text-gray-700 mb-2">📋 휴가·출장 신청</div>
            <form onSubmit={handleApplyClick} className="space-y-2">
              {/* 유형 + 시작일 + 종료일 가로 배치 */}
              <div className={`grid gap-2 ${!['반차(오전)','반차(오후)','반반차'].includes(form.type) ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">유형</label>
                  <select className="input py-1.5 text-sm" value={form.type} onChange={e=>handleTypeChange(e.target.value)}>
                    {TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">시작일</label>
                  <div className={`input py-1.5 text-sm w-full ${form.start?'text-gray-800 bg-purple-50 border-purple-200':'text-gray-400'}`}>
                    {form.start || '👉 캘린더에서 선택'}
                  </div>
                </div>
                {!['반차(오전)','반차(오후)','반반차'].includes(form.type) && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">종료일</label>
                    <div className={`input py-1.5 text-sm w-full ${form.end?'text-gray-800 bg-purple-50 border-purple-200':'text-gray-400'}`}>
                      {form.end || '👉 캘린더에서 선택'}
                    </div>
                  </div>
                )}
              </div>

              {/* 시간 입력 (출장/외근/반반차일 때만) */}
              {needsTime && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">시작 시간</label>
                    <input type="time" className="input py-1.5 text-sm" value={form.startTime}
                      onChange={e=>setForm(f=>({...f,startTime:e.target.value}))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">종료 시간</label>
                    <input type="time" className="input py-1.5 text-sm" value={form.endTime}
                      onChange={e=>setForm(f=>({...f,endTime:e.target.value}))} />
                  </div>
                </div>
              )}

              {/* 유형별 안내 (반차/반반차일 때) */}
              {['반반차','반차(오전)','반차(오후)'].includes(form.type) && (
                <div className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">
                  {form.type === '반반차' && '⏰ 반반차: 날짜 선택 후 시간 입력 (연차 2H)'}
                  {form.type === '반차(오전)' && '⏰ 오전반차: 09:00 ~ 13:00 (연차 4H)'}
                  {form.type === '반차(오후)' && '⏰ 오후반차: 14:00 ~ 18:00 (연차 4H)'}
                </div>
              )}

              {/* 결재자 + 사유 가로 */}
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">결재자</label>
                  <select className="input py-1.5 text-sm" value={form.approverId}
                    onChange={e=>setForm(f=>({...f,approverId:e.target.value}))}>
                    {approvers.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">사유</label>
                  <input type="text" className="input py-1.5 text-sm"
                    placeholder="사유를 입력하세요"
                    value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))} />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button type="submit" className="btn-primary text-sm px-4 py-1.5">결재 상신</button>
              </div>
            </form>
          </div>
          </div>
          {/* 우측: 인라인 캘린더 (항상 표시) */}
          {(()=>{
            const DAYS = ['일','월','화','수','목','금','토']
            const firstDay = new Date(calYear, calMonth, 1).getDay()
            const daysInMonth = new Date(calYear, calMonth+1, 0).getDate()
            const prevDays = new Date(calYear, calMonth, 0).getDate()
            type Cell = {date:string|null, day:number, isCurrentMonth:boolean}
            const cells: Cell[] = []
            for (let i = 0; i < firstDay; i++) {
              cells.push({date:null, day:prevDays-firstDay+1+i, isCurrentMonth:false})
            }
            for (let d = 1; d <= daysInMonth; d++) {
              const ds = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
              cells.push({date:ds, day:d, isCurrentMonth:true})
            }
            const remaining = 42 - cells.length
            for (let i = 1; i <= remaining; i++) {
              cells.push({date:null, day:i, isCurrentMonth:false})
            }

            // 신청하려는 유형의 사용량
            const typeDay: Record<string,number> = {
              '연차':8,'반차(오전)':4,'반차(오후)':4,'반반차':2
            }
            const requestingHours = typeDay[form.type] || 0

            // 날짜별 이미 사용량 계산 → 추가하면 1일 초과하는 날짜 차단
            const blockedDates = new Set<string>()
            const allWorkDates = new Set<string>()
            myRequests
              .filter((r:any) => ['approved','pending'].includes(r.status))
              .forEach((r:any) => {
                getDateRange(r.start_date, r.end_date||r.start_date)
                  .filter(d => { const dw=new Date(d+'T00:00:00').getDay(); return dw!==0&&dw!==6&&!isHoliday(d) })
                  .forEach(d => allWorkDates.add(d))
              })
            allWorkDates.forEach(d => {
              const usage = getDayUsage(d, myRequests)
              if (usage + requestingHours > 8) blockedDates.add(d)
            })

            function getDayEvents(ds: string) {
              return calEvents.filter(e => {
                const d = new Date(e.start_at)
                const kst = new Date(d.getTime() + 9*60*60*1000)
                return kst.toISOString().slice(0,10) === ds
              }).sort((a,b) => {
                const aMe = (a as any).isMe ? 0 : 1
                const bMe = (b as any).isMe ? 0 : 1
                return aMe - bMe
              })
            }

            const isSingleDay = ['반차(오전)','반차(오후)','반반차'].includes(form.type)
            const isHalfHalf = form.type === '반반차'

            // 캘린더 활성 모드: 시작일 미선택 → start, 시작일만 → end, 둘 다 → start 재선택
            const activeMode: 'start' | 'end' = (form.start && !form.end) ? 'end' : 'start'

            function selectDate(ds: string) {
              const dow = new Date(ds + 'T00:00:00').getDay()
              if (dow === 0 || dow === 6) return
              if (isHoliday(ds)) return
              if (blockedDates.has(ds)) return

              if (isSingleDay) {
                setForm(f=>({...f, start:ds, end:ds}))
                setLeaveError('')
              } else if (!form.start || (form.start && form.end)) {
                setForm(f=>({...f, start:ds, end:''}))
              } else {
                if (ds < form.start) {
                  setForm(f=>({...f, start:ds, end:''}))
                  return
                }
                setForm(f=>({...f, end:ds}))
                setLeaveError('')
              }
            }

            const _now = new Date()
            const todayStr = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`

            return (
              <div className="card overflow-hidden p-0">
                {/* 헤더: 가이드 + 상태 표시 */}
                <div className="p-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isSingleDay ? (
                      <div className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-600 text-white">
                        {isHalfHalf ? '날짜 선택 후 시간 입력' : '날짜 선택 (1일)'}
                      </div>
                    ) : (
                      <>
                        <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${activeMode==='start' && !form.end?'bg-purple-600 text-white':form.start?'bg-purple-100 text-purple-700':'bg-gray-100 text-gray-400'}`}>
                          {form.start && !form.end ? '✓ 시작일 선택됨' : form.start && form.end ? '① 시작' : '① 시작일 클릭'}
                        </div>
                        <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${activeMode==='end'?'bg-purple-600 text-white':form.end?'bg-purple-100 text-purple-700':'bg-gray-100 text-gray-400'}`}>
                          {form.end ? '✓ 종료일 선택됨' : '② 종료일'}
                        </div>
                      </>
                    )}
                    <span className="text-xs text-gray-400">주말·승인·신청중 불가</span>
                  </div>
                </div>

                {/* 월 네비게이션 */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-50">
                  <button type="button" onClick={()=>{ if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1)}else setCalMonth(m=>m-1) }}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">‹</button>
                  <span className="text-base font-semibold text-gray-700">{calYear}년 {calMonth+1}월</span>
                  <button type="button" onClick={()=>{ if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1)}else setCalMonth(m=>m+1) }}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">›</button>
                </div>

                {/* 요일 헤더 */}
                <div className="grid grid-cols-7 px-3 pt-2 gap-x-1">
                  {DAYS.map((d,i)=>(
                    <div key={d} className={`text-center text-sm font-bold py-2 rounded
                      ${i===0?'text-red-500 bg-red-50':i===6?'text-blue-500 bg-blue-50':'text-gray-600 bg-gray-50'}`}>{d}</div>
                  ))}
                </div>

                {/* 날짜 그리드 */}
                <div className="grid grid-cols-7 px-3 pb-3 gap-1">
                  {cells.map((cell, idx) => {
                    if (!cell.date || !cell.isCurrentMonth) {
                      const prevDate = cell.isCurrentMonth ? null : (() => {
                        if (cell.day > 20) {
                          const m = calMonth === 0 ? 12 : calMonth
                          const y = calMonth === 0 ? calYear-1 : calYear
                          return `${y}-${String(m).padStart(2,'0')}-${String(cell.day).padStart(2,'0')}`
                        } else {
                          const m = calMonth === 11 ? 1 : calMonth+2
                          const y = calMonth === 11 ? calYear+1 : calYear
                          return `${y}-${String(m).padStart(2,'0')}-${String(cell.day).padStart(2,'0')}`
                        }
                      })()
                      const prevInRange = prevDate && form.start && form.end &&
                        prevDate > form.start && prevDate < form.end &&
                        new Date(prevDate+'T00:00:00').getDay() !== 0 &&
                        new Date(prevDate+'T00:00:00').getDay() !== 6
                      return (
                        <div key={idx} className={`h-24 flex items-start justify-center pt-2 rounded-lg ${prevInRange?'bg-purple-50':''}`}>
                          <span className={`text-base ${prevInRange?'text-purple-300':'text-gray-200'}`}>{cell.day}</span>
                        </div>
                      )
                    }
                    const dow = new Date(cell.date! + 'T00:00:00').getDay()
                    const isSun = dow === 0
                    const isSat = dow === 6
                    const isWknd = isSun || isSat
                    const isHol = HOLIDAY_NAMES_LEAVE[cell.date!]
                    const isBlocked = blockedDates.has(cell.date!)
                    const isStart = form.start === cell.date
                    const isEnd = form.end === cell.date
                    const inRange = !!(form.start && form.end && cell.date! > form.start && cell.date! < form.end)
                    const isWorkDay = !isWknd && !isHol
                    const isInRangeWorkDay = inRange && isWorkDay
                    const isToday = cell.date === todayStr
                    const dayEvs = getDayEvents(cell.date!)
                    const isEndDisabled = activeMode === 'end' && !!form.start && !form.end && cell.date! < form.start
                    const isDisabled = isWknd || !!isHol || isBlocked || !!isEndDisabled

                    let bgClass = 'hover:bg-gray-100 cursor-pointer'
                    if (isStart||isEnd) bgClass = 'bg-purple-600 shadow-md'
                    else if (isBlocked) bgClass = 'bg-red-100 cursor-not-allowed'
                    else if (isInRangeWorkDay) bgClass = 'bg-purple-100'
                    else if (isSat) bgClass = 'bg-blue-50/60 cursor-not-allowed'
                    else if (isSun || isHol) bgClass = 'bg-red-50 cursor-not-allowed'
                    else if (isEndDisabled) bgClass = 'opacity-20 cursor-not-allowed'

                    let txtClass = 'text-gray-700'
                    if (isStart||isEnd) txtClass = 'text-white font-bold'
                    else if (isBlocked) txtClass = 'text-red-500 font-bold'
                    else if (isInRangeWorkDay) txtClass = 'text-purple-700 font-bold'
                    else if (isSat) txtClass = 'text-blue-500'
                    else if (isSun || isHol) txtClass = 'text-red-400'
                    else if (isToday) txtClass = 'text-purple-600 font-bold'

                    return (
                      <button key={idx} type="button"
                        onClick={()=>!isDisabled && selectDate(cell.date!)}
                        disabled={isDisabled}
                        className={`h-24 rounded-lg flex flex-col items-center pt-1.5 transition-colors relative overflow-hidden ${bgClass}`}>
                        <div className="flex items-center gap-1">
                          <span className={`text-base font-bold ${txtClass}`}>{cell.day}</span>
                          {isHol && !isStart && !isEnd && (
                            <span className="text-red-400 font-semibold" style={{fontSize:'10px'}}>{isHol}</span>
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5 w-full px-1 mt-1">
                          {dayEvs.slice(0,2).map((e:any,i:number)=>{
                            // title 매칭: 새 형식 "[상태] 유형 이름" 또는 옛날 형식 "[유형] 이름"
                            const matchNew = String(e.title||'').match(/^\[([^\]]+)\]\s+(\S+)\s+(.+)$/)
                            const matchOld = !matchNew ? String(e.title||'').match(/^\[(\S+)\]\s+(.+)$/) : null
                            let isPending = false
                            let typeName = ''
                            let personName = ''
                            if (matchNew) {
                              isPending = matchNew[1] === '신청중'
                              typeName = matchNew[2]
                              personName = matchNew[3]
                            } else if (matchOld && ['연차','반차(오전)','반차(오후)','반반차','병가','공가','출장','외근','특별휴가'].includes(matchOld[1])) {
                              isPending = false
                              typeName = matchOld[1]
                              personName = matchOld[2]
                            } else {
                              personName = e.title || ''
                            }
                            const typeShort = typeName === '반차(오전)' ? '오전반차'
                              : typeName === '반차(오후)' ? '오후반차'
                              : typeName.replace(/[()]/g, '')
                            const displayText = typeShort ? `${personName}-${typeShort}` : personName
                            // 시작/종료일(보라 배경)일 때는 박스 안에 보이도록 흰색 테두리 강조
                            const onSelected = isStart || isEnd
                            return (
                              <div key={i} className="rounded truncate font-bold text-center"
                                title={e.title}
                                style={{
                                  backgroundColor: onSelected ? 'rgba(255,255,255,0.95)' : (isPending ? '#FEF3C7' : '#DBEAFE'),
                                  border: onSelected ? '1px solid #fff' : (isPending ? '1px solid #FCD34D' : '1px solid #93C5FD'),
                                  color: '#111827',
                                  padding: '2px 4px',
                                  fontSize: '12px',
                                  lineHeight:'15px',
                                }}>
                                {displayText}
                              </div>
                            )
                          })}
                          {dayEvs.length > 2 && (
                            <div className={`text-center font-bold cursor-pointer rounded ${(isStart||isEnd)?'text-white':'text-purple-600 hover:bg-purple-50'}`}
                              title={dayEvs.slice(2).map((e:any)=>e.title).join(', ')}
                              style={{fontSize:'11px',lineHeight:'14px'}}>
                              +{dayEvs.length - 2}건 더보기
                            </div>
                          )}
                        </div>
                        {isToday && !isStart && !isEnd && !isBlocked && <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-0.5"/>}
                      </button>
                    )
                  })}
                </div>

                {/* 하단 - 범례 + 선택 정보 + 초기화 */}
                <div className="px-4 pb-4 border-t border-gray-50 pt-3">
                  <div className="flex gap-3 mb-2 flex-wrap text-sm text-gray-600">
                    <span className="px-2 py-0.5 rounded font-bold text-gray-900" style={{backgroundColor:'#FEF3C7',border:'1px solid #FCD34D',fontSize:'11px'}}>신청중</span>
                    <span className="px-2 py-0.5 rounded font-bold text-gray-900" style={{backgroundColor:'#DBEAFE',border:'1px solid #93C5FD',fontSize:'11px'}}>승인</span>
                    <span className="flex items-center gap-1.5 text-sm text-gray-600"><span className="w-3.5 h-3.5 rounded bg-purple-600 inline-block"/>선택</span>
                    <span className="flex items-center gap-1.5 text-sm text-gray-600"><span className="w-3.5 h-3.5 rounded bg-purple-100 border border-purple-200 inline-block"/>선택 구간</span>
                    <span className="flex items-center gap-1.5 text-sm text-gray-600"><span className="w-3.5 h-3.5 rounded bg-red-100 border border-red-200 inline-block"/>선택불가(초과)</span>
                    <span className="flex items-center gap-1.5 text-sm text-gray-600"><span className="w-3.5 h-3.5 rounded bg-blue-50 border border-blue-200 inline-block"/>토</span>
                    <span className="flex items-center gap-1.5 text-sm text-gray-600"><span className="w-3.5 h-3.5 rounded bg-red-50 border border-red-200 inline-block"/>일·공휴일</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      {form.start && <span>시작: <strong className="text-purple-600">{form.start}</strong></span>}
                      {form.end && form.end !== form.start && <span className="ml-2">종료: <strong className="text-purple-600">{form.end}</strong></span>}
                      {form.start && reqDays > 0 && <span className="ml-2 text-green-600 font-bold">→ {reqDays}H 사용</span>}
                    </div>
                    {(form.start || form.end) && (
                      <button type="button" onClick={()=>{ setForm(f=>({...f,start:'',end:''})) }}
                        className="btn-secondary text-sm px-3 py-1.5">🔄 초기화</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {tab==='all' && profile?.role==='director' && renderTable(allRequests, true)}
      {tab==='mine' && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-400">정렬:</span>
            {([['created_at','신청일'],['start_date','사용일자'],['type','유형']] as const).map(([key,label])=>(
              <button key={key} onClick={()=>{ if(sortKey===key) setSortAsc(a=>!a); else { setSortKey(key); setSortAsc(false) } }}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${sortKey===key?'bg-purple-600 text-white border-purple-600':'border-gray-200 text-gray-500 hover:border-purple-400'}`}>
                {label} {sortKey===key?(sortAsc?'↑':'↓'):''}
              </button>
            ))}
          </div>
          {renderTable([...myRequests].sort((a,b)=>{
            const va = a[sortKey]||'', vb = b[sortKey]||''
            return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
          }))}
        </div>
      )}


      {/* 겹치는 기존 신청 건 처리 모달 */}
      {conflictModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="p-5 border-b border-gray-100">
              <div className="text-base font-semibold text-gray-800">⚠️ 기존 신청 건과 겹칩니다</div>
              <div className="text-xs text-gray-400 mt-1">신청하려는 날짜에 아래 대기중인 신청 건이 있습니다</div>
            </div>
            <div className="p-5 space-y-2">
              {conflictModal.conflicts.map((r:any) => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div>
                    <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full mr-2">{r.type}</span>
                    <span className="text-sm text-gray-700">{r.start_date}{r.end_date&&r.end_date!==r.start_date?` ~ ${r.end_date}`:''}</span>
                  </div>
                  <span className="text-xs text-amber-500">대기중</span>
                </div>
              ))}
              <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                기존 신청 건을 취소하고 새로 신청하시겠습니까?<br/>
                <span className="text-blue-500">취소 후 재신청 시 결재자에게 다시 승인 요청됩니다.</span>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={()=>setConflictModal(null)} className="btn-secondary text-sm">취소</button>
              <button onClick={()=>{
                setPendingCancelIds(conflictModal.conflicts.map((r:any)=>r.id))
                setConflictModal(null)
                setShowConfirm(true)
              }} className="btn-primary text-sm">기존 건 취소 후 재신청</button>
            </div>
          </div>
        </div>
      )}

      {/* 상신 확인 모달 */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
            <div className="p-5 border-b border-gray-100">
              <div className="text-base font-semibold text-gray-800">결재 상신 확인</div>
              <div className="text-xs text-gray-400 mt-1">아래 내용을 확인 후 상신해 주세요</div>
            </div>
            <div className="p-5 space-y-3">
              {[
                {label:'신청 유형', val:form.type},
                {label:'시작', val:`${form.start}${(needsTime||form.type==='반반차')?' '+form.startTime:''}`},
                {label:'종료', val:`${form.end||form.start}${(needsTime||form.type==='반반차')?' '+form.endTime:''}`},
                {label:'결재자', val:approverName},
                {label:'사유', val:form.reason||'(없음)'},
                ...(leaveTypeSelected && reqDays > 0 ? [{label:'사용 연차', val:`${reqDays}H (잔여: ${afterLeave}H)`}] : []),
              ].map(item=>(
                <div key={item.label} className="flex gap-3">
                  <span className="text-xs font-medium text-gray-400 w-16 flex-shrink-0 pt-0.5">{item.label}</span>
                  <span className="text-sm text-gray-800 flex-1">{item.val}</span>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={()=>setShowConfirm(false)} className="btn-secondary text-sm">다시 확인</button>
              <button onClick={()=>handleSubmit(pendingCancelIds)} disabled={loading} className="btn-primary text-sm">
                {loading ? '처리 중...' : '확인, 상신합니다'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 문서 상세 모달 */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-base font-semibold text-gray-800">결재 문서 조회</div>
                <div className="text-xs text-gray-400 mt-0.5">{showDetail.created_at?.slice(0,16).replace('T',' ')} 신청</div>
              </div>
              <Badge s={showDetail.status} />
            </div>
            <div className="p-5 space-y-3">
              {[
                {label:'신청자', val:(showDetail.requester as any)?.name || profile?.name},
                {label:'신청 유형', val:showDetail.type},
                {label:'시작', val:`${showDetail.start_date}${showDetail.start_time?' '+showDetail.start_time:''}`},
                {label:'종료', val:`${showDetail.end_date||showDetail.start_date}${showDetail.end_time?' '+showDetail.end_time:''}`},
                {label:'결재자', val:(showDetail.approver as any)?.name},
              ].map(item=>(
                <div key={item.label} className="flex gap-4 pb-3 border-b border-gray-50">
                  <span className="text-xs font-medium text-gray-400 w-16 flex-shrink-0 pt-0.5">{item.label}</span>
                  <span className="text-sm text-gray-800">{item.val}</span>
                </div>
              ))}
              <div>
                <div className="text-xs font-medium text-gray-400 mb-2">신청 사유</div>
                <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-800 whitespace-pre-wrap min-h-[60px] leading-relaxed">
                  {showDetail.reason || '(사유 없음)'}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={()=>setShowDetail(null)} className="btn-secondary text-sm">닫기</button>
              {showDetail.requester_id===profile?.id && showDetail.status==='pending' && (
                <button onClick={()=>handleCancel(showDetail.id)} className="btn-danger text-sm">취소</button>
              )}
              {showDetail.requester_id===profile?.id && showDetail.status==='approved' && (
                <button onClick={()=>handleCancel(showDetail.id, true)}
                  className="btn-secondary text-sm text-orange-600 border-orange-200 hover:bg-orange-50">승인 취소</button>
              )}
              {profile?.role==='director' && showDetail.status==='pending' && (
                <>
                  <button onClick={()=>handleApprove(showDetail.id,'rejected')} className="btn-danger text-sm">반려</button>
                  <button onClick={()=>handleApprove(showDetail.id,'approved')}
                    className="btn-secondary text-sm text-green-700 border-green-200 hover:bg-green-50">승인</button>
                </>
              )}
              {profile?.role==='director' && showDetail.status==='approved' && (
                <button onClick={()=>handleCancel(showDetail.id, true)}
                  className="btn-secondary text-sm text-orange-600 border-orange-200 hover:bg-orange-50">승인 번복</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { isHoliday, classifyWork, minutesToHours } from '@/lib/attendance'

const TYPES = ['연차','반차(오전)','반차(오후)','반반차','병가','출장','외근','특별휴가']

// 날짜 범위 배열 반환
function getDateRange(start: string, end: string): string[] {
  const dates = []
  const cur = new Date(start + 'T00:00:00')
  const endD = new Date(end + 'T00:00:00')
  while (cur <= endD) {
    dates.push(cur.toISOString().slice(0,10))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}
function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00').getDay()
  return d === 0 || d === 6
}

// 유형별 시간 기본값
const TYPE_TIMES: Record<string, {startTime:string, endTime:string}> = {
  '연차':       { startTime:'09:00', endTime:'18:00' },
  '반차(오전)': { startTime:'09:00', endTime:'13:00' },
  '반차(오후)': { startTime:'13:00', endTime:'18:00' },
  '반반차':     { startTime:'09:00', endTime:'11:00' },
  '병가':       { startTime:'09:00', endTime:'18:00' },
  '출장':       { startTime:'09:00', endTime:'18:00' },
  '외근':       { startTime:'09:00', endTime:'18:00' },
  '특별휴가':   { startTime:'09:00', endTime:'18:00' },
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
  const [showCal, setShowCal] = useState<'start'|'end'|null>(null)
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calEvents, setCalEvents] = useState<any[]>([])
  const [remainLeave, setRemainLeave] = useState(0)       // 잔여 연차 (일)
  const [usedLeave, setUsedLeave] = useState(0)            // 사용 연차 (일)
  const [totalLeave, setTotalLeave] = useState(0)          // 총 연차 (일)
  const [leaveError, setLeaveError] = useState('')         // 연차 부족 오류

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const { data: dirs } = await supabase.from('profiles').select('id,name').eq('role','director')
    setApprovers(dirs||[])
    if (dirs?.[0] && !form.approverId) setForm(f=>({...f, approverId: dirs[0].id}))
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

    // 연차 잔여 계산
    const annualLeave = p?.annual_leave || 15
    setTotalLeave(annualLeave)
    const thisYear = new Date().getFullYear()
    const { data: usedApprovals } = await supabase.from('approvals')
      .select('type, start_date, end_date')
      .eq('requester_id', session.user.id)
      .eq('status', 'approved')
      .in('type', ['연차','반차(오전)','반차(오후)','반반차'])
      .gte('start_date', `${thisYear}-01-01`)
    let used = 0
    ;(usedApprovals||[]).forEach((a:any) => {
      if (a.type === '연차') {
        const dates = getDateRange(a.start_date, a.end_date || a.start_date)
        const workDays = dates.filter(d => !isWeekend(d) && !isHoliday(d)).length
        used += workDays
      } else if (a.type === '반차(오전)' || a.type === '반차(오후)') {
        used += 0.5
      } else if (a.type === '반반차') {
        used += 0.25
      }
    })
    setUsedLeave(used)
    setRemainLeave(annualLeave - used)

    // 캘린더 이벤트 로드 (전사 공유 + 본인 일정)
    const { data: evs } = await supabase.from('events')
      .select('title,start_at,end_at,color,calendar_type')
      .or('calendar_type.eq.company,creator_id.eq.' + session.user.id)
    setCalEvents(evs||[])
  }, [form.approverId])

  useEffect(() => { load() }, [load])

  // 신청 시 사용될 연차 일수 계산
  function calcRequestDays(type: string, start: string, end: string): number {
    if (!start) return 0
    if (type === '연차') {
      const dates = getDateRange(start, end || start)
      // 주말 + 공휴일 + 이미 승인된 연차 날짜 제외
      const alreadyApproved = new Set(
        myRequests
          .filter((r:any) => r.status === 'approved' && ['연차','반차(오전)','반차(오후)','반반차'].includes(r.type))
          .flatMap((r:any) => getDateRange(r.start_date, r.end_date || r.start_date))
      )
      return dates.filter(d => !isWeekend(d) && !isHoliday(d) && !alreadyApproved.has(d)).length
    } else if (type === '반차(오전)' || type === '반차(오후)') {
      return 0.5
    } else if (type === '반반차') {
      return 0.25
    }
    return 0
  }

  // 유형 변경 시 시간 자동 설정
  function handleTypeChange(type: string) {
    const times = TYPE_TIMES[type] || { startTime:'09:00', endTime:'18:00' }
    setForm(f=>({...f, type, startTime:times.startTime, endTime:times.endTime}))
    setLeaveError('')
  }

  function handleApplyClick(e: React.FormEvent) {
    e.preventDefault()
    if (!form.start || !form.approverId) return
    // 연차 관련 유형만 잔여일수 체크
    const leaveTypes = ['연차','반차(오전)','반차(오후)','반반차']
    if (leaveTypes.includes(form.type)) {
      const reqDays = calcRequestDays(form.type, form.start, form.end)
      if (reqDays > remainLeave) {
        setLeaveError(`잔여 연차가 부족합니다. (신청: ${reqDays}일, 잔여: ${remainLeave}일)`)
        return
      }
      setLeaveError('')
    }
    setShowConfirm(true)
  }

  async function handleSubmit() {
    setLoading(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
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
    setShowConfirm(false); load(); setLoading(false)
    setTimeout(()=>setAlert(''), 3000)
  }

  async function handleApprove(id: string, status: 'approved'|'rejected') {
    const supabase = createClient()
    await supabase.from('approvals').update({status, updated_at: new Date().toISOString()}).eq('id', id)

    if (status === 'approved') {
      const approval = [...myRequests, ...allRequests].find((r:any) => r.id === id)
      if (approval) {
        const leaveTypes = ['연차','반차(오전)','반차(오후)','반반차','출장']
        const dates = getDateRange(approval.start_date, approval.end_date || approval.start_date)

        // 1. 근태 자동등록
        if (leaveTypes.includes(approval.type)) {
          for (const dateStr of dates) {
            if (isWeekend(dateStr) || isHoliday(dateStr)) continue
            let checkIn = '09:00:00', checkOut = '18:00:00'
            if (approval.type === '반차(오전)') { checkIn = '09:00:00'; checkOut = '13:00:00' }
            else if (approval.type === '반차(오후)') { checkIn = '13:00:00'; checkOut = '18:00:00' }
            else if (approval.type === '반반차') { checkIn = '09:00:00'; checkOut = '11:00:00' }
            const r = classifyWork(dateStr, checkIn, checkOut)
            const attData = {
              user_id: approval.requester_id, work_date: dateStr,
              check_in: checkIn, check_out: checkOut, is_holiday: isHoliday(dateStr),
              reg_hours: minutesToHours(r.reg), ext_hours: minutesToHours(r.ext),
              night_hours: minutesToHours(r.night), hol_hours: minutesToHours(r.hReg),
              hol_eve_hours: minutesToHours(r.hEve), hol_night_hours: minutesToHours(r.hNight),
              ignored_hours: minutesToHours(r.ignored), note: approval.type,
            }
            const { data: existing } = await supabase.from('attendance')
              .select('id,note').eq('user_id', approval.requester_id).eq('work_date', dateStr)
            if (existing && existing.length > 0) {
              const hasLeaveRecord = existing.some((e:any) => leaveTypes.includes(e.note))
              if (!hasLeaveRecord) {
                await supabase.from('attendance').delete()
                  .eq('user_id', approval.requester_id).eq('work_date', dateStr)
                await supabase.from('attendance').insert(attData)
              }
            } else {
              await supabase.from('attendance').insert(attData)
            }
          }
        }

        // 2. 캘린더 자동등록
        const typeColors: Record<string,string> = {
          '연차':'#EF4444','반차(오전)':'#F97316','반차(오후)':'#F97316',
          '반반차':'#FBBF24','출장':'#3B82F6','병가':'#8B5CF6',
          '외근':'#06B6D4','특별휴가':'#EC4899',
        }
        const startDate = approval.start_date
        const endDate = approval.end_date || approval.start_date
        const startTime = approval.start_time || '09:00'
        const endTime = approval.end_time || '18:00'
        const { data: ev } = await supabase.from('events').insert({
          title: `[${approval.type}] ${(approval.requester as any)?.name || ''}`,
          start_at: `${startDate}T${startTime}:00`,
          end_at: `${endDate}T${endTime}:00`,
          color: typeColors[approval.type] || '#6B7280',
          creator_id: approval.requester_id,
          calendar_type: 'personal',
          is_locked: true,
        }).select().single()
        // 본인을 참석자로 등록
        if (ev) {
          await supabase.from('event_attendees').insert({
            event_id: ev.id, user_id: approval.requester_id, status: 'accepted'
          })
        }
      }
    }

    setAlert(status==='approved'?'승인되었습니다.':'반려되었습니다.')
    setShowDetail(null); load()
    setTimeout(()=>setAlert(''), 3000)
  }

  async function handleCancel(id: string) {
    if (!confirm('결재 신청을 취소하시겠습니까?')) return
    const supabase = createClient()
    await supabase.from('approvals').delete().eq('id', id)
    load()
  }

  const Badge = ({s}: {s:string}) => (
    <span className={s==='pending'?'badge-pending':s==='approved'?'badge-approved':'badge-rejected'}>
      {s==='pending'?'대기':s==='approved'?'승인':'반려'}
    </span>
  )

  const RequestTable = ({data, showRequester=false}: {data:any[], showRequester?:boolean}) => (
    <div className="card overflow-x-auto">
      {data.length===0 ? (
        <div className="py-12 text-center text-gray-300 text-sm">내역이 없습니다</div>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100">
            {[showRequester?'신청자':'신청일','유형','기간','시간','사유','상태',''].filter(Boolean).map(h=>(
              <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-4 text-xs whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {data.map(r=>(
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                {showRequester
                  ? <td className="py-2 pr-4 font-medium">{(r.requester as any)?.name}</td>
                  : <td className="py-2 pr-4 text-xs text-gray-500">{r.created_at?.slice(0,10)}</td>
                }
                <td className="py-2 pr-4 text-xs">{r.type}</td>
                <td className="py-2 pr-4 text-xs whitespace-nowrap">{r.start_date}{r.end_date&&r.end_date!==r.start_date?' ~ '+r.end_date:''}</td>
                <td className="py-2 pr-4 text-xs text-gray-500 whitespace-nowrap">
                  {r.start_time&&r.end_time ? `${r.start_time}~${r.end_time}` : '-'}
                </td>
                <td className="py-2 pr-4 text-xs text-gray-500 max-w-[120px] truncate">{r.reason||'-'}</td>
                <td className="py-2 pr-4"><Badge s={r.status} /></td>
                <td className="py-2">
                  <div className="flex gap-1">
                    <button onClick={()=>setShowDetail(r)} className="btn-secondary text-xs px-2 py-1">조회</button>
                    {r.status==='pending' && r.requester_id===profile?.id && (
                      <button onClick={()=>handleCancel(r.id)} className="btn-danger text-xs px-2 py-1">취소</button>
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
  const needsTime = ['반차(오전)','반차(오후)','반반차','출장','외근','병가'].includes(form.type) // 연차/특별휴가는 시간 불필요

  const tabs = [
    {key:'apply', label:'신청하기'},
    ...(profile?.role==='director' ? [{key:'all', label:'전체 신청현황'}] : []),
    {key:'mine', label:'내 신청현황'},
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto">
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
        <div className="max-w-lg space-y-3">
          {/* 연차 잔여 현황 카드 */}
          {['연차','반차(오전)','반차(오후)','반반차'].includes(form.type) && (
            <div className="card border-purple-100 bg-purple-50/50">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">📅</span>
                <span className="text-sm font-semibold text-gray-700">내 연차 현황</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-white rounded-lg p-2.5 text-center border border-purple-100">
                  <div className="text-xs text-gray-400 mb-1">총 연차</div>
                  <div className="text-lg font-bold text-gray-700">{totalLeave}<span className="text-xs font-normal text-gray-400 ml-0.5">일</span></div>
                </div>
                <div className="bg-white rounded-lg p-2.5 text-center border border-orange-100">
                  <div className="text-xs text-gray-400 mb-1">사용</div>
                  <div className="text-lg font-bold text-orange-500">{usedLeave}<span className="text-xs font-normal text-gray-400 ml-0.5">일</span></div>
                </div>
                <div className={`rounded-lg p-2.5 text-center border ${remainLeave <= 0 ? 'bg-red-50 border-red-200' : 'bg-white border-green-100'}`}>
                  <div className="text-xs text-gray-400 mb-1">잔여</div>
                  <div className={`text-lg font-bold ${remainLeave <= 0 ? 'text-red-500' : 'text-green-600'}`}>{remainLeave}<span className="text-xs font-normal text-gray-400 ml-0.5">일</span></div>
                </div>
              </div>
              {/* 이번 신청 후 잔여 실시간 계산 */}
              {form.start && (() => {
                const reqDays = calcRequestDays(form.type, form.start, form.end)
                const afterLeave = remainLeave - reqDays
                return reqDays > 0 ? (
                  <div className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${afterLeave < 0 ? 'bg-red-100 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    <span>이번 신청: <strong>{reqDays}일</strong> 사용</span>
                    <span>신청 후 잔여: <strong>{afterLeave}일</strong> {afterLeave < 0 ? '⚠️ 부족' : '✅'}</span>
                  </div>
                ) : null
              })()}
              {leaveError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-1">
                  ⚠️ {leaveError}
                </div>
              )}
            </div>
          )}

          <div className="card">
          <div className="text-sm font-medium text-gray-700 mb-4">휴가·출장 신청서</div>
          <form onSubmit={handleApplyClick} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">신청 유형</label>
              <select className="input" value={form.type} onChange={e=>handleTypeChange(e.target.value)}>
                {TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>

            {/* 시작일 + 시작시간 */}
            <div className={`grid gap-3 ${needsTime ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">시작일 *</label>
                <button type="button"
                  onClick={()=>{ setCalYear(form.start?new Date(form.start).getFullYear():new Date().getFullYear()); setCalMonth(form.start?new Date(form.start).getMonth():new Date().getMonth()); setShowCal('start') }}
                  className={`input w-full text-left ${form.start?'text-gray-800':'text-gray-400'}`}>
                  {form.start || '날짜 선택 📅'}
                </button>
              </div>
              {needsTime && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">시작 시간</label>
                  <input type="time" className="input" value={form.startTime}
                    onChange={e=>setForm(f=>({...f,startTime:e.target.value}))} />
                </div>
              )}
            </div>

            {/* 종료일 + 종료시간 - 반차/반반차는 종료일 불필요 */}
            {!['반차(오전)','반차(오후)','반반차'].includes(form.type) && (
              <div className={`grid gap-3 ${needsTime ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">종료일</label>
                  <button type="button"
                    onClick={()=>{ setCalYear(form.end?new Date(form.end).getFullYear():form.start?new Date(form.start).getFullYear():new Date().getFullYear()); setCalMonth(form.end?new Date(form.end).getMonth():form.start?new Date(form.start).getMonth():new Date().getMonth()); setShowCal('end') }}
                    className={`input w-full text-left ${form.end?'text-gray-800':'text-gray-400'}`}>
                    {form.end || '날짜 선택 📅'}
                  </button>
                </div>
                {needsTime && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">종료 시간</label>
                    <input type="time" className="input" value={form.endTime}
                      onChange={e=>setForm(f=>({...f,endTime:e.target.value}))} />
                  </div>
                )}
              </div>
            )}

            {/* 유형별 안내 */}
            {['반반차','반차(오전)','반차(오후)'].includes(form.type) && (
              <div className="text-xs text-purple-600 bg-purple-50 px-3 py-2 rounded-lg">
                {form.type === '반반차' && '⏰ 반반차: 09:00 ~ 11:00 (2시간)'}
                {form.type === '반차(오전)' && '⏰ 오전반차: 09:00 ~ 13:00 (4시간)'}
                {form.type === '반차(오후)' && '⏰ 오후반차: 13:00 ~ 18:00 (4시간)'}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">결재자</label>
              <select className="input" value={form.approverId}
                onChange={e=>setForm(f=>({...f,approverId:e.target.value}))}>
                {approvers.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">사유</label>
              <textarea className="input resize-none" rows={3}
                placeholder="사유를 상세히 입력해 주세요..."
                value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))} />
            </div>
            <div className="flex justify-end">
              <button type="submit" className="btn-primary">결재 상신</button>
            </div>
          </form>
          </div>
        </div>
      )}

      {tab==='all' && profile?.role==='director' && <RequestTable data={allRequests} showRequester />}
      {tab==='mine' && <RequestTable data={myRequests} />}

      {/* 캘린더 날짜 선택 모달 */}
      {showCal && (() => {
        const DAYS = ['일','월','화','수','목','금','토']
        const firstDay = new Date(calYear, calMonth, 1).getDay()
        const daysInMonth = new Date(calYear, calMonth+1, 0).getDate()
        const prevDays = new Date(calYear, calMonth, 0).getDate()
        const cells: {date:string|null, day:number, isCurrentMonth:boolean}[] = []
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

        function getDayEvents(ds: string) {
          return calEvents.filter(e => e.start_at.slice(0,10) <= ds && e.end_at.slice(0,10) >= ds)
        }

        // 이미 승인된 연차 날짜
        const approvedDates = new Set(
          myRequests
            .filter((r:any) => r.status === 'approved' && ['연차','반차(오전)','반차(오후)','반반차'].includes(r.type))
            .flatMap((r:any) => getDateRange(r.start_date, r.end_date || r.start_date))
        )

        function selectDate(ds: string) {
          const dow = new Date(ds + 'T00:00:00').getDay()
          if (dow === 0 || dow === 6) return
          if (approvedDates.has(ds) && form.type === '연차') return // 이미 승인된 날은 선택 불가
          if (showCal === 'start') {
            setForm(f=>({...f, start:ds, end:''}))
            // 연차는 시작일 선택 후 종료일 모드로 자동 전환
            if (['연차','병가','출장','특별휴가'].includes(form.type)) {
              setShowCal('end')
            } else {
              setShowCal(null)
            }
          } else {
            if (form.start && ds < form.start) {
              // 종료일이 시작일보다 이전이면 시작일로 재설정
              setForm(f=>({...f, start:ds, end:''}))
              setShowCal('end')
              return
            }
            setForm(f=>({...f, end:ds}))
            setLeaveError('')
            setShowCal(null)
          }
        }

        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${showCal==='start'?'bg-purple-600 text-white':'bg-gray-100 text-gray-400'}`}>
                    1 시작일
                  </div>
                  {['연차','병가','출장','특별휴가'].includes(form.type) && (
                    <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${showCal==='end'?'bg-purple-600 text-white':'bg-gray-100 text-gray-400'}`}>
                      2 종료일
                    </div>
                  )}
                  <span className="text-xs text-gray-400">주말·이미승인된날 선택불가</span>
                </div>
                <button onClick={()=>setShowCal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              </div>
              {/* 월 네비게이션 */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-50">
                <button onClick={()=>{ if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1)}else setCalMonth(m=>m-1) }}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">‹</button>
                <span className="text-sm font-semibold text-gray-700">{calYear}년 {calMonth+1}월</span>
                <button onClick={()=>{ if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1)}else setCalMonth(m=>m+1) }}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">›</button>
              </div>
              {/* 요일 헤더 */}
              <div className="grid grid-cols-7 px-3 pt-2">
                {DAYS.map((d,i)=>(
                  <div key={d} className={`text-center text-xs font-medium py-1.5 ${i===0?'text-red-400':i===6?'text-blue-400':'text-gray-400'}`}>{d}</div>
                ))}
              </div>
              {/* 날짜 그리드 */}
              <div className="grid grid-cols-7 px-3 pb-3 gap-y-1">
                {cells.map((cell, idx) => {
                  if (!cell.date || !cell.isCurrentMonth) {
                    return <div key={idx} className="h-14 flex items-start justify-center pt-1"><span className="text-xs text-gray-200">{cell.day}</span></div>
                  }
                  const dow = new Date(cell.date + 'T00:00:00').getDay()
                  const isWeekend = dow === 0 || dow === 6
                  const isHol = isHoliday(cell.date)
                  const isStart = form.start === cell.date
                  const isEnd = form.end === cell.date
                  const inRange = form.start && form.end && cell.date > form.start && cell.date < form.end
                  const isToday = cell.date === new Date().toISOString().slice(0,10)
                  const dayEvs = getDayEvents(cell.date)
                  const isAlreadyApproved = approvedDates.has(cell.date) && form.type === '연차'
                  const isEndDisabled = showCal === 'end' && form.start && cell.date < form.start

                  return (
                    <button key={idx} type="button"
                      onClick={()=>!isWeekend && !isHol && !isEndDisabled && !isAlreadyApproved && selectDate(cell.date!)}
                      disabled={isWeekend || isHol || !!isEndDisabled || isAlreadyApproved}
                      className={`h-14 rounded-lg flex flex-col items-center pt-1 transition-colors relative
                        ${isStart ? 'bg-purple-600 text-white' :
                          isEnd ? 'bg-purple-600 text-white' :
                          inRange ? 'bg-purple-50' :
                          isAlreadyApproved ? 'bg-red-50 cursor-not-allowed' :
                          isWeekend||isHol ? 'opacity-30 cursor-not-allowed' :
                          isEndDisabled ? 'opacity-20 cursor-not-allowed' :
                          'hover:bg-gray-100 cursor-pointer'}
                      `}>
                      <span className={`text-xs font-medium ${
                        isStart||isEnd ? 'text-white' :
                        isAlreadyApproved ? 'text-red-400' :
                        dow===0||isHol ? 'text-red-500' :
                        dow===6 ? 'text-blue-500' :
                        isToday ? 'text-purple-600 font-bold' : 'text-gray-700'
                      }`}>{cell.day}</span>
                      {isAlreadyApproved && <span className="text-red-300" style={{fontSize:'7px'}}>승인됨</span>}
                      {isToday && !isStart && !isEnd && !isAlreadyApproved && <div className="w-1 h-1 rounded-full bg-purple-400 mt-0.5"/>}
                      <div className="flex flex-col gap-0.5 w-full px-0.5 mt-0.5">
                        {dayEvs.slice(0,2).map((e:any,i:number)=>(
                          <div key={i} className="text-center rounded text-white truncate"
                            style={{fontSize:'8px', backgroundColor: e.color||'#534AB7', padding:'0 2px'}}>
                            {e.title}
                          </div>
                        ))}
                      </div>
                    </button>
                  )
                })}
              </div>
              {/* 선택된 날짜 표시 */}
              <div className="px-4 pb-4 border-t border-gray-50 pt-3 flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  {form.start && <span>시작: <strong className="text-purple-600">{form.start}</strong></span>}
                  {form.end && form.end !== form.start && <span className="ml-2">종료: <strong className="text-purple-600">{form.end}</strong></span>}
                </div>
                <button onClick={()=>setShowCal(null)} className="btn-secondary text-xs px-3 py-1.5">확인</button>
              </div>
            </div>
          </div>
        )
      })()}

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
                {label:'시작', val:`${form.start} ${form.startTime}`},
                {label:'종료', val:`${form.end||form.start} ${form.endTime}`},
                {label:'결재자', val:approverName},
                {label:'사유', val:form.reason||'(없음)'},
              ].map(item=>(
                <div key={item.label} className="flex gap-3">
                  <span className="text-xs font-medium text-gray-400 w-16 flex-shrink-0 pt-0.5">{item.label}</span>
                  <span className="text-sm text-gray-800 flex-1 whitespace-pre-wrap">{item.val}</span>
                </div>
              ))}
              <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
                ⚠️ 상신 후에는 결재자가 처리하기 전까지 취소 가능합니다
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={()=>setShowConfirm(false)} className="btn-secondary text-sm">다시 확인</button>
              <button onClick={handleSubmit} disabled={loading} className="btn-primary text-sm">
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
              <span className={showDetail.status==='pending'?'badge-pending':showDetail.status==='approved'?'badge-approved':'badge-rejected'}>
                {showDetail.status==='pending'?'대기':showDetail.status==='approved'?'승인':'반려'}
              </span>
            </div>
            <div className="p-5 space-y-3">
              {[
                {label:'신청자', val:(showDetail.requester as any)?.name || profile?.name},
                {label:'신청 유형', val:showDetail.type},
                {label:'시작', val:`${showDetail.start_date} ${showDetail.start_time||''}`},
                {label:'종료', val:`${showDetail.end_date||showDetail.start_date} ${showDetail.end_time||''}`},
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
              {profile?.role==='director' && showDetail.status==='pending' && (
                <>
                  <button onClick={()=>handleApprove(showDetail.id,'rejected')} className="btn-danger text-sm">반려</button>
                  <button onClick={()=>handleApprove(showDetail.id,'approved')}
                    className="btn-secondary text-sm text-green-700 border-green-200 hover:bg-green-50">승인</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

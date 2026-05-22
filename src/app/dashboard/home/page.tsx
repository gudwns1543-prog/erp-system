'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { classifyWork, minutesToHours, isHoliday } from '@/lib/attendance'
import { Logo } from '@/components/Logo'

const DAYS = ['일','월','화','수','목','금','토']
const DAYS_SHORT = ['일','월','화','수','목','금','토']
function todayStr() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
}

// 한국어 조사 자동 (은/는, 이/가, 을/를)
function josa(word: string, eunNun: '은/는' | '이/가' | '을/를' = '은/는'): string {
  if (!word) return ''
  const last = word.charCodeAt(word.length - 1)
  if (last < 0xAC00 || last > 0xD7A3) return eunNun === '은/는' ? '는' : eunNun === '이/가' ? '가' : '를'
  const hasFinal = (last - 0xAC00) % 28 !== 0
  if (eunNun === '은/는') return hasFinal ? '은' : '는'
  if (eunNun === '이/가') return hasFinal ? '이' : '가'
  return hasFinal ? '을' : '를'
}

const leaveNotes = ['연차','반차(오전)','반차(오후)','반반차','병가','공가','출장','외근','특별휴가']

// UTC timestamp → KST 날짜 문자열 (YYYY-MM-DD)
function toKSTDate(utcStr: string): string {
  const d = new Date(utcStr)
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

function makeApprovalEvents(approvals: any[], myUserId: string) {
  const typeColors: Record<string,string> = {
    '연차':'#EF4444','반차(오전)':'#F97316','반차(오후)':'#F97316',
    '반반차':'#F59E0B','출장':'#3B82F6','병가':'#8B5CF6',
    '외근':'#06B6D4','특별휴가':'#EC4899',
  }
  return approvals.flatMap((a:any) => {
    const name = (a.requester as any)?.name || ''
    const isMe = a.requester_id === myUserId
    const statusLabel = a.status === 'pending' ? '[신청중]' : '[승인]'
    const dates: string[] = []
    const cur = new Date(a.start_date + 'T12:00:00')
    const end = new Date((a.end_date||a.start_date) + 'T12:00:00')
    while (cur <= end) {
      const dw = cur.getDay()
      const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`
      // 공휴일 제외는 클라이언트 isHoliday가 없으므로 주말만 제외
      if (dw !== 0 && dw !== 6) dates.push(ds)
      cur.setDate(cur.getDate() + 1)
    }
    return dates.map(d => ({
      id: `approval-${a.id}-${d}`,
      title: `${statusLabel} ${a.type} ${name}`,
      start_at: `${d}T09:00:00+09:00`,
      end_at: `${d}T18:00:00+09:00`,
      color: typeColors[a.type] || '#6B7280',
      creator_id: a.requester_id,
      calendar_type: a.status === 'pending' ? 'pending' : 'company',
      isMe,
      isPending: a.status === 'pending',
    }))
  })
}

export default function HomePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [time, setTime] = useState('')
  const [today, setToday] = useState<any>(null)
  const [stats, setStats] = useState({monthReg:0, remainLeave:0, pendingApprovals:0})
  const [allEvents, setAllEvents] = useState<any[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([])
  const [recentNotices, setRecentNotices] = useState<any[]>([])
  const [teamStatus, setTeamStatus] = useState<any[]>([])
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [briefing, setBriefing] = useState('')
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [kecoItems, setKecoItems] = useState<any[]>([])
  const [kecoLoading, setKecoLoading] = useState(true)
  // 어제 미퇴근 세션 (퇴근 시간 사후 입력용)
  const [unclockedSession, setUnclockedSession] = useState<any>(null)
  const [pickedCheckoutTime, setPickedCheckoutTime] = useState('')
  // 홈 UI: 접힘 상태
  const [briefingOpen, setBriefingOpen] = useState(false)
  const [newsExpanded, setNewsExpanded] = useState(false)
  // 업무 카운트
  const [taskCounts, setTaskCounts] = useState({ todo: 0, in_progress: 0, blocked: 0, overdue: 0 })
  // 공지사항 새글 여부 (마지막 읽은 시각 이후)
  const [hasNewNotice, setHasNewNotice] = useState(false)
  // 통합 알림 (홈 화면 상단)
  const [notifications, setNotifications] = useState<any[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(true)
  // 사용자가 X로 닫은 알림 ID들 (localStorage에 보관, 새로 안 뜸)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [kecoFilter, setKecoFilter] = useState('전체')
  // 캘린더에 스티커로 표시할 업무 (마감일 있는 본인 관련 + 공유)
  const [calendarTasks, setCalendarTasks] = useState<any[]>([])

  function nowStr() {
    const n = new Date()
    return String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0')+':'+String(n.getSeconds()).padStart(2,'0')
  }

  async function handleCheckIn() {
    // 저녁식사 시간(18:00 ~ 19:00) 출근 차단
    const now = new Date()
    const hour = now.getHours()
    const minute = now.getMinutes()
    const totalMin = hour * 60 + minute
    if (totalMin >= 18 * 60 && totalMin < 19 * 60) {
      alert('🍱 지금은 저녁식사 시간입니다.\n19:00 이후에 다시 출근해 주세요.')
      return
    }

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const ds = todayStr()
    await supabase.from('attendance').insert({
      user_id: session.user.id, work_date: ds,
      check_in: nowStr(), is_holiday: isHoliday(ds),
    })
    load()
  }

  async function handleCheckOut() {
    if (!today?.check_in) return
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const outTime = nowStr(); const ds = todayStr()
    const r = classifyWork(ds, today.check_in, outTime)
    // check_out이 없는 가장 최근 세션 업데이트 (created_at 기준)
    const { data: openSessions } = await supabase.from('attendance')
      .select('id').eq('user_id', session.user.id).eq('work_date', ds).is('check_out', null)
      .order('created_at', {ascending: false}).limit(1)
    if (openSessions?.[0]) {
      await supabase.from('attendance').update({
        check_out: outTime,
        reg_hours: minutesToHours(r.reg), ext_hours: minutesToHours(r.ext),
        night_hours: minutesToHours(r.night), hol_hours: minutesToHours(r.hReg),
        hol_eve_hours: minutesToHours(r.hEve), hol_night_hours: minutesToHours(r.hNight),
        ignored_hours: minutesToHours(r.ignored),
      }).eq('id', openSessions[0].id)
    }
    load()
  }

  async function handleResumeWork() {
    // 퇴근 후 복귀 = 새 세션 추가 (출근과 동일)
    handleCheckIn()
  }

  // 어제 미퇴근 시간 사후 수정 요청
  async function submitUnclockedFix() {
    if (!unclockedSession || !pickedCheckoutTime) return
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || !profile) return

    // 입력한 시각 검증: 어제 check_in 이후여야 함
    const inSec = unclockedSession.check_in.split(':').map(Number)
    const outSec = pickedCheckoutTime.split(':').map(Number)
    const inMin = inSec[0] * 60 + inSec[1]
    const outMin = outSec[0] * 60 + outSec[1]
    // 익일로 넘어간 경우(00~06시): outMin이 작은 게 정상 (자정 넘김)
    // 그 외 경우: outMin이 inMin보다 커야 함
    const isOvernight = outMin < 12 * 60 // 12시 이전 = 익일로 간주
    if (!isOvernight && outMin <= inMin) {
      alert('퇴근 시간은 출근 시간 이후여야 합니다.')
      return
    }

    // 결재자 찾기 (박팔주 우선)
    const { data: dirs } = await supabase.from('profiles').select('id,name').eq('role','director')
    const sortedDirs = (dirs||[]).slice().sort((a:any,b:any)=>{
      if (a.name==='박팔주') return -1
      if (b.name==='박팔주') return 1
      return (a.name||'').localeCompare(b.name||'')
    })
    const approverId = sortedDirs[0]?.id

    // attendance는 그대로 유지 (야간자동컷오프 상태 유지)
    // 단 note만 '수정요청중'으로 변경하여 팝업이 다시 안 뜨도록
    // (check_out 시각은 변경하지 않음 - 결재 승인되어야 비로소 반영)
    await supabase.from('attendance').update({
      note: '수정요청중',
    }).eq('id', unclockedSession.id)

    // 결재자에게 결재 요청 (approvals 테이블에 type='퇴근시간수정')
    // 본인이 입력한 시각은 reason에 상세히 기록 + start_time/end_time에도 기록
    if (approverId) {
      await supabase.from('approvals').insert({
        type: '퇴근시간수정',
        requester_id: session.user.id,
        approver_id: approverId,
        start_date: unclockedSession.work_date,
        end_date: unclockedSession.work_date,
        start_time: unclockedSession.check_in, // 출근 시각
        end_time: pickedCheckoutTime + ':00', // 본인이 주장하는 퇴근 시각
        status: 'pending',
        reason: `${unclockedSession.work_date} 퇴근시각 사후입력 요청\n출근: ${unclockedSession.check_in.slice(0,5)}\n퇴근(본인 입력): ${pickedCheckoutTime}${outMin < 12*60 ? ' (익일)' : ''}\n승인 시 근태기록에 반영됩니다.`,
      })
    }

    alert(`✅ 퇴근시간 수정 요청을 보냈습니다.\n결재자: ${sortedDirs[0]?.name || '없음'}\n승인 시 정식으로 반영됩니다.`)
    setUnclockedSession(null)
    setPickedCheckoutTime('')
    load()
  }

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const { data: todaySess } = await supabase.from('attendance')
      .select('*').eq('user_id', session.user.id).eq('work_date', todayStr())
      .order('created_at', {ascending: true})
    // 활성 세션(미퇴근) 또는 가장 최근 세션
    // 기존에는 check_out이 끝난 세션도 check_in이 있다는 이유로 출근 버튼이 막히는 경우가 있었습니다.
    // _isActive/_isLeave 플래그를 별도로 붙여 복귀출근 가능 여부를 명확히 판단합니다.
    const BLOCK_NOTES = ['연차','반차(오전)','반차(오후)','반반차','병가','공가','특별휴가']
    const leaveS = (todaySess||[]).find((s:any) => BLOCK_NOTES.includes(s.note))
    const activeOpen = [...(todaySess||[])].reverse().find((s:any) => s.check_in && !s.check_out && !BLOCK_NOTES.includes(s.note))
    const lastS = (todaySess||[]).slice(-1)[0]
    setToday(leaveS ? {...leaveS, _isLeave:true, _isActive:false} : activeOpen ? {...activeOpen, _isActive:true} : lastS ? {...lastS, _isActive:false} : null)

    // 어제 미퇴근 세션 체크 (퇴근 시간 사후 입력 팝업)
    // 야간자동컷오프된 건도 본인이 수정/승인 요청을 안 했다면 보여줌
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`
    const { data: yesterdaySess } = await supabase.from('attendance')
      .select('id, check_in, check_out, note').eq('user_id', session.user.id).eq('work_date', yesterdayStr)
      .order('created_at', {ascending: true})
    // 가장 마지막 세션이 미퇴근(자동컷오프 포함, 단 본인 수정 안 한 경우)이면 팝업
    if (yesterdaySess && yesterdaySess.length > 0) {
      const lastY = yesterdaySess[yesterdaySess.length - 1]
      // 본인 확인이 필요한 케이스:
      //   1) check_out null (자동 처리도 안 됐거나 어떤 이유로 실패)
      //   2) note='야간자동컷오프' (야간 출근자 - 새벽 7시 cron이 임의로 처리한 경우, 실제 시간 확인 필요)
      // 18시 자동퇴근('자동퇴근')은 정상 처리로 보고 팝업 안 띄움
      const isYesterdayUnclocked =
        !lastY.check_out ||
        lastY.note === '야간자동컷오프'
      // '본인수정완료' = 결재까지 끝남, '수정요청중' = 결재 대기중 - 둘 다 더 이상 팝업 안 띄움
      const alreadyHandled = lastY.note === '본인수정완료' || lastY.note === '수정요청중'
      if (isYesterdayUnclocked && !alreadyHandled && lastY.check_in) {
        // 기본 추천 시각: 어제 check_in 이후 합리적 시각 (예: 22:00 또는 check_in + 4h 중 큰 값)
        const inSec = lastY.check_in.split(':').map(Number)
        const inMin = inSec[0] * 60 + inSec[1]
        const recommendMin = Math.max(inMin + 240, 22 * 60) // 출근 + 4h 또는 22시 중 큰 값
        const recH = Math.min(Math.floor(recommendMin / 60), 30)
        const recM = recommendMin % 60
        const finalH = Math.min(recH, 23)
        setPickedCheckoutTime(`${String(finalH).padStart(2,'0')}:${String(recM).padStart(2,'0')}`)
        setUnclockedSession({ ...lastY, work_date: yesterdayStr })
      }
    }
    const now = new Date()
    const start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
    const { data: recs } = await supabase.from('attendance').select('reg_hours')
      .eq('user_id', session.user.id).gte('work_date', start)
    const monthReg = (recs||[]).reduce((a:number,r:any)=>a+(r.reg_hours||0),0)
    // 잔여 연차 - 시간 단위로 정확히 계산
    const { data: usedLeaveData } = await supabase.from('approvals')
      .select('type, start_date, end_date').eq('requester_id', session.user.id)
      .in('status',['approved','pending'])
      .in('type',['연차','반차(오전)','반차(오후)','반반차'])
      .gte('start_date', new Date().getFullYear() + '-01-01')
    const usedLeaveCount = (usedLeaveData||[]).reduce((a:number, l:any) => {
      if (l.type === '반반차') return a + 2
      if (l.type.includes('반차')) return a + 4
      // 연차: 근무일 수 × 8H
      const cur = new Date(l.start_date + 'T12:00:00')
      const end = new Date((l.end_date||l.start_date) + 'T12:00:00')
      let workDays = 0
      while (cur <= end) {
        const dw = cur.getDay()
        if (dw !== 0 && dw !== 6) workDays++
        cur.setDate(cur.getDate() + 1)
      }
      return a + workDays * 8
    }, 0)
    const remainLeave = (p?.annual_leave || 0) - usedLeaveCount
    let pendingCount = 0
    if (p?.role === 'director') {
      const { count } = await supabase.from('approvals').select('*',{count:'exact',head:true})
        .eq('approver_id', session.user.id).eq('status','pending')
      pendingCount = count||0
    }
    setStats({ monthReg, remainLeave, pendingApprovals: pendingCount })
    // 이번달 일정
    const { data: myAtt } = await supabase.from('event_attendees').select('event_id').eq('user_id', session.user.id)
    const attIds = (myAtt||[]).map((a:any)=>a.event_id)
    const homeOrClauses = ["calendar_type.eq.company", `creator_id.eq.${session.user.id}`]
    if (attIds.length) homeOrClauses.push(`id.in.(${attIds.join(",")})`)
    const { data: evs } = await supabase.from("events")
      .select("id,title,start_at,end_at,color,creator_id,created_at,calendar_type")
      .or(homeOrClauses.join(",")).order("start_at")

    // 전체 직원 결재 (신청중+승인됨) → 가상 이벤트로 캘린더에 표시
    const { data: allApprovals } = await supabase.from('approvals')
      .select('id,type,start_date,end_date,requester_id,status,requester:requester_id(name)')
      .in('status', ['pending','approved'])
      .in('type',['연차','반차(오전)','반차(오후)','반반차','출장','병가','외근','특별휴가'])
    const approvalEvents = makeApprovalEvents(allApprovals||[], session.user.id)
    // events 테이블에서 결재 관련 이벤트 제외 (approvalEvents로 대체하여 중복 방지)
    const filteredEvs = (evs||[]).filter((e:any) => {
      const t = e.title || ''
      return !t.startsWith('[연차]') && !t.startsWith('[반차') && !t.startsWith('[반반차') &&
             !t.startsWith('[출장]') && !t.startsWith('[병가]') && !t.startsWith('[외근]') &&
             !t.startsWith('[특별휴가]') && !t.startsWith('[신청중]') && !t.startsWith('[승인]')
    })
    // 본인 결재가 우선 표시되도록 approvalEvents 먼저 + isMe 우선 정렬
    const sortedApprovalEvs = [...approvalEvents].sort((a:any, b:any) => {
      if (a.isMe && !b.isMe) return -1
      if (!a.isMe && b.isMe) return 1
      return 0
    })
    setAllEvents([...sortedApprovalEvs, ...filteredEvs])
    if (p?.role === 'director') {
      const { data: apps } = await supabase.from('approvals')
        .select('*, requester:requester_id(name,color,tc,avatar_url)')
        .eq('approver_id', session.user.id).eq('status','pending').limit(4)
      setPendingApprovals(apps||[])
    }
    // 팀원 현황 - 모든 사용자가 볼 수 있도록 (전 직원, 본인 포함)
    const { data: allStaff } = await supabase.from('profiles')
      .select('id,name,dept,color,tc,avatar_url,grade').eq('status','active')
    const { data: todayAtts } = await supabase.from('attendance').select('user_id,check_in,check_out').eq('work_date', todayStr())
    // user_id 중복 제거 - 각 직원의 가장 최근 세션만 사용
    const attMap: Record<string,any> = {}
    ;(todayAtts||[]).forEach((a:any) => {
      if (!attMap[a.user_id] || (a.check_in > (attMap[a.user_id].check_in||''))) {
        attMap[a.user_id] = a
      }
    })
    setTeamStatus((allStaff||[]).map((s:any)=>{
      const att = attMap[s.id]
      return { ...s, checkIn: att?.check_in, checkOut: att?.check_out, status: att?.check_out?'done':att?.check_in?'working':'absent' }
    }))
    const { data: notices } = await supabase.from('notices')
      .select('*, author:author_id(name)').order('created_at',{ascending:false}).limit(3)
    setRecentNotices(notices||[])

    // 새 공지 여부 체크 (마지막 읽은 시각보다 최신 공지가 있으면)
    if (typeof window !== 'undefined' && notices && notices.length > 0) {
      const lastRead = localStorage.getItem('notice_read_' + session.user.id) || '2000-01-01'
      const newest = notices[0].created_at
      setHasNewNotice(new Date(newest).getTime() > new Date(lastRead).getTime())
    }

    // 업무 카운트 (내가 담당자거나 등록자)
    const { data: myTasks } = await supabase.from('tasks')
      .select('id, title, status, priority, due_date, due_time, assignees, creator_id, visibility, progress, assignee_progress')
    const today = todayStr()
    const counts = { todo: 0, in_progress: 0, blocked: 0, overdue: 0 }
    const calTasks: any[] = []
    // 자동 완료 처리할 task ID 목록 (평균 100% 인데 status가 done이 아닌 경우)
    const autoCompleteIds: string[] = []
    for (const t of (myTasks || [])) {
      const isMine = t.creator_id === session.user.id || (t.assignees || []).includes(session.user.id)
      // 평균 진척률 계산 (DB에 저장된 progress가 우선)
      const avgProg = t.progress || 0
      const isCompleted = t.status === 'done' || avgProg >= 100
      // 평균 100% 인데 status가 done이 아니면 자동 완료 대상
      if (avgProg >= 100 && t.status !== 'done' && isMine) {
        autoCompleteIds.push(t.id)
      }
      // 캘린더 스티커용 - 본인 관련 + 공유 업무, 미완료 + 마감일 있음
      if (t.due_date && !isCompleted && (isMine || t.visibility === 'shared')) {
        calTasks.push(t)
      }
      if (!isMine) continue
      if (isCompleted) continue
      if (t.status === 'todo') counts.todo++
      else if (t.status === 'in_progress') counts.in_progress++
      else if (t.status === 'blocked') counts.blocked++
      // 마감 지난 미완료 업무 (진척률 100% 미만)
      if (t.due_date && t.due_date < today) counts.overdue++
    }
    setTaskCounts(counts)
    setCalendarTasks(calTasks)

    // 평균 100% 도달 업무를 백그라운드에서 자동 완료 처리
    if (autoCompleteIds.length > 0) {
      for (const tid of autoCompleteIds) {
        await supabase.from('tasks').update({
          status: 'done',
          updated_at: new Date().toISOString()
        }).eq('id', tid)
      }
    }

    // ─── 통합 알림 수집 ───
    const notifs: any[] = []
    const lastNotifRead = typeof window !== 'undefined'
      ? localStorage.getItem(`notif_read_${session.user.id}`) || '2000-01-01'
      : '2000-01-01'

    // 1) 신규 일정 초대
    const { data: invs } = await supabase.from('event_attendees')
      .select('id, event:event_id(id,title,start_at,creator:creator_id(name))')
      .eq('user_id', session.user.id).eq('status','pending').limit(5)
    for (const inv of (invs || [])) {
      const ev: any = inv.event
      if (!ev) continue
      notifs.push({
        id: 'invite-'+inv.id,
        icon: '🆕',
        type: '신규 일정',
        title: `${ev.creator?.name || '누군가'}가 "${ev.title}"에 초대했습니다`,
        sub: ev.start_at?.slice(0,10),
        href: '/dashboard/calendar',
        urgent: false,
      })
    }

    // 2) 최근 변경된 본인 업무 (마지막 본 시점 이후)
    const { data: recentTasks } = await supabase.from('tasks')
      .select('id, title, status, due_date, assignees, creator_id, updated_at, creator:creator_id(name)')
      .gt('updated_at', lastNotifRead)
      .neq('status', 'done')
      .order('updated_at', { ascending: false }).limit(10)
    for (const t of (recentTasks || [])) {
      const isMine = t.creator_id === session.user.id || (t.assignees || []).includes(session.user.id)
      if (!isMine) continue
      notifs.push({
        id: 'task-'+t.id,
        icon: '✔️',
        type: '업무 변경',
        title: `"${t.title}" - ${t.status==='todo'?'할 일':t.status==='in_progress'?'진행중':'대기'}`,
        sub: t.due_date ? `마감 ${t.due_date}` : '',
        href: '/dashboard/tasks',
        urgent: false,
      })
    }

    // 3) 마감 임박 업무 (오늘~3일 이내, 미완료, 본인 거)
    const todayDate = new Date(today + 'T00:00:00')
    const threeDaysLater = new Date(todayDate.getTime() + 3 * 86400000)
    const threeDaysLaterStr = threeDaysLater.toISOString().slice(0,10)
    const { data: dueTasks } = await supabase.from('tasks')
      .select('id, title, due_date, assignees, creator_id, status')
      .neq('status', 'done')
      .gte('due_date', today)
      .lte('due_date', threeDaysLaterStr)
      .order('due_date', { ascending: true })
    for (const t of (dueTasks || [])) {
      const isMine = t.creator_id === session.user.id || (t.assignees || []).includes(session.user.id)
      if (!isMine) continue
      const days = Math.round((new Date(t.due_date+'T00:00:00').getTime() - todayDate.getTime()) / 86400000)
      notifs.push({
        id: 'duetask-'+t.id,
        icon: days === 0 ? '🔥' : '⏰',
        type: '마감 임박',
        title: `"${t.title}"`,
        sub: days === 0 ? '오늘 마감' : days === 1 ? '내일 마감' : `${days}일 후 마감`,
        href: '/dashboard/tasks',
        urgent: days <= 1,
      })
    }

    // 3.5) 검토 대기 업무 (관리자에게만)
    if (p?.role === 'director') {
      const { data: reviewTasks } = await supabase.from('tasks')
        .select('id, title, submitted_for_review_at')
        .eq('status', 'review')
        .order('submitted_for_review_at', { ascending: true }).limit(5)
      for (const t of (reviewTasks || [])) {
        notifs.push({
          id: 'review-'+t.id,
          icon: '✋',
          type: '검토 대기',
          title: `"${t.title}"의 검토를 요청합니다`,
          sub: '',
          href: '/dashboard/tasks',
          urgent: true,
        })
      }
    }

    // 3.6) 수정 요청 받은 업무 (본인 담당)
    const { data: revisionTasks } = await supabase.from('tasks')
      .select('id, title, assignees, review_note, reviewed_at')
      .eq('status', 'revision')
      .gt('reviewed_at', lastNotifRead)
      .order('reviewed_at', { ascending: false }).limit(5)
    for (const t of (revisionTasks || [])) {
      if (!(t.assignees || []).includes(session.user.id)) continue
      notifs.push({
        id: 'revision-'+t.id,
        icon: '⮐',
        type: '수정 요청',
        title: `"${t.title}" - 수정 요청이 도착했습니다`,
        sub: t.review_note ? t.review_note.slice(0, 40) + (t.review_note.length > 40 ? '...' : '') : '',
        href: '/dashboard/tasks',
        urgent: true,
      })
    }

    // 4) 결재 처리 결과 (승인/반려, 본인 결재)
    const { data: processedApps } = await supabase.from('approvals')
      .select('id, type, status, start_date, end_date, updated_at, approver:approver_id(name)')
      .eq('requester_id', session.user.id)
      .in('status', ['approved', 'rejected'])
      .gt('updated_at', lastNotifRead)
      .order('updated_at', { ascending: false }).limit(10)
    for (const a of (processedApps || [])) {
      notifs.push({
        id: 'app-'+a.id,
        icon: a.status === 'approved' ? '✅' : '❌',
        type: a.status === 'approved' ? '결재 승인' : '결재 반려',
        title: `${(a.approver as any)?.name || '결재자'}가 ${a.start_date} ${a.type}${josa(a.type, '을/를')} ${a.status==='approved'?'승인':'반려'}했습니다`,
        sub: '',
        href: '/dashboard/leave',
        urgent: a.status === 'rejected',
      })
    }

    // 5) 본인에게 온 결재 (관리자인 경우)
    if (p?.role === 'director') {
      const { data: incomingApps } = await supabase.from('approvals')
        .select('id, type, start_date, requester:requester_id(name)')
        .eq('approver_id', session.user.id).eq('status', 'pending')
        .order('created_at', { ascending: false }).limit(5)
      for (const a of (incomingApps || [])) {
        notifs.push({
          id: 'incoming-'+a.id,
          icon: '📋',
          type: '결재 대기',
          title: `${(a.requester as any)?.name}의 ${a.type} 결재 대기`,
          sub: a.start_date,
          href: '/dashboard/approval',
          urgent: false,
        })
      }
    }

    // dismissed된 알림은 제외
    const dismissed = typeof window !== 'undefined'
      ? JSON.parse(localStorage.getItem(`notif_dismissed_${session.user.id}`) || '[]')
      : []
    const dismissedSet = new Set<string>(dismissed)
    setDismissedIds(dismissedSet)
    const filteredNotifs = notifs.filter(n => !dismissedSet.has(n.id))

    // 긴급한 것 먼저
    filteredNotifs.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0))
    setNotifications(filteredNotifs)
  }, [])

  useEffect(() => { load() }, [load])

  // 홈 캘린더가 화면에 보이면 현재까지의 일정은 확인한 것으로 처리합니다.
  // 기존에는 '전체 →' 또는 날짜 클릭 시에만 cal_checked가 갱신되어 NEW 표시가 계속 남았습니다.
  useEffect(() => {
    if (!profile?.id || typeof window === 'undefined') return
    const t = setTimeout(() => {
      localStorage.setItem(`cal_checked_${profile.id}`, new Date().toISOString())
    }, 1500)
    return () => clearTimeout(t)
  }, [profile?.id, calYear, calMonth])

  // 알림 개별 닫기 (X 버튼)
  function dismissNotification(notifId: string) {
    if (!profile?.id || typeof window === 'undefined') return
    const stored = JSON.parse(localStorage.getItem(`notif_dismissed_${profile.id}`) || '[]')
    if (!stored.includes(notifId)) {
      stored.push(notifId)
      // 오래된 dismissed는 잘라냄 (최대 200개 유지 - localStorage 비대화 방지)
      const trimmed = stored.slice(-200)
      localStorage.setItem(`notif_dismissed_${profile.id}`, JSON.stringify(trimmed))
    }
    setNotifications(prev => prev.filter(n => n.id !== notifId))
  }

  // 알림 클릭하면 닫고 페이지 이동
  function clickNotification(n: any) {
    dismissNotification(n.id)
    router.push(n.href)
  }

  // 모두 닫기 (모두 dismissed 처리)
  function dismissAll() {
    if (!profile?.id || typeof window === 'undefined') return
    const stored = JSON.parse(localStorage.getItem(`notif_dismissed_${profile.id}`) || '[]')
    const allIds = notifications.map(n => n.id)
    const merged = Array.from(new Set([...stored, ...allIds])).slice(-200)
    localStorage.setItem(`notif_dismissed_${profile.id}`, JSON.stringify(merged))
    setNotifications([])
  }

  // 한국환경공단 게시글 로드
  useEffect(() => {
    setKecoLoading(true)
    fetch('/api/keco')
      .then(r => r.json())
      .then(d => { setKecoItems(d.items || []); setKecoLoading(false) })
      .catch(() => setKecoLoading(false))
  }, [])

  async function loadBriefing() {
    setBriefingLoading(true)
    setBriefing('')
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setBriefingLoading(false); return }

      const today = todayStr()
      const todayDate = new Date()
      // 날짜 비교용 - 시간을 0시 0분으로 정규화 (오늘 21시에 비교해도 정확)
      const todayMidnight = new Date(today + 'T00:00:00')
      const days = ['일','월','화','수','목','금','토']

      // 내 프로필
      const { data: p } = await supabase.from('profiles')
        .select('role,name,grade,dept,annual_leave,join_date').eq('id', session.user.id).single()

      // 오늘 출퇴근
      const { data: todayAttRows } = await supabase.from('attendance')
        .select('check_in,check_out,reg_hours,ext_hours,night_hours').eq('user_id', session.user.id).eq('work_date', today)
      const todayAtt = todayAttRows?.[0]
      const attendStatus = todayAtt?.check_in
        ? ('출근 ' + todayAtt.check_in.slice(0,5) + (todayAtt.check_out ? ' → 퇴근 ' + todayAtt.check_out.slice(0,5) : ' (근무중)'))
        : '미출근'

      // 이번달 근태 요약
      const thisMonth = todayDate.getMonth() + 1
      const lastMonthDate = new Date(todayDate); lastMonthDate.setMonth(lastMonthDate.getMonth()-1)
      const monthStart = todayDate.getFullYear() + '-' + String(thisMonth).padStart(2,'0') + '-01'
      const lastMonthStart = lastMonthDate.getFullYear() + '-' + String(lastMonthDate.getMonth()+1).padStart(2,'0') + '-01'
      const { data: monthAtts } = await supabase.from('attendance')
        .select('reg_hours,ext_hours,night_hours,hol_hours,work_date').eq('user_id', session.user.id).gte('work_date', monthStart).lte('work_date', today)
      const monthReg = (monthAtts||[]).reduce((a: number, r: any) => a + (r.reg_hours||0), 0)
      const monthExt = (monthAtts||[]).reduce((a: number, r: any) => a + (r.ext_hours||0) + (r.night_hours||0) + (r.hol_hours||0), 0)
      const workDays = (monthAtts||[]).filter((r: any) => r.reg_hours > 0).length

      // 잔여 연차
      const { data: usedLeaves } = await supabase.from('approvals')
        .select('type').eq('requester_id', session.user.id).eq('status','approved')
        .in('type',['연차','반차(오전)','반차(오후)']).gte('start_date', todayDate.getFullYear() + '-01-01')
      const usedLeave = (usedLeaves||[]).reduce((a: number, l: any) =>
        a + (l.type.includes('반차') ? 0.5 : 1), 0)
      const remainLeave = (p?.annual_leave || 0) - usedLeave

      // 급여일 계산 - DB company_settings에서 읽기
      const { data: payDaySetting } = await supabase.from('company_settings')
        .select('value').eq('key', 'pay_day').maybeSingle()
      const payDay = Number(payDaySetting?.value || 10)
      const today_d = todayDate.getDate()
      const daysToPayday = today_d <= payDay
        ? payDay - today_d
        : new Date(todayDate.getFullYear(), todayDate.getMonth()+1, 0).getDate() - today_d + payDay
      const nextPayMonth = today_d <= payDay ? todayDate.getMonth()+1 : todayDate.getMonth()+2
      const paydayMsg = today_d === payDay
        ? '🎉 오늘이 급여일입니다!'
        : `${nextPayMonth}월 ${payDay}일 급여일까지 ${daysToPayday}일 남았습니다`

      // 다가오는 30일 일정 - 내가 참석자인 일정 + 전사 공유 일정
      const next30 = new Date(todayDate); next30.setDate(todayDate.getDate() + 30)
      const next30str = next30.toISOString().slice(0,10) + 'T23:59:59'
      const { data: myAtt } = await supabase.from('event_attendees')
        .select('event_id').eq('user_id', session.user.id)
      const attIds = (myAtt||[]).map((a: any) => a.event_id)
      // 전사 일정 OR 내가 참석자인 일정
      const orClauses = ['calendar_type.eq.company']
      if (attIds.length > 0) orClauses.push(`id.in.(${attIds.join(',')})`)
      const { data: evData } = await supabase.from('events')
        .select('title,start_at,location,calendar_type').order('start_at')
        .gte('start_at', today).lte('start_at', next30str)
        .or(orClauses.join(','))
      const events = evData || []
      const eventList = events.slice(0,10).map((e: any) => {
        const evDate = toKSTDate(e.start_at)
        const evDay = new Date(evDate + 'T00:00:00')
        const todayMidnight = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate())
        const diffDays = Math.round((evDay.getTime() - todayMidnight.getTime()) / 86400000)
        const dayLabel = diffDays === 0 ? '오늘' : diffDays === 1 ? '내일' : diffDays === 2 ? '모레' : diffDays + '일 후'
        const dateLabel = `${toKSTDate(e.start_at).slice(5,10).replace('-','/')}(${days[evDay.getDay()]})`
        const timeLabel = e.start_at.slice(11,16) === '00:00' ? '시간미정' : e.start_at.slice(11,16)  // 시간은 UTC 그대로 (09:00 기준)
        return `[${dayLabel}/${dateLabel} ${timeLabel}] ${e.title}${e.calendar_type==='company'?' [전사]':''}${e.location?' @ '+e.location:''}`
      })

      // 대기 결재
      const pendingCol = p?.role === 'director' ? 'approver_id' : 'requester_id'
      const { data: pendingApprovals } = await supabase.from('approvals')
        .select('type,start_date,requester:requester_id(name)')
        .eq(pendingCol, session.user.id).eq('status','pending').limit(5)
      const approvalList = (pendingApprovals||[]).map((a: any) =>
        p?.role === 'director'
          ? ((a.requester as any)?.name + '님 ' + a.type + ' (' + a.start_date + ')')
          : (a.type + ' 결재 대기중')
      )

      // 팀원 생일/입사기념일 (7일 이내) - 관리자만
      let anniversaries: string[] = []
      if (p?.role === 'director') {
        const { data: allStaff } = await supabase.from('profiles')
          .select('name,birth_date,join_date').eq('status','active').neq('id', session.user.id)
        const thisYear = todayDate.getFullYear()
        ;(allStaff||[]).forEach((s: any) => {
          if (s.birth_date) {
            const bd = s.birth_date.slice(5)
            const bdThis = thisYear + '-' + bd
            const diff = Math.ceil((new Date(bdThis).getTime() - todayDate.getTime()) / 86400000)
            if (diff >= 0 && diff <= 7) anniversaries.push(s.name + '님 생일 D-' + diff + ' (' + bd.replace('-','/') + ')')
          }
          if (s.join_date) {
            const jd = s.join_date.slice(5)
            const jdThis = thisYear + '-' + jd
            const diff2 = Math.ceil((new Date(jdThis).getTime() - todayDate.getTime()) / 86400000)
            if (diff2 >= 0 && diff2 <= 7) {
              const years = thisYear - parseInt(s.join_date.slice(0,4))
              if (years > 0) anniversaries.push(s.name + '님 입사 ' + years + '주년 D-' + diff2)
            }
          }
        })
      }

      // 이번주 팀원 현황 (관리자만)
      let teamStatus = ''
      if (p?.role === 'director') {
        const now = new Date(); const dow = now.getDay()
        const mon = new Date(now); mon.setDate(now.getDate() - (dow===0?6:dow-1))
        const { data: weekAtts } = await supabase.from('attendance')
          .select('user_id').eq('work_date', today).not('check_in','is',null)
        teamStatus = '오늘 출근 ' + (weekAtts?.length || 0) + '명'
      }

      // 미읽음 공지
      const lastRead = localStorage.getItem('notice_read_' + session.user.id) || '2000-01-01'
      const { count: noticeCount } = await supabase.from('notices')
        .select('*',{count:'exact',head:true}).gt('created_at', lastRead)

      // 본인 관련 업무 상세 (통찰용)
      const { data: myDetailTasks } = await supabase.from('tasks')
        .select('id, title, status, priority, due_date, due_time, progress, assignee_progress, assignees, creator_id, creator:creator_id(name), updated_at')
        .neq('status', 'done')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(20)
      const myTasksDetailed: string[] = []
      for (const t of (myDetailTasks || [])) {
        const isMine = t.creator_id === session.user.id || (t.assignees || []).includes(session.user.id)
        if (!isMine) continue
        const myProgress = (t.assignee_progress as any)?.[session.user.id] ?? 0
        const statusKr = t.status === 'todo' ? '할 일' : t.status === 'in_progress' ? '진행중' : '막힘'
        const priorityMark = t.priority === 'high' ? '🔴 높음' : t.priority === 'normal' ? '🟡 보통' : '🔵 낮음'
        let dueLabel = ''
        if (t.due_date) {
          // 두 날짜 모두 자정 기준으로 비교 (시각 차이로 인한 1일 오차 방지)
          const dueDateMidnight = new Date(t.due_date+'T00:00:00')
          const diff = Math.round((dueDateMidnight.getTime() - todayMidnight.getTime()) / 86400000)
          dueLabel = diff < 0 ? `⚠️ ${Math.abs(diff)}일 지남` : diff === 0 ? '🔥 오늘 마감' : diff === 1 ? '내일 마감' : `${diff}일 후 마감`
          dueLabel += ` (${t.due_date}${t.due_time?' '+t.due_time.slice(0,5):''})`
        } else dueLabel = '마감 미정'
        myTasksDetailed.push(`"${t.title}" - ${statusKr} ${priorityMark} ${dueLabel} (본인 ${myProgress}%, 등록자: ${(t.creator as any)?.name || '본인'})`)
      }

      // 최근 새 소식 (홈에 표시되는 알림센터의 raw 항목)
      const newsItems: string[] = []
      // 신규 일정 초대
      const { data: invs } = await supabase.from('event_attendees')
        .select('event:event_id(title, start_at, creator:creator_id(name))')
        .eq('user_id', session.user.id).eq('status','pending').limit(5)
      for (const inv of (invs || [])) {
        const ev: any = inv.event
        if (!ev) continue
        newsItems.push(`🆕 ${ev.creator?.name || '누군가'}가 "${ev.title}"(${ev.start_at?.slice(0,10)})에 초대`)
      }
      // 결재 처리 결과
      const lastNotifReadAt = typeof window !== 'undefined'
        ? localStorage.getItem(`notif_read_${session.user.id}`) || '2000-01-01'
        : '2000-01-01'
      const { data: processedAps } = await supabase.from('approvals')
        .select('type, status, start_date, approver:approver_id(name)')
        .eq('requester_id', session.user.id).in('status', ['approved', 'rejected'])
        .gt('updated_at', lastNotifReadAt).limit(5)
      for (const a of (processedAps || [])) {
        const aprName = (a.approver as any)?.name || '결재자'
        newsItems.push(`${a.status==='approved'?'✅':'❌'} ${aprName}이 ${a.start_date} ${a.type}을 ${a.status==='approved'?'승인':'반려'}`)
      }

      // AI에게 보낼 최종 데이터
      const briefData = {
        오늘날짜: today, // ISO 형식 (예: "2026-05-14") - AI 날짜 비교 기준
        날짜표시: (todayDate.getMonth()+1) + '월 ' + todayDate.getDate() + '일 ' + days[todayDate.getDay()] + '요일',
        직원정보: (p?.name||'') + ' ' + (p?.grade||'') + ' / ' + (p?.dept||''),
        오늘출퇴근: attendStatus,
        이번달근태: thisMonth + '월 ' + workDays + '일 출근 / 정규 ' + monthReg + 'h / 초과 ' + monthExt + 'h',
        잔여연차: remainLeave + 'H (사용 ' + usedLeave + 'H / 기본 ' + (p?.annual_leave||0) + 'H)',
        급여일안내: paydayMsg,
        향후30일일정: eventList.length ? eventList : ['등록된 일정 없음'],
        결재현황: approvalList.length ? approvalList : ['대기중인 결재 없음'],
        미읽음공지: (noticeCount||0) + '건',
        본인업무상세: myTasksDetailed.length ? myTasksDetailed : ['진행 중인 본인 업무 없음'],
        최근새소식: newsItems.length ? newsItems : ['새 소식 없음'],
        특이사항: [
          ...(anniversaries.length ? anniversaries : []),
          ...(teamStatus ? [teamStatus] : []),
        ].filter(Boolean),
      }

      const response = await fetch('/api/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ briefData })
      })
      const data = await response.json()
      const text = data.text || '브리핑을 불러올 수 없습니다.'
      setBriefing(text)
    } catch (e: any) {
      console.error('브리핑 오류:', e)
      setBriefing('브리핑 로딩 실패: ' + (e?.message || '알 수 없는 오류'))
    }
    setBriefingLoading(false)
  }

  // 브리핑은 사용자가 펼칠 때만 호출됨 (자동 호출 제거)
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date()
      setTime(`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const d = new Date()
  const dateStr = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일`

  const firstDay = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate()
  const todayDate = todayStr()

  function getEventsForDate(ds: string) {
    const filtered = allEvents.filter((e:any) => toKSTDate(e.start_at) <= ds && ds <= toKSTDate(e.end_at))
    // 본인 결재 우선 정렬 (slice 3개 안에 본인 거가 짤리지 않도록)
    return filtered.sort((a:any, b:any) => {
      if (a.isMe && !b.isMe) return -1
      if (!a.isMe && b.isMe) return 1
      return 0
    })
  }
  function prevMonth() { if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11)}else setCalMonth(m=>m-1) }
  function nextMonth() { if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0)}else setCalMonth(m=>m+1) }

  const Avatar = ({u,size=5}:{u:any,size?:number}) => (
    u?.avatar_url
      ? <img src={u.avatar_url} className={`w-${size} h-${size} rounded-full object-cover flex-shrink-0`} alt="" />
      : <div className={`w-${size} h-${size} rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0`}
          style={{background:u?.color||'#EEEDFE',color:u?.tc||'#3C3489'}}>{u?.name?.[0]}</div>
  )

  const SHORTCUTS = [
    {icon:'⏰',label:'출퇴근',href:'/dashboard'},
    {icon:'📋',label:'근태기록',href:'/dashboard/attendance'},
    {icon:'📄',label:'급여명세',href:'/dashboard/payslip'},
    {icon:'⚡',label:'예상급여',href:'/dashboard/paysim'},
    {icon:'📅',label:'일정',href:'/dashboard/calendar'},
    {icon:'💬',label:'메시지',href:'/dashboard/chat'},
    {icon:'✅',label:'결재함',href:'/dashboard/approval'},
    {icon:'📢',label:'공지사항',href:'/dashboard/notice'},
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* 메인 컨테이너: 좌측 main + 우측 바로가기 세로 */}
      <div className="grid grid-cols-[1fr_auto] gap-4">

        {/* ─── 좌측 메인 영역 ─── */}
        <div className="space-y-4 min-w-0">

          {/* 인사말 + 공지사항(가운데) + 출퇴근 - 메인 영역 안에 있어서 캘린더/통계 라인에 맞춰짐 */}
          <div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-shrink-0">
                <div className="text-xl font-semibold text-gray-800">안녕하세요, {profile?.name} {profile?.grade}님 👋</div>
                <div className="text-sm text-gray-400 mt-0.5">{dateStr}</div>
              </div>

              {/* 가운데 - 공지사항 */}
              <div className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={()=>{
                  if (typeof window !== 'undefined' && profile?.id) {
                    const newest = recentNotices[0]?.created_at || new Date().toISOString()
                    localStorage.setItem('notice_read_' + profile.id, newest)
                    setHasNewNotice(false)
                  }
                  router.push('/dashboard/notice')
                }}>
                <div className="bg-white rounded-xl border border-gray-100 px-3 py-2 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">📢</span>
                      <span className="text-xs font-semibold text-gray-700">공지사항</span>
                      {hasNewNotice && (
                        <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">N</span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400">전체 →</span>
                  </div>
                  {recentNotices.length === 0 ? (
                    <div className="text-[11px] text-gray-300">공지사항이 없습니다</div>
                  ) : (
                    <div className="space-y-0.5">
                      {recentNotices.slice(0,2).map((n:any)=>(
                        <div key={n.id} className="flex items-center gap-1.5 group">
                          <span className="text-[11px] text-gray-700 group-hover:text-purple-600 truncate flex-1">
                            {n.title || '(제목없음)'}
                          </span>
                          <span className="text-[10px] text-gray-300 flex-shrink-0">
                            {n.created_at?.slice(5,10).replace('-','/')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="flex flex-col items-end gap-1">
                  <div className="text-lg font-bold text-gray-700 tabular-nums leading-tight">{time}</div>
                  <div className="flex gap-2">
                    <button onClick={handleCheckIn} disabled={today?._isActive || today?._isLeave}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed">
                      <span style={{fontSize:13}}>🔴</span> {today?.check_out && !today?._isActive ? '복귀출근' : '출근'}
                    </button>
                    <button onClick={handleCheckOut} disabled={!today?._isActive}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">
                      <span style={{fontSize:13}}>🔴</span> 퇴근
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {today?.check_out && !today?._isActive && !today?._isLeave && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-between">
                <span className="text-xs text-amber-700">퇴근 처리됨 · 업무에 복귀하시겠습니까?</span>
                <button onClick={handleResumeWork} className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700">🔄 근무 복귀</button>
              </div>
            )}
          </div>

          {/* 통합 알림 센터 + AI 통찰 */}
          <div className="card border-amber-200 bg-amber-50/40 p-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button onClick={()=>{
                  const next = !notificationsOpen
                  setNotificationsOpen(next)
                  // 펼치면 read 시점 기록 (다음 로드때 사라지도록)
                  if (next && typeof window !== 'undefined' && profile?.id) {
                    setTimeout(() => {
                      localStorage.setItem(`notif_read_${profile.id}`, new Date().toISOString())
                    }, 3000) // 3초 후 (읽었다고 간주)
                  }
                }}
                className="flex items-center gap-2 hover:opacity-80 flex-1 min-w-0">
                <span className="text-base">📬</span>
                <span className="text-sm font-semibold text-gray-800">새 소식</span>
                <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{notifications.length}</span>
                {notifications.some(n => n.urgent) && (
                  <span className="text-xs text-red-600 font-medium">⚠️ 긴급 {notifications.filter(n=>n.urgent).length}건</span>
                )}
                <span className="text-xs text-gray-400 ml-auto">{notificationsOpen ? '▲' : '▼'}</span>
              </button>
              {/* AI 통찰 받기 버튼 + 모두 닫기 */}
              <div className="flex items-center gap-1.5">
                {notifications.length > 0 && (
                  <button onClick={dismissAll}
                    className="text-[11px] text-gray-500 hover:text-gray-800 px-2 py-1 hover:bg-white rounded-lg transition-colors"
                    title="모든 알림을 닫습니다">
                    모두 닫기
                  </button>
                )}
                <button onClick={loadBriefing} disabled={briefingLoading}
                  className="flex items-center gap-1 px-2.5 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-xs font-medium rounded-lg transition-colors">
                  <span>✨</span>
                  {briefingLoading ? 'AI 분석 중...' : briefing ? '🔄 통찰 새로고침' : 'AI 통찰 받기'}
                </button>
              </div>
            </div>
            {notificationsOpen && (
              <div className="mt-2 pt-2 border-t border-amber-200 space-y-2">
                {/* AI 통찰 영역 (브리핑 결과) */}
                {(briefing || briefingLoading) && (
                  <div className="bg-gradient-to-r from-purple-50 to-white border border-purple-100 rounded-md p-2.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-[10px]">✨</div>
                      <span className="text-xs font-semibold text-purple-800">AI 통찰</span>
                    </div>
                    {briefingLoading ? (
                      <div className="flex items-center gap-2 py-1">
                        <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{animationDelay:'0ms'}}/>
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{animationDelay:'150ms'}}/>
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{animationDelay:'300ms'}}/>
                        </div>
                        <span className="text-[11px] text-purple-500">우선순위 분석 중...</span>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{briefing}</div>
                    )}
                  </div>
                )}
                {/* 새 소식 raw 항목 */}
                {notifications.length === 0 ? (
                  <div className="text-[11px] text-gray-400 text-center py-2">새 소식이 없습니다 ✨</div>
                ) : (
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {notifications.slice(0, 15).map(n => (
                      <div key={n.id}
                        className={`group flex items-start gap-2 p-1.5 rounded transition-colors hover:bg-white/70 ${
                          n.urgent ? 'bg-red-50/70' : ''
                        }`}>
                        <div onClick={()=>clickNotification(n)}
                          className="flex items-start gap-2 flex-1 min-w-0 cursor-pointer">
                          <span className="text-base flex-shrink-0">{n.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                n.type === '결재 반려' || n.type === '마감 임박' ? 'bg-red-100 text-red-700' :
                                n.type === '결재 승인' ? 'bg-green-100 text-green-700' :
                                n.type === '신규 일정' ? 'bg-blue-100 text-blue-700' :
                                n.type === '결재 대기' ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>{n.type}</span>
                            </div>
                            <div className="text-xs text-gray-700 mt-0.5 truncate">{n.title}</div>
                            {n.sub && <div className="text-[10px] text-gray-500 mt-0.5">{n.sub}</div>}
                          </div>
                          <span className="text-[10px] text-gray-400 flex-shrink-0 mt-1">→</span>
                        </div>
                        <button onClick={(e)=>{ e.stopPropagation(); dismissNotification(n.id) }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 text-sm leading-none px-1 flex-shrink-0"
                          title="이 알림 닫기">✕</button>
                      </div>
                    ))}
                    {notifications.length > 15 && (
                      <div className="text-center text-[10px] text-gray-400 pt-1">+ {notifications.length - 15}건 더</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 1단: 내 업무 (풀폭 슬림) - AI 브리핑은 위 알림센터로 통합됨 */}
          <div className="card cursor-pointer hover:border-purple-200 transition-colors p-3"
            onClick={()=>router.push('/dashboard/tasks')}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-sm">✔️</span>
                <span className="text-xs font-semibold text-gray-800">내 업무</span>
                {taskCounts.overdue > 0 && (
                  <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    ⚠️ {taskCounts.overdue} 지연
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-1 justify-end">
                <div className="flex items-center gap-1 px-2 py-0.5 bg-gray-50 rounded">
                  <span className="text-[10px] text-gray-500">할 일</span>
                  <span className="text-sm font-bold text-gray-700">{taskCounts.todo}</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 rounded">
                  <span className="text-[10px] text-blue-600">진행</span>
                  <span className="text-sm font-bold text-blue-700">{taskCounts.in_progress}</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 bg-red-50 rounded">
                  <span className="text-[10px] text-red-600">막힘</span>
                  <span className="text-sm font-bold text-red-700">{taskCounts.blocked}</span>
                </div>
                <span className="text-[10px] text-gray-400 ml-1">→</span>
              </div>
            </div>
          </div>

          {/* 2단: 출근현황 + 공단소식 - 비슷한 높이 */}
          <div className="grid grid-cols-2 gap-3">
            {/* 출근현황 */}
            <div className="card cursor-pointer hover:border-purple-200 transition-colors p-3"
              onClick={()=>router.push('/dashboard/attendance')}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">👥</span>
                  <span className="text-xs font-semibold text-gray-800">출근현황</span>
                </div>
                <span className="text-[10px] text-gray-400">→</span>
              </div>
              {teamStatus.length === 0 ? (
                <div className="text-[11px] text-gray-300 py-1">정보 없음</div>
              ) : (
                <div className="space-y-1">
                  {teamStatus.map((u:any)=>(
                    <div key={u.id}
                      className="flex items-center gap-1.5 py-0.5"
                      title={`${u.name} ${u.status==='working'?'근무중':u.status==='done'?'퇴근':'미출근'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        u.status==='working'?'bg-green-400':u.status==='done'?'bg-purple-400':'bg-gray-300'
                      }`} />
                      <span className="text-[11px] font-medium text-gray-700 w-12 flex-shrink-0 truncate">{u.name}</span>
                      <span className="text-[10px] text-gray-400 flex-1 tabular-nums">
                        {u.checkIn ? (
                          <>
                            {u.checkIn.slice(0,5)}
                            {u.checkOut ? <span className="text-gray-300"> ~ </span> : <span className="text-green-500"> ~</span>}
                            {u.checkOut ? u.checkOut.slice(0,5) : <span className="text-green-500">근무중</span>}
                          </>
                        ) : (
                          <span className="text-gray-300">미출근</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 환경공단 뉴스 */}
            <div className="card p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🌿</span>
                  <span className="text-xs font-semibold text-gray-800">한국환경공단 소식</span>
                </div>
                <a href="https://www.keco.or.kr" target="_blank" rel="noreferrer"
                  className="text-[10px] text-gray-400 hover:text-green-600">공단 →</a>
              </div>
              <div className="flex gap-1 mb-1.5 flex-wrap">
                {['전체','공지사항','언론보도','보도자료','입찰공고'].map(f => (
                  <button key={f} onClick={() => setKecoFilter(f)}
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      kecoFilter === f ? 'bg-green-600 text-white font-medium' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}>
                    {f}
                  </button>
                ))}
              </div>
              {kecoLoading ? (
                <div className="text-[11px] text-gray-400 py-2 text-center">불러오는 중...</div>
              ) : kecoItems.length === 0 ? (
                <div className="text-[11px] text-gray-400 py-2 text-center">게시글 없음</div>
              ) : (
                (() => {
                  const list = (kecoFilter === '전체' ? kecoItems : kecoItems.filter(i => i.type === kecoFilter))
                  const displayed = newsExpanded ? list.slice(0, 10) : list.slice(0, 3)
                  return (
                    <>
                      <div className="space-y-0.5">
                        {displayed.map((item, idx) => (
                          <a key={idx} href={item.url} target="_blank" rel="noreferrer"
                            className="flex items-start gap-1.5 p-1 rounded hover:bg-gray-50 group">
                            <span className={`text-[10px] px-1 py-0.5 rounded font-medium flex-shrink-0 ${
                              item.type === '공지사항' ? 'bg-blue-100 text-blue-700' :
                              item.type === '언론보도' ? 'bg-green-100 text-green-700' :
                              item.type === '보도자료' ? 'bg-teal-100 text-teal-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>{item.type}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] text-gray-700 group-hover:text-green-600 line-clamp-1">{item.title}</div>
                              <div className="text-[10px] text-gray-400">{item.date}</div>
                            </div>
                          </a>
                        ))}
                      </div>
                      {list.length > 3 && (
                        <button onClick={()=>setNewsExpanded(v=>!v)}
                          className="w-full mt-1.5 text-[10px] text-gray-500 hover:text-green-600 py-0.5 border-t border-gray-100">
                          {newsExpanded ? '▲ 접기' : `▼ ${list.length-3}개 더보기`}
                        </button>
                      )}
                    </>
                  )
                })()
              )}
            </div>
          </div>


      {/* 요약 카드 - 캘린더 위에 (출근/근태/연차/결재) */}
      <div className="grid grid-cols-4 gap-2">
        {[
          {label:'출근', val:leaveNotes.includes(today?.note) ? today.note : (today?.check_in?.slice(0,5)||'--:--'), c:'text-gray-800'},
          {label:'이번달 근태', val:Math.round(stats.monthReg*10)/10+'h', c:'text-purple-600'},
          {label:'잔여 연차', val:stats.remainLeave+'H', c:'text-teal-600'},
          {label:profile?.role==='director'?'미결 결재':'대기 결재', val:stats.pendingApprovals+'건', c:stats.pendingApprovals>0?'text-amber-600':'text-gray-400'},
        ].map(m=>(
          <div key={m.label} className="card p-2.5 flex items-center justify-between">
            <div className="text-xs text-gray-500">{m.label}</div>
            <div className={`text-sm font-bold ${m.c}`}>{m.val}</div>
          </div>
        ))}
      </div>

      {/* 캘린더 - 풀 폭 */}
      <div className="card mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-gray-700">📅 일정</div>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="btn-secondary px-2 py-1 text-xs">‹</button>
            <span className="text-xs font-medium text-gray-600 px-1">{calYear}년 {calMonth+1}월</span>
            <button onClick={nextMonth} className="btn-secondary px-2 py-1 text-xs">›</button>
            <button onClick={()=>{setCalYear(new Date().getFullYear());setCalMonth(new Date().getMonth())}}
              className="btn-secondary px-2 py-1 text-xs text-purple-600 ml-1">오늘</button>
            <button onClick={()=>{
                if (profile?.id) localStorage.setItem(`cal_checked_${profile.id}`, new Date().toISOString())
                router.push('/dashboard/calendar')
              }}
              className="text-xs text-purple-600 hover:text-purple-800 ml-2">전체 →</button>
          </div>
        </div>
        <div className="grid grid-cols-7 mb-1">
          {DAYS_SHORT.map((d,i)=>(
            <div key={d} className={`text-center text-sm font-bold py-2
              ${i===0?'text-red-400 bg-red-50':i===6?'text-blue-500 bg-blue-50':'text-gray-500 bg-gray-50'} rounded-sm`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({length:firstDay}).map((_,i)=>(
            <div key={`e-${i}`} className="min-h-[110px] bg-gray-50/30" />
          ))}
          {Array.from({length:daysInMonth}).map((_,i)=>{
            const day = i+1
            const ds = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
            const dayEvs = getEventsForDate(ds)
            const isToday = ds === todayDate
            const dow = (firstDay + i) % 7
            const isHol = isHoliday(ds)
            const isSun = dow===0; const isSat = dow===6
            return (
              <div key={day}
                onClick={()=>{
                  if (profile?.id) localStorage.setItem(`cal_checked_${profile.id}`, new Date().toISOString())
                  router.push('/dashboard/calendar')
                }}
                className={`min-h-[110px] border border-gray-100 p-1.5 cursor-pointer transition-colors
                  ${isSat?'bg-blue-50/60':isHol||isSun?'bg-red-50':'bg-white'}
                  hover:bg-purple-50/40`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold mb-1
                  ${isToday?'bg-purple-600 text-white':isSat?'text-blue-500':isHol||isSun?'text-red-400':'text-gray-700'}`}>
                  {day}
                </div>
                {dayEvs.slice(0,3).map((ev:any)=>{
                  // 마지막으로 캘린더를 확인한 시간 이후 생성/수정된 일정 = NEW
                  const lastChecked = typeof window !== 'undefined'
                    ? localStorage.getItem(`cal_checked_${profile?.id}`) || '2000-01-01'
                    : '2000-01-01'
                  const evTime = ev.updated_at || ev.created_at
                  const isNew = evTime && new Date(evTime).getTime() > new Date(lastChecked).getTime()
                    && ev.creator_id !== profile?.id // 내가 만든 건 NEW 표시 안 함

                  // title 매칭: 새 형식 "[상태] 유형 이름" 또는 옛날 형식 "[유형] 이름"
                  const matchNew = String(ev.title||'').match(/^\[([^\]]+)\]\s+(\S+)\s+(.+)$/)
                  const matchOld = !matchNew ? String(ev.title||'').match(/^\[(\S+)\]\s+(.+)$/) : null
                  let isApproval = false
                  let isPending = false
                  let typeName = ''
                  let personName = ''
                  if (matchNew) {
                    isApproval = true
                    isPending = matchNew[1] === '신청중'
                    typeName = matchNew[2]
                    personName = matchNew[3]
                  } else if (matchOld && ['연차','반차(오전)','반차(오후)','반반차','병가','공가','출장','외근','특별휴가'].includes(matchOld[1])) {
                    isApproval = true
                    isPending = false
                    typeName = matchOld[1]
                    personName = matchOld[2]
                  }
                  const typeShort = typeName === '반차(오전)' ? '오전반차'
                    : typeName === '반차(오후)' ? '오후반차'
                    : typeName.replace(/[()]/g, '')
                  const displayText = isApproval ? `${personName}-${typeShort}` : ev.title

                  return (
                    <div key={ev.id}
                      className="rounded px-1.5 mb-1 flex items-center gap-1 truncate font-bold"
                      title={ev.title}
                      style={isApproval ? {
                        backgroundColor: isPending ? '#FEF3C7' : '#DBEAFE',
                        border: isPending ? '1px solid #FCD34D' : '1px solid #93C5FD',
                        color: '#111827',
                        fontSize:'12px',
                        lineHeight:'18px',
                      } : {
                        background:ev.color||'#534AB7',
                        color:'#fff',
                        fontSize:'12px',
                        lineHeight:'20px',
                        fontWeight:500,
                      }}>
                      <span className="truncate flex-1">{displayText}</span>
                      {isNew && (
                        <span className="flex-shrink-0 rounded px-1 font-bold"
                          style={{fontSize:'10px',background:'#ef4444',color:'#facc15',border:'1px solid #dc2626'}}>
                          NEW
                        </span>
                      )}
                    </div>
                  )
                })}
                {dayEvs.length>3 && <div className="text-gray-500 font-medium" style={{fontSize:'12px'}}>+{dayEvs.length-3}</div>}
                {/* 업무 스티커 (마감일 본인 업무) */}
                {calendarTasks.filter((t:any) => t.due_date === ds).slice(0, 2).map((t:any) => (
                  <div key={'task-'+t.id}
                    onClick={(e)=>{e.stopPropagation(); router.push('/dashboard/tasks')}}
                    title={`📌 업무: ${t.title}${t.due_time ? ' '+t.due_time.slice(0,5) : ''}`}
                    className="cursor-pointer hover:scale-105 transition-transform"
                    style={{
                      background: t.priority === 'high' ? '#FECACA' : '#FED7AA',
                      border: '1px dashed ' + (t.priority === 'high' ? '#EF4444' : '#F97316'),
                      borderRadius: '3px',
                      padding: '0 4px',
                      fontSize: '11px',
                      lineHeight: '15px',
                      color: '#7C2D12',
                      transform: `rotate(${(t.id.charCodeAt(0) % 5) - 2}deg)`,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      marginTop: '2px',
                    }}>
                    📌 {t.title.length > 7 ? t.title.slice(0,7)+'…' : t.title}
                  </div>
                ))}
                {calendarTasks.filter((t:any) => t.due_date === ds).length > 2 && (
                  <div className="text-orange-600 font-medium" style={{fontSize:'10px',marginTop:'2px'}}>+업무 {calendarTasks.filter((t:any) => t.due_date === ds).length-2}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

          {/* 결재대기 (관리자만, 있을 때만) */}
          {profile?.role==='director' && pendingApprovals.length>0 && (
            <div className="card p-3">
              <div className="flex justify-between items-center mb-2">
                <div className="text-sm font-medium text-gray-700">✅ 결재 대기 ({pendingApprovals.length}건)</div>
                <button onClick={()=>router.push('/dashboard/approval')} className="text-xs text-purple-600">결재함 →</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {pendingApprovals.map((a:any)=>(
                  <div key={a.id} className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 rounded-lg">
                    <Avatar u={a.requester} size={5} />
                    <span className="text-xs font-medium text-gray-800">{(a.requester as any)?.name}</span>
                    <span className="text-xs text-gray-500">{a.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* ─── 좌측 메인 영역 끝 ─── */}

        {/* ─── 우측 사이드바: 바로가기 세로 ─── */}
        <div className="card p-2 w-[88px] h-fit sticky top-4">
          <div className="text-[10px] font-medium text-gray-500 mb-1.5 text-center">🚀 바로가기</div>
          <div className="space-y-1">
            {SHORTCUTS.map(s=>(
              <button key={s.href} onClick={()=>router.push(s.href)}
                className="w-full flex flex-col items-center gap-0.5 p-2 bg-gray-50 rounded-lg hover:bg-purple-50 transition-colors group">
                <span style={{fontSize:18}}>{s.icon}</span>
                <span className="text-[10px] text-gray-500 group-hover:text-purple-600 text-center leading-tight">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* 메인 컨테이너 끝 */}

      {/* 어제 퇴근 미기록 알림 모달 - 강제 (닫을 수 없음) */}
      {unclockedSession && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border-2 border-amber-300">
            <div className="p-5 border-b border-gray-100 bg-amber-50 rounded-t-xl">
              <div className="text-base font-bold text-gray-800">⚠️ 처리가 필요합니다</div>
              <div className="text-sm text-gray-700 mt-1 font-medium">어제 퇴근을 안 찍으셨습니다</div>
              <div className="text-xs text-gray-500 mt-1">
                {unclockedSession.work_date} 출근 {unclockedSession.check_in?.slice(0,5)}
                {unclockedSession.note === '야간자동컷오프' && <span className="ml-1 text-amber-600">(시스템이 익일 07:00으로 임시 처리함)</span>}
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-sm text-gray-700">
                실제 퇴근하신 시간을 입력해야 진행할 수 있습니다.<br />
                <span className="text-xs text-gray-500">결재자 승인 후 정식 반영됩니다.</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">퇴근 시간 *</label>
                <input type="time" className="input"
                  value={pickedCheckoutTime}
                  onChange={e=>setPickedCheckoutTime(e.target.value)} />
                <div className="text-xs text-gray-400 mt-1">
                  💡 자정 넘긴 야근은 00:00 ~ 07:00 사이로 입력 (예: 02:30)
                </div>
              </div>
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                ⚠️ 이 항목을 처리하지 않으면 출근을 비롯한 다른 작업을 진행할 수 없습니다.
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={submitUnclockedFix}
                disabled={!pickedCheckoutTime}
                className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                결재자에게 승인 요청
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

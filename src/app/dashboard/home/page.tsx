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

  function nowStr() {
    const n = new Date()
    return String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0')
  }

  async function handleCheckIn() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const ds = todayStr()
    // 오늘 세션 조회해서 다음 번호 계산
    const { data: todaySessions } = await supabase.from('attendance')
      .select('id').eq('user_id', session.user.id).eq('work_date', ds)
    const nextSeq = (todaySessions?.length || 0) + 1
    await supabase.from('attendance').insert({
      user_id: session.user.id, work_date: ds,
      check_in: nowStr(), is_holiday: isHoliday(ds), session_seq: nextSeq,
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
    // check_out이 없는 가장 최근 세션 업데이트
    const { data: openSessions } = await supabase.from('attendance')
      .select('id').eq('user_id', session.user.id).eq('work_date', ds).is('check_out', null)
      .order('session_seq', {ascending: false}).limit(1)
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

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const { data: todaySess } = await supabase.from('attendance')
      .select('*').eq('user_id', session.user.id).eq('work_date', todayStr())
      .order('session_seq')
    // 활성 세션(미퇴근) 또는 가장 최근 세션
    const activeS = (todaySess||[]).find((s:any) => s.check_in && !s.check_out)
    const lastS = (todaySess||[]).slice(-1)[0]
    setToday(activeS || lastS || null)
    const now = new Date()
    const start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
    const { data: recs } = await supabase.from('attendance').select('reg_hours')
      .eq('user_id', session.user.id).gte('work_date', start)
    const monthReg = (recs||[]).reduce((a:number,r:any)=>a+(r.reg_hours||0),0)
    let pendingCount = 0
    if (p?.role === 'director') {
      const { count } = await supabase.from('approvals').select('*',{count:'exact',head:true})
        .eq('approver_id', session.user.id).eq('status','pending')
      pendingCount = count||0
    }
    setStats({ monthReg, remainLeave: p?.annual_leave||0, pendingApprovals: pendingCount })
    // 이번달 일정
    const { data: myAtt } = await supabase.from('event_attendees').select('event_id').eq('user_id', session.user.id)
    const attIds = (myAtt||[]).map((a:any)=>a.event_id)
    const { data: evs } = await supabase.from('events')
      .select('id,title,start_at,end_at,color,creator_id,created_at')
      .or('creator_id.eq.'+session.user.id+(attIds.length?',id.in.('+attIds.join(',')+')'  :'')).order('start_at')
    setAllEvents(evs||[])
    if (p?.role === 'director') {
      const { data: apps } = await supabase.from('approvals')
        .select('*, requester:requester_id(name,color,tc,avatar_url)')
        .eq('approver_id', session.user.id).eq('status','pending').limit(4)
      setPendingApprovals(apps||[])
      const { data: allStaff } = await supabase.from('profiles').select('id,name,dept,color,tc,avatar_url').eq('status','active').neq('id', session.user.id)
      const { data: todayAtts } = await supabase.from('attendance').select('user_id,check_in,check_out').eq('work_date', todayStr())
      setTeamStatus((allStaff||[]).map((s:any)=>{
        const att = (todayAtts||[]).find((a:any)=>a.user_id===s.id)
        return { ...s, checkIn: att?.check_in, status: att?.check_out?'done':att?.check_in?'working':'absent' }
      }).slice(0,5))
    }
    const { data: notices } = await supabase.from('notices')
      .select('*, author:author_id(name)').order('created_at',{ascending:false}).limit(3)
    setRecentNotices(notices||[])
  }, [])

  useEffect(() => { load() }, [load])

  async function loadBriefing() {
    setBriefingLoading(true)
    setBriefing('')
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setBriefingLoading(false); return }

      const today = todayStr()
      const todayDate = new Date()
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

      // 급여일 계산 (매월 25일)
      const payDay = 25
      const today_d = todayDate.getDate()
      const daysToPayday = today_d <= payDay ? payDay - today_d : (new Date(todayDate.getFullYear(), todayDate.getMonth()+1, payDay).getDate() + (new Date(todayDate.getFullYear(), todayDate.getMonth()+1, 0).getDate() - today_d))
      const paydayMsg = today_d === payDay ? '🎉 오늘이 급여일입니다!' : ('급여일까지 ' + (payDay - today_d > 0 ? payDay - today_d : new Date(todayDate.getFullYear(), todayDate.getMonth()+1, 0).getDate() - today_d + payDay) + '일 남았어요')

      // 다가오는 30일 일정
      const next30 = new Date(todayDate); next30.setDate(todayDate.getDate() + 30)
      const next30str = next30.toISOString().slice(0,10) + 'T23:59:59'
      const { data: myAtt } = await supabase.from('event_attendees').select('event_id').eq('user_id', session.user.id)
      const attIds = (myAtt||[]).map((a: any) => a.event_id)
      let eventsQuery = supabase.from('events')
        .select('title,start_at,location').order('start_at')
        .gte('start_at', today).lte('start_at', next30str)
      if (attIds.length > 0) {
        eventsQuery = eventsQuery.or('creator_id.eq.' + session.user.id + ',id.in.(' + attIds.join(',') + ')')
      } else {
        eventsQuery = eventsQuery.eq('creator_id', session.user.id)
      }
      const { data: events } = await eventsQuery
      const eventList = (events||[]).slice(0,10).map((e: any) =>
        e.start_at.slice(5,10).replace('-','/') + ' ' + e.start_at.slice(11,16) + ' ' + e.title + (e.location ? ' @ ' + e.location : '')
      )

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

      // AI에게 보낼 최종 데이터
      const briefData = {
        날짜: (todayDate.getMonth()+1) + '월 ' + todayDate.getDate() + '일 ' + days[todayDate.getDay()] + '요일',
        직원정보: (p?.name||'') + ' ' + (p?.grade||'') + ' / ' + (p?.dept||''),
        오늘출퇴근: attendStatus,
        이번달근태: thisMonth + '월 ' + workDays + '일 출근 / 정규 ' + monthReg + 'h / 초과 ' + monthExt + 'h',
        잔여연차: remainLeave + '일 (사용 ' + usedLeave + '일 / 기본 ' + (p?.annual_leave||0) + '일)',
        급여일안내: paydayMsg,
        향후30일일정: eventList.length ? eventList : ['등록된 일정 없음'],
        결재현황: approvalList.length ? approvalList : ['대기중인 결재 없음'],
        미읽음공지: (noticeCount||0) + '건',
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

  useEffect(() => {
    if (profile?.id) {
      loadBriefing()
    }
  }, [profile?.id])
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
    return allEvents.filter((e:any) => e.start_at.slice(0,10) <= ds && ds <= e.end_at.slice(0,10))
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
      {/* 인사말 + 출퇴근 */}
      <div className="mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div>
              <div className="text-xl font-semibold text-gray-800">안녕하세요, {profile?.name} {profile?.grade}님 👋</div>
              <div className="text-sm text-gray-400 mt-0.5">{dateStr}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xl font-bold text-gray-700 tabular-nums">{time}</div>
            <div className="flex gap-2">
              <button onClick={handleCheckIn} disabled={!!today?.check_in && !today?.check_out}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed">
                <span style={{fontSize:16}}>🔴</span> 출근
              </button>
              <button onClick={handleCheckOut} disabled={!today?.check_in||!!today?.check_out}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">
                <span style={{fontSize:16}}>🔴</span> 퇴근
              </button>
            </div>
          </div>
        </div>
        {today?.check_out && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-between">
            <span className="text-xs text-amber-700">퇴근 처리됨 · 업무에 복귀하시겠습니까?</span>
            <button onClick={handleResumeWork} className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700">🔄 근무 복귀</button>
          </div>
        )}
      </div>

      {/* AI 업무 브리핑 */}
      <div className="card mb-5 border-purple-100 bg-gradient-to-r from-purple-50 to-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-sm">✨</div>
            <span className="text-sm font-semibold text-gray-800">AI 업무 브리핑</span>
            <span className="text-xs text-gray-400">오늘의 일정과 할 일을 정리했어요</span>
          </div>
          <button onClick={loadBriefing} disabled={briefingLoading}
            className="text-xs text-purple-600 hover:text-purple-800 disabled:text-gray-400 flex items-center gap-1">
            {briefingLoading ? '⏳' : '🔄'} {briefingLoading ? '분석 중...' : '새로고침'}
          </button>
        </div>
        {briefingLoading ? (
          <div className="flex items-center gap-3 py-2">
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{animationDelay:'0ms'}}/>
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{animationDelay:'150ms'}}/>
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{animationDelay:'300ms'}}/>
            </div>
            <span className="text-xs text-gray-400">AI가 오늘의 업무를 분석하고 있어요...</span>
          </div>
        ) : briefing ? (
          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{briefing}</div>
        ) : (
          <div className="text-sm text-gray-400 py-1">브리핑을 불러오는 중...</div>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          {label:'출근 시간', val:today?.check_in?.slice(0,5)||'--:--', sub:today?.check_out?'퇴근완료':today?.check_in?'근무중':'미출근', c:'text-gray-800'},
          {label:'이번달 근태', val:Math.round(stats.monthReg*10)/10+'h', sub:'정규 근무', c:'text-purple-600'},
          {label:'잔여 연차', val:stats.remainLeave+'일', sub:'사용 가능', c:'text-teal-600'},
          {label:profile?.role==='director'?'미결 결재':'대기 결재', val:stats.pendingApprovals+'건', sub:'승인 대기', c:stats.pendingApprovals>0?'text-amber-600':'text-gray-400'},
        ].map(m=>(
          <div key={m.label} className="card">
            <div className="text-xs text-gray-400 mb-1">{m.label}</div>
            <div className={`text-2xl font-semibold ${m.c}`}>{m.val}</div>
            <div className="text-xs text-gray-400 mt-1">{m.sub}</div>
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
            <button onClick={()=>router.push('/dashboard/calendar')}
              className="text-xs text-purple-600 hover:text-purple-800 ml-2">전체 →</button>
          </div>
        </div>
        <div className="grid grid-cols-7 mb-1">
          {DAYS_SHORT.map((d,i)=>(
            <div key={d} className={`text-center text-xs font-semibold py-1.5
              ${i===0?'text-red-400 bg-red-50':i===6?'text-blue-500 bg-blue-50':'text-gray-500 bg-gray-50'} rounded-sm`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({length:firstDay}).map((_,i)=>(
            <div key={`e-${i}`} className="min-h-[80px] bg-gray-50/30" />
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
                onClick={()=>router.push('/dashboard/calendar')}
                className={`min-h-[80px] border border-gray-100 p-1 cursor-pointer transition-colors
                  ${isSat?'bg-blue-50/60':isHol||isSun?'bg-red-50':'bg-white'}
                  hover:bg-purple-50/40`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold mb-0.5
                  ${isToday?'bg-purple-600 text-white':isSat?'text-blue-500':isHol||isSun?'text-red-400':'text-gray-700'}`}>
                  {day}
                </div>
                {dayEvs.slice(0,3).map((ev:any)=>{
                  const isNew = ev.created_at && (new Date().getTime() - new Date(ev.created_at).getTime()) < 3*24*60*60*1000
                  return (
                    <div key={ev.id}
                      className="text-white rounded px-1 mb-0.5 flex items-center gap-0.5"
                      style={{background:ev.color||'#534AB7',fontSize:'10px',lineHeight:'16px'}}>
                      <span className="truncate flex-1">{ev.title}</span>
                      {isNew && <span className="flex-shrink-0 bg-white/30 rounded px-0.5" style={{fontSize:'8px'}}>NEW</span>}
                    </div>
                  )
                })}
                {dayEvs.length>3 && <div className="text-gray-400" style={{fontSize:'10px'}}>+{dayEvs.length-3}</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* 하단 3열 */}
      <div className="grid grid-cols-3 gap-4">
        {/* 바로가기 */}
        <div className="card">
          <div className="text-sm font-medium text-gray-700 mb-3">🚀 바로가기</div>
          <div className="grid grid-cols-4 gap-2">
            {SHORTCUTS.map(s=>(
              <button key={s.href} onClick={()=>router.push(s.href)}
                className="flex flex-col items-center gap-1 p-2 bg-gray-50 rounded-xl hover:bg-purple-50 transition-colors group">
                <span style={{fontSize:18}}>{s.icon}</span>
                <span className="text-xs text-gray-500 group-hover:text-purple-600">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 결재대기 + 공지 */}
        <div className="space-y-3">
          {profile?.role==='director' && pendingApprovals.length>0 && (
            <div className="card">
              <div className="flex justify-between items-center mb-2">
                <div className="text-sm font-medium text-gray-700">✅ 결재 대기</div>
                <button onClick={()=>router.push('/dashboard/approval')} className="text-xs text-purple-600">결재함 →</button>
              </div>
              {pendingApprovals.map((a:any)=>(
                <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <Avatar u={a.requester} size={5} />
                    <div>
                      <div className="text-xs font-medium text-gray-800">{(a.requester as any)?.name}</div>
                      <div className="text-xs text-gray-400">{a.type}</div>
                    </div>
                  </div>
                  <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">대기</span>
                </div>
              ))}
            </div>
          )}
          <div className="card">
            <div className="flex justify-between items-center mb-2">
              <div className="text-sm font-medium text-gray-700">📢 최근 공지</div>
              <button onClick={()=>router.push('/dashboard/notice')} className="text-xs text-purple-600">전체 →</button>
            </div>
            {recentNotices.length===0
              ? <div className="py-3 text-center text-gray-300 text-xs">공지사항이 없습니다</div>
              : recentNotices.map((n:any)=>(
                <div key={n.id}
                  className="py-1.5 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-purple-50 -mx-3 px-3 rounded transition-colors"
                  onClick={()=>router.push(`/dashboard/notice?id=${n.id}`)}>
                  <div className="text-xs font-medium text-gray-800 truncate">{n.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{(n.author as any)?.name} · {n.created_at?.slice(0,10)}</div>
                </div>
              ))
            }
          </div>
        </div>

        {/* 팀원현황 + 나의결재 */}
        <div className="space-y-3">
          {profile?.role==='director' && (
            <div className="card">
              <div className="flex justify-between items-center mb-2">
                <div className="text-sm font-medium text-gray-700">👥 팀원 현황</div>
                <button onClick={()=>router.push('/dashboard/attendance')} className="text-xs text-purple-600">전체 →</button>
              </div>
              {teamStatus.map((u:any)=>(
                <div key={u.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0
                    ${u.status==='working'?'bg-green-400':u.status==='done'?'bg-purple-400':'bg-gray-300'}`} />
                  <span className="text-xs font-medium text-gray-800 flex-1">{u.name}</span>
                  <span className="text-xs text-gray-400">{u.dept}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0
                    ${u.status==='working'?'bg-green-50 text-green-700':u.status==='done'?'bg-purple-50 text-purple-700':'bg-gray-100 text-gray-500'}`}>
                    {u.checkIn?u.checkIn.slice(0,5):''} {u.status==='working'?'근무중':u.status==='done'?'퇴근':'미출근'}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="card">
            <div className="flex justify-between items-center mb-2">
              <div className="text-sm font-medium text-gray-700">📝 나의 결재</div>
              <button onClick={()=>router.push('/dashboard/leave')} className="text-xs text-purple-600">신청 →</button>
            </div>
            <div className="space-y-1.5">
              <button onClick={()=>router.push('/dashboard/leave')}
                className="w-full text-left p-2 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
                <div className="text-xs font-medium text-purple-700">+ 휴가·출장 신청</div>
                <div className="text-xs text-purple-400 mt-0.5">연차 · 반차 · 출장 · 외근</div>
              </button>
              <button onClick={()=>router.push('/dashboard/approval')}
                className="w-full text-left p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="text-xs font-medium text-gray-700">결재함 확인</div>
                <div className="text-xs text-gray-400 mt-0.5">보낸 결재 · 받은 결재</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

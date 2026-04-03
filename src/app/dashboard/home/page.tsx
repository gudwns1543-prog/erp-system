'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { classifyWork, minutesToHours, isHoliday } from '@/lib/attendance'
import { Logo } from '@/components/Logo'

const DAYS = ['일','월','화','수','목','금','토']
const DAYS_SHORT = ['일','월','화','수','목','금','토']
function todayStr() { return new Date().toISOString().slice(0,10) }

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
    await supabase.from('attendance').upsert({
      user_id: session.user.id, work_date: ds, check_in: nowStr(), is_holiday: isHoliday(ds),
    }, { onConflict: 'user_id,work_date' })
    load()
  }

  async function handleCheckOut() {
    if (!today?.check_in) return
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const outTime = nowStr(); const ds = todayStr()
    const r = classifyWork(ds, today.check_in, outTime)
    await supabase.from('attendance').update({
      check_out: outTime,
      reg_hours: minutesToHours(r.reg), ext_hours: minutesToHours(r.ext),
      night_hours: minutesToHours(r.night), hol_hours: minutesToHours(r.hReg),
      hol_eve_hours: minutesToHours(r.hEve), hol_night_hours: minutesToHours(r.hNight),
      ignored_hours: minutesToHours(r.ignored),
    }).eq('user_id', session.user.id).eq('work_date', ds)
    load()
  }

  async function handleResumeWork() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const ds = todayStr()
    await supabase.from('attendance').update({
      check_in: nowStr(), check_out: null,
      reg_hours:0, ext_hours:0, night_hours:0,
    }).eq('user_id', session.user.id).eq('work_date', ds)
    load()
  }

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const { data: t } = await supabase.from('attendance')
      .select('*').eq('user_id', session.user.id).eq('work_date', todayStr()).maybeSingle()
    setToday(t)
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
      .select('id,title,start_at,end_at,color,creator_id')
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
      const next7 = new Date(todayDate)
      next7.setDate(todayDate.getDate() + 7)
      const next7str = next7.toISOString().slice(0,10) + 'T23:59:59'

      // 내 일정 (참석자 포함)
      const { data: myAtt } = await supabase.from('event_attendees').select('event_id').eq('user_id', session.user.id)
      const attIds = (myAtt||[]).map((a: any) => a.event_id)
      let eventsQuery = supabase.from('events')
        .select('title,start_at,end_at,location').order('start_at')
        .gte('start_at', today).lte('start_at', next7str)
      if (attIds.length > 0) {
        eventsQuery = eventsQuery.or('creator_id.eq.' + session.user.id + ',id.in.(' + attIds.join(',') + ')')
      } else {
        eventsQuery = eventsQuery.eq('creator_id', session.user.id)
      }
      const { data: events } = await eventsQuery

      // 프로필 + 대기결재
      const { data: p } = await supabase.from('profiles').select('role,name,grade,dept').eq('id', session.user.id).single()
      const pendingCol = p?.role === 'director' ? 'approver_id' : 'requester_id'
      const { data: pendingApprovals } = await supabase.from('approvals')
        .select('type,start_date,requester:requester_id(name)')
        .eq(pendingCol, session.user.id).eq('status','pending').limit(5)

      // 오늘 출퇴근
      const { data: todayAtt } = await supabase.from('attendance')
        .select('check_in,check_out,reg_hours').eq('user_id', session.user.id).eq('work_date', today)

      // 미읽음 공지
      const lastRead = localStorage.getItem('notice_read_' + session.user.id) || '2000-01-01'
      const { count: noticeCount } = await supabase.from('notices')
        .select('*',{count:'exact',head:true}).gt('created_at', lastRead)

      const days = ['일','월','화','수','목','금','토']
      const checkIn = todayAtt?.[0]?.check_in
      const checkOut = todayAtt?.[0]?.check_out
      const attendStatus = checkIn
        ? ('출근 ' + checkIn.slice(0,5) + (checkOut ? ' / 퇴근 ' + checkOut.slice(0,5) : ' (근무중)'))
        : '미출근'

      const eventList = (events||[]).map((e: any) =>
        e.start_at.slice(5,10).replace('-','/') + ' ' + e.start_at.slice(11,16) + ' ' + e.title + (e.location ? ' (' + e.location + ')' : '')
      )
      const approvalList = (pendingApprovals||[]).map((a: any) =>
        p?.role === 'director'
          ? ((a.requester as any)?.name + '님의 ' + a.type + ' (' + a.start_date + ')')
          : (a.type + ' 신청 대기중 (' + a.start_date + ')')
      )

      const briefData = {
        오늘날짜: (todayDate.getMonth()+1) + '월 ' + todayDate.getDate() + '일 ' + days[todayDate.getDay()] + '요일',
        직원정보: (p?.name || '') + ' ' + (p?.grade || '') + ' (' + (p?.dept || '') + ')',
        출퇴근상태: attendStatus,
        다가오는일정: eventList,
        대기결재: approvalList,
        미읽음공지: noticeCount || 0,
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: '당신은 회사 ERP 시스템의 AI 어시스턴트입니다. 주어진 업무 데이터를 바탕으로 오늘의 업무 브리핑을 친근하고 간결하게 한국어로 작성해주세요. 인사말 없이 바로 핵심 내용으로 시작하고, 이모지를 활용하여 가독성을 높이고, 3~5줄 이내로 간결하게 작성하며, 없는 내용은 언급하지 마세요. 마지막에 짧은 응원 멘트를 추가해주세요.',
          messages: [{ role: 'user', content: '오늘 업무 데이터:\n' + JSON.stringify(briefData, null, 2) }]
        })
      })
      const data = await response.json()
      const text = data.content?.[0]?.text || '브리핑을 불러올 수 없습니다.'
      setBriefing(text)
    } catch (e) {
      setBriefing('브리핑 로딩 실패. 잠시 후 다시 시도해주세요.')
    }
    setBriefingLoading(false)
  }

  useEffect(() => { loadBriefing() }, [])
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
                  ${isHol?'bg-red-50':isSun?'bg-rose-50/60':isSat?'bg-blue-50/60':'bg-white'}
                  hover:bg-purple-50/40`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold mb-0.5
                  ${isToday?'bg-purple-600 text-white':isHol||isSun?'text-red-400':isSat?'text-blue-500':'text-gray-700'}`}>
                  {day}
                </div>
                {dayEvs.slice(0,3).map((ev:any)=>(
                  <div key={ev.id}
                    className="text-white rounded px-1 mb-0.5 truncate"
                    style={{background:ev.color||'#534AB7',fontSize:'10px',lineHeight:'16px'}}>
                    {ev.title}
                  </div>
                ))}
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
                <div key={n.id} className="py-1.5 border-b border-gray-50 last:border-0">
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

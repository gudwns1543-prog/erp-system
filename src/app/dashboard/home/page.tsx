'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const DAYS = ['일','월','화','수','목','금','토']

function todayStr() { return new Date().toISOString().slice(0,10) }

export default function HomePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [time, setTime] = useState('')
  const [today, setToday] = useState<any>(null)
  const [stats, setStats] = useState({monthReg:0, remainLeave:0, pendingApprovals:0, pendingInvites:0})
  const [todayEvents, setTodayEvents] = useState<any[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([])
  const [recentNotices, setRecentNotices] = useState<any[]>([])
  const [teamStatus, setTeamStatus] = useState<any[]>([])

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)

    // 오늘 출퇴근
    const { data: t } = await supabase.from('attendance')
      .select('*').eq('user_id', session.user.id).eq('work_date', todayStr()).maybeSingle()
    setToday(t)

    // 이번달 근태 합계
    const now = new Date()
    const start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
    const { data: recs } = await supabase.from('attendance').select('reg_hours')
      .eq('user_id', session.user.id).gte('work_date', start)
    const monthReg = (recs||[]).reduce((a:number,r:any)=>a+(r.reg_hours||0),0)

    // 미결 결재 수 (관리자: 받은 것, 직원: 보낸 것 중 대기)
    let pendingApprovalCount = 0
    if (p?.role === 'director') {
      const { count } = await supabase.from('approvals').select('*',{count:'exact',head:true})
        .eq('approver_id', session.user.id).eq('status','pending')
      pendingApprovalCount = count||0
    } else {
      const { count } = await supabase.from('approvals').select('*',{count:'exact',head:true})
        .eq('requester_id', session.user.id).eq('status','pending')
      pendingApprovalCount = count||0
    }

    // 미응답 일정 초대
    const { count: invCount } = await supabase.from('event_attendees').select('*',{count:'exact',head:true})
      .eq('user_id', session.user.id).eq('status','pending')

    setStats({ monthReg, remainLeave: p?.annual_leave||0, pendingApprovals: pendingApprovalCount, pendingInvites: invCount||0 })

    // 오늘 일정
    const { data: evAtts } = await supabase.from('event_attendees').select('event_id').eq('user_id', session.user.id)
    const attIds = (evAtts||[]).map(a=>a.event_id)
    const { data: evs } = await supabase.from('events')
      .select('*, creator:creator_id(name)')
      .or(`creator_id.eq.${session.user.id}${attIds.length?`,id.in.(${attIds.join(',')})`:''}`).order('start_at')
    setTodayEvents((evs||[]).filter(e=>e.start_at.slice(0,10)<=todayStr()&&e.end_at.slice(0,10)>=todayStr()).slice(0,3))

    // 결재 대기 (관리자)
    if (p?.role === 'director') {
      const { data: apps } = await supabase.from('approvals')
        .select('*, requester:requester_id(name,color,tc)')
        .eq('approver_id', session.user.id).eq('status','pending').limit(4)
      setPendingApprovals(apps||[])
    }

    // 최근 공지
    const { data: notices } = await supabase.from('notices')
      .select('*, author:author_id(name)').order('created_at',{ascending:false}).limit(3)
    setRecentNotices(notices||[])

    // 팀원 오늘 근태 현황
    if (p?.role === 'director') {
      const { data: allStaff } = await supabase.from('profiles').select('id,name,dept,color,tc,avatar_url').eq('status','active').neq('id', session.user.id)
      const { data: todayAtts } = await supabase.from('attendance').select('user_id,check_in,check_out').eq('work_date', todayStr())
      const statusList = (allStaff||[]).map(s=>{
        const att = (todayAtts||[]).find(a=>a.user_id===s.id)
        return { ...s, checkIn: att?.check_in, checkOut: att?.check_out,
          status: att?.check_out ? 'done' : att?.check_in ? 'working' : 'absent' }
      })
      setTeamStatus(statusList.slice(0,5))
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date()
      setTime(`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const d = new Date()
  const dateStr = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일`

  const Avatar = ({u,size=6}:{u:any,size?:number}) => (
    u?.avatar_url
      ? <img src={u.avatar_url} className={`w-${size} h-${size} rounded-full object-cover flex-shrink-0`} alt="" />
      : <div className={`w-${size} h-${size} rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0`}
          style={{background:u?.color||'#EEEDFE',color:u?.tc||'#3C3489'}}>{u?.name?.[0]}</div>
  )

  const SHORTCUTS = [
    {icon:'⏱', label:'출퇴근', href:'/dashboard'},
    {icon:'📋', label:'근태기록', href:'/dashboard/attendance'},
    {icon:'📄', label:'급여명세', href:'/dashboard/payslip'},
    {icon:'⚡', label:'예상급여', href:'/dashboard/paysim'},
    {icon:'📅', label:'일정', href:'/dashboard/calendar'},
    {icon:'💬', label:'메시지', href:'/dashboard/chat'},
    {icon:'✅', label:'결재함', href:'/dashboard/approval'},
    {icon:'📢', label:'공지사항', href:'/dashboard/notice'},
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* 인사말 */}
      <div className="mb-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold text-gray-800">
              안녕하세요, {profile?.name} {profile?.grade}님 👋
            </div>
            <div className="text-sm text-gray-400 mt-1">{dateStr}</div>
          </div>
          <div className="text-2xl font-bold text-gray-700 tabular-nums">{time}</div>
        </div>
      </div>

      {/* 요약 카드 4개 */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label:'출근 시간', val: today?.check_in?.slice(0,5)||'--:--',
            sub: today?.check_out?'퇴근 완료':today?.check_in?'근무 중':'미출근',
            color:'text-gray-800', icon:'⏱' },
          { label:'이번달 근태', val: Math.round(stats.monthReg*10)/10+'h',
            sub:'정규 근무 합계', color:'text-purple-600', icon:'📊' },
          { label:'잔여 연차', val: stats.remainLeave+'일',
            sub:'사용 가능', color:'text-teal-600', icon:'🌿' },
          { label: profile?.role==='director'?'미결 결재':'대기 중 결재',
            val: stats.pendingApprovals+'건',
            sub: profile?.role==='director'?'승인 대기':'상신 후 대기',
            color: stats.pendingApprovals>0?'text-amber-600':'text-gray-400', icon:'📝' },
        ].map(m=>(
          <div key={m.label} className="card">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-gray-400">{m.label}</div>
              <span style={{fontSize:16}}>{m.icon}</span>
            </div>
            <div className={`text-2xl font-semibold ${m.color}`}>{m.val}</div>
            <div className="text-xs text-gray-400 mt-1">{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* 왼쪽 (3/5) */}
        <div className="col-span-3 space-y-4">
          {/* 오늘 일정 */}
          <div className="card">
            <div className="flex justify-between items-center mb-3">
              <div className="text-sm font-medium text-gray-700">📅 오늘 일정</div>
              <button onClick={()=>router.push('/dashboard/calendar')}
                className="text-xs text-purple-600 hover:text-purple-800">전체 보기 →</button>
            </div>
            {todayEvents.length === 0 ? (
              <div className="py-4 text-center text-gray-300 text-xs">오늘 일정이 없습니다</div>
            ) : todayEvents.map(ev=>(
              <div key={ev.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:ev.color||'#534AB7'}}></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{ev.title}</div>
                  <div className="text-xs text-gray-400">
                    {ev.all_day ? '종일' : `${ev.start_at.slice(11,16)} ~ ${ev.end_at.slice(11,16)}`}
                    {ev.location && ` · 📍${ev.location}`}
                  </div>
                </div>
              </div>
            ))}
            {stats.pendingInvites > 0 && (
              <div className="mt-2 p-2 bg-amber-50 rounded-lg flex items-center justify-between">
                <span className="text-xs text-amber-700">📬 미응답 일정 초대 {stats.pendingInvites}건</span>
                <button onClick={()=>router.push('/dashboard/calendar')}
                  className="text-xs text-amber-700 font-medium">응답하기 →</button>
              </div>
            )}
          </div>

          {/* 빠른 바로가기 */}
          <div className="card">
            <div className="text-sm font-medium text-gray-700 mb-3">🚀 바로가기</div>
            <div className="grid grid-cols-4 gap-2">
              {SHORTCUTS.map(s=>(
                <button key={s.href} onClick={()=>router.push(s.href)}
                  className="flex flex-col items-center gap-1.5 p-3 bg-gray-50 rounded-xl hover:bg-purple-50 transition-colors group">
                  <span style={{fontSize:20}}>{s.icon}</span>
                  <span className="text-xs text-gray-500 group-hover:text-purple-600 transition-colors">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 팀원 오늘 현황 (관리자) */}
          {profile?.role === 'director' && (
            <div className="card">
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm font-medium text-gray-700">👥 오늘 팀원 현황</div>
                <button onClick={()=>router.push('/dashboard/attendance')}
                  className="text-xs text-purple-600 hover:text-purple-800">전체 보기 →</button>
              </div>
              {teamStatus.map(u=>(
                <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <Avatar u={u} />
                    <div>
                      <div className="text-sm font-medium text-gray-800">{u.name}</div>
                      <div className="text-xs text-gray-400">{u.dept}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.checkIn && <span className="text-xs text-gray-400">{u.checkIn.slice(0,5)}</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                      ${u.status==='working'?'bg-green-50 text-green-700':
                        u.status==='done'?'bg-purple-50 text-purple-700':'bg-gray-100 text-gray-500'}`}>
                      {u.status==='working'?'근무중':u.status==='done'?'퇴근':'미출근'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 오른쪽 (2/5) */}
        <div className="col-span-2 space-y-4">
          {/* 결재 대기 */}
          {profile?.role === 'director' && (
            <div className="card">
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm font-medium text-gray-700">✅ 결재 대기</div>
                <button onClick={()=>router.push('/dashboard/approval')}
                  className="text-xs text-purple-600 hover:text-purple-800">결재함 →</button>
              </div>
              {pendingApprovals.length === 0 ? (
                <div className="py-4 text-center text-gray-300 text-xs">대기 중인 결재가 없습니다</div>
              ) : pendingApprovals.map(a=>(
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <Avatar u={a.requester} size={5} />
                    <div>
                      <div className="text-xs font-medium text-gray-800">{(a.requester as any)?.name}</div>
                      <div className="text-xs text-gray-400">{a.type} · {a.start_date}</div>
                    </div>
                  </div>
                  <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">대기</span>
                </div>
              ))}
            </div>
          )}

          {/* 최근 공지 */}
          <div className="card">
            <div className="flex justify-between items-center mb-3">
              <div className="text-sm font-medium text-gray-700">📢 최근 공지</div>
              <button onClick={()=>router.push('/dashboard/notice')}
                className="text-xs text-purple-600 hover:text-purple-800">전체 보기 →</button>
            </div>
            {recentNotices.length === 0 ? (
              <div className="py-4 text-center text-gray-300 text-xs">공지사항이 없습니다</div>
            ) : recentNotices.map(n=>(
              <div key={n.id} className="py-2 border-b border-gray-50 last:border-0">
                <div className="text-xs font-medium text-gray-800 truncate">{n.title}</div>
                <div className="text-xs text-gray-400 mt-0.5">{(n.author as any)?.name} · {n.created_at?.slice(0,10)}</div>
              </div>
            ))}
          </div>

          {/* 나의 결재 현황 */}
          <div className="card">
            <div className="flex justify-between items-center mb-3">
              <div className="text-sm font-medium text-gray-700">📝 나의 결재</div>
              <button onClick={()=>router.push('/dashboard/leave')}
                className="text-xs text-purple-600 hover:text-purple-800">신청하기 →</button>
            </div>
            <div className="space-y-2">
              <button onClick={()=>router.push('/dashboard/leave')}
                className="w-full text-left p-2.5 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
                <div className="text-xs font-medium text-purple-700">+ 휴가·출장 신청</div>
                <div className="text-xs text-purple-500 mt-0.5">연차 · 반차 · 출장 · 외근</div>
              </button>
              <button onClick={()=>router.push('/dashboard/approval')}
                className="w-full text-left p-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
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

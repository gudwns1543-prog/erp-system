'use client'
import { useEffect, useState } from 'react'
import { Logo } from '@/components/Logo'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const NAV = [
  { group: '홈', items: [
    { href: '/dashboard/home', label: '홈', icon: '🏠' },
  ]},
  { group: '근태', items: [
    { href: '/dashboard', label: '출퇴근', icon: '⏰' },
    { href: '/dashboard/attendance', label: '근태 기록', icon: '📋' },
  ]},
  { group: '급여', items: [
    { href: '/dashboard/payslip', label: '급여명세 조회', icon: '📄' },
    { href: '/dashboard/paysim', label: '예상 급여 조회', icon: '⚡' },
    { href: '/dashboard/payroll', label: '급여 일괄계산', icon: '📊', adminOnly: true },
  ]},
  { group: '결재', items: [
    { href: '/dashboard/leave', label: '휴가·출장 신청', icon: '📝' },
    { href: '/dashboard/annual', label: '연차 관리', icon: '📅' },
    { href: '/dashboard/approval', label: '결재함', icon: '✅' },
  ]},
  { group: '소통', items: [
    { href: '/dashboard/calendar', label: '일정', icon: '📅' },
    { href: '/dashboard/notice', label: '공지사항', icon: '📢' },
    { href: '/dashboard/chat', label: '메시지', icon: '💬' },
  ]},
  { group: '인사', items: [
    { href: '/dashboard/myinfo', label: '내 정보', icon: '👤' },
    { href: '/dashboard/org', label: '조직도', icon: '🏢' },
    { href: '/dashboard/hrm', label: '인사정보 관리', icon: '⚙️', adminOnly: true },
    { href: '/dashboard/signup', label: '가입 승인', icon: '🔑', adminOnly: true },
  ]},
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<any>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [unreadChat, setUnreadChat] = useState(0)
  const [unreadNotice, setUnreadNotice] = useState(0)
  const [pendingInvite, setPendingInvite] = useState(0)
  const [pendingLeave, setPendingLeave] = useState(0)
  const [showProfilePhoto, setShowProfilePhoto] = useState(false)
  const [chatToast, setChatToast] = useState<{name:string,avatar:string|null,color:string,tc:string,room:string,text:string,roomId:string}|null>(null)
  const [toastTimer, setToastTimer] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      const { data } = await supabase
        .from('profiles').select('*').eq('id', session.user.id).single()
      if (!data || data.status === 'pending') {
        await supabase.auth.signOut()
        router.replace('/login')
        return
      }
      setProfile(data)
      // 결재 대기
      if (data.role === 'director') {
        const { count } = await supabase
          .from('approvals').select('*', { count: 'exact', head: true })
          .eq('approver_id', session.user.id).eq('status', 'pending')
        setPendingCount(count || 0)
        // 가입 승인 대기
        const { count: lc } = await supabase
          .from('signup_requests').select('*', { count: 'exact', head: true }).eq('status','pending')
        setPendingLeave(lc || 0)
      } else {
        const { count: myLeave } = await supabase
          .from('approvals').select('*', { count: 'exact', head: true })
          .eq('requester_id', session.user.id).eq('status','pending')
        setPendingLeave(myLeave || 0)
      }
      // 채팅 미읽음
      const { data: myRooms } = await supabase.from('chat_members').select('room_id').eq('user_id', session.user.id)
      const roomIds = (myRooms||[]).map((r:any)=>r.room_id)
      const { data: reads } = await supabase.from('chat_reads').select('*').eq('user_id', session.user.id)
      let totalUnread = 0
      for (const roomId of roomIds) {
        const lastRead = reads?.find((r:any)=>r.room_id===roomId)?.last_read_at
        const { count } = await supabase.from('chat_messages')
          .select('*',{count:'exact',head:true}).eq('room_id',roomId).eq('is_system',false)
          .gt('created_at', lastRead||'2000-01-01').neq('sender_id', session.user.id)
        totalUnread += count||0
      }
      setUnreadChat(totalUnread)
      // 공지 미읽음 - 마지막 읽은 시간 이후 새 공지 수
      const lastReadNotice = typeof window !== 'undefined'
        ? localStorage.getItem(`notice_read_${session.user.id}`) || '2000-01-01'
        : '2000-01-01'
      const { count: nc } = await supabase.from('notices')
        .select('*',{count:'exact',head:true}).gt('created_at', lastReadNotice)
      setUnreadNotice(nc||0)
      // 일정 초대 미응답
      const { count: ic } = await supabase.from('event_attendees')
        .select('*',{count:'exact',head:true}).eq('user_id', session.user.id).eq('status','pending')
      setPendingInvite(ic||0)
    })
  }, [router])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  // Service Worker 등록 + 알림 권한 요청
  useEffect(() => {
    if (typeof window === 'undefined') return

    // 알림 권한 요청
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    // Service Worker 등록
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW registered'))
        .catch(err => console.log('SW error:', err))
    }
  }, [])

  // 실시간 채팅 알림 구독
  useEffect(() => {
    if (!profile) return
    const supabase = createClient()
    const ch = supabase.channel('layout-chat-notify')
      .on('postgres_changes', {event:'INSERT', schema:'public', table:'chat_messages'},
        async (payload: any) => {
          const msg = payload.new
          if (msg.sender_id === profile.id || msg.is_system) return
          // 내가 속한 방인지 확인
          const { data: membership } = await supabase.from('chat_members')
            .select('room_id').eq('user_id', profile.id).eq('room_id', msg.room_id).maybeSingle()
          if (!membership) return
          // 채팅 페이지에 있으면 카운트 증가 안 함 (채팅 페이지가 직접 처리)
          if (pathname === '/dashboard/chat') return
          setUnreadChat(prev => prev + 1)
          // 발신자 정보 조회
          const { data: sender } = await supabase.from('profiles')
            .select('name,avatar_url,color,tc').eq('id', msg.sender_id).single()
          const { data: room } = await supabase.from('chat_rooms')
            .select('name').eq('id', msg.room_id).single()
          if (sender && room) {
            const toastData = {
              name: sender.name || '누군가',
              avatar: sender.avatar_url || null,
              color: sender.color || '#EEEDFE',
              tc: sender.tc || '#3C3489',
              room: room.name,
              roomId: msg.room_id,
              text: msg.content?.substring(0,60) || '파일을 보냈습니다',
            }
            setChatToast(toastData)
            if (toastTimer) clearTimeout(toastTimer)
            const t = setTimeout(() => setChatToast(null), 5000)
            setToastTimer(t)
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('💬 ' + room.name + ' - ' + sender.name, {
                body: msg.content?.substring(0,80) || '파일을 보냈습니다',
                icon: '/favicon.svg'
              })
            }
          }
        })
      // chat_reads 업데이트 시 레이아웃 카운트 재계산
      .on('postgres_changes', {event:'INSERT', schema:'public', table:'chat_reads'},
        async (payload: any) => {
          if (payload.new?.user_id !== profile.id) return
          // 본인 읽음 기록 변경 → 전체 미읽음 재계산
          const { data: myRooms } = await supabase.from('chat_members').select('room_id').eq('user_id', profile.id)
          const roomIds = (myRooms||[]).map((r:any) => r.room_id)
          const { data: reads } = await supabase.from('chat_reads').select('*').eq('user_id', profile.id)
          let total = 0
          for (const roomId of roomIds) {
            const lastRead = reads?.find((r:any) => r.room_id === roomId)?.last_read_at
            const { count } = await supabase.from('chat_messages')
              .select('*',{count:'exact',head:true}).eq('room_id',roomId).eq('is_system',false)
              .gt('created_at', lastRead||'2000-01-01').neq('sender_id', profile.id)
            total += count||0
          }
          setUnreadChat(total)
        })
      .on('postgres_changes', {event:'UPDATE', schema:'public', table:'chat_reads'},
        async (payload: any) => {
          if (payload.new?.user_id !== profile.id) return
          const { data: myRooms } = await supabase.from('chat_members').select('room_id').eq('user_id', profile.id)
          const roomIds = (myRooms||[]).map((r:any) => r.room_id)
          const { data: reads } = await supabase.from('chat_reads').select('*').eq('user_id', profile.id)
          let total = 0
          for (const roomId of roomIds) {
            const lastRead = reads?.find((r:any) => r.room_id === roomId)?.last_read_at
            const { count } = await supabase.from('chat_messages')
              .select('*',{count:'exact',head:true}).eq('room_id',roomId).eq('is_system',false)
              .gt('created_at', lastRead||'2000-01-01').neq('sender_id', profile.id)
            total += count||0
          }
          setUnreadChat(total)
        })
      .on('postgres_changes', {event:'INSERT', schema:'public', table:'approvals'},
        (payload: any) => {
          if (profile.role === 'director') setPendingCount(prev => prev + 1)
        })
      .on('postgres_changes', {event:'UPDATE', schema:'public', table:'approvals'},
        async () => {
          // 결재 상태 변경 시 재계산
          const supabase2 = createClient()
          const { data: { session } } = await supabase2.auth.getSession()
          if (!session) return
          if (profile.role === 'director') {
            const { count } = await supabase2.from('approvals').select('*',{count:'exact',head:true})
              .eq('approver_id', session.user.id).eq('status','pending')
            setPendingCount(count||0)
          } else {
            const { count } = await supabase2.from('approvals').select('*',{count:'exact',head:true})
              .eq('requester_id', session.user.id).eq('status','pending')
            setPendingLeave(count||0)
          }
        })
      .on('postgres_changes', {event:'INSERT', schema:'public', table:'notices'},
        (payload: any) => {
          // 본인이 작성한 공지는 읽음 처리
          if (payload.new?.author_id !== profile?.id) {
            setUnreadNotice(prev => prev + 1)
          }
        })
      .on('postgres_changes', {event:'INSERT', schema:'public', table:'event_attendees'},
        async (payload: any) => {
          if (payload.new.user_id === profile.id && payload.new.status === 'pending') {
            setPendingInvite(prev => prev + 1)
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile])

  // 페이지 이동 시 해당 뱃지 클리어
  useEffect(() => {
    if (pathname === '/dashboard/notice') {
      setUnreadNotice(0)
      if (typeof window !== 'undefined' && profile?.id) {
        localStorage.setItem(`notice_read_${profile.id}`, new Date().toISOString())
      }
    }
    if (pathname === '/dashboard/chat') {
      // 채팅 페이지 진입 시 DB 기준으로 정확히 재계산
      const supabase = createClient()
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (!session) return
        const { data: myRooms } = await supabase.from('chat_members').select('room_id').eq('user_id', session.user.id)
        const roomIds = (myRooms||[]).map((r:any) => r.room_id)
        const { data: reads } = await supabase.from('chat_reads').select('*').eq('user_id', session.user.id)
        let totalUnread = 0
        for (const roomId of roomIds) {
          const lastRead = reads?.find((r:any) => r.room_id === roomId)?.last_read_at
          const { count } = await supabase.from('chat_messages')
            .select('*',{count:'exact',head:true}).eq('room_id',roomId).eq('is_system',false)
            .gt('created_at', lastRead||'2000-01-01').neq('sender_id', session.user.id)
          totalUnread += count||0
        }
        setUnreadChat(totalUnread)
      })
    }
    if (pathname === '/dashboard/calendar') setPendingInvite(0)
    if (pathname === '/dashboard/approval' || pathname === '/dashboard/leave') {
      // 실제 DB에서 재조회해서 정확한 값 설정
      const supabase = createClient()
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (!session || !profile) return
        if (profile.role === 'director') {
          const { count } = await supabase.from('approvals')
            .select('*',{count:'exact',head:true})
            .eq('approver_id', session.user.id).eq('status','pending')
          setPendingCount(count||0)
        } else {
          const { count } = await supabase.from('approvals')
            .select('*',{count:'exact',head:true})
            .eq('requester_id', session.user.id).eq('status','pending')
          setPendingLeave(count||0)
          setPendingCount(0)
        }
      })
    }
    if (pathname === '/dashboard/signup') {
      setPendingLeave(0)
      // 가입승인도 읽음 처리
    }
  }, [pathname, profile])

  if (!profile) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-400 text-sm">로딩 중...</div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* 사이드바 */}
      <div className="w-52 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
        <div className="px-4 pt-5 pb-4 border-b border-gray-100">
          <div className="flex flex-col items-center gap-1.5 mb-3 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={()=>router.push('/dashboard/home')}>
            <Logo size={48} />
            <div className="text-sm font-bold text-gray-700 tracking-wide">(주)솔루션 ERP</div>
          </div>
          <div className="flex items-center gap-2">
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0 border-2 border-gray-100" />
              : <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
                  style={{ background: profile.color || '#EEEDFE', color: profile.tc || '#3C3489' }}>
                  {profile.name?.[0]}
                </div>}
            <div>
              <div className="text-xs font-semibold text-gray-800">{profile.name}</div>
              <div className="text-xs text-gray-500">{profile.dept} · {profile.grade}</div>
              <div className={`text-xs font-medium ${profile.role==='director'?'text-purple-600':'text-gray-400'}`}>
                {profile.role==='director'?'관리자':'일반직원'}
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {NAV.map(group => (
            <div key={group.group} className="mb-1">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 py-1.5">
                {group.group}
              </div>
              {group.items
                .filter(item => !item.adminOnly || profile.role === 'director')
                .map(item => {
                  const isActive = pathname === item.href ||
                    (item.href !== '/dashboard' && pathname.startsWith(item.href))
                  return (
                    <Link key={item.href} href={item.href}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm mb-0.5 transition-colors
                        ${isActive
                          ? 'bg-purple-50 text-purple-700 font-medium'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
                      <span className="text-sm w-4 text-center">{item.icon}</span>
                      <span className="flex-1">{item.label}</span>
                      {item.href === '/dashboard/approval' && pendingCount > 0 && (
                        <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingCount}</span>
                      )}
                    {item.href === '/dashboard/chat' && unreadChat > 0 && (
                        <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{unreadChat}</span>
                      )}
                    {item.href === '/dashboard/notice' && unreadNotice > 0 && pathname !== '/dashboard/notice' && (
                        <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{unreadNotice}</span>
                      )}
                    {item.href === '/dashboard/calendar' && pendingInvite > 0 && (
                        <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingInvite}</span>
                      )}
                    {item.href === '/dashboard/leave' && pendingLeave > 0 && (
                        <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingLeave}</span>
                      )}
                    {item.href === '/dashboard/signup' && pendingLeave > 0 && profile?.role==='director' && (
                        <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingLeave}</span>
                      )}
                    </Link>
                  )
                })}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-100">
          <button onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-500
              border border-gray-200 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
            <span>⎋</span> 로그아웃
          </button>
          <div className="text-center text-xs text-gray-300 mt-1.5">{profile.email}</div>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>

      {/* 전역 채팅 토스트 알림 */}
      {chatToast && (
        <div
          onClick={()=>{router.push('/dashboard/chat');setChatToast(null)}}
          className="fixed bottom-6 right-6 z-[9999] cursor-pointer w-72 rounded-2xl shadow-2xl overflow-hidden border border-gray-100"
          style={{animation:'slideUpToast .3s ease'}}>
          <div className="bg-purple-600 px-4 py-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-white truncate">&#128172; {chatToast.room}</span>
            <button onClick={e=>{e.stopPropagation();setChatToast(null)}}
              className="text-white/60 hover:text-white text-sm ml-2 flex-shrink-0">x</button>
          </div>
          <div className="bg-white p-3 flex items-start gap-3">
            {chatToast.avatar
              ? <img src={chatToast.avatar} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt="" />
              : <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{background:chatToast.color,color:chatToast.tc}}>{chatToast.name[0]}</div>
            }
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-gray-800 mb-0.5">{chatToast.name}</div>
              <div className="text-xs text-gray-500 leading-relaxed"
                style={{overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
                {chatToast.text}
              </div>
            </div>
            <div className="text-xs text-gray-300 flex-shrink-0">지금</div>
          </div>
        </div>
      )}
      {/* 프로필 사진 확대 모달 */}
      {showProfilePhoto && profile?.avatar_url && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] cursor-zoom-out"
          onClick={()=>setShowProfilePhoto(false)}>
          <img src={profile.avatar_url} alt={profile.name}
            className="max-w-xs max-h-[80vh] rounded-2xl object-contain shadow-2xl" />
        </div>
      )}
      <style>{`@keyframes slideUpToast{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </div>
  )
}

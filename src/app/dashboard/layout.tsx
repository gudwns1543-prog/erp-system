'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const NAV = [
  { group: '근태', items: [
    { href: '/dashboard', label: '출퇴근', icon: '⏱' },
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
      if (data.role === 'director') {
        const { count } = await supabase
          .from('approvals').select('*', { count: 'exact', head: true })
          .eq('status', 'pending')
        setPendingCount(count || 0)
      }
    })
  }, [router])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (!profile) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-400 text-sm">로딩 중...</div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* 사이드바 */}
      <div className="w-52 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <div className="text-base font-bold text-purple-600">📊 근태 ERP</div>
          <div className="flex items-center gap-2 mt-3">
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-gray-100" />
              : <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: profile.color || '#EEEDFE', color: profile.tc || '#3C3489' }}>
                  {profile.name?.[0]}
                </div>}
            <div>
              <div className="text-xs font-medium text-gray-800">{profile.name}</div>
              <div className="text-xs text-gray-400">{profile.role === 'director' ? '권한관리자' : '일반직원'}</div>
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
                        <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                          {pendingCount}
                        </span>
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
    </div>
  )
}

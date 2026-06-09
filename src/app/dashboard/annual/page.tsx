'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { sortByGrade, getCurrentLeaveEntitlement, calcLeaveUsageForEntitlement, leaveHoursForApproval } from '@/lib/attendance'

const LEAVE_TYPES = ['연차','반차(오전)','반차(오후)','반반차']

function hToD(hours: number) {
  return (hours / 8).toLocaleString('ko-KR', { maximumFractionDigits: 2 })
}

function formatH(hours: number) {
  return `${hours}H (${hToD(hours)}일)`
}

export default function AnnualPage() {
  const [profile, setProfile] = useState<any>(null)
  const [staff, setStaff] = useState<any[]>([])
  const [approvals, setApprovals] = useState<any[]>([])
  const [tab, setTab] = useState<'mine'|'all'>('mine')
  const [selectedUserId, setSelectedUserId] = useState<string>('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)

    const isAdmin = p?.role === 'director'
    const { data: people } = isAdmin
      ? await supabase.from('profiles').select('*').eq('status', 'active')
      : await supabase.from('profiles').select('*').eq('id', session.user.id)

    const users = sortByGrade(people || [])
    setStaff(users)
    if (!selectedUserId && users[0]) setSelectedUserId(session.user.id)

    const ids = users.map((u:any) => u.id)
    if (!ids.length) {
      setApprovals([])
      return
    }

    const { data: reqs } = await supabase.from('approvals')
      .select('id, requester_id, type, start_date, end_date, status, reason, created_at')
      .in('requester_id', ids)
      .in('type', LEAVE_TYPES)
      .in('status', ['approved','pending'])
      .order('start_date', { ascending: false })

    setApprovals(reqs || [])
  }, [selectedUserId])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    return staff.map((u:any) => {
      const ent = getCurrentLeaveEntitlement(u.join_date)
      const userApprovals = approvals.filter((a:any) => a.requester_id === u.id)
      const usage = calcLeaveUsageForEntitlement(userApprovals, ent)
      return { user: u, ent, usage }
    })
  }, [staff, approvals])

  const selectedRow = rows.find((r:any) => r.user.id === (tab === 'mine' ? profile?.id : selectedUserId)) || rows[0]
  const selectedApprovals = selectedRow
    ? approvals
        .filter((a:any) => a.requester_id === selectedRow.user.id)
        .filter((a:any) => {
          if (!selectedRow.ent.generatedAt || !selectedRow.ent.expiresAt) return false
          const s = String(a.start_date).slice(0,10)
          return s >= selectedRow.ent.generatedAt && s < selectedRow.ent.expiresAt
        })
    : []

  const SummaryCards = ({ row }: { row: any }) => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { label: '발생', value: formatH(row.ent.totalHours), color: 'text-gray-800' },
        { label: '승인 사용', value: formatH(row.usage.approvedHours), color: 'text-amber-600' },
        { label: '신청중', value: formatH(row.usage.pendingHours), color: 'text-blue-600' },
        { label: '잔여', value: formatH(row.usage.remainHours), color: row.usage.remainHours <= 8 ? 'text-red-600' : 'text-teal-600' },
      ].map(c => (
        <div key={c.label} className="card text-center py-4">
          <div className="text-xs text-gray-400 mb-1">{c.label}</div>
          <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
        </div>
      ))}
    </div>
  )

  const DetailPanel = ({ row }: { row: any }) => {
    if (!row) return null
    return (
      <div className="space-y-4">
        <div className="card">
          <div className="flex justify-between items-start gap-4 flex-wrap">
            <div>
              <div className="text-lg font-bold text-gray-800">{row.user.name} {row.user.grade}</div>
              <div className="text-sm text-gray-500 mt-1">{row.user.dept || '-'} · 입사일 {row.user.join_date || '미등록'}</div>
            </div>
            <a href="/dashboard/leave" className="btn-primary text-sm px-4 py-2">📝 휴가 신청</a>
          </div>
          <div className="mt-4 grid md:grid-cols-4 gap-3 text-sm">
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-400 mb-1">현재 구분</div>
              <div className="font-semibold text-gray-800">{row.ent.label}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-400 mb-1">생성일</div>
              <div className="font-semibold text-gray-800">{row.ent.generatedAt || '-'}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-400 mb-1">소멸일</div>
              <div className="font-semibold text-gray-800">{row.ent.expiresAt || '-'}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-400 mb-1">발생 수량</div>
              <div className="font-semibold text-gray-800">{formatH(row.ent.totalHours)}</div>
            </div>
          </div>
        </div>

        <SummaryCards row={row} />

        <div className="card overflow-x-auto">
          <div className="text-sm font-semibold text-gray-700 mb-3">현재 유효 휴가 상세</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['구분','생성일','소멸일','발생','승인 사용','신청중','잔여'].map(h => (
                  <th key={h} className="text-left text-xs text-gray-400 font-medium pb-2 pr-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50">
                <td className="py-2 pr-4 font-medium">{row.ent.label}</td>
                <td className="py-2 pr-4 text-gray-500">{row.ent.generatedAt || '-'}</td>
                <td className="py-2 pr-4 text-gray-500">{row.ent.expiresAt || '-'}</td>
                <td className="py-2 pr-4">{formatH(row.ent.totalHours)}</td>
                <td className="py-2 pr-4 text-amber-600">{formatH(row.usage.approvedHours)}</td>
                <td className="py-2 pr-4 text-blue-600">{formatH(row.usage.pendingHours)}</td>
                <td className="py-2 pr-4 font-semibold text-teal-600">{formatH(row.usage.remainHours)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card overflow-x-auto">
          <div className="text-sm font-semibold text-gray-700 mb-3">현재 유효기간 내 사용/신청 내역</div>
          {!selectedApprovals.length ? (
            <div className="text-sm text-gray-400 py-6 text-center">사용 또는 신청 내역이 없습니다.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['상태','유형','시작일','종료일','사용시간','사유'].map(h => (
                    <th key={h} className="text-left text-xs text-gray-400 font-medium pb-2 pr-4 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedApprovals.map((a:any) => (
                  <tr key={a.id} className="border-b border-gray-50">
                    <td className="py-2 pr-4">
                      <span className={`text-xs px-2 py-1 rounded-full ${a.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {a.status === 'approved' ? '승인' : '신청중'}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-medium">{a.type}</td>
                    <td className="py-2 pr-4 text-gray-500">{a.start_date}</td>
                    <td className="py-2 pr-4 text-gray-500">{a.end_date || a.start_date}</td>
                    <td className="py-2 pr-4 font-semibold">{formatH(leaveHoursForApproval(a))}</td>
                    <td className="py-2 pr-4 text-gray-500">{a.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
        <h1 className="text-lg font-semibold text-gray-800">내 연차</h1>
        <a href="/dashboard/leave" className="btn-primary text-sm px-4 py-2">📝 새 결재 신청</a>
      </div>

      {profile?.role === 'director' && (
        <div className="flex gap-1 border-b border-gray-200 mb-5">
          {[
            { key: 'mine', label: '내 연차' },
            { key: 'all', label: '전체 직원 연차' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'all' && profile?.role === 'director' ? (
        <div className="space-y-4">
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['이름','부서','직급','입사일','구분','생성일','소멸일','발생','사용/신청','잔여',''].map(h => (
                    <th key={h} className="text-left text-xs text-gray-400 font-medium pb-2 pr-4 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r:any) => (
                  <tr key={r.user.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-4 font-medium">{r.user.name}</td>
                    <td className="py-2 pr-4 text-gray-500">{r.user.dept || '-'}</td>
                    <td className="py-2 pr-4 text-gray-500">{r.user.grade || '-'}</td>
                    <td className="py-2 pr-4 text-gray-500">{r.user.join_date || '미등록'}</td>
                    <td className="py-2 pr-4">{r.ent.label}</td>
                    <td className="py-2 pr-4 text-gray-500">{r.ent.generatedAt || '-'}</td>
                    <td className="py-2 pr-4 text-gray-500">{r.ent.expiresAt || '-'}</td>
                    <td className="py-2 pr-4">{formatH(r.ent.totalHours)}</td>
                    <td className="py-2 pr-4">{formatH(r.usage.usedHours)}</td>
                    <td className="py-2 pr-4 font-semibold text-teal-600">{formatH(r.usage.remainHours)}</td>
                    <td className="py-2 pr-4">
                      <button onClick={() => setSelectedUserId(r.user.id)} className="btn-secondary text-xs px-2 py-1">조회</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DetailPanel row={selectedRow} />
        </div>
      ) : (
        <DetailPanel row={selectedRow} />
      )}
    </div>
  )
}

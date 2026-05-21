'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { sortByGrade, classifyWork, minutesToHours, isHoliday } from '@/lib/attendance'

function hoursBetween(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60)
}

const STATUS_LABEL: Record<string, string> = {
  draft: '작성중',
  pending: '결재 대기',
  approved: '승인',
  rejected: '반려',
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}


function parseInternalAttendeeIds(raw: string | null | undefined): string[] {
  if (!raw) return []
  const idsPart = String(raw).split('|')[0] || ''
  return idsPart.startsWith('staff:')
    ? idsPart.replace('staff:', '').split(';').map(v => v.trim()).filter(Boolean)
    : []
}

function getBusinessTripUserIds(trip: any): string[] {
  return Array.from(new Set([trip?.user_id, ...parseInternalAttendeeIds(trip?.attendees)].filter(Boolean)))
}

function isBusinessTripParticipant(trip: any, userId?: string): boolean {
  if (!userId || !trip) return false
  return getBusinessTripUserIds(trip).includes(userId)
}

async function applyBusinessTripAttendance(supabase: any, trip: any) {
  const userIds = getBusinessTripUserIds(trip)
  const tripDuration = trip.all_day ? 8 : Number(trip.duration_hours || 0)
  const tripNote = tripDuration >= 4 ? '출장(장)' : '출장(단)'
  const checkIn = trip.all_day ? '09:00:00' : (trip.start_time || '09:00:00')
  const checkOut = trip.all_day ? '18:00:00' : (trip.end_time || '18:00:00')
  const r = classifyWork(trip.trip_date, checkIn, checkOut)

  for (const userId of userIds) {
    const { data: existingList } = await supabase.from('attendance')
      .select('id, note')
      .eq('user_id', userId)
      .eq('work_date', trip.trip_date)
      .order('created_at', { ascending: false })

    const existing = existingList?.[0]
    if (existing) {
      const note = String(existing.note || '')
      if (!note.includes('출장')) {
        await supabase.from('attendance').update({
          note: note ? `${note} · ${tripNote}` : tripNote,
        }).eq('id', existing.id)
      }
    } else {
      await supabase.from('attendance').insert({
        user_id: userId,
        work_date: trip.trip_date,
        check_in: checkIn,
        check_out: checkOut,
        reg_hours: minutesToHours(r.reg),
        ext_hours: minutesToHours(r.ext),
        night_hours: minutesToHours(r.night),
        hol_hours: minutesToHours(r.hReg),
        hol_eve_hours: minutesToHours(r.hEve),
        hol_night_hours: minutesToHours(r.hNight),
        ignored_hours: minutesToHours(r.ignored),
        note: tripNote,
        is_holiday: isHoliday(trip.trip_date),
      })
    }
  }
}

async function removeBusinessTripAttendance(supabase: any, trip: any) {
  const userIds = getBusinessTripUserIds(trip)
  for (const userId of userIds) {
    const { data: existingList } = await supabase.from('attendance')
      .select('id, note')
      .eq('user_id', userId)
      .eq('work_date', trip.trip_date)
    for (const existing of (existingList || [])) {
      const note = String(existing.note || '')
      if (['출장(장)', '출장(단)', '출장'].includes(note)) {
        await supabase.from('attendance').delete().eq('id', existing.id)
      } else if (note.includes('출장')) {
        const cleaned = note
          .replace(/\s*·?\s*출장(?:\([장단]\))?/g, '')
          .replace(/^\s*·\s*/, '')
          .trim()
        await supabase.from('attendance').update({ note: cleaned || null }).eq('id', existing.id)
      }
    }
  }
}

export default function BizTripPage() {
  const [profile, setProfile] = useState<any>(null)
  const [trips, setTrips] = useState<any[]>([])
  const [staffList, setStaffList] = useState<any[]>([])
  const [approvers, setApprovers] = useState<any[]>([])
  const [tripPolicy, setTripPolicy] = useState({ short: 15000, long: 25000 })
  const [tab, setTab] = useState<'mine' | 'pending' | 'all'>('mine')
  const [editing, setEditing] = useState<any | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [alert, setAlert] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data: p } = await supabase.from('profiles')
      .select('id,name,role,dept,grade').eq('id', session.user.id).single()
    setProfile(p)

    // 직원 목록
    const { data: emps } = await supabase.from('profiles')
      .select('id,name,grade,dept,color,tc,role').eq('status', 'active').order('name')
    setStaffList(sortByGrade(emps || []))
    // 결재자 후보 (이사급 이상)
    const apprs = (emps || []).filter((e: any) =>
      ['대표이사', '대표', '이사', '부사장', '전무이사', '전무', '상무이사', '상무'].includes(e.grade)
    )
    setApprovers(sortByGrade(apprs))

    // 회사 출장 정책 로딩
    const { data: cs } = await supabase.from('company_settings')
      .select('key, value')
      .in('key', ['trip_short_amount', 'trip_long_amount'])
    if (cs && cs.length > 0) {
      const policy = { short: 15000, long: 25000 }
      for (const row of cs) {
        if (row.key === 'trip_short_amount') policy.short = Number(row.value) || 15000
        if (row.key === 'trip_long_amount') policy.long = Number(row.value) || 25000
      }
      setTripPolicy(policy)
    }

    // 출장 목록 (tab 별)
    let query = supabase.from('business_trips').select(`
      *,
      user:user_id(id,name,grade,dept,color,tc),
      approver:approver_id(id,name)
    `).order('trip_date', { ascending: false })

    setTrips([])
    const { data, error } = await query
    if (error) { console.error(error); return }
    setTrips(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  function getFilteredTrips() {
    if (!profile) return []
    if (tab === 'mine') {
      // 작성자뿐 아니라 내부 참석자로 포함된 출장도 본인 출장으로 표시
      return trips.filter(t => isBusinessTripParticipant(t, profile.id) && t.status !== 'draft')
    } else if (tab === 'pending') {
      // 본인이 결재자로 지정된 pending
      return trips.filter(t => t.approver_id === profile.id && t.status === 'pending')
    } else {
      return trips // 관리자만
    }
  }

  async function deleteTrip(id: string) {
    if (!confirm('이 출장 보고서를 삭제하시겠습니까?')) return
    const supabase = createClient()
    const { error } = await supabase.from('business_trips').delete().eq('id', id)
    if (error) { window.alert('삭제 실패: ' + error.message); return }
    setAlert('삭제되었습니다.')
    setTimeout(() => setAlert(''), 2000)
    load()
  }

  async function handleApprove(id: string, status: 'approved' | 'rejected') {
    const supabase = createClient()
    const { data: trip } = await supabase.from('business_trips').select('*').eq('id', id).single()
    if (!trip) { window.alert('출장 보고서를 찾을 수 없습니다.'); return }

    if (status === 'approved') {
      await applyBusinessTripAttendance(supabase, trip)
    } else if (status === 'rejected' && trip.status === 'approved') {
      await removeBusinessTripAttendance(supabase, trip)
    }

    const { error } = await supabase.from('business_trips')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { window.alert('처리 실패: ' + error.message); return }
    setAlert(status === 'approved'
      ? '승인되었습니다. 작성자와 내부 참석자 전원의 근태에 출장 기록이 반영되었습니다.'
      : '반려되었습니다.')
    setTimeout(() => setAlert(''), 2500)
    load()
  }

  const filtered = getFilteredTrips()

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-lg font-semibold text-gray-800">🚗 출장 보고</h1>
        <button onClick={() => { setEditing(null); setShowCreate(true) }}
          className="btn-primary text-sm">+ 새 출장 보고</button>
      </div>

      {alert && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{alert}</div>
      )}

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        <button onClick={() => setTab('mine')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'mine' ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>📋 내 출장 ({trips.filter(t => isBusinessTripParticipant(t, profile?.id) && t.status !== 'draft').length})</button>
        {profile?.role === 'director' && (
          <>
            <button onClick={() => setTab('pending')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === 'pending' ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>⏳ 결재 대기 ({trips.filter(t => t.approver_id === profile?.id && t.status === 'pending').length})</button>
            <button onClick={() => setTab('all')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === 'all' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>📂 전체 출장</button>
          </>
        )}
      </div>

      {/* 출장 목록 */}
      {filtered.length === 0 ? (
        <div className="card py-12 text-center">
          <div className="text-3xl mb-2">🗒</div>
          <div className="text-gray-400 text-sm">
            {tab === 'mine' ? '아직 출장 보고서가 없습니다.' :
             tab === 'pending' ? '결재 대기 중인 출장이 없습니다.' :
             '등록된 출장이 없습니다.'}
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-200">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">출장일</th>
                {tab !== 'mine' && <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">출장자</th>}
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">시간</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">장소</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">내용</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500">수당</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">상태</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 w-32">처리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-purple-50/30">
                  <td className="px-3 py-2.5 text-xs text-gray-700">{t.trip_date}</td>
                  {tab !== 'mine' && (
                    <td className="px-3 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded font-medium"
                        style={{ backgroundColor: t.user?.color || '#E6F1FB', color: t.user?.tc || '#185FA5' }}>
                        {t.user?.name}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-xs text-gray-600">
                    {t.all_day ? '📅 종일' :
                      t.start_time ? `${t.start_time.slice(0,5)} ~ ${t.end_time?.slice(0,5) || '?'}` : '-'}
                    {!t.all_day && t.duration_hours && <div className="text-[10px] text-gray-400">{Number(t.duration_hours).toFixed(1)}h</div>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-700">{t.location}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[200px] truncate" title={t.purpose}>{t.purpose}</td>
                  <td className="px-3 py-2.5 text-xs text-right text-gray-700 font-medium tabular-nums">
                    {t.allowance ? t.allowance.toLocaleString('ko-KR') + '원' : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_COLOR[t.status]}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex gap-1 justify-center">
                      {/* 결재 대기 + 본인이 결재자 */}
                      {t.status === 'pending' && t.approver_id === profile?.id && (
                        <>
                          <button onClick={() => handleApprove(t.id, 'approved')}
                            className="btn-secondary text-xs px-2 py-1 text-green-700 border-green-200 hover:bg-green-50">승인</button>
                          <button onClick={() => handleApprove(t.id, 'rejected')}
                            className="btn-danger text-xs px-2 py-1">반려</button>
                        </>
                      )}
                      {/* 본인 출장 - 수정/삭제 */}
                      {t.user_id === profile?.id && t.status !== 'approved' && (
                        <>
                          <button onClick={() => setEditing(t)}
                            className="text-gray-400 hover:text-purple-600 text-xs px-1">✏️</button>
                          <button onClick={() => deleteTrip(t.id)}
                            className="text-gray-300 hover:text-red-500 text-xs px-1">🗑</button>
                        </>
                      )}
                      {t.status === 'approved' && (
                        <button onClick={() => setEditing(t)}
                          className="text-gray-400 hover:text-purple-600 text-xs px-1" title="보기">👁</button>
                      )}
                      {t.user_id !== profile?.id && t.status !== 'approved' && isBusinessTripParticipant(t, profile?.id) && (
                        <button onClick={() => setEditing(t)}
                          className="text-gray-400 hover:text-purple-600 text-xs px-1" title="보기">👁</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 작성/수정 모달 */}
      {(showCreate || editing) && (
        <BizTripModal
          trip={editing}
          currentUser={profile}
          approvers={approvers}
          staffList={staffList}
          tripPolicy={tripPolicy}
          onClose={() => { setShowCreate(false); setEditing(null) }}
          onSaved={() => { setShowCreate(false); setEditing(null); load() }}
        />
      )}
    </div>
  )
}

// ─── 출장 보고서 작성/수정 모달 ──────
function BizTripModal({ trip, currentUser, approvers, staffList, tripPolicy, onClose, onSaved }: any) {
  // 출장수당 = 정책 기반 계산
  function calcAllowance(hours: number): number {
    if (hours <= 0) return 0
    if (hours >= 4) return tripPolicy?.long ?? 25000
    return tripPolicy?.short ?? 15000
  }
  // attendees는 'staff:<uuid>;...|<외부 텍스트>' 형식으로 저장
  // 파싱: 내부 ID 목록 + 외부 텍스트
  const parseAttendees = (raw: string | null) => {
    if (!raw) return { ids: [] as string[], external: '' }
    const parts = raw.split('|')
    const idsPart = parts[0] || ''
    const external = parts[1] || ''
    const ids = idsPart.startsWith('staff:')
      ? idsPart.replace('staff:', '').split(';').filter(Boolean)
      : []
    return { ids, external: external || (parts.length === 1 && !idsPart.startsWith('staff:') ? idsPart : '') }
  }
  const initParsed = parseAttendees(trip?.attendees || '')
  const [form, setForm] = useState({
    trip_date: trip?.trip_date || new Date().toISOString().slice(0, 10),
    all_day: trip?.all_day ?? false,
    start_time: trip?.start_time?.slice(0, 5) || '09:00',
    end_time: trip?.end_time?.slice(0, 5) || '18:00',
    location: trip?.location || '',
    attendeeIds: trip ? initParsed.ids : (currentUser?.id ? [currentUser.id] : []),
    externalAttendees: initParsed.external,
    purpose: trip?.purpose || '',
    notes: trip?.notes || '',
    approver_id: trip?.approver_id || approvers[0]?.id || '',
    status: trip?.status || 'draft',
  })

  const duration = form.all_day ? 8 : hoursBetween(form.start_time, form.end_time)
  const allowance = calcAllowance(duration)
  const isReadOnly = trip?.status === 'approved'

  async function save(submitForApproval: boolean = false) {
    if (!form.location.trim()) { window.alert('장소를 입력해주세요.'); return }
    if (!form.purpose.trim()) { window.alert('출장 내용을 입력해주세요.'); return }
    if (submitForApproval && !form.approver_id) { window.alert('결재자를 선택해주세요.'); return }

    const supabase = createClient()
    const status = submitForApproval ? 'pending' : form.status

    // 참석자 직렬화: "staff:uuid1;uuid2|외부 텍스트"
    const attendeesStr = (form.attendeeIds.length > 0 ? `staff:${form.attendeeIds.join(';')}` : '')
      + (form.externalAttendees ? `|${form.externalAttendees}` : '')

    const data: any = {
      trip_date: form.trip_date,
      all_day: form.all_day,
      start_time: form.all_day ? null : form.start_time,
      end_time: form.all_day ? null : form.end_time,
      duration_hours: duration,
      location: form.location,
      attendees: attendeesStr,
      purpose: form.purpose,
      notes: form.notes,
      approver_id: form.approver_id || null,
      status,
      allowance,
      updated_at: new Date().toISOString(),
    }

    let error: any = null
    if (trip) {
      const result = await supabase.from('business_trips').update(data).eq('id', trip.id).select()
      error = result.error
    } else {
      data.user_id = currentUser.id
      const result = await supabase.from('business_trips').insert(data).select()
      error = result.error
    }

    if (error) {
      window.alert('저장 실패: ' + error.message)
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-800">
              {trip ? (isReadOnly ? '🔒 출장 보고서 (승인됨)' : '✏️ 출장 보고서 수정') : '🚗 새 출장 보고서'}
            </div>
            {trip?.source_event_id && (
              <div className="text-[10px] text-purple-600 mt-1">📅 일정에서 자동 생성됨</div>
            )}
          </div>
          <button onClick={onClose}
            className="text-gray-300 hover:text-gray-600 text-2xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-3">
          {/* 출장일 + 종일/시간 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">출장일</label>
            <div className="flex items-center gap-2 flex-wrap">
              <input type="date" className="input flex-1 min-w-[140px]" disabled={isReadOnly}
                value={form.trip_date}
                onChange={e => setForm(f => ({ ...f, trip_date: e.target.value }))} />
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={form.all_day} disabled={isReadOnly}
                  onChange={e => setForm(f => ({ ...f, all_day: e.target.checked }))}
                  className="w-4 h-4" />
                <span className="text-xs text-gray-600">하루종일</span>
              </label>
            </div>
          </div>
          {!form.all_day && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">출발</label>
                <input type="time" className="input" disabled={isReadOnly}
                  value={form.start_time}
                  onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">종료</label>
                <input type="time" className="input" disabled={isReadOnly}
                  value={form.end_time}
                  onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>
          )}

          {/* 출장 시간 + 수당 자동 표시 */}
          <div className="bg-purple-50 rounded-md p-2.5 flex items-center justify-between">
            <div className="text-xs text-gray-700">
              {form.all_day ? (
                <span className="text-purple-700 font-medium">📅 하루종일 출장</span>
              ) : (
                <>
                  <span className="text-purple-700 font-medium">⏱ {duration.toFixed(1)}시간</span>
                  {duration >= 4 && <span className="ml-2 text-[10px] text-purple-500">(4시간 이상)</span>}
                  {duration > 0 && duration < 4 && <span className="ml-2 text-[10px] text-amber-500">(4시간 미만)</span>}
                </>
              )}
            </div>
            <div className="text-sm font-bold text-purple-700 tabular-nums">
              출장수당 {allowance.toLocaleString('ko-KR')}원
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">장소 *</label>
            <input className="input" disabled={isReadOnly}
              placeholder="예: 한국환경공단 본사 (인천)"
              value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              참석자 (내부 직원)
              <span className="text-[9px] text-gray-400 font-normal ml-1">
                · 현재 {staffList?.length || 0}명 로딩됨 / 본인: {currentUser?.name || '?'}
              </span>
            </label>
            <div className="border border-gray-200 rounded-md p-2 max-h-40 overflow-y-auto bg-white">
              {(() => {
                // 본인이 staffList에 없을 경우를 대비해 강제로 맨 앞에 포함
                const list = [...(staffList || [])]
                if (currentUser && !list.find((s: any) => s.id === currentUser.id)) {
                  list.unshift({
                    id: currentUser.id,
                    name: currentUser.name,
                    grade: currentUser.grade,
                    dept: currentUser.dept,
                  })
                } else if (currentUser) {
                  // 본인을 맨 앞으로 이동
                  const meIdx = list.findIndex((s: any) => s.id === currentUser.id)
                  if (meIdx > 0) {
                    const me = list.splice(meIdx, 1)[0]
                    list.unshift(me)
                  }
                }
                if (list.length === 0) {
                  return <div className="text-xs text-gray-400 text-center py-1">직원 목록 로딩 중...</div>
                }
                return (
                  <div className="grid grid-cols-2 gap-1">
                    {list.map((s: any) => {
                      const checked = form.attendeeIds.includes(s.id)
                      const isMe = s.id === currentUser?.id
                      return (
                        <label key={s.id} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-xs ${
                          checked ? 'bg-purple-50' : 'hover:bg-gray-50'
                        } ${isReadOnly ? 'pointer-events-none opacity-60' : ''} ${
                          isMe ? 'border border-purple-200 bg-purple-50/50' : ''
                        }`}>
                          <input type="checkbox" disabled={isReadOnly}
                            checked={checked}
                            onChange={e => {
                              setForm(f => ({
                                ...f,
                                attendeeIds: e.target.checked
                                  ? [...f.attendeeIds, s.id]
                                  : f.attendeeIds.filter((id: string) => id !== s.id)
                              }))
                            }}
                            className="w-3 h-3" />
                          <span className="text-gray-700">
                            {s.name}{isMe && <span className="text-purple-600 font-medium"> (나)</span>}
                            {s.grade && <span className="text-gray-400"> ({s.grade})</span>}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">
              {form.attendeeIds.length > 0
                ? `✓ 선택된 내부 직원 ${form.attendeeIds.length}명`
                : '내부 직원 미선택'}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">외부 참석자 (선택)</label>
            <input className="input" disabled={isReadOnly}
              placeholder="예: 환경공단 김ㅇㅇ 팀장, 이ㅇㅇ 차장"
              value={form.externalAttendees}
              onChange={e => setForm(f => ({ ...f, externalAttendees: e.target.value }))} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">출장 내용 *</label>
            <textarea className="input min-h-[80px]" disabled={isReadOnly}
              placeholder="회의 내용, 진행 사항 등 자세히 작성"
              value={form.purpose}
              onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">결재자</label>
            <select className="input" disabled={isReadOnly}
              value={form.approver_id}
              onChange={e => setForm(f => ({ ...f, approver_id: e.target.value }))}>
              <option value="">선택...</option>
              {approvers.map((a: any) => (
                <option key={a.id} value={a.id}>{a.name} ({a.grade})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">비고</label>
            <textarea className="input min-h-[60px]" disabled={isReadOnly}
              placeholder="기타 메모"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">취소</button>
          {!isReadOnly && (
            <>
              <button onClick={() => save(false)} className="btn-secondary text-sm">💾 임시저장</button>
              <button onClick={() => save(true)} className="btn-primary text-sm">📤 결재 요청</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

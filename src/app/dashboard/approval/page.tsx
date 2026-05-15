'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { isHoliday, classifyWork, minutesToHours } from '@/lib/attendance'

// 두 날짜 사이의 모든 날짜 배열 반환
function getDateRange(start: string, end: string): string[] {
  const dates: string[] = []
  const cur = new Date(start + 'T12:00:00')
  const endD = new Date(end + 'T12:00:00')
  while (cur <= endD) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth()+1).padStart(2,'0')
    const d = String(cur.getDate()).padStart(2,'0')
    dates.push(`${y}-${m}-${d}`)
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

// 주말 여부
function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00').getDay()
  return d === 0 || d === 6
}

export default function ApprovalPage() {
  const [profile, setProfile] = useState<any>(null)
  const [all, setAll] = useState<any[]>([])
  const [inbox, setInbox] = useState<any[]>([])
  const [sent, setSent] = useState<any[]>([])
  const [tab, setTab] = useState<'all'|'inbox'|'sent'>('inbox')
  const [alert, setAlert] = useState('')
  const [showDetail, setShowDetail] = useState<any>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)

    // 헬퍼 - 출장 보고서를 결재 형식으로 매핑
    const mapBizTrip = (t: any) => ({
      ...t,
      kind: 'biztrip', // 결재 종류 구분
      requester_id: t.user_id,
      requester: t.user,
      type: '🚗 출장',
      start_date: t.trip_date,
      end_date: t.trip_date,
      start_time: t.start_time,
      end_time: t.end_time,
      // 보고 내용을 reason 필드에 매핑 (UI 호환)
      reason: `[장소] ${t.location}\n[내용] ${t.purpose}${t.notes ? '\n[비고] ' + t.notes : ''}`,
      // 본인 작성 보고서가 draft 상태로 남아있어도 'sent'에는 포함
    })

    // 보낸 결재 = 일반 결재 + 본인 작성 출장 (draft/pending/approved/rejected 모두)
    const { data: sentAppr } = await supabase.from('approvals')
      .select('*, requester:requester_id(name,dept,color,tc), approver:approver_id(name)')
      .eq('requester_id', session.user.id).order('created_at',{ascending:false})
    const { data: sentTrips } = await supabase.from('business_trips')
      .select('*, user:user_id(id,name,dept,color,tc), approver:approver_id(name)')
      .eq('user_id', session.user.id).neq('status', 'draft') // draft는 결재함에 노출 안 함
      .order('created_at',{ascending:false})
    const sentMerged = [
      ...(sentAppr || []).map((a: any) => ({ ...a, kind: 'approval' })),
      ...(sentTrips || []).map(mapBizTrip),
    ].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    setSent(sentMerged)

    if (p?.role === 'director') {
      // 받은 결재 (대기) = 일반 결재 + 본인이 결재자인 출장
      const { data: inboxAppr } = await supabase.from('approvals')
        .select('*, requester:requester_id(name,dept,color,tc), approver:approver_id(name)')
        .eq('approver_id', session.user.id).eq('status','pending').order('created_at',{ascending:false})
      const { data: inboxTrips } = await supabase.from('business_trips')
        .select('*, user:user_id(id,name,dept,color,tc), approver:approver_id(name)')
        .eq('approver_id', session.user.id).eq('status','pending').order('created_at',{ascending:false})
      const inboxMerged = [
        ...(inboxAppr || []).map((a: any) => ({ ...a, kind: 'approval' })),
        ...(inboxTrips || []).map(mapBizTrip),
      ].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      setInbox(inboxMerged)

      // 전체 결재 = 일반 결재 + 모든 출장 (draft 제외)
      const { data: allAppr } = await supabase.from('approvals')
        .select('*, requester:requester_id(name,dept,color,tc), approver:approver_id(name)')
        .order('created_at',{ascending:false})
      const { data: allTrips } = await supabase.from('business_trips')
        .select('*, user:user_id(id,name,dept,color,tc), approver:approver_id(name)')
        .neq('status', 'draft').order('created_at',{ascending:false})
      const allMerged = [
        ...(allAppr || []).map((a: any) => ({ ...a, kind: 'approval' })),
        ...(allTrips || []).map(mapBizTrip),
      ].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      setAll(allMerged)
      setTab('inbox')
    } else {
      setTab('sent')
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handle(id: string, status: 'approved'|'rejected', kind: 'approval' | 'biztrip' = 'approval') {
    const supabase = createClient()

    // 출장 결재 처리
    if (kind === 'biztrip') {
      const { error } = await supabase.from('business_trips')
        .update({ status, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) {
        setAlert('처리 실패: ' + error.message)
        setTimeout(() => setAlert(''), 3000)
        return
      }
      setAlert(status === 'approved' ? '✅ 출장 보고서가 승인되었습니다.' : '❌ 출장 보고서가 반려되었습니다.')
      setShowDetail(null)
      setTimeout(() => setAlert(''), 3000)
      load()
      return
    }

    await supabase.from('approvals').update({status, updated_at: new Date().toISOString()}).eq('id', id)

    // 반려 시 - 퇴근시간수정 요청이면 attendance note만 '수정요청중' → '야간자동컷오프'로 복원
    // (이제는 attendance의 check_out을 건드리지 않으므로 단순 note 복원만 필요)
    if (status === 'rejected') {
      const { data: approval } = await supabase.from('approvals')
        .select('type, requester_id, start_date').eq('id', id).single()
      if (approval && approval.type === '퇴근시간수정') {
        // 야간컷오프 상태로 복원 (다음번 접속 시 다시 팝업 뜸)
        await supabase.from('attendance')
          .update({ note: '야간자동컷오프' })
          .eq('user_id', approval.requester_id)
          .eq('work_date', approval.start_date)
          .eq('note', '수정요청중')
      }
    }

    if (status === 'approved') {
      // DB에서 직접 조회 (state 캐시 문제 방지)
      const { data: approval } = await supabase.from('approvals')
        .select('*, requester:requester_id(name)').eq('id', id).single()

      const leaveTypes = ['연차','반차(오전)','반차(오후)','반반차','출장','병가','외근','특별휴가']
      if (approval && leaveTypes.includes(approval.type)) {
        const dates = getDateRange(approval.start_date, approval.end_date || approval.start_date)
        for (const dateStr of dates) {
          if (isWeekend(dateStr) || isHoliday(dateStr)) continue

          let checkIn = '09:00:00'
          let checkOut = '18:00:00'
          if (approval.type === '반차(오전)') { checkIn = '09:00:00'; checkOut = '13:00:00' }
          else if (approval.type === '반차(오후)') { checkIn = '13:00:00'; checkOut = '18:00:00' }
          else if (approval.type === '반반차') { checkIn = '09:00:00'; checkOut = '11:00:00' }

          const r = classifyWork(dateStr, checkIn, checkOut)
          const attendanceData = {
            user_id: approval.requester_id,
            work_date: dateStr,
            check_in: checkIn,
            check_out: checkOut,
            is_holiday: isHoliday(dateStr),
            reg_hours: minutesToHours(r.reg),
            ext_hours: minutesToHours(r.ext),
            night_hours: minutesToHours(r.night),
            hol_hours: minutesToHours(r.hReg),
            hol_eve_hours: minutesToHours(r.hEve),
            hol_night_hours: minutesToHours(r.hNight),
            ignored_hours: minutesToHours(r.ignored),
            note: approval.type,
          }

          // 기존 기록 삭제 후 연차/출장 레코드로 교체
          const { data: existing } = await supabase.from('attendance')
            .select('id,note').eq('user_id', approval.requester_id).eq('work_date', dateStr)

          if (existing && existing.length > 0) {
            const hasLeaveRecord = existing.some((e:any) => leaveTypes.includes(e.note))
            if (!hasLeaveRecord) {
              await supabase.from('attendance').delete()
                .eq('user_id', approval.requester_id).eq('work_date', dateStr)
              await supabase.from('attendance').insert(attendanceData)
            }
          } else {
            await supabase.from('attendance').insert(attendanceData)
          }
        }

        // 캘린더 자동등록 - 근무일별로 각각 등록 (토/일/공휴일 제외)
        const typeColors: Record<string,string> = {
          '연차':'#EF4444','반차(오전)':'#F97316','반차(오후)':'#F97316',
          '반반차':'#FBBF24','출장':'#3B82F6','병가':'#8B5CF6',
          '외근':'#06B6D4','특별휴가':'#EC4899',
        }
        const startTime = approval.start_time || '09:00'
        const endTime = approval.end_time || '18:00'
        const allDates = getDateRange(approval.start_date, approval.end_date || approval.start_date)
        const workDates = allDates.filter(d => {
          const dw = new Date(d + 'T00:00:00').getDay()
          return dw !== 0 && dw !== 6 && !isHoliday(d)
        })
        for (const workDate of workDates) {
          // 날짜별로 각각 중복 체크
          const { data: existingEv } = await supabase.from('events')
            .select('id')
            .eq('creator_id', approval.requester_id)
            .eq('is_locked', true)
            .like('title', `[${approval.type}]%`)
            .gte('start_at', `${workDate}T00:00:00`)
            .lte('start_at', `${workDate}T23:59:59`)
          if (existingEv && existingEv.length > 0) continue // 해당 날짜만 스킵
          const { data: ev, error: evError } = await supabase.from('events').insert({
            title: `[${approval.type}] ${(approval.requester as any)?.name || ''}`,
            start_at: `${workDate}T${startTime}:00+09:00`,
            end_at: `${workDate}T${endTime}:00+09:00`,
            color: typeColors[approval.type] || '#6B7280',
            creator_id: approval.requester_id,
            calendar_type: 'company',
            is_locked: true,
          }).select().single()
          if (evError) console.error('캘린더 자동등록 오류:', evError)
          if (ev) {
            await supabase.from('event_attendees').insert({
              event_id: ev.id, user_id: approval.requester_id, status: 'accepted'
            })
          }
        }
      }

      // 퇴근시간수정 승인: 본인이 신청한 시각으로 attendance 갱신 + 근무시간 재계산
      if (approval && approval.type === '퇴근시간수정') {
        // approval에 저장된 본인 입력 시각 (end_time) 으로 attendance 업데이트
        const newCheckOut = approval.end_time // "HH:MM:SS" 형식
        const checkIn = approval.start_time // "HH:MM:SS" 형식
        if (newCheckOut && checkIn) {
          // 근무시간 재계산 (정규/시간외/야간)
          const parseSec = (t: string) => {
            const p = t.split(':').map(Number)
            return p[0]*3600 + p[1]*60 + (p[2]||0)
          }
          const overlap = (s1:number,e1:number,s2:number,e2:number) =>
            Math.max(0, Math.min(e1,e2) - Math.max(s1,s2))
          const secToH = (s:number) => Math.round(Math.max(s,0)/360)/10

          const inSec = parseSec(checkIn)
          let outSec = parseSec(newCheckOut)
          // 익일로 넘어간 경우 (예: 02:30 → outSec < inSec) +86400
          if (outSec < inSec) outSec += 86400

          const lunch = overlap(inSec, outSec, 43200, 46800) // 12~13시
          const dinner = overlap(inSec, outSec, 64800, 68400) // 18~19시
          const reg = Math.max(0, overlap(inSec, outSec, 32400, 64800) - lunch)
          const ext = Math.max(0, overlap(inSec, outSec, 68400, 79200) - dinner)
          const night = overlap(inSec, outSec, 79200, 111600) // 22시~익일 07시

          await supabase.from('attendance')
            .update({
              check_out: newCheckOut,
              reg_hours: secToH(reg),
              ext_hours: secToH(ext),
              night_hours: secToH(night),
              note: '본인수정완료',
            })
            .eq('user_id', approval.requester_id)
            .eq('work_date', approval.start_date)
            .in('note', ['수정요청중', '야간자동컷오프'])
        } else {
          // 안전장치: 시간 정보가 없으면 note만 변경
          await supabase.from('attendance')
            .update({ note: '본인수정완료' })
            .eq('user_id', approval.requester_id)
            .eq('work_date', approval.start_date)
            .in('note', ['수정요청중', '야간자동컷오프'])
        }
      }

      // 철회요청 승인: 원본 결재의 근태/캘린더 정리 + 원본 삭제
      if (approval && approval.type === '철회요청' && status === 'approved') {
        // reason에서 원본결재ID 추출
        const match = (approval.reason || '').match(/원본결재ID:\s*([a-f0-9-]+)/)
        const origId = match?.[1]
        if (origId) {
          const { data: orig } = await supabase.from('approvals')
            .select('*').eq('id', origId).single()
          if (orig) {
            // 1. 근태기록 삭제
            const dates = getDateRange(orig.start_date, orig.end_date || orig.start_date)
            for (const dateStr of dates) {
              await supabase.from('attendance').delete()
                .eq('user_id', orig.requester_id).eq('work_date', dateStr).eq('note', orig.type)
            }
            // 2. 캘린더 이벤트 삭제 (옛 형식)
            await supabase.from('events').delete()
              .eq('creator_id', orig.requester_id).eq('is_locked', true)
              .like('title', `[${orig.type}]%`)
              .gte('start_at', `${orig.start_date}T00:00:00`)
              .lte('start_at', `${(orig.end_date||orig.start_date)}T23:59:59`)
            // 3. 원본 결재 삭제
            await supabase.from('approvals').delete().eq('id', origId)
          }
        }
      }
    }

    setAlert(status==='approved'?'승인되었습니다.':'반려되었습니다.')
    setShowDetail(null); load()
    setTimeout(()=>setAlert(''),3000)
  }

  // 결재 철회 (승인/반려 → pending으로 되돌리기)
  // 양방향 가능: 결재자가 처리한 것을 다시 대기로 + 신청자가 본인 신청 취소도 가능
  async function handleRevoke(id: string) {
    const supabase = createClient()
    // 해당 결재 정보 먼저 조회 (현재 상태 확인용)
    const { data: approval } = await supabase.from('approvals')
      .select('*, requester:requester_id(name)').eq('id', id).single()
    if (!approval) return

    const statusKr = approval.status==='approved' ? '승인' : approval.status==='rejected' ? '반려' : '대기'
    const msg = `이 결재 건을 [${statusKr}] 상태에서 [대기] 상태로 철회하시겠습니까?` +
      (approval.status==='approved' ? '\n\n관련 근태기록과 캘린더 일정도 함께 삭제됩니다.' : '')
    if (!confirm(msg)) return

    // 1. 상태를 pending으로 되돌리기
    await supabase.from('approvals').update({status:'pending', updated_at: new Date().toISOString()}).eq('id', id)
    // 2. 승인 건이었던 경우만 관련 근태기록/캘린더 삭제 (반려 건은 어차피 처리된 게 없음)
    if (approval.status === 'approved') {
      const dates = getDateRange(approval.start_date, approval.end_date || approval.start_date)
      for (const dateStr of dates) {
        await supabase.from('attendance')
          .delete()
          .eq('user_id', approval.requester_id)
          .eq('work_date', dateStr)
          .eq('note', approval.type)
      }
      // 관련 캘린더 이벤트 삭제
      await supabase.from('events')
        .delete()
        .eq('creator_id', approval.requester_id)
        .eq('is_locked', true)
        .like('title', `[${approval.type}]%`)
        .gte('start_at', `${approval.start_date}T00:00:00`)
        .lte('start_at', `${(approval.end_date||approval.start_date)}T23:59:59`)
    }
    setAlert(`${statusKr} 처리가 철회되었습니다. 결재 대기 상태로 변경되었습니다.`)
    setShowDetail(null); load()
    setTimeout(()=>setAlert(''),3000)
  }

  const Badge = ({s}:{s:string}) => (
    <span className={s==='pending'?'badge-pending':s==='approved'?'badge-approved':'badge-rejected'}>
      {s==='pending'?'대기':s==='approved'?'승인':'반려'}
    </span>
  )

  const ApprovalTable = ({data, showRequester=false}: {data:any[], showRequester?:boolean}) => (
    <div className="card overflow-x-auto">
      {data.length===0 ? (
        <div className="py-12 text-center text-gray-300 text-sm">내역이 없습니다</div>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100">
            {[showRequester?'신청자':'', '유형','기간','사유','결재자','상태',''].filter(Boolean).map(h=>(
              <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-4 text-xs whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {data.map(r=>(
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                {showRequester && <td className="py-2 pr-4 font-medium text-sm">{(r.requester as any)?.name}</td>}
                <td className="py-2 pr-4 text-xs">
                  <span className={`inline-block px-1.5 py-0.5 rounded font-medium ${
                    r.kind === 'biztrip' ? 'bg-amber-100 text-amber-700' :
                    r.type === '연차' || r.type?.startsWith('반차') || r.type === '반반차' ? 'bg-purple-100 text-purple-700' :
                    r.type === '병가' ? 'bg-pink-100 text-pink-700' :
                    r.type === '공가' ? 'bg-indigo-100 text-indigo-700' :
                    r.type === '외근' ? 'bg-cyan-100 text-cyan-700' :
                    r.type === '특별휴가' ? 'bg-rose-100 text-rose-700' :
                    r.type === '퇴근시간수정' ? 'bg-gray-100 text-gray-700' :
                    r.type === '철회요청' ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>{r.type}</span>
                </td>
                <td className="py-2 pr-4 text-xs whitespace-nowrap">{r.start_date}{r.end_date!==r.start_date?' ~ '+r.end_date:''}</td>
                <td className="py-2 pr-4 text-xs text-gray-500 max-w-[160px] truncate">{r.reason||'-'}</td>
                <td className="py-2 pr-4 text-xs">{(r.approver as any)?.name}</td>
                <td className="py-2 pr-4"><Badge s={r.status} /></td>
                <td className="py-2">
                  <div className="flex gap-1">
                    <button onClick={()=>setShowDetail(r)} className="btn-secondary text-xs px-2 py-1">문서 열기</button>
                    {profile?.role==='director' && r.status==='pending' && (
                      <>
                        <button onClick={()=>handle(r.id,'approved', r.kind)} className="btn-secondary text-xs px-2 py-1 text-green-700 border-green-200 hover:bg-green-50">승인</button>
                        <button onClick={()=>handle(r.id,'rejected', r.kind)} className="btn-danger text-xs px-2 py-1">반려</button>
                      </>
                    )}
                    {profile?.role==='director' && r.kind === 'approval' && (r.status==='approved' || r.status==='rejected') && (
                      <button onClick={()=>handleRevoke(r.id)} className="btn-secondary text-xs px-2 py-1 text-orange-600 border-orange-200 hover:bg-orange-50">철회</button>
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

  const tabs = profile?.role==='director'
    ? [{key:'inbox',label:'받은 결재',count:inbox.length},{key:'sent',label:'보낸 결재',count:0},{key:'all',label:'전체 결재',count:0}]
    : [{key:'sent',label:'내 결재 현황',count:0}]

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">결재함</h1>
      {alert && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{alert}</div>}

      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {tabs.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5
              ${tab===t.key?'border-purple-600 text-purple-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            {t.count>0 && <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab==='inbox' && <ApprovalTable data={inbox} showRequester />}
      {tab==='sent'  && <ApprovalTable data={sent} />}
      {tab==='all'   && <ApprovalTable data={all} showRequester />}

      {/* 결재 문서 상세 모달 */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-base font-semibold text-gray-800">결재 문서</div>
                <div className="text-xs text-gray-400 mt-0.5">{showDetail.created_at?.slice(0,16).replace('T',' ')} 신청</div>
              </div>
              <Badge s={showDetail.status} />
            </div>
            <div className="p-5 space-y-3">
              {[
                {label:'신청자', val:(showDetail.requester as any)?.name || profile?.name},
                {label:'부서', val:(showDetail.requester as any)?.dept || profile?.dept},
                {label:'유형', val: showDetail.kind === 'biztrip' ? '🚗 출장 보고' : showDetail.type},
                {label: showDetail.kind === 'biztrip' ? '출장일' : '기간',
                  val:`${showDetail.start_date}${showDetail.end_date!==showDetail.start_date?' ~ '+showDetail.end_date:''}`},
                ...(showDetail.kind === 'biztrip' ? [
                  {label:'시간', val: showDetail.all_day ? '하루종일'
                    : showDetail.start_time && showDetail.end_time
                      ? `${showDetail.start_time.slice(0,5)} ~ ${showDetail.end_time.slice(0,5)} (${Number(showDetail.duration_hours || 0).toFixed(1)}시간)`
                      : '-'
                  },
                  {label:'출장수당', val: showDetail.allowance ? `${showDetail.allowance.toLocaleString('ko-KR')}원` : '0원'},
                ] : []),
                {label:'결재자', val:(showDetail.approver as any)?.name},
              ].map(item=>(
                <div key={item.label} className="flex gap-4 pb-3 border-b border-gray-50">
                  <span className="text-xs font-medium text-gray-400 w-14 flex-shrink-0 pt-0.5">{item.label}</span>
                  <span className="text-sm text-gray-800">{item.val}</span>
                </div>
              ))}
              <div>
                <div className="text-xs font-medium text-gray-400 mb-2">
                  {showDetail.kind === 'biztrip' ? '출장 내용' : '신청 사유'}
                </div>
                <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-800 whitespace-pre-wrap min-h-[80px] leading-relaxed">
                  {showDetail.reason || '(사유 없음)'}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={()=>setShowDetail(null)} className="btn-secondary text-sm">닫기</button>
              {profile?.role==='director' && showDetail.status==='pending' && (
                <>
                  <button onClick={()=>handle(showDetail.id,'rejected', showDetail.kind)} className="btn-danger text-sm">반려</button>
                  <button onClick={()=>handle(showDetail.id,'approved', showDetail.kind)}
                    className="btn-secondary text-sm text-green-700 border-green-200 hover:bg-green-50">승인</button>
                </>
              )}
              {profile?.role==='director' && showDetail.kind === 'approval' && (showDetail.status==='approved' || showDetail.status==='rejected') && (
                <button onClick={()=>handleRevoke(showDetail.id)}
                  className="btn-secondary text-sm text-orange-600 border-orange-200 hover:bg-orange-50">
                  {showDetail.status==='approved' ? '승인 철회' : '반려 철회'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

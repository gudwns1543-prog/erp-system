// AI Agent용 도구 정의 및 실행기
// Claude Tool Use 형식: { name, description, input_schema }

export const tools = [
  {
    name: 'get_my_leave_status',
    description: '본인의 연차 현황을 조회합니다. 총 연차, 승인된 사용량, 신청중 사용량, 잔여 H를 반환합니다.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_my_schedule',
    description: '본인의 일정/이벤트를 조회합니다. 캘린더에 등록된 일정 (회의, 출장, 연차 등)을 날짜 범위로 조회합니다.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: '조회 시작일 YYYY-MM-DD (생략시 오늘)' },
        end_date: { type: 'string', description: '조회 종료일 YYYY-MM-DD (생략시 7일 후)' },
      },
      required: [],
    },
  },
  {
    name: 'get_my_attendance',
    description: '본인의 근태 기록을 조회합니다. 출퇴근 시각, 근무 시간 등.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: '조회 시작일 YYYY-MM-DD (생략시 이번 달 1일)' },
        end_date: { type: 'string', description: '조회 종료일 YYYY-MM-DD (생략시 오늘)' },
      },
      required: [],
    },
  },
  {
    name: 'get_my_approvals',
    description: '본인의 결재 현황을 조회합니다. inbox=내가 받은 결재, sent=내가 신청한 결재.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['inbox','sent','all'], description: '받은/보낸/전체' },
        status: { type: 'string', enum: ['pending','approved','rejected','all'], description: '상태 필터' },
      },
      required: [],
    },
  },
  {
    name: 'search_employees',
    description: '직원 검색. 이름이나 부서로 찾습니다. 결재자나 일정 참여자를 찾을 때 사용.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '이름, 부서명 일부 검색어' },
      },
      required: ['query'],
    },
  },
  {
    name: 'submit_leave_request',
    description: '연차·반차·출장·병가 등 결재 신청을 등록합니다. 박팔주 이사님께 자동으로 보내집니다 (다른 결재자 명시시 변경).',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['연차','반차(오전)','반차(오후)','반반차','병가','출장','외근','특별휴가'],
          description: '신청 유형'
        },
        start_date: { type: 'string', description: '시작일 YYYY-MM-DD' },
        end_date: { type: 'string', description: '종료일 YYYY-MM-DD (생략시 start_date와 동일)' },
        start_time: { type: 'string', description: '시작 시각 HH:MM (출장/외근/반반차일 때)' },
        end_time: { type: 'string', description: '종료 시각 HH:MM (출장/외근/반반차일 때)' },
        reason: { type: 'string', description: '사유 (생략시 "개인 사정")' },
        approver_name: { type: 'string', description: '결재자 이름 (생략시 박팔주)' },
      },
      required: ['type','start_date'],
    },
  },
  {
    name: 'create_calendar_event',
    description: '캘린더 일정/이벤트를 생성합니다.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '일정 제목' },
        start_at: { type: 'string', description: '시작 일시 YYYY-MM-DD HH:MM' },
        end_at: { type: 'string', description: '종료 일시 YYYY-MM-DD HH:MM (생략시 시작 + 1시간)' },
        location: { type: 'string', description: '장소 (선택)' },
        description: { type: 'string', description: '설명 (선택)' },
        color: { type: 'string', description: '색상 hex (생략시 #534AB7)' },
      },
      required: ['title','start_at'],
    },
  },
  {
    name: 'approve_or_reject',
    description: '결재를 승인/반려합니다. 관리자(director) 권한 필요. 본인 받은 결재함의 항목 처리.',
    input_schema: {
      type: 'object',
      properties: {
        approval_id: { type: 'string', description: '결재 ID (get_my_approvals로 먼저 조회 필요)' },
        action: { type: 'string', enum: ['approve','reject'], description: 'approve=승인, reject=반려' },
      },
      required: ['approval_id','action'],
    },
  },
  {
    name: 'update_approval',
    description: '본인이 신청한 결재를 수정합니다. pending(신청중) 상태인 것만 수정 가능. approval_id가 없으면 get_my_approvals(type=sent, status=pending)로 먼저 조회해서 가장 최근 것을 찾아주세요.',
    input_schema: {
      type: 'object',
      properties: {
        approval_id: { type: 'string', description: '수정할 결재 ID' },
        type: {
          type: 'string',
          enum: ['연차','반차(오전)','반차(오후)','반반차','병가','출장','외근','특별휴가'],
          description: '변경할 유형 (생략시 변경 안 함)',
        },
        start_date: { type: 'string', description: '변경할 시작일 YYYY-MM-DD (생략시 변경 안 함)' },
        end_date: { type: 'string', description: '변경할 종료일 YYYY-MM-DD (생략시 변경 안 함)' },
        start_time: { type: 'string', description: '변경할 시작 시각 HH:MM (생략시 변경 안 함)' },
        end_time: { type: 'string', description: '변경할 종료 시각 HH:MM (생략시 변경 안 함)' },
        reason: { type: 'string', description: '변경할 사유 (생략시 변경 안 함)' },
      },
      required: ['approval_id'],
    },
  },
  {
    name: 'delete_approval',
    description: '본인이 신청한 결재를 삭제합니다. pending(신청중) 상태인 것만 삭제 가능. 이미 승인된 건은 삭제 불가.',
    input_schema: {
      type: 'object',
      properties: {
        approval_id: { type: 'string', description: '삭제할 결재 ID' },
      },
      required: ['approval_id'],
    },
  },
  {
    name: 'delete_calendar_event',
    description: '본인이 생성한 일정을 삭제합니다.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: '삭제할 일정 ID' },
      },
      required: ['event_id'],
    },
  },
]

// ─── 실행 컨텍스트 타입 ──────
type Ctx = {
  userId: string
  userName: string
  userRole: string
  supabase: any
}

// ─── 헬퍼 ──────
function todayKst() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9*60*60*1000)
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth()+1).padStart(2,'0')}-${String(kst.getUTCDate()).padStart(2,'0')}`
}
function addDays(ds: string, days: number) {
  const d = new Date(ds + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// 한국 공휴일 (간단)
const HOLIDAYS_2026 = new Set([
  '2026-01-01','2026-02-16','2026-02-17','2026-02-18',
  '2026-03-01','2026-05-05','2026-05-25','2026-06-03',
  '2026-08-17','2026-09-24','2026-09-25','2026-09-26',
  '2026-10-05','2026-10-09','2026-12-25',
])
function isWorkday(ds: string) {
  const dow = new Date(ds + 'T00:00:00').getDay()
  if (dow === 0 || dow === 6) return false
  if (HOLIDAYS_2026.has(ds)) return false
  return true
}

// 연차 유형별 시간(H)
const TYPE_HOURS: Record<string, number> = {
  '연차': 8, '반차(오전)': 4, '반차(오후)': 4, '반반차': 2,
  '병가': 8, '특별휴가': 8, // 차감 안 됨
  '출장': 0, '외근': 0, // 차감 안 됨
}

// ─── 도구 실행기 ──────
export async function executeTool(name: string, input: any, ctx: Ctx): Promise<any> {
  const { supabase, userId } = ctx

  switch (name) {
    // 1) 내 연차 현황
    case 'get_my_leave_status': {
      const { data: prof } = await supabase.from('profiles').select('annual_leave, name').eq('id', userId).single()
      const total = prof?.annual_leave || 0

      const { data: reqs } = await supabase.from('approvals')
        .select('type, start_date, end_date, status')
        .eq('requester_id', userId)
        .in('type', ['연차','반차(오전)','반차(오후)','반반차'])

      let used = 0, pending = 0
      for (const r of (reqs||[])) {
        const dates: string[] = []
        let cur = r.start_date
        while (cur <= (r.end_date || r.start_date)) {
          if (isWorkday(cur)) dates.push(cur)
          cur = addDays(cur, 1)
        }
        let hours = (TYPE_HOURS[r.type] || 0)
        if (r.type === '연차') hours = dates.length * 8
        if (r.status === 'approved') used += hours
        else if (r.status === 'pending') pending += hours
      }
      const remain = total - used - pending
      return { 이름: prof?.name, 총연차H: total, 승인사용H: used, 신청중H: pending, 잔여H: remain }
    }

    // 2) 일정 조회
    case 'get_my_schedule': {
      const start = input.start_date || todayKst()
      const end = input.end_date || addDays(start, 7)
      const { data: evs } = await supabase.from('events')
        .select('id, title, start_at, end_at, location, description')
        .gte('start_at', start + 'T00:00:00')
        .lte('start_at', end + 'T23:59:59')
        .order('start_at', { ascending: true })
      return { 범위: `${start} ~ ${end}`, 일정수: (evs||[]).length, 일정: evs || [] }
    }

    // 3) 근태 기록
    case 'get_my_attendance': {
      const today = todayKst()
      const start = input.start_date || (today.slice(0,7) + '-01')
      const end = input.end_date || today
      const { data: recs } = await supabase.from('attendance')
        .select('work_date, check_in, check_out, reg_hours, ext_hours, night_hours, note')
        .eq('user_id', userId)
        .gte('work_date', start)
        .lte('work_date', end)
        .order('work_date', { ascending: false })
      const totalReg = (recs||[]).reduce((a:number,r:any)=>a+(r.reg_hours||0),0)
      const totalExt = (recs||[]).reduce((a:number,r:any)=>a+(r.ext_hours||0),0)
      const totalNight = (recs||[]).reduce((a:number,r:any)=>a+(r.night_hours||0),0)
      return {
        범위: `${start} ~ ${end}`,
        근무일수: (recs||[]).length,
        총정규근무H: totalReg,
        총연장근무H: totalExt,
        총야간근무H: totalNight,
        세부: recs || [],
      }
    }

    // 4) 결재 현황
    case 'get_my_approvals': {
      const type = input.type || 'all'
      const status = input.status || 'all'
      let query = supabase.from('approvals')
        .select('id, type, start_date, end_date, status, reason, created_at, requester:requester_id(name), approver:approver_id(name)')
        .order('created_at', { ascending: false }).limit(20)
      if (type === 'inbox') query = query.eq('approver_id', userId)
      else if (type === 'sent') query = query.eq('requester_id', userId)
      else query = query.or(`approver_id.eq.${userId},requester_id.eq.${userId}`)
      if (status !== 'all') query = query.eq('status', status)
      const { data } = await query
      return { 건수: (data||[]).length, 결재목록: data || [] }
    }

    // 5) 직원 검색
    case 'search_employees': {
      const q = input.query || ''
      const { data } = await supabase.from('profiles')
        .select('id, name, dept, role, position')
        .or(`name.ilike.%${q}%,dept.ilike.%${q}%`)
        .limit(10)
      return { 검색어: q, 결과수: (data||[]).length, 직원: data || [] }
    }

    // 6) 결재 신청
    case 'submit_leave_request': {
      const type = input.type
      const start_date = input.start_date
      const end_date = input.end_date || start_date
      const reason = input.reason || '개인 사정'
      const approverName = input.approver_name || '박팔주'

      // 결재자 ID 찾기
      const { data: approver } = await supabase.from('profiles')
        .select('id, name').eq('name', approverName).eq('role', 'director').maybeSingle()
      if (!approver) {
        // 박팔주 못 찾으면 아무 director라도
        const { data: anyDir } = await supabase.from('profiles')
          .select('id, name').eq('role', 'director').limit(1).maybeSingle()
        if (!anyDir) return { 오류: `결재자(${approverName})를 찾을 수 없고, 관리자 권한자가 한 명도 없습니다.` }
        return await insertApproval(supabase, userId, anyDir, type, start_date, end_date, reason, input)
      }
      return await insertApproval(supabase, userId, approver, type, start_date, end_date, reason, input)
    }

    // 7) 일정 생성
    case 'create_calendar_event': {
      const title = input.title
      const start_at = parseDateTime(input.start_at)
      const end_at = input.end_at ? parseDateTime(input.end_at) : addHours(start_at, 1)
      const { data, error } = await supabase.from('events').insert({
        title,
        start_at,
        end_at,
        location: input.location || null,
        description: input.description || null,
        color: input.color || '#534AB7',
        creator_id: userId,
      }).select().single()
      if (error) return { 오류: error.message }
      return { 성공: true, 일정ID: data.id, 메시지: `✅ "${title}" 일정 생성 완료 (${start_at} ~ ${end_at})` }
    }

    // 8) 결재 승인/반려
    case 'approve_or_reject': {
      if (ctx.userRole !== 'director') {
        return { 오류: '결재 처리 권한이 없습니다. 관리자만 가능합니다.' }
      }
      const action = input.action === 'approve' ? 'approved' : 'rejected'
      const { error } = await supabase.from('approvals')
        .update({ status: action, updated_at: new Date().toISOString() })
        .eq('id', input.approval_id)
        .eq('approver_id', userId)
      if (error) return { 오류: error.message }
      return { 성공: true, 메시지: action === 'approved' ? '✅ 승인 완료' : '❌ 반려 완료' }
    }

    // 9) 결재 수정 (본인이 신청한 pending 건만)
    case 'update_approval': {
      // 먼저 그 결재가 본인 거고 pending인지 확인
      const { data: existing } = await supabase.from('approvals')
        .select('id, type, start_date, end_date, status, requester_id, reason')
        .eq('id', input.approval_id).maybeSingle()
      if (!existing) return { 오류: '결재를 찾을 수 없습니다.' }
      if (existing.requester_id !== userId) return { 오류: '본인이 신청한 결재만 수정할 수 있습니다.' }
      if (existing.status !== 'pending') return { 오류: '이미 처리된 결재는 수정할 수 없습니다. 새로 신청하거나 결재자에게 반려 요청해주세요.' }

      const updateData: any = {}
      if (input.type) updateData.type = input.type
      if (input.start_date) updateData.start_date = input.start_date
      if (input.end_date) updateData.end_date = input.end_date
      if (input.start_time) updateData.start_time = input.start_time
      if (input.end_time) updateData.end_time = input.end_time
      if (input.reason) updateData.reason = input.reason
      if (Object.keys(updateData).length === 0) return { 오류: '변경할 항목이 없습니다.' }
      updateData.updated_at = new Date().toISOString()

      const { data, error } = await supabase.from('approvals')
        .update(updateData).eq('id', input.approval_id).select().single()
      if (error) return { 오류: error.message }
      return {
        성공: true,
        메시지: `✅ 결재 수정 완료`,
        변경전: { 유형: existing.type, 시작: existing.start_date, 종료: existing.end_date, 사유: existing.reason },
        변경후: { 유형: data.type, 시작: data.start_date, 종료: data.end_date, 사유: data.reason },
      }
    }

    // 10) 결재 삭제 (본인이 신청한 pending 건만)
    case 'delete_approval': {
      const { data: existing } = await supabase.from('approvals')
        .select('id, type, start_date, status, requester_id')
        .eq('id', input.approval_id).maybeSingle()
      if (!existing) return { 오류: '결재를 찾을 수 없습니다.' }
      if (existing.requester_id !== userId) return { 오류: '본인이 신청한 결재만 삭제할 수 있습니다.' }
      if (existing.status !== 'pending') return { 오류: '이미 처리된 결재는 삭제할 수 없습니다.' }

      const { error } = await supabase.from('approvals').delete().eq('id', input.approval_id)
      if (error) return { 오류: error.message }
      return { 성공: true, 메시지: `🗑️ ${existing.type} 신청(${existing.start_date}) 삭제 완료` }
    }

    // 11) 일정 삭제 (본인이 생성한 것만)
    case 'delete_calendar_event': {
      const { data: existing } = await supabase.from('events')
        .select('id, title, creator_id')
        .eq('id', input.event_id).maybeSingle()
      if (!existing) return { 오류: '일정을 찾을 수 없습니다.' }
      if (existing.creator_id !== userId) return { 오류: '본인이 만든 일정만 삭제할 수 있습니다.' }
      const { error } = await supabase.from('events').delete().eq('id', input.event_id)
      if (error) return { 오류: error.message }
      return { 성공: true, 메시지: `🗑️ "${existing.title}" 일정 삭제 완료` }
    }

    default:
      return { 오류: `알 수 없는 도구: ${name}` }
  }
}

// 결재 insert 헬퍼
async function insertApproval(supabase: any, userId: string, approver: any, type: string, start_date: string, end_date: string, reason: string, input: any) {
  const insertData: any = {
    type,
    requester_id: userId,
    approver_id: approver.id,
    start_date,
    end_date,
    status: 'pending',
    reason,
  }
  if (input.start_time) insertData.start_time = input.start_time
  if (input.end_time) insertData.end_time = input.end_time

  const { data, error } = await supabase.from('approvals').insert(insertData).select().single()
  if (error) return { 오류: error.message }
  return {
    성공: true,
    결재ID: data.id,
    메시지: `✅ ${type} 신청 완료 (${start_date}${end_date !== start_date ? ' ~ ' + end_date : ''}). ${approver.name} 이사님께 결재 요청 보냈습니다.`,
  }
}

// "2026-05-19 14:00" → "2026-05-19T14:00:00+09:00" (KST 가정)
function parseDateTime(s: string): string {
  // 이미 ISO 형식이면 그대로
  if (s.includes('T')) return s
  // "2026-05-19 14:00" 또는 "2026-05-19 14:00:00"
  const cleaned = s.replace(' ', 'T')
  if (cleaned.length === 16) return cleaned + ':00+09:00'
  if (cleaned.length === 19) return cleaned + '+09:00'
  return cleaned
}

function addHours(isoStr: string, hours: number): string {
  const d = new Date(isoStr)
  d.setHours(d.getHours() + hours)
  return d.toISOString()
}

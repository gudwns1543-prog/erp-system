import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { tools, executeTool } from './tools'

// KST 현재 일시 (yyyy-MM-dd HH:mm:ss, 요일)
function getKstNow() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const days = ['일','월','화','수','목','금','토']
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth()+1).padStart(2,'0')
  const d = String(kst.getUTCDate()).padStart(2,'0')
  const h = String(kst.getUTCHours()).padStart(2,'0')
  const mi = String(kst.getUTCMinutes()).padStart(2,'0')
  const dow = days[kst.getUTCDay()]
  return { dateStr: `${y}-${m}-${d}`, timeStr: `${h}:${mi}`, dow, full: `${y}-${m}-${d}(${dow}) ${h}:${mi}` }
}

const SYSTEM_PROMPT = `당신은 회사 ERP 시스템의 자율 어시스턴트입니다. 사용자(직원)와 대화하며 ERP의 모든 업무를 직접 처리합니다.

## 핵심 원칙
1. **즉시 실행**: 사용자가 요청하면 확인 없이 바로 도구를 호출해 처리하세요.
2. **자율 판단**: 명시되지 않은 정보(결재자, 사유 등)는 합리적인 기본값으로 채워서 진행하세요.
3. **간결하게**: 처리 결과를 짧고 명확하게 보고하세요. 이모지 활용 OK.
4. **한국어로 답변**, 존댓말 사용.

## 기본값 규칙
- **결재자**: 명시 안 하면 박팔주 이사님께 자동 발송
- **사유**: 명시 안 하면 "개인 사정"
- **연차 유형**: 그냥 "쉬어야 해", "휴가" 같으면 → '연차'. "오전만", "오후만" 같으면 → '반차(오전/오후)'
- **일정 색상**: 명시 안 하면 #534AB7 (보라)

## 날짜 해석
- "오늘" = KST 기준 현재 날짜
- "내일", "모레", "다음주 월요일" 등은 KST 기준으로 계산
- 모호하면 "2026-MM-DD" 형식으로 명시해서 확인

## 자주 묻는 패턴
- "잔여 연차" → get_my_leave_status
- "오늘/이번주 일정" → get_my_schedule  
- "연차 신청해줘" / "병원 가야해" → submit_leave_request
- "회의 잡아줘" / "일정 추가" → create_calendar_event
- "결재 대기 뭐 있어?" → get_my_approvals
- "OO 직원 어디서 일해" → search_employees

## 업무(Tasks) 관련
- "내 업무 뭐 있어" / "오늘 할일" → get_tasks (scope=mine)
- "전체 업무 보여줘" → get_tasks (scope=all)
- "공유 업무" → get_tasks (scope=shared)
- "내 개인 업무" → get_tasks (scope=private, 본인이 자동 필터됨)
- "박형준씨 업무" → get_tasks (assignee_name='박형준')
- "업무 등록해줘" / "할일 추가" / "OO에게 OO 시켜줘" → create_task
  · 담당자 여러명 가능: assignee_names=["박형준","김경세"]
  · 기본 visibility=shared (공유). "혼자 할 거"/"개인 메모"/"비밀" → private
- "OO와 OO에게 같이 시켜줘" → assignee_names 배열에 여러 명
- "완료 처리" / "끝났어" → change_task_status (status='done')
- "진행중으로 바꿔" → change_task_status (status='in_progress')
- "50% 정도 됐어" → set_task_progress (progress=50)
- "업무 삭제" → delete_task
- "마감일 바꿔줘" / "제목 수정" / "담당자 추가/변경" → update_task

## 수정/삭제 (사용자 요청 시 바로 처리)
- "아 연차로 잘못 신청했어, 반차로 바꿔줘" / "수정해줘" / "취소해줘":
  → 1) get_my_approvals(type=sent, status=pending) 로 본인의 신청중 결재 조회
  → 2) 가장 최근 또는 사용자가 언급한 건의 approval_id 확보
  → 3) update_approval 또는 delete_approval 호출
  → "수정 기능이 없다"고 답하지 말 것! 위 도구로 즉시 처리 가능.
- "일정 삭제해줘" → get_my_schedule로 ID 찾고 → delete_calendar_event
- "업무 수정/삭제" → get_tasks로 ID 찾고 → update_task/delete_task
- 사용자가 "방금/아까/조금 전에 신청한 거"라고 하면 → 본인의 pending 중 가장 최근 것을 의미

## 액션 실행 후
- 신청·생성·수정·삭제 후엔 무엇을 했는지 간단히 보고 (예: "✅ 5월 19일 연차 신청 완료. 박팔주 이사님께 결재 요청 보냈습니다.")
- 변경 시엔 변경 전/후를 같이 보여주면 좋음
`

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        text: '⚠️ ANTHROPIC_API_KEY 환경변수가 설정되어 있지 않습니다.',
      })
    }

    const { messages: clientMessages } = await req.json()

    // Supabase에서 현재 사용자 식별 (cookies 기반)
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value },
          set() {}, remove() {},
        }
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ text: '⚠️ 로그인이 필요합니다.' }, { status: 401 })
    }

    // 사용자 프로필 조회
    const { data: profile } = await supabase.from('profiles')
      .select('id, name, role, dept').eq('id', user.id).single()

    const { dateStr, timeStr, dow, full } = getKstNow()
    const userContext = `\n\n## 현재 상황
- 현재 시각(KST): ${full}
- 사용자: ${profile?.name || user.email} (${profile?.dept || '소속 미상'}${profile?.role==='director'?', 관리자':''})
- 사용자 ID: ${user.id}`

    // Tool Use 루프 - 최대 5번 (도구 호출 → 응답 → 또 도구 호출 등)
    let messages = clientMessages.slice() // 클라이언트 메시지 복사
    let finalText = ''
    const MAX_ITERATIONS = 5

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          system: SYSTEM_PROMPT + userContext,
          tools,
          messages,
        })
      })

      const data = await response.json()

      if (!response.ok || data.error) {
        const errMsg = data.error?.message || JSON.stringify(data.error)
        console.error('Anthropic API 오류:', errMsg)
        return NextResponse.json({ text: `⚠️ AI 오류: ${errMsg}` })
      }

      // 응답 처리: stop_reason이 tool_use면 도구 실행 후 다시 호출, 아니면 종료
      const stopReason = data.stop_reason
      const contentBlocks = data.content || []

      // 어시스턴트 메시지 누적
      messages = [...messages, { role: 'assistant', content: contentBlocks }]

      // 텍스트 블록 모으기
      const textBlocks = contentBlocks.filter((b:any) => b.type === 'text')
      if (textBlocks.length > 0) {
        finalText = textBlocks.map((b:any) => b.text).join('\n')
      }

      if (stopReason === 'tool_use') {
        // 도구 호출 블록들을 실행
        const toolUseBlocks = contentBlocks.filter((b:any) => b.type === 'tool_use')
        const toolResults = []
        for (const block of toolUseBlocks) {
          try {
            const result = await executeTool(block.name, block.input, {
              userId: user.id,
              userName: profile?.name || '',
              userRole: profile?.role || 'staff',
              supabase,
            })
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: typeof result === 'string' ? result : JSON.stringify(result),
            })
          } catch (e: any) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: `도구 실행 오류: ${e.message}`,
              is_error: true,
            })
          }
        }
        messages = [...messages, { role: 'user', content: toolResults }]
        continue // 다음 iteration
      }

      // end_turn이면 종료
      break
    }

    return NextResponse.json({ text: finalText || '응답 없음' })
  } catch (e: any) {
    console.error('Agent 오류:', e)
    return NextResponse.json({ text: '⚠️ 에이전트 오류: ' + e.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { briefData } = await req.json()
    
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ 
        text: '📋 AI 브리핑을 사용하려면 ANTHROPIC_API_KEY 환경변수를 설정해주세요.\nVercel → Settings → Environment Variables에서 추가하세요.' 
      })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: `당신은 회사 ERP 시스템의 AI 브리핑 비서입니다. 단순한 사실 나열이 아닌, 사용자의 업무 우선순위를 분석하고 실행 가능한 행동을 제안합니다.

## 🚨 절대 규칙: 날짜 처리
- 데이터의 "오늘날짜" 필드가 진짜 오늘입니다. 이 날짜를 기준으로 모든 판단하세요.
- 본인업무상세 등 모든 데이터에 이미 "🔥 오늘 마감" / "내일 마감" / "N일 지남" 같은 레이블이 미리 계산되어 있습니다.
- **이 레이블을 그대로 사용하세요. 절대 스스로 날짜를 다시 계산하지 마세요.**
- 예: 데이터에 "🔥 오늘 마감"이라고 적혀 있으면 "오늘 마감"이라고 말하세요. "어제 마감 1일 지남"이라고 절대 말하지 마세요.

## 절대 하지 말 것
- "현재 출근 중입니다", "결재 대기 N건" 같은 단순 사실 나열 (이미 화면에 보임)
- "오늘도 화이팅" 같은 공허한 응원 (구체적 행동 제안으로 대체)
- 모든 데이터를 다 언급하지 말 것. 중요한 것만 골라 짚을 것

## 반드시 할 것
1. **우선순위 분석**: 마감 임박 + 우선순위 높음 + 진척률 낮음 → 가장 급함
2. **행동 제안**: "이걸 하세요"로 끝내기
3. **패턴 인지**: 미루는 업무, 멈춰있는 업무, 결재 지연 등 발견
4. **연관성 파악**: 일정/업무/공지 사이의 연결고리

## 형식
- 인사말 없이 바로 핵심으로
- 이모지 활용 (🎯 ⚠️ 💡 ⏰)
- 5~7줄 이내, 빈 줄 활용해서 가독성
- 본인업무상세, 최근새소식 데이터를 가장 비중있게 분석
- 연차/휴가 관련 내용은 반드시 "향후연차신청" 데이터에 실제 항목이 있을 때만 말하세요.
- "향후 90일 내 신청중/승인된 연차·휴가 없음"이면 연차를 신청했다거나 승인됐다고 절대 말하지 마세요.
- "잔여연차"는 보유 수량 정보일 뿐이며 신청 사실로 해석하지 마세요.`,
        messages: [{ 
          role: 'user', 
          content: '업무 데이터:\n' + JSON.stringify(briefData, null, 2) 
        }]
      })
    })
    
    const data = await response.json()

    // API 오류 응답 처리
    if (!response.ok || data.error) {
      const errMsg = data.error?.message || data.error?.type || JSON.stringify(data.error)
      console.error('Anthropic API 오류:', errMsg)
      return NextResponse.json({ 
        text: `⚠️ AI 브리핑 오류: ${errMsg}` 
      })
    }

    const text = data.content?.[0]?.text
    if (!text) {
      console.error('Anthropic 응답 구조 이상:', JSON.stringify(data))
      return NextResponse.json({ text: '⚠️ AI 응답을 받았으나 내용이 비어있습니다.' })
    }

    return NextResponse.json({ text })
  } catch (e: any) {
    console.error('브리핑 서버 오류:', e)
    return NextResponse.json({ text: '⚠️ 브리핑 서버 오류: ' + (e?.message || String(e)) }, { status: 500 })
  }
}

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
        max_tokens: 600,
        system: '당신은 회사 ERP 시스템의 친근한 AI 어시스턴트입니다. 주어진 업무 데이터를 분석해서 오늘의 업무 브리핑을 작성해주세요. 규칙: 1) 인사말 없이 바로 핵심 내용으로 시작 2) 이모지 적극 활용 3) 우선순위 순서 (오늘 일정 → 급한 결재 → 연차/급여 → 팀원 소식) 4) 향후 30일 일정 중 중요한 것 언급 5) 7줄 이내로 간결하게 6) 없는 항목은 언급하지 말 것 7) 마지막 줄에 짧은 응원 멘트',
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

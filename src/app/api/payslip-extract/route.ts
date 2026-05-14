import { NextRequest, NextResponse } from 'next/server'

// 표준 추출 키 정의
const EXTRACTION_KEYS = [
  // 지급항목
  { key: 'basic_pay', label: '기본급', category: 'pay' },
  { key: 'overtime_pay', label: '시간외수당(연장근로수당)', category: 'pay' },
  { key: 'night_pay', label: '야간근로수당', category: 'pay' },
  { key: 'holiday_pay', label: '휴일근로수당', category: 'pay' },
  { key: 'annual_leave_pay', label: '연차수당', category: 'pay' },
  { key: 'meal_allowance', label: '급량비(식대)', category: 'pay' },
  { key: 'comm_allowance', label: '통신비', category: 'pay' },
  { key: 'trip_allowance', label: '출장수당', category: 'pay' },
  { key: 'other_pay', label: '기타수당', category: 'pay' },
  // 공제항목
  { key: 'income_tax', label: '근로소득세', category: 'deduct' },
  { key: 'local_tax', label: '지방소득세', category: 'deduct' },
  { key: 'national_pension', label: '국민연금', category: 'deduct' },
  { key: 'health_insurance', label: '건강보험', category: 'deduct' },
  { key: 'longterm_care', label: '장기요양보험', category: 'deduct' },
  { key: 'employment_insurance', label: '고용보험', category: 'deduct' },
  { key: 'other_deduct', label: '기타공제', category: 'deduct' },
  // 합계
  { key: 'total_pay', label: '지급항목 합계', category: 'total' },
  { key: 'total_deduct', label: '공제항목 합계', category: 'total' },
  { key: 'net_pay', label: '실지급액(실수령액)', category: 'total' },
]

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY 환경변수가 없습니다.' }, { status: 500 })
    }

    const { pdf_url, pdf_base64 } = await req.json()

    if (!pdf_url && !pdf_base64) {
      return NextResponse.json({ error: 'pdf_url 또는 pdf_base64 필요' }, { status: 400 })
    }

    // PDF base64 준비
    let base64Data = pdf_base64
    if (!base64Data && pdf_url) {
      const resp = await fetch(pdf_url)
      if (!resp.ok) {
        return NextResponse.json({ error: `PDF 다운로드 실패: ${resp.status}` }, { status: 500 })
      }
      const buf = await resp.arrayBuffer()
      base64Data = Buffer.from(buf).toString('base64')
    }

    // 추출 키 목록을 프롬프트에 포함
    const keyList = EXTRACTION_KEYS.map(k => `- "${k.key}" (${k.label})`).join('\n')

    const systemPrompt = `당신은 한국 급여명세서를 분석하는 전문가입니다.
PDF에서 다음 항목의 금액을 추출하여 JSON으로 반환하세요.

추출 대상 항목:
${keyList}

규칙:
1. 금액은 숫자만 (원화 단위, 콤마 제외). 예: "4,780,000원" → 4780000
2. 명세서에 없거나 0인 항목은 null로
3. 비슷한 의미의 항목은 매칭 (예: "식대"=meal_allowance, "직책수당"=other_pay)
4. 마이너스(공제)는 양수로 (공제 카테고리니까)
5. 응답은 순수 JSON만, 코드블록(\`\`\`)이나 설명 없이

응답 예시:
{
  "basic_pay": 4780000,
  "overtime_pay": 950950,
  "night_pay": null,
  "income_tax": 439750,
  ...
}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Data,
                }
              },
              { type: 'text', text: '이 급여명세서에서 위에 명시한 항목들을 추출해서 JSON으로 반환해주세요.' }
            ]
          }
        ]
      })
    })

    const data = await response.json()
    if (!response.ok || data.error) {
      return NextResponse.json({
        error: 'AI 추출 실패: ' + (data.error?.message || JSON.stringify(data.error))
      }, { status: 500 })
    }

    const textBlocks = (data.content || []).filter((b:any) => b.type === 'text')
    const rawText = textBlocks.map((b:any) => b.text).join('\n')
    // JSON 정제: 코드블록 제거
    const cleaned = rawText.replace(/```json\n?|```\n?/g, '').trim()
    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
    } catch (e) {
      return NextResponse.json({
        error: 'AI 응답 파싱 실패',
        raw: rawText.slice(0, 500),
      }, { status: 500 })
    }

    // 모든 추출 키에 대해 누락 항목은 null로 채우기
    const result: Record<string, number | null> = {}
    for (const k of EXTRACTION_KEYS) {
      const v = parsed[k.key]
      result[k.key] = (typeof v === 'number') ? v : null
    }

    return NextResponse.json({
      success: true,
      extracted: result,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

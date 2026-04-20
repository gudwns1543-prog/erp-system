import { NextResponse } from 'next/server'

const BASE = 'https://www.keco.or.kr'

const BOARDS = [
  {
    type: '공지사항',
    url: `${BASE}/web/lay1/bbs/S1T10C108/A/18/list.do`,
    viewBase: `${BASE}/web/lay1/bbs/S1T10C108/A/18/view.do`,
  },
  {
    type: '언론보도',
    url: `${BASE}/web/lay1/bbs/S1T109C110/A/19/list.do`,
    viewBase: `${BASE}/web/lay1/bbs/S1T109C110/A/19/view.do`,
  },
  {
    type: '보도자료',
    url: `${BASE}/web/lay1/bbs/S1T109C111/A/20/list.do`,
    viewBase: `${BASE}/web/lay1/bbs/S1T109C111/A/20/view.do`,
  },
  {
    type: '입찰공고',
    url: `${BASE}/web/lay1/bbs/S1T115C125/A/23/list.do`,
    viewBase: `${BASE}/web/lay1/bbs/S1T115C125/A/23/view.do`,
  },
]

function parseBoard(html: string, type: string, viewBase: string) {
  const items: { type: string; title: string; date: string; url: string }[] = []

  // 모바일 리스트 영역: <li>...</li> 블록 파싱
  const liBlocks = html.match(/<li>[\s\S]*?<\/li>/g) || []

  for (const li of liBlocks) {
    const seqMatch = li.match(/article_seq=(\d+)/)
    if (!seqMatch) continue
    const seq = seqMatch[1]

    const dateMatch = li.match(/(\d{4}-\d{2}-\d{2})/)
    if (!dateMatch) continue
    const date = dateMatch[1]

    // 태그 제거 후 텍스트 추출
    const textOnly = li.replace(/<[^>]+>/g, '\n').replace(/\n+/g, '\n').trim()
    const lines = textOnly.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0)

    // "제목" 키워드 다음 줄이 실제 제목
    const titleIdx = lines.findIndex((l: string) => l === '제목')
    if (titleIdx === -1 || titleIdx + 1 >= lines.length) continue

    let title = lines[titleIdx + 1]
    title = title.replace('최신게시물', '').trim()
    if (!title || title.length < 3) continue

    const url = `${viewBase}?article_seq=${seq}&cpage=1&rows=10&condition=&keyword=`

    if (!items.find(i => i.url === url)) {
      items.push({ type, title, date, url })
    }

    if (items.length >= 6) break
  }

  return items
}

export async function GET() {
  try {
    const results = await Promise.all(
      BOARDS.map(async (board) => {
        try {
          const res = await fetch(board.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html,application/xhtml+xml',
              'Accept-Language': 'ko-KR,ko;q=0.9',
              'Referer': 'https://www.keco.or.kr/',
            },
            next: { revalidate: 1800 },
          })
          if (!res.ok) return []
          const html = await res.text()
          return parseBoard(html, board.type, board.viewBase)
        } catch (e) {
          console.error(`Error fetching ${board.type}:`, e)
          return []
        }
      })
    )

    const all = results.flat().sort((a, b) => b.date.localeCompare(a.date))
    return NextResponse.json({ items: all, updatedAt: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ items: [], error: '데이터를 가져올 수 없습니다.' })
  }
}

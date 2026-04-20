import { NextResponse } from 'next/server'

const BASE = 'https://www.keco.or.kr'

const BOARDS = [
  { type: '공지사항', url: `${BASE}/web/lay1/bbs/S1T17C108/A/18/list.do` },
  { type: '언론보도', url: `${BASE}/web/lay1/bbs/S1T109C110/A/19/list.do` },
  { type: '보도자료', url: `${BASE}/web/lay1/bbs/S1T109C111/A/20/list.do` },
  { type: '입찰공고', url: `${BASE}/web/lay1/bbs/S1T115C125/A/23/list.do` },
]

function parseList(html: string, type: string, boardUrl: string) {
  const items: { type: string; title: string; date: string; url: string }[] = []

  // article_seq 패턴으로 게시글 링크 추출
  const linkPattern = /href="([^"]*article_seq=(\d+)[^"]*)"/g
  const titlePattern = /<a[^>]*href="[^"]*article_seq=\d+[^"]*"[^>]*>\s*(?:<[^>]+>)*\s*([^<\n]{5,200}?)\s*(?:<\/[^>]+>)*\s*<\/a>/g
  
  // 날짜 패턴
  const datePattern = /(\d{4}-\d{2}-\d{2})/g

  const seqSet = new Set<string>()
  const links: { seq: string; url: string }[] = []
  
  let m
  while ((m = linkPattern.exec(html)) !== null) {
    const seq = m[2]
    if (!seqSet.has(seq)) {
      seqSet.add(seq)
      links.push({ seq, url: BASE + m[1].replace(/&amp;/g, '&') })
    }
  }

  // 제목과 날짜를 순서대로 추출
  const titles: string[] = []
  const titleRe = /class="[^"]*title[^"]*"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/g
  while ((m = titleRe.exec(html)) !== null) {
    const t = m[1].trim().replace(/\s+/g, ' ')
    if (t.length > 3) titles.push(t)
  }

  // 대안: li 내부 a 태그에서 텍스트 추출
  if (titles.length === 0) {
    const liRe = /<li[^>]*>[\s\S]*?article_seq=(\d+)[^"]*"[^>]*>([^<]{5,200})<\/a>/g
    while ((m = liRe.exec(html)) !== null) {
      const t = m[2].trim().replace(/\s+/g, ' ')
      if (t.length > 3 && !titles.includes(t)) titles.push(t)
    }
  }

  const dates: string[] = []
  const dateRe = /(\d{4}-\d{2}-\d{2})/g
  while ((m = dateRe.exec(html)) !== null) {
    if (!dates.includes(m[1])) dates.push(m[1])
  }

  // links와 titles를 매칭
  links.slice(0, 5).forEach((link, i) => {
    items.push({
      type,
      title: titles[i] || `${type} ${i + 1}`,
      date: dates[i] || '',
      url: link.url,
    })
  })

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
            },
            next: { revalidate: 1800 }, // 30분 캐시
          })
          if (!res.ok) return []
          const html = await res.text()
          return parseList(html, board.type, board.url)
        } catch {
          return []
        }
      })
    )

    // 날짜 기준 내림차순 정렬
    const all = results.flat().sort((a, b) => b.date.localeCompare(a.date))

    return NextResponse.json({ items: all, updatedAt: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ items: [], error: '데이터를 가져올 수 없습니다.' })
  }
}

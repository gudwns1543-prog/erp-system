'use client'
import { useState, useRef, useEffect } from 'react'

type Msg = { role: 'user' | 'assistant', content: string }

export default function AgentChat() {
  const [open, setOpen] = useState(true)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 새 메시지 들어오면 자동 스크롤
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg: Msg = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      // API에는 단순 텍스트 형식으로 보냄 (서버에서 Anthropic 형식으로 변환할 수도 있지만, 일단 직접)
      const apiMessages = newMessages.map(m => ({
        role: m.role,
        content: m.content,
      }))
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })
      const data = await res.json()
      setMessages([...newMessages, { role: 'assistant', content: data.text || '응답 없음' }])
    } catch (e: any) {
      setMessages([...newMessages, { role: 'assistant', content: '⚠️ 오류: ' + e.message }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <>
      {/* 떠있는 토글 버튼 (우측 하단) */}
      {!open && (
        <button
          onClick={()=>setOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-lg flex items-center justify-center transition-all hover:scale-105"
          aria-label="AI 어시스턴트 열기"
          title="AI 어시스턴트">
          <span className="text-2xl">🤖</span>
        </button>
      )}

      {/* 채팅창 */}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 w-[380px] max-w-[calc(100vw-24px)] h-[560px] max-h-[calc(100vh-48px)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          {/* 헤더 */}
          <div className="px-4 py-3 bg-purple-600 text-white flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-lg">🤖</span>
              <div>
                <div className="font-semibold text-sm">AI 어시스턴트</div>
                <div className="text-xs text-purple-100">연차/일정/결재 처리 도우미</div>
              </div>
            </div>
            <button onClick={()=>setOpen(false)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
          </div>

          {/* 메시지 영역 */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
            {messages.length === 0 && (
              <div className="text-sm text-gray-500 bg-white rounded-xl p-3 border border-gray-100">
                안녕하세요! 무엇을 도와드릴까요?<br /><br />
                💡 이런 걸 할 수 있어요:<br />
                • "잔여 연차 얼마야?"<br />
                • "내일 14시 박이사님 미팅 잡아줘"<br />
                • "다음주 월요일 연차 신청해줘"<br />
                • "오늘 일정 알려줘"<br />
                • "이번 달 근무시간 얼마나 됐어?"
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                  m.role === 'user'
                    ? 'bg-purple-600 text-white rounded-tr-sm'
                    : 'bg-white text-gray-800 border border-gray-200 rounded-tl-sm'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-3.5 py-2 text-sm text-gray-500 flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay:'0ms'}}></span>
                  <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}}></span>
                  <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}}></span>
                </div>
              </div>
            )}
          </div>

          {/* 입력창 */}
          <div className="p-3 border-t border-gray-100 bg-white flex-shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={e=>setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="무엇이든 물어보세요... (Enter로 전송)"
                rows={1}
                disabled={loading}
                className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 max-h-24"
                style={{minHeight:'38px'}}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="px-3 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
                전송
              </button>
            </div>
            <div className="text-xs text-gray-400 mt-1.5 text-center">AI가 직접 처리합니다. 잘못된 결과는 결재함/캘린더에서 수정/삭제 가능</div>
          </div>
        </div>
      )}
    </>
  )
}

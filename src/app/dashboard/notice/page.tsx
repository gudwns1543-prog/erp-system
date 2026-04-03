'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

export default function NoticePage() {
  const [profile, setProfile] = useState<any>(null)
  const [notices, setNotices] = useState<any[]>([])
  const [form, setForm] = useState({title:'', content:''})
  const [open, setOpen] = useState<string|null>(null)
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const { data } = await supabase.from('notices')
      .select('*, author:author_id(name)').order('created_at',{ascending:false})
    setNotices(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  async function handlePost(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.content.trim()) return
    setLoading(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await supabase.from('notices').insert({
      author_id: session.user.id, title: form.title, content: form.content
    })
    setForm({title:'', content:''})
    setAlert('공지가 등록되었습니다.')
    load()
    setLoading(false)
    setTimeout(()=>setAlert(''),3000)
  }

  async function handleDelete(id: string) {
    if (!confirm('공지를 삭제하시겠습니까?')) return
    const supabase = createClient()
    await supabase.from('notices').delete().eq('id', id)
    load()
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">공지사항</h1>
      {alert && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{alert}</div>}

      {profile?.role === 'director' && (
        <div className="card mb-5">
          <div className="text-sm font-medium text-gray-700 mb-3">공지 작성</div>
          <form onSubmit={handlePost} className="space-y-3">
            <input className="input" placeholder="공지 제목" value={form.title}
              onChange={e=>setForm(f=>({...f,title:e.target.value}))} required />
            <textarea className="input resize-none" rows={4} placeholder="공지 내용을 입력하세요..."
              value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))} required />
            <div className="flex justify-end">
              <button type="submit" disabled={loading} className="btn-primary">공지 등록</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="text-sm font-medium text-gray-700 mb-3">공지사항 목록</div>
        {notices.length === 0 ? (
          <div className="py-12 text-center text-gray-300 text-sm">등록된 공지가 없습니다</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {notices.map(n=>(
              <div key={n.id} className="py-3">
                <div className="flex items-start justify-between cursor-pointer" onClick={()=>setOpen(open===n.id?null:n.id)}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="badge-pending text-xs">공지</span>
                      <span className="text-sm font-medium text-gray-800 hover:text-purple-600 transition-colors">{n.title}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{(n.author as any)?.name} · {n.created_at?.slice(0,10)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {profile?.role === 'director' && (
                      <button onClick={e=>{e.stopPropagation();handleDelete(n.id)}}
                        className="text-xs text-gray-300 hover:text-red-500 transition-colors px-1">삭제</button>
                    )}
                    <span className="text-gray-300 text-sm">{open===n.id?'▲':'▼'}</span>
                  </div>
                </div>
                {open === n.id && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                    {n.content}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

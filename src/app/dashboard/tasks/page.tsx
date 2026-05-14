'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

type Task = {
  id: string
  title: string
  description: string | null
  assignee_id: string | null
  creator_id: string | null
  due_date: string | null
  status: 'todo' | 'in_progress' | 'done' | 'blocked'
  priority: 'high' | 'normal' | 'low'
  progress: number
  created_at: string
  updated_at: string
  assignee?: { id: string, name: string, color: string, tc: string } | null
  creator?: { id: string, name: string } | null
}

const STATUS_META = {
  todo: { label: '할일', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  in_progress: { label: '진행중', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  done: { label: '완료', color: 'bg-green-100 text-green-700 border-green-300' },
  blocked: { label: '대기/막힘', color: 'bg-red-100 text-red-700 border-red-300' },
}

const PRIORITY_META = {
  high: { label: '높음', emoji: '🔴' },
  normal: { label: '보통', emoji: '🟡' },
  low: { label: '낮음', emoji: '🔵' },
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function TasksPage() {
  const [profile, setProfile] = useState<any>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'due_date' | 'priority' | 'created_at'>('due_date')
  const [editing, setEditing] = useState<Task | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('id,name,role,dept').eq('id', session.user.id).single()
    setProfile(p)
    const { data: emps } = await supabase.from('profiles').select('id,name,color,tc,dept').eq('status','active')
    setEmployees(emps || [])
    const { data } = await supabase.from('tasks')
      .select('*, assignee:assignee_id(id,name,color,tc), creator:creator_id(id,name)')
      .order('created_at', { ascending: false })
    setTasks(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  // 필터링
  const filtered = tasks.filter(t => {
    if (scope === 'mine' && t.assignee_id !== profile?.id && t.creator_id !== profile?.id) return false
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    return true
  })

  // 정렬
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'due_date') {
      const ad = a.due_date || '9999-12-31'
      const bd = b.due_date || '9999-12-31'
      return ad.localeCompare(bd)
    }
    if (sortBy === 'priority') {
      const order = { high: 0, normal: 1, low: 2 }
      return order[a.priority] - order[b.priority]
    }
    return b.created_at.localeCompare(a.created_at)
  })

  // 칸반용 그룹핑
  const grouped = {
    todo: sorted.filter(t => t.status === 'todo'),
    in_progress: sorted.filter(t => t.status === 'in_progress'),
    blocked: sorted.filter(t => t.status === 'blocked'),
    done: sorted.filter(t => t.status === 'done'),
  }

  async function updateTaskStatus(id: string, newStatus: string) {
    const supabase = createClient()
    await supabase.from('tasks').update({
      status: newStatus,
      progress: newStatus === 'done' ? 100 : newStatus === 'todo' ? 0 : undefined,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    load()
  }

  async function deleteTask(id: string) {
    if (!confirm('이 업무를 삭제하시겠습니까?')) return
    const supabase = createClient()
    await supabase.from('tasks').delete().eq('id', id)
    load()
  }

  // 마감일 상태 (overdue, today, upcoming)
  function dueDateStatus(date: string | null): 'overdue' | 'today' | 'soon' | 'normal' | null {
    if (!date) return null
    const today = todayStr()
    if (date < today) return 'overdue'
    if (date === today) return 'today'
    const diff = (new Date(date+'T00:00:00').getTime() - new Date(today+'T00:00:00').getTime()) / 86400000
    if (diff <= 3) return 'soon'
    return 'normal'
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold text-gray-800">✔️ 업무 관리</h1>
        <button onClick={()=>{ setEditing(null); setShowCreate(true) }}
          className="btn-primary text-sm flex items-center gap-1">
          <span>+</span> 새 업무
        </button>
      </div>

      {/* 컨트롤 바 */}
      <div className="card mb-4 p-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* 보기 방식 (칸반 / 목록) */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button onClick={()=>setView('kanban')}
                className={`px-3 py-1.5 text-sm rounded-md font-medium ${view==='kanban'?'bg-white shadow-sm text-purple-600':'text-gray-500'}`}>
                🗂 칸반
              </button>
              <button onClick={()=>setView('list')}
                className={`px-3 py-1.5 text-sm rounded-md font-medium ${view==='list'?'bg-white shadow-sm text-purple-600':'text-gray-500'}`}>
                📋 목록
              </button>
            </div>

            {/* 공개 범위 (내 업무 / 전체) */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button onClick={()=>setScope('mine')}
                className={`px-3 py-1.5 text-sm rounded-md font-medium ${scope==='mine'?'bg-white shadow-sm text-purple-600':'text-gray-500'}`}>
                내 업무
              </button>
              <button onClick={()=>setScope('all')}
                className={`px-3 py-1.5 text-sm rounded-md font-medium ${scope==='all'?'bg-white shadow-sm text-purple-600':'text-gray-500'}`}>
                전체
              </button>
            </div>

            {/* 상태 필터 (목록 뷰에서만) */}
            {view === 'list' && (
              <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5">
                <option value="all">모든 상태</option>
                <option value="todo">할일</option>
                <option value="in_progress">진행중</option>
                <option value="blocked">대기/막힘</option>
                <option value="done">완료</option>
              </select>
            )}

            {/* 정렬 */}
            <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5">
              <option value="due_date">마감일순</option>
              <option value="priority">우선순위순</option>
              <option value="created_at">최근등록순</option>
            </select>
          </div>

          <div className="text-sm text-gray-500">
            총 <strong className="text-gray-700">{filtered.length}</strong>건
          </div>
        </div>
      </div>

      {/* 본문 */}
      {view === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {(['todo','in_progress','blocked','done'] as const).map(st => (
            <div key={st} className="bg-gray-50 rounded-lg p-3 min-h-[400px]">
              <div className="flex items-center justify-between mb-3">
                <span className={`px-2 py-0.5 rounded text-xs font-bold border ${STATUS_META[st].color}`}>
                  {STATUS_META[st].label}
                </span>
                <span className="text-xs text-gray-400">{grouped[st].length}</span>
              </div>
              <div className="space-y-2">
                {grouped[st].length === 0 && (
                  <div className="text-xs text-gray-400 text-center py-4">없음</div>
                )}
                {grouped[st].map(t => (
                  <KanbanCard key={t.id} task={t} onClick={()=>setEditing(t)} dueDateStatus={dueDateStatus} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">제목</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 w-24">담당자</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 w-24">상태</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 w-20">우선순위</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 w-28">마감일</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 w-20">진척률</th>
                <th className="px-3 py-2.5 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">업무가 없습니다.</td></tr>
              )}
              {sorted.map(t => {
                const dueStat = dueDateStatus(t.due_date)
                return (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-purple-50/30 cursor-pointer" onClick={()=>setEditing(t)}>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-800">{t.title}</div>
                      {t.description && <div className="text-xs text-gray-400 truncate max-w-md">{t.description}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      {t.assignee ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{backgroundColor: t.assignee.color || '#E6F1FB', color: t.assignee.tc || '#185FA5'}}>
                          {t.assignee.name}
                        </span>
                      ) : <span className="text-xs text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold border ${STATUS_META[t.status].color}`}>
                        {STATUS_META[t.status].label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="text-sm">{PRIORITY_META[t.priority].emoji}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {t.due_date ? (
                        <span className={`text-xs ${
                          dueStat === 'overdue' ? 'text-red-500 font-bold' :
                          dueStat === 'today' ? 'text-orange-500 font-bold' :
                          dueStat === 'soon' ? 'text-amber-600 font-medium' : 'text-gray-600'
                        }`}>{t.due_date}{dueStat==='overdue'?' ⚠️':dueStat==='today'?' 🔥':''}</span>
                      ) : <span className="text-xs text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-purple-500 h-1.5" style={{width:`${t.progress}%`}} />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{t.progress}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button onClick={(e)=>{e.stopPropagation();deleteTask(t.id)}}
                        className="text-gray-300 hover:text-red-500 text-sm">🗑</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 새 업무 / 수정 모달 */}
      {(showCreate || editing) && (
        <TaskModal
          task={editing}
          employees={employees}
          currentUserId={profile?.id}
          onClose={()=>{ setShowCreate(false); setEditing(null) }}
          onSaved={()=>{ setShowCreate(false); setEditing(null); load() }}
          onDelete={editing ? ()=>{ deleteTask(editing.id); setEditing(null) } : undefined}
        />
      )}
    </div>
  )
}

// ─── 칸반 카드 ──────
function KanbanCard({ task, onClick, dueDateStatus }: {
  task: Task, onClick: ()=>void, dueDateStatus: (d:string|null)=>any
}) {
  const dueStat = dueDateStatus(task.due_date)
  return (
    <div onClick={onClick}
      className="bg-white rounded-lg p-2.5 border border-gray-200 hover:border-purple-300 hover:shadow-sm cursor-pointer transition-all">
      <div className="flex items-start justify-between gap-1.5 mb-1.5">
        <div className="text-sm font-medium text-gray-800 flex-1">{task.title}</div>
        <span className="text-xs flex-shrink-0">{PRIORITY_META[task.priority].emoji}</span>
      </div>
      {task.description && <div className="text-xs text-gray-400 truncate mb-1.5">{task.description}</div>}
      <div className="flex items-center justify-between gap-1.5">
        {task.assignee ? (
          <span className="text-xs px-1.5 py-0.5 rounded font-medium truncate"
            style={{backgroundColor: task.assignee.color || '#E6F1FB', color: task.assignee.tc || '#185FA5'}}>
            {task.assignee.name}
          </span>
        ) : <span className="text-xs text-gray-300">담당자 없음</span>}
        {task.due_date && (
          <span className={`text-xs flex-shrink-0 ${
            dueStat === 'overdue' ? 'text-red-500 font-bold' :
            dueStat === 'today' ? 'text-orange-500 font-bold' :
            dueStat === 'soon' ? 'text-amber-600' : 'text-gray-500'
          }`}>{task.due_date.slice(5)}{dueStat==='overdue'?' ⚠️':dueStat==='today'?' 🔥':''}</span>
        )}
      </div>
      {task.progress > 0 && task.progress < 100 && (
        <div className="mt-1.5 bg-gray-100 rounded-full h-1 overflow-hidden">
          <div className="bg-purple-500 h-1" style={{width:`${task.progress}%`}} />
        </div>
      )}
    </div>
  )
}

// ─── 새 업무 / 수정 모달 ──────
function TaskModal({ task, employees, currentUserId, onClose, onSaved, onDelete }: {
  task: Task | null
  employees: any[]
  currentUserId: string
  onClose: ()=>void
  onSaved: ()=>void
  onDelete?: ()=>void
}) {
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    assignee_id: task?.assignee_id || currentUserId || '',
    due_date: task?.due_date || '',
    status: task?.status || 'todo',
    priority: task?.priority || 'normal',
    progress: task?.progress ?? 0,
  })

  async function save() {
    if (!form.title.trim()) { alert('제목을 입력해주세요.'); return }
    const supabase = createClient()
    if (task) {
      // 수정
      await supabase.from('tasks').update({
        title: form.title,
        description: form.description || null,
        assignee_id: form.assignee_id || null,
        due_date: form.due_date || null,
        status: form.status,
        priority: form.priority,
        progress: form.progress,
        updated_at: new Date().toISOString(),
      }).eq('id', task.id)
    } else {
      // 신규
      await supabase.from('tasks').insert({
        title: form.title,
        description: form.description || null,
        assignee_id: form.assignee_id || null,
        creator_id: currentUserId,
        due_date: form.due_date || null,
        status: form.status,
        priority: form.priority,
        progress: form.progress,
      })
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e=>e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="text-base font-semibold text-gray-800">
            {task ? '업무 수정' : '새 업무'}
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">제목 *</label>
            <input type="text" className="input" autoFocus
              placeholder="예: 5월 매출 보고서 작성"
              value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">상세 설명</label>
            <textarea className="input resize-none" rows={3}
              placeholder="업무 내용을 자세히 적어주세요..."
              value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">담당자</label>
              <select className="input" value={form.assignee_id}
                onChange={e=>setForm(f=>({...f,assignee_id:e.target.value}))}>
                <option value="">-</option>
                {employees.map(e=>(
                  <option key={e.id} value={e.id}>{e.name} {e.dept?`(${e.dept})`:''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">마감일</label>
              <input type="date" className="input"
                value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">상태</label>
              <select className="input" value={form.status}
                onChange={e=>setForm(f=>({...f,status:e.target.value as any}))}>
                <option value="todo">할일</option>
                <option value="in_progress">진행중</option>
                <option value="blocked">대기/막힘</option>
                <option value="done">완료</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">우선순위</label>
              <select className="input" value={form.priority}
                onChange={e=>setForm(f=>({...f,priority:e.target.value as any}))}>
                <option value="high">🔴 높음</option>
                <option value="normal">🟡 보통</option>
                <option value="low">🔵 낮음</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">진척률: {form.progress}%</label>
            <input type="range" min="0" max="100" step="10" className="w-full accent-purple-600"
              value={form.progress} onChange={e=>setForm(f=>({...f,progress:parseInt(e.target.value)}))} />
          </div>
        </div>
        <div className="p-4 border-t border-gray-100 flex justify-between gap-2">
          <div>
            {onDelete && (
              <button onClick={onDelete} className="btn-secondary text-sm text-red-500 hover:bg-red-50">
                🗑 삭제
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">취소</button>
            <button onClick={save} className="btn-primary text-sm">{task ? '저장' : '등록'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

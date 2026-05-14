'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'

type Task = {
  id: string
  title: string
  description: string | null
  assignees: string[] | null // uuid 배열
  creator_id: string | null
  due_date: string | null
  status: 'todo' | 'in_progress' | 'done' | 'blocked'
  priority: 'high' | 'normal' | 'low'
  progress: number
  assignee_progress: Record<string, number> | null // 담당자별 진척률
  visibility: 'private' | 'shared'
  created_at: string
  updated_at: string
  creator?: { id: string, name: string } | null
}

// 담당자 진척률 평균 계산
function avgProgress(task: Task): number {
  const ap = task.assignee_progress || {}
  const assignees = task.assignees || []
  if (assignees.length === 0) return task.progress || 0
  let sum = 0
  for (const aid of assignees) {
    sum += (ap[aid] || 0)
  }
  return Math.round(sum / assignees.length)
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
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [visibilityFilter, setVisibilityFilter] = useState<'all'|'mine'|'shared'|'private'>('all')
  const [sortBy, setSortBy] = useState<'due_date' | 'priority' | 'created_at'>('due_date')
  const [editing, setEditing] = useState<Task | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('id,name,role,dept').eq('id', session.user.id).single()
    setProfile(p)
    const { data: emps } = await supabase.from('profiles')
      .select('id,name,color,tc,dept,grade').eq('status','active').order('name')
    setEmployees(emps || [])
    const { data } = await supabase.from('tasks')
      .select('*, creator:creator_id(id,name)')
      .order('created_at', { ascending: false })
    setTasks(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  // 직원 ID → 직원 정보 매핑 (담당자 표시용)
  const empMap: Record<string, any> = {}
  for (const e of employees) empMap[e.id] = e

  // 필터링
  const filtered = tasks.filter(t => {
    if (visibilityFilter === 'mine') {
      // 내가 담당자거나 등록자
      if (t.creator_id !== profile?.id && !(t.assignees || []).includes(profile?.id)) return false
    } else if (visibilityFilter === 'shared') {
      if (t.visibility !== 'shared') return false
    } else if (visibilityFilter === 'private') {
      if (t.visibility !== 'private') return false
    }
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

  const grouped = {
    todo: sorted.filter(t => t.status === 'todo'),
    in_progress: sorted.filter(t => t.status === 'in_progress'),
    blocked: sorted.filter(t => t.status === 'blocked'),
    done: sorted.filter(t => t.status === 'done'),
  }

  // 삭제 권한 체크: 작성자 또는 관리자(director)만
  function canDeleteTask(task: Task): boolean {
    if (!profile) return false
    if (profile.role === 'director') return true
    return task.creator_id === profile.id
  }

  async function deleteTask(id: string) {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    if (!canDeleteTask(task)) {
      alert('업무 작성자 또는 관리자만 삭제할 수 있습니다.')
      return
    }
    if (!confirm('이 업무를 삭제하시겠습니까?')) return
    const supabase = createClient()
    await supabase.from('tasks').delete().eq('id', id)
    load()
  }

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
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold text-gray-800">✔️ 업무 관리</h1>
        <button onClick={()=>{ setEditing(null); setShowCreate(true) }}
          className="btn-primary text-sm flex items-center gap-1">
          <span>+</span> 새 업무
        </button>
      </div>

      {/* 필터 바 */}
      <div className="card mb-4 p-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* 보기 방식 */}
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

            {/* 공개범위 필터 */}
            <select value={visibilityFilter} onChange={e=>setVisibilityFilter(e.target.value as any)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
              <option value="all">📂 전체 업무</option>
              <option value="mine">👤 내 업무 (내가 담당/등록)</option>
              <option value="shared">👥 공유 업무</option>
              <option value="private">🔒 개인 업무</option>
            </select>

            {/* 상태 필터 */}
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
              <option value="all">모든 상태</option>
              <option value="todo">할일</option>
              <option value="in_progress">진행중</option>
              <option value="blocked">대기/막힘</option>
              <option value="done">완료</option>
            </select>

            {/* 정렬 */}
            <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
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
                  <KanbanCard key={t.id} task={t} empMap={empMap}
                    onClick={()=>setEditing(t)} dueDateStatus={dueDateStatus} />
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
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 w-8"></th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">제목</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 w-40">담당자</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 w-24">상태</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 w-20">우선순위</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 w-28">마감일</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 w-24">진척률</th>
                <th className="px-3 py-2.5 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">업무가 없습니다.</td></tr>
              )}
              {sorted.map(t => {
                const dueStat = dueDateStatus(t.due_date)
                const asgs = (t.assignees || []).map(id => empMap[id]).filter(Boolean)
                return (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-purple-50/30 cursor-pointer" onClick={()=>setEditing(t)}>
                    <td className="px-3 py-2.5 text-center">
                      <span title={t.visibility === 'private' ? '개인 업무' : '공유 업무'}>
                        {t.visibility === 'private' ? '🔒' : '👥'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-800">{t.title}</div>
                      {t.description && <div className="text-xs text-gray-400 truncate max-w-md">{t.description}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      {asgs.length === 0 && <span className="text-xs text-gray-300">-</span>}
                      <div className="flex flex-wrap gap-1">
                        {asgs.slice(0,3).map((a:any) => (
                          <span key={a.id} className="text-xs px-1.5 py-0.5 rounded font-medium"
                            style={{backgroundColor: a.color || '#E6F1FB', color: a.tc || '#185FA5'}}>
                            {a.name}
                          </span>
                        ))}
                        {asgs.length > 3 && <span className="text-xs text-gray-400">+{asgs.length-3}</span>}
                      </div>
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
                      {(() => {
                        const avg = avgProgress(t)
                        return (
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div className="bg-purple-500 h-1.5" style={{width:`${avg}%`}} />
                            </div>
                            <span className="text-xs text-gray-500 w-8 text-right">{avg}%</span>
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {canDeleteTask(t) && (
                        <button onClick={(e)=>{e.stopPropagation();deleteTask(t.id)}}
                          className="text-gray-300 hover:text-red-500 text-sm">🗑</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {(showCreate || editing) && (
        <TaskModal
          task={editing}
          employees={employees}
          currentUserId={profile?.id}
          canDelete={editing ? canDeleteTask(editing) : false}
          onClose={()=>{ setShowCreate(false); setEditing(null) }}
          onSaved={()=>{ setShowCreate(false); setEditing(null); load() }}
          onDelete={editing ? ()=>{ deleteTask(editing.id); setEditing(null) } : undefined}
        />
      )}
    </div>
  )
}

// ─── 칸반 카드 ──────
function KanbanCard({ task, empMap, onClick, dueDateStatus }: {
  task: Task, empMap: Record<string, any>, onClick: ()=>void, dueDateStatus: (d:string|null)=>any
}) {
  const dueStat = dueDateStatus(task.due_date)
  const asgs = (task.assignees || []).map(id => empMap[id]).filter(Boolean)
  return (
    <div onClick={onClick}
      className="bg-white rounded-lg p-2.5 border border-gray-200 hover:border-purple-300 hover:shadow-sm cursor-pointer transition-all">
      <div className="flex items-start justify-between gap-1.5 mb-1.5">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-xs flex-shrink-0" title={task.visibility==='private'?'개인 업무':'공유 업무'}>
            {task.visibility==='private'?'🔒':'👥'}
          </span>
          <div className="text-sm font-medium text-gray-800 truncate">{task.title}</div>
        </div>
        <span className="text-xs flex-shrink-0">{PRIORITY_META[task.priority].emoji}</span>
      </div>
      {task.description && <div className="text-xs text-gray-400 truncate mb-1.5">{task.description}</div>}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex flex-wrap gap-0.5 flex-1 min-w-0">
          {asgs.length === 0 && <span className="text-xs text-gray-300">담당자 없음</span>}
          {asgs.slice(0,2).map((a:any)=>(
            <span key={a.id} className="text-xs px-1.5 py-0.5 rounded font-medium truncate"
              style={{backgroundColor: a.color || '#E6F1FB', color: a.tc || '#185FA5'}}>
              {a.name}
            </span>
          ))}
          {asgs.length > 2 && <span className="text-xs text-gray-400">+{asgs.length-2}</span>}
        </div>
        {task.due_date && (
          <span className={`text-xs flex-shrink-0 ${
            dueStat === 'overdue' ? 'text-red-500 font-bold' :
            dueStat === 'today' ? 'text-orange-500 font-bold' :
            dueStat === 'soon' ? 'text-amber-600' : 'text-gray-500'
          }`}>{task.due_date.slice(5)}{dueStat==='overdue'?' ⚠️':dueStat==='today'?' 🔥':''}</span>
        )}
      </div>
      {(() => {
        const avg = avgProgress(task)
        if (avg > 0 && avg < 100) {
          return (
            <div className="mt-1.5 bg-gray-100 rounded-full h-1 overflow-hidden">
              <div className="bg-purple-500 h-1" style={{width:`${avg}%`}} />
            </div>
          )
        }
        return null
      })()}
    </div>
  )
}

// ─── 새 업무 / 수정 모달 ──────
function TaskModal({ task, employees, currentUserId, canDelete, onClose, onSaved, onDelete }: {
  task: Task | null
  employees: any[]
  currentUserId: string
  canDelete: boolean
  onClose: ()=>void
  onSaved: ()=>void
  onDelete?: ()=>void
}) {
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    assignees: (task?.assignees || [currentUserId]).filter(Boolean),
    due_date: task?.due_date || '',
    status: task?.status || 'todo',
    priority: task?.priority || 'normal',
    visibility: task?.visibility || 'shared', // 기본 = 공유
  })
  // 담당자별 진척률 (각자 말)
  const [assigneeProgress, setAssigneeProgress] = useState<Record<string, number>>(
    task?.assignee_progress || {}
  )
  const [showAsgDropdown, setShowAsgDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 본인 진척률만 수정 가능 - 본인 progress 조정 함수
  function adjustMyProgress(delta: number) {
    setAssigneeProgress(p => {
      const cur = p[currentUserId] ?? 0
      const next = Math.min(100, Math.max(0, cur + delta))
      return { ...p, [currentUserId]: next }
    })
  }
  function setMyProgress(value: number) {
    setAssigneeProgress(p => ({ ...p, [currentUserId]: Math.min(100, Math.max(0, value)) }))
  }

  // 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowAsgDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function toggleAssignee(empId: string) {
    setForm(f => {
      if (f.assignees.includes(empId)) {
        return { ...f, assignees: f.assignees.filter(id => id !== empId) }
      } else {
        return { ...f, assignees: [...f.assignees, empId] }
      }
    })
  }

  const selectedEmps = form.assignees.map(id => employees.find(e => e.id === id)).filter(Boolean)
  const isMyAssignee = form.assignees.includes(currentUserId)
  // 평균 진척률 (담당자들만)
  const avgProg = form.assignees.length === 0 ? 0 :
    Math.round(form.assignees.reduce((s, id) => s + (assigneeProgress[id] || 0), 0) / form.assignees.length)

  async function save() {
    if (!form.title.trim()) { alert('제목을 입력해주세요.'); return }
    const supabase = createClient()
    // 담당자 아닌 사람의 진척률은 정리
    const cleanedProgress: Record<string, number> = {}
    for (const aid of form.assignees) {
      cleanedProgress[aid] = assigneeProgress[aid] || 0
    }
    if (task) {
      await supabase.from('tasks').update({
        title: form.title,
        description: form.description || null,
        assignees: form.assignees,
        due_date: form.due_date || null,
        status: form.status,
        priority: form.priority,
        progress: avgProg, // 평균 진척률 자동 계산
        assignee_progress: cleanedProgress,
        visibility: form.visibility,
        updated_at: new Date().toISOString(),
      }).eq('id', task.id)
    } else {
      await supabase.from('tasks').insert({
        title: form.title,
        description: form.description || null,
        assignees: form.assignees,
        creator_id: currentUserId,
        due_date: form.due_date || null,
        status: form.status,
        priority: form.priority,
        progress: avgProg,
        assignee_progress: cleanedProgress,
        visibility: form.visibility,
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

          {/* 공개 범위 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">공개 범위</label>
            <div className="flex gap-2">
              <button type="button" onClick={()=>setForm(f=>({...f,visibility:'shared'}))}
                className={`flex-1 px-3 py-2 rounded-lg text-sm border-2 transition-all ${
                  form.visibility==='shared'
                    ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold'
                    : 'border-gray-200 text-gray-500'
                }`}>
                👥 공유 업무<div className="text-xs font-normal mt-0.5">회사 전체 공개</div>
              </button>
              <button type="button" onClick={()=>setForm(f=>({...f,visibility:'private'}))}
                className={`flex-1 px-3 py-2 rounded-lg text-sm border-2 transition-all ${
                  form.visibility==='private'
                    ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold'
                    : 'border-gray-200 text-gray-500'
                }`}>
                🔒 개인 업무<div className="text-xs font-normal mt-0.5">담당자만 볼 수 있음</div>
              </button>
            </div>
          </div>

          {/* 담당자 다중 선택 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">담당자 (여러 명 선택 가능)</label>
            <div ref={dropdownRef} className="relative">
              <button type="button"
                onClick={()=>setShowAsgDropdown(v=>!v)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-left bg-white hover:border-purple-300 flex items-center justify-between min-h-[42px]">
                <div className="flex flex-wrap gap-1 flex-1">
                  {selectedEmps.length === 0 && <span className="text-gray-400">담당자를 선택하세요</span>}
                  {selectedEmps.map((e:any)=>(
                    <span key={e.id} className="text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1"
                      style={{backgroundColor: e.color || '#E6F1FB', color: e.tc || '#185FA5'}}>
                      {e.name}
                      <span onClick={(ev)=>{ev.stopPropagation();toggleAssignee(e.id)}} className="hover:opacity-60 cursor-pointer">✕</span>
                    </span>
                  ))}
                </div>
                <span className="text-gray-400 ml-2">▼</span>
              </button>
              {showAsgDropdown && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {employees.map((e:any)=>(
                    <label key={e.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-purple-50 cursor-pointer text-sm">
                      <input type="checkbox" checked={form.assignees.includes(e.id)}
                        onChange={()=>toggleAssignee(e.id)} className="accent-purple-600" />
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                        style={{backgroundColor: e.color || '#E6F1FB', color: e.tc || '#185FA5'}}>
                        {e.name}
                      </span>
                      <span className="text-xs text-gray-400">{e.dept} · {e.grade}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">마감일</label>
              <input type="date" className="input"
                value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))} />
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
            <label className="block text-xs font-medium text-gray-500 mb-1">상태</label>
            <select className="input" value={form.status}
              onChange={e=>setForm(f=>({...f,status:e.target.value as any}))}>
              <option value="todo">할일</option>
              <option value="in_progress">진행중</option>
              <option value="blocked">대기/막힘</option>
              <option value="done">완료</option>
            </select>
          </div>
          {/* 진척률 트랙 (담당자별 각자 말) */}
          <div className="bg-purple-50/40 rounded-lg p-3 border border-purple-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">🏁</span>
                <span className="text-xs font-semibold text-gray-700">담당자별 진척률 (각자 말)</span>
              </div>
              <span className="text-xs text-purple-700 font-bold">전체 평균 {avgProg}%</span>
            </div>
            {form.assignees.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-2">담당자를 먼저 선택해주세요</div>
            ) : (
              <div className="space-y-2">
                {form.assignees.map(aid => {
                  const emp = employees.find(e => e.id === aid)
                  if (!emp) return null
                  const myProg = assigneeProgress[aid] || 0
                  const isMe = aid === currentUserId
                  return (
                    <div key={aid} className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded font-medium w-20 flex-shrink-0 text-center"
                        style={{backgroundColor: emp.color || '#E6F1FB', color: emp.tc || '#185FA5'}}>
                        {emp.name}{isMe ? ' 👈' : ''}
                      </span>
                      {/* 진척률 바 */}
                      <div className="flex-1 relative h-5 bg-white rounded-full overflow-hidden border border-gray-200">
                        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-400 to-purple-600 transition-all"
                          style={{width:`${myProg}%`}} />
                        {/* 말 (이모지) */}
                        <div className="absolute inset-y-0 flex items-center transition-all"
                          style={{left: `calc(${myProg}% - 12px)`}}>
                          <span className="text-base" style={{filter:'drop-shadow(0 1px 2px rgba(0,0,0,0.2))'}}>
                            {isMe ? '🏃' : '🚶'}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-gray-700 w-10 text-right">{myProg}%</span>
                      {/* 본인 것만 조정 버튼 */}
                      {isMe ? (
                        <div className="flex gap-0.5">
                          <button onClick={()=>adjustMyProgress(-10)}
                            className="px-1.5 py-0.5 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50">⬅</button>
                          <button onClick={()=>adjustMyProgress(10)}
                            className="px-1.5 py-0.5 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50">➡</button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300 w-12 text-center">읽기만</span>
                      )}
                    </div>
                  )
                })}
                {/* 본인이 담당자라면 슬라이더로도 조정 가능 */}
                {isMyAssignee && (
                  <div className="pt-2 border-t border-purple-100 mt-2">
                    <div className="text-[10px] text-gray-500 mb-1">내 진척률 슬라이더</div>
                    <input type="range" min="0" max="100" step="5" className="w-full accent-purple-600"
                      value={assigneeProgress[currentUserId] || 0}
                      onChange={e=>setMyProgress(parseInt(e.target.value))} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 작성자 정보 (수정 모드일 때만) */}
          {task && (
            <div className="text-[11px] text-gray-400 text-right pt-1">
              작성자: <span className="text-gray-600 font-medium">{task.creator?.name || '알 수 없음'}</span>
              {' · '}
              등록일: {task.created_at?.slice(0, 10)}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-gray-100 flex justify-between gap-2">
          <div>
            {onDelete && canDelete && (
              <button onClick={onDelete} className="btn-secondary text-sm text-red-500 hover:bg-red-50">
                🗑 삭제
              </button>
            )}
            {task && !canDelete && (
              <span className="text-[11px] text-gray-400">삭제는 작성자 또는 관리자만 가능</span>
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

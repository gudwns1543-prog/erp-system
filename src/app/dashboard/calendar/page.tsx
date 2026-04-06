'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { GRADE_ORDER, isHoliday } from '@/lib/attendance'

const DAYS = ['일','월','화','수','목','금','토']
const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
const HOLIDAY_NAMES: Record<string,string> = {
  '2026-01-01':'신정','2026-02-16':'설날연휴','2026-02-17':'설날',
  '2026-02-18':'설날연휴','2026-03-01':'삼일절','2026-05-05':'어린이날',
  '2026-05-25':'부처님오신날','2026-06-03':'현충일',
  '2026-08-17':'광복절대체','2026-09-24':'추석연휴','2026-09-25':'추석',
  '2026-09-26':'추석연휴','2026-10-05':'개천절대체','2026-10-09':'한글날','2026-12-25':'성탄절',
}
const EVENT_COLORS = [
  {label:'보라', value:'#534AB7'},{label:'파랑', value:'#185FA5'},
  {label:'초록', value:'#0F6E56'},{label:'빨강', value:'#A32D2D'},
  {label:'주황', value:'#854F0B'},{label:'분홍', value:'#993556'},
]
const DEFAULT_CATEGORIES = [
  { id:'personal', name:'내 일정', icon:'👤', scope:'personal', members:[] },
  { id:'company',  name:'솔루션 공유일정', icon:'🏢', scope:'company', members:[] },
]
const CAT_ICONS = ['👤','🏢','👥','📁','📌','🎯','🚀','💼','🔔','⭐','🌟','📋']

function toLocalDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}

export default function CalendarPage() {
  const [profile, setProfile] = useState<any>(null)
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [attendees, setAttendees] = useState<any[]>([])
  const [curYear, setCurYear] = useState(new Date().getFullYear())
  const [curMonth, setCurMonth] = useState(new Date().getMonth())
  const [selDate, setSelDate] = useState<string|null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showDetail, setShowDetail] = useState<any>(null)
  const [editMode, setEditMode] = useState(false)
  const [editingEventId, setEditingEventId] = useState<string|null>(null)
  const [myInvites, setMyInvites] = useState<any[]>([])
  const [tab, setTab] = useState<'calendar'|'invites'|'settings'>('calendar')
  const [categories, setCategories] = useState<any[]>(DEFAULT_CATEGORIES)
  const [catForm, setCatForm] = useState({ name:'', icon:'📁', scope:'personal' as string })
  const [editingCat, setEditingCat] = useState<string|null>(null)
  const [form, setForm] = useState({
    title:'', description:'', start_date:'', start_time:'09:00',
    end_date:'', end_time:'18:00', all_day:false,
    location:'', color:'#534AB7', attendeeIds:[] as string[],
    calendar_type:'personal' as string,
    is_locked: false,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem('cal_categories')
    if (saved) { try { setCategories(JSON.parse(saved)) } catch {} }
  }, [])

  function saveCategories(cats: any[]) {
    setCategories(cats)
    if (typeof window !== 'undefined') localStorage.setItem('cal_categories', JSON.stringify(cats))
  }
  function addCategory() {
    if (!catForm.name.trim()) return
    saveCategories([...categories, { id: Date.now().toString(), ...catForm, members:[] }])
    setCatForm({ name:'', icon:'📁', scope:'personal' })
  }
  function deleteCategory(id: string) {
    if (['personal','company'].includes(id)) return
    if (!confirm('이 카테고리를 삭제하시겠습니까?')) return
    saveCategories(categories.filter(c => c.id !== id))
  }
  function updateCategory(id: string, field: string, value: any) {
    saveCategories(categories.map(c => c.id === id ? {...c, [field]: value} : c))
  }

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const { data: users } = await supabase.from('profiles').select('id,name,grade,dept,color,tc,avatar_url').eq('status','active')
    setAllUsers(users||[])
    const { data: myAtt } = await supabase.from('event_attendees').select('event_id').eq('user_id', session.user.id)
    const attEventIds = (myAtt||[]).map((a:any) => a.event_id)
    const { data: evs } = await supabase.from('events')
      .select('*, creator:creator_id(name,grade,color,tc,avatar_url)')
      .or(`calendar_type.eq.company,creator_id.eq.${session.user.id}${attEventIds.length?`,id.in.(${attEventIds.join(',')})`:''}`).order('start_at')
    setEvents(evs||[])
    if (typeof window !== 'undefined' && p?.id) {
      localStorage.setItem(`cal_checked_${p.id}`, new Date().toISOString())
    }
    const { data: atts } = await supabase.from('event_attendees')
      .select('*, user:user_id(id,name,grade,color,tc,avatar_url)')
      .in('event_id', (evs||[]).map((e:any) => e.id))
    setAttendees(atts||[])
    const { data: inv } = await supabase.from('event_attendees')
      .select('*, event:event_id(title,start_at,end_at,creator:creator_id(name))')
      .eq('user_id', session.user.id).eq('status','pending')
    setMyInvites(inv||[])
  }, [])

  useEffect(() => { load() }, [load])

  const firstDay = new Date(curYear, curMonth, 1).getDay()
  const daysInMonth = new Date(curYear, curMonth+1, 0).getDate()
  const today = toLocalDateStr(new Date())

  function getEventsForDate(dateStr: string) {
    return events.filter(e => e.start_at.slice(0,10) <= dateStr && dateStr <= e.end_at.slice(0,10))
  }

  // 수정 가능 여부: 본인 작성 OR 관리자 OR (하위직급이 작성 AND 잠금 안 됨)
  function canEdit(event: any): boolean {
    if (!profile) return false
    if (event.creator_id === profile.id) return true
    if (profile.role === 'director') return true
    if (event.is_locked) return false  // 잠금 표시된 일정은 수정 불가
    const creatorGrade = GRADE_ORDER[(event.creator as any)?.grade||''] || 99
    const myGrade = GRADE_ORDER[profile.grade||''] || 99
    return myGrade < creatorGrade  // 내가 더 상위직급이면 수정 가능
  }

  function canDelete(event: any): boolean {
    if (!profile) return false
    if (event.creator_id === profile.id || profile.role === 'director') return true
    if (event.is_locked) return false
    const creatorGrade = GRADE_ORDER[(event.creator as any)?.grade||''] || 99
    const myGrade = GRADE_ORDER[profile.grade||''] || 99
    return myGrade < creatorGrade
  }

  // 잠금 토글 (작성자 본인 또는 관리자만)
  async function toggleLock(event: any) {
    if (event.creator_id !== profile?.id && profile?.role !== 'director') return
    const supabase = createClient()
    await supabase.from('events').update({ is_locked: !event.is_locked }).eq('id', event.id)
    load()
    setShowDetail(null)
  }

  function editBlockReason(event: any): string | null {
    if (canEdit(event)) return null
    if (event.is_locked) {
      return `${(event.creator as any)?.name} ${(event.creator as any)?.grade}님이 잠금 설정한 일정으로 수정이 불가합니다.`
    }
    const creatorGrade = GRADE_ORDER[(event.creator as any)?.grade||''] || 99
    const myGrade = GRADE_ORDER[profile?.grade||''] || 99
    if (creatorGrade < myGrade) {
      return `${(event.creator as any)?.name} ${(event.creator as any)?.grade}님이 작성한 일정으로 수정이 불가합니다.`
    }
    return '본인이 작성한 일정이 아니므로 수정이 불가합니다.'
  }

  async function handleSubmit() {
    if (!form.title || !form.start_date) return
    const supabase = createClient()
    const startAt = form.all_day ? `${form.start_date}T00:00:00` : `${form.start_date}T${form.start_time}:00`
    const endAt   = form.all_day ? `${form.end_date||form.start_date}T23:59:59` : `${form.end_date||form.start_date}T${form.end_time}:00`
    if (editMode && editingEventId) {
      await supabase.from('events').update({
        title:form.title, description:form.description, start_at:startAt, end_at:endAt,
        all_day:form.all_day, location:form.location, color:form.color,
        calendar_type:form.calendar_type, is_locked:form.is_locked,
      }).eq('id', editingEventId)
      await supabase.from('event_attendees').delete().eq('event_id', editingEventId).neq('user_id', profile.id)
      if (form.attendeeIds.length) {
        await supabase.from('event_attendees').upsert(
          form.attendeeIds.map(uid=>({event_id:editingEventId, user_id:uid, status:'pending'})),
          {onConflict:'event_id,user_id'}
        )
      }
    } else {
      const { data: ev } = await supabase.from('events').insert({
        title:form.title, description:form.description, start_at:startAt, end_at:endAt,
        all_day:form.all_day, location:form.location, color:form.color,
        creator_id:profile.id, calendar_type:form.calendar_type, is_locked:form.is_locked,
      }).select().single()
      if (ev) {
        const cat = categories.find(c => c.id === form.calendar_type)
        const catMemberIds: string[] = cat?.members || []
        const allInviteIds = Array.from(new Set([...form.attendeeIds, ...catMemberIds]))
          .filter(uid => uid !== profile.id)
        if (allInviteIds.length) {
          await supabase.from('event_attendees').insert(
            allInviteIds.map(uid => ({event_id:ev.id, user_id:uid, status:'pending'}))
          )
        }
      }
    }
    setShowForm(false); setEditMode(false); setEditingEventId(null); setShowDetail(null); resetForm(); load()
  }

  async function handleDelete(eventId: string) {
    if (!confirm('일정을 삭제하시겠습니까?')) return
    const supabase = createClient()
    await supabase.from('events').delete().eq('id', eventId)
    setShowDetail(null); load()
  }

  async function respondInvite(attendeeId: string, status: 'accepted'|'declined') {
    const supabase = createClient()
    await supabase.from('event_attendees').update({status, responded_at:new Date().toISOString()}).eq('id', attendeeId)
    load()
  }

  function resetForm() {
    setForm({title:'',description:'',start_date:selDate||'',start_time:'09:00',
      end_date:selDate||'',end_time:'18:00',all_day:false,location:'',color:'#534AB7',
      attendeeIds:[],calendar_type:'personal',is_locked:false})
  }
  function openCreate(dateStr: string) {
    setSelDate(dateStr)
    setForm(f=>({...f, start_date:dateStr, end_date:dateStr}))
    setEditMode(false); setShowForm(true)
  }
  function openEdit(ev: any) {
    const atts = attendees.filter((a:any)=>a.event_id===ev.id).map((a:any)=>a.user_id)
    setForm({
      title:ev.title, description:ev.description||'',
      start_date:ev.start_at.slice(0,10), start_time:ev.start_at.slice(11,16),
      end_date:ev.end_at.slice(0,10), end_time:ev.end_at.slice(11,16),
      all_day:ev.all_day||false, location:ev.location||'', color:ev.color||'#534AB7',
      attendeeIds:atts, calendar_type:ev.calendar_type||'personal', is_locked:ev.is_locked||false,
    })
    setEditingEventId(ev.id); setEditMode(true); setShowDetail(null); setShowForm(true)
  }
  function closeForm() { setShowForm(false); setEditMode(false); setEditingEventId(null); resetForm() }

  function getCatInfo(calType: string) {
    return categories.find(c => c.id === calType) || { name:calType, icon:'📁' }
  }

  const Avatar = ({u,size=5}:{u:any,size?:number}) => (
    u?.avatar_url
      ? <img src={u.avatar_url} className={`w-${size} h-${size} rounded-full object-cover flex-shrink-0`} alt="" />
      : <div className={`w-${size} h-${size} rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0`}
          style={{background:u?.color||'#EEEDFE',color:u?.tc||'#3C3489'}}>{u?.name?.[0]}</div>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-lg font-semibold text-gray-800">일정</h1>
        <div className="flex gap-2 items-center">
          {myInvites.length > 0 && (
            <button onClick={()=>setTab('invites')} className="flex items-center gap-1.5 btn-secondary text-sm">
              📬 초대 응답
              <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{myInvites.length}</span>
            </button>
          )}
          <button onClick={()=>setTab('calendar')} className={tab==='calendar'?'btn-primary text-sm':'btn-secondary text-sm'}>📅 캘린더</button>
          <button onClick={()=>setTab('settings')} className={tab==='settings'?'btn-primary text-sm':'btn-secondary text-sm'}>⚙️ 설정</button>
        </div>
      </div>

      {/* 초대 응답 탭 */}
      {tab==='invites' && (
        <div className="card">
          <div className="text-sm font-medium text-gray-700 mb-4">📬 받은 일정 초대</div>
          {myInvites.length===0
            ? <div className="py-10 text-center text-gray-300 text-sm">대기 중인 초대가 없습니다</div>
            : myInvites.map((inv:any)=>(
              <div key={inv.id} className="flex items-center justify-between py-3 border-b border-gray-50">
                <div>
                  <div className="text-sm font-medium text-gray-800">{(inv.event as any)?.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {(inv.event as any)?.start_at?.slice(0,16).replace('T',' ')} ~ {(inv.event as any)?.end_at?.slice(11,16)}
                  </div>
                  <div className="text-xs text-gray-400">주최: {(inv.event as any)?.creator?.name}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>respondInvite(inv.id,'accepted')}
                    className="btn-secondary text-xs px-3 py-1.5 text-green-700 border-green-200 hover:bg-green-50">✅ 수락</button>
                  <button onClick={()=>respondInvite(inv.id,'declined')} className="btn-danger text-xs px-3 py-1.5">❌ 거절</button>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* ⚙️ 설정 탭 */}
      {tab==='settings' && (
        <div className="card">
          <div className="text-sm font-semibold text-gray-800 mb-1">📁 저장 위치 관리</div>
          <div className="text-xs text-gray-400 mb-4">카테고리별 소속 멤버를 지정하면 일정 등록 시 자동으로 초대됩니다.</div>
          <div className="space-y-3 mb-5">
            {categories.map(cat=>{
              const catMembers: string[] = cat.members || []
              return (
                <div key={cat.id} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 p-3 bg-gray-50">
                    <span className="text-lg w-8 text-center flex-shrink-0">{cat.icon}</span>
                    {editingCat===cat.id ? (
                      <div className="flex-1 flex flex-wrap items-center gap-2">
                        <input className="input text-sm w-36" value={cat.name}
                          onChange={e=>updateCategory(cat.id,'name',e.target.value)} />
                        <select className="input text-sm w-auto" value={cat.scope}
                          onChange={e=>updateCategory(cat.id,'scope',e.target.value)}>
                          <option value="personal">개인 (나만 보기)</option>
                          <option value="company">공유 (전직원 공개)</option>
                        </select>
                        <div className="flex gap-1 flex-wrap">
                          {CAT_ICONS.map(ic=>(
                            <button key={ic} onClick={()=>updateCategory(cat.id,'icon',ic)}
                              className={`w-7 h-7 rounded-lg text-sm border transition-all
                                ${cat.icon===ic?'border-purple-500 bg-purple-50':'border-transparent hover:border-gray-300'}`}>
                              {ic}
                            </button>
                          ))}
                        </div>
                        <button onClick={()=>setEditingCat(null)} className="btn-primary text-xs px-3 py-1.5">완료</button>
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800">{cat.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0
                          ${cat.scope==='company'?'bg-blue-50 text-blue-600':'bg-purple-50 text-purple-600'}`}>
                          {cat.scope==='company'?'전직원 공개':'개인'}
                        </span>
                        {catMembers.length > 0 && (
                          <span className="text-xs text-gray-400">멤버 {catMembers.length}명</span>
                        )}
                      </div>
                    )}
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button onClick={()=>setEditingCat(editingCat===cat.id?null:cat.id)}
                        className="btn-secondary text-xs px-2 py-1">수정</button>
                      {!['personal','company'].includes(cat.id) && (
                        <button onClick={()=>deleteCategory(cat.id)} className="btn-danger text-xs px-2 py-1">삭제</button>
                      )}
                    </div>
                  </div>
                  {cat.id !== 'personal' && (
                    <div className="p-3 border-t border-gray-100 bg-white">
                      <div className="text-xs font-medium text-gray-500 mb-2">👥 소속 멤버</div>
                      <div className="flex flex-wrap gap-1.5">
                        {allUsers.map(u=>{
                          const isMember = catMembers.includes(u.id)
                          return (
                            <button key={u.id}
                              onClick={()=>{
                                const newMembers = isMember ? catMembers.filter(id=>id!==u.id) : [...catMembers, u.id]
                                updateCategory(cat.id, 'members', newMembers)
                              }}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-all
                                ${isMember?'bg-purple-50 border-purple-300 text-purple-700':'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                              <div className="w-4 h-4 rounded-full flex items-center justify-center font-bold flex-shrink-0"
                                style={{background:u.color||'#EEEDFE',color:u.tc||'#3C3489',fontSize:'9px'}}>
                                {u.name?.[0]}
                              </div>
                              {u.name}
                              {isMember && <span className="text-purple-400">✓</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="border-t border-gray-100 pt-4">
            <div className="text-xs font-semibold text-gray-500 mb-3">+ 새 저장 위치 추가</div>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="block text-xs text-gray-400 mb-1">이름</label>
                <input className="input text-sm w-36" placeholder="예) 개발팀 일정"
                  value={catForm.name} onChange={e=>setCatForm(f=>({...f,name:e.target.value}))} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">아이콘</label>
                <div className="flex gap-1 flex-wrap">
                  {CAT_ICONS.map(ic=>(
                    <button key={ic} onClick={()=>setCatForm(f=>({...f,icon:ic}))}
                      className={`w-7 h-7 rounded-lg text-sm border transition-all
                        ${catForm.icon===ic?'border-purple-500 bg-purple-50':'border-transparent hover:border-gray-300'}`}>
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">공개 범위</label>
                <select className="input text-sm w-auto" value={catForm.scope}
                  onChange={e=>setCatForm(f=>({...f,scope:e.target.value}))}>
                  <option value="personal">개인 (나만 보기)</option>
                  <option value="company">공유 (전직원 공개)</option>
                </select>
              </div>
              <button onClick={addCategory} className="btn-primary text-sm px-4">추가</button>
            </div>
          </div>
          <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-100">
            <div className="text-xs text-amber-700">
              💡 <strong>내 일정</strong>과 <strong>솔루션 공유일정</strong>은 기본 카테고리로 삭제할 수 없습니다.
            </div>
          </div>
        </div>
      )}

      {/* 캘린더 탭 */}
      {tab==='calendar' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1">
              <button onClick={()=>setCurYear(y=>y-1)} className="btn-secondary px-2 py-1.5 text-xs">‹</button>
              <select className="input w-auto text-sm font-medium" value={curYear} onChange={e=>setCurYear(+e.target.value)}>
                {Array.from({length:10},(_,i)=>new Date().getFullYear()-3+i).map(y=>(
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
              <button onClick={()=>setCurYear(y=>y+1)} className="btn-secondary px-2 py-1.5 text-xs">›</button>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={()=>{if(curMonth===0){setCurMonth(11);setCurYear(y=>y-1)}else setCurMonth(m=>m-1)}}
                className="btn-secondary px-2 py-1.5 text-xs">‹</button>
              <select className="input w-auto text-sm font-medium" value={curMonth} onChange={e=>setCurMonth(+e.target.value)}>
                {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
              </select>
              <button onClick={()=>{if(curMonth===11){setCurMonth(0);setCurYear(y=>y+1)}else setCurMonth(m=>m+1)}}
                className="btn-secondary px-2 py-1.5 text-xs">›</button>
            </div>
            <button onClick={()=>{setCurYear(new Date().getFullYear());setCurMonth(new Date().getMonth())}}
              className="btn-secondary px-3 py-1.5 text-sm text-purple-600">오늘</button>
          </div>
          <div className="card overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-200">
              {DAYS.map((d,i)=>(
                <div key={d} className={`text-center text-xs font-semibold py-2.5
                  ${i===0?'text-red-500 bg-red-50':i===6?'text-sky-600 bg-sky-100':'text-gray-600 bg-gray-50'}`}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({length: firstDay}).map((_,i)=>(
                <div key={`e-${i}`} className="min-h-[90px] border-b border-r border-gray-100 bg-gray-50" />
              ))}
              {Array.from({length: daysInMonth}).map((_,i)=>{
                const day = i+1
                const dateStr = `${curYear}-${String(curMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                const dayEvents = getEventsForDate(dateStr)
                const isToday = dateStr === today
                const dow = (firstDay + i) % 7
                const isHol = isHoliday(dateStr)
                const isSun = dow===0; const isSat = dow===6
                return (
                  <div key={day}
                    className={`min-h-[90px] border-b border-r p-1 cursor-pointer transition-colors
                      ${isSat?'bg-sky-100 border-sky-200 hover:bg-sky-200'
                        :isHol||isSun?'bg-red-50 border-red-100 hover:bg-red-100'
                        :'bg-white border-gray-100 hover:bg-purple-50'}`}
                    onClick={()=>openCreate(dateStr)}>
                    <div className="flex items-center gap-1 mb-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0
                        ${isToday?'bg-purple-600 text-white':isSat?'text-sky-600':isHol||isSun?'text-red-500':'text-gray-700'}`}>
                        {day}
                      </div>
                      {HOLIDAY_NAMES[dateStr] && (
                        <span className="text-red-400 text-xs truncate font-medium">{HOLIDAY_NAMES[dateStr]}</span>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0,3).map(ev=>{
                        const lastChecked = typeof window !== 'undefined'
                          ? localStorage.getItem(`cal_checked_${profile?.id}`) || '2000-01-01' : '2000-01-01'
                        const evTime = ev.updated_at || ev.created_at
                        const isNew = evTime && new Date(evTime).getTime() > new Date(lastChecked).getTime() && ev.creator_id !== profile?.id
                        const catInfo = getCatInfo(ev.calendar_type)
                        return (
                          <div key={ev.id}
                            className="text-xs px-1.5 py-0.5 rounded text-white cursor-pointer hover:opacity-80 flex items-center gap-0.5"
                            style={{background:ev.color||'#534AB7'}}
                            onClick={e=>{e.stopPropagation();setShowDetail(ev)}}>
                            {ev.is_locked && <span style={{fontSize:'9px'}}>🔒</span>}
                            <span style={{fontSize:'9px'}}>{catInfo.icon}</span>
                            <span className="truncate flex-1">{ev.title}</span>
                            {isNew && (
                              <span className="flex-shrink-0 rounded px-0.5 font-bold"
                                style={{fontSize:'8px',background:'#ef4444',color:'#facc15',border:'1px solid #dc2626'}}>
                                NEW
                              </span>
                            )}
                          </div>
                        )
                      })}
                      {dayEvents.length>3 && <div className="text-xs text-gray-400 pl-1">+{dayEvents.length-3}개</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* 일정 등록/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={closeForm}>
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-800">{editMode?'일정 수정':'일정 등록'}</div>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 text-xl w-6 h-6 flex items-center justify-center">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">저장 위치</label>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map(cat=>(
                    <button key={cat.id} type="button"
                      onClick={()=>setForm(f=>({...f,calendar_type:cat.id}))}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-left
                        ${form.calendar_type===cat.id?'border-purple-500 bg-purple-50':'border-gray-200 bg-white hover:border-gray-300'}`}>
                      <span className="text-base">{cat.icon}</span>
                      <div>
                        <div className={`text-xs font-semibold ${form.calendar_type===cat.id?'text-purple-700':'text-gray-700'}`}>{cat.name}</div>
                        <div className="text-xs text-gray-400">{cat.scope==='company'?'전직원 공개':'개인 일정'}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">제목 *</label>
                <input className="input" placeholder="일정 제목" value={form.title}
                  onChange={e=>setForm(f=>({...f,title:e.target.value}))} />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={form.all_day}
                    onChange={e=>setForm(f=>({...f,all_day:e.target.checked}))} className="accent-purple-600" />
                  <span className="text-xs text-gray-500">종일</span>
                </label>
                {/* 잠금 옵션 - 작성자만 설정 가능 */}
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={form.is_locked}
                    onChange={e=>setForm(f=>({...f,is_locked:e.target.checked}))} className="accent-red-500" />
                  <span className="text-xs text-gray-500">🔒 하위직급 수정 잠금</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">시작일</label>
                  <input type="date" className="input" value={form.start_date}
                    onChange={e=>setForm(f=>({...f,start_date:e.target.value}))} />
                </div>
                {!form.all_day && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">시작 시간</label>
                    <input type="time" className="input" value={form.start_time}
                      onChange={e=>setForm(f=>({...f,start_time:e.target.value}))} />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">종료일</label>
                  <input type="date" className="input" value={form.end_date}
                    onChange={e=>setForm(f=>({...f,end_date:e.target.value}))} />
                </div>
                {!form.all_day && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">종료 시간</label>
                    <input type="time" className="input" value={form.end_time}
                      onChange={e=>setForm(f=>({...f,end_time:e.target.value}))} />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">장소</label>
                <input className="input" placeholder="장소 (선택)" value={form.location}
                  onChange={e=>setForm(f=>({...f,location:e.target.value}))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">내용</label>
                <textarea className="input resize-none" rows={3} placeholder="일정 내용 (선택)"
                  value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">색상</label>
                <div className="flex gap-2">
                  {EVENT_COLORS.map(c=>(
                    <button key={c.value} onClick={()=>setForm(f=>({...f,color:c.value}))}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${form.color===c.value?'border-gray-800 scale-110':'border-transparent'}`}
                      style={{background:c.value}} title={c.label} />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">
                  참석자 초대 {form.attendeeIds.length>0 && <span className="text-purple-600">({form.attendeeIds.length}명 선택)</span>}
                </label>
                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  {allUsers.filter(u=>u.id!==profile?.id).map(u=>(
                    <label key={u.id}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer border-b border-gray-50 last:border-0 transition-colors
                        ${form.attendeeIds.includes(u.id)?'bg-purple-50':'hover:bg-gray-50'}`}>
                      <input type="checkbox" className="accent-purple-600 flex-shrink-0"
                        checked={form.attendeeIds.includes(u.id)}
                        onChange={e=>setForm(f=>({...f,attendeeIds:e.target.checked?[...f.attendeeIds,u.id]:f.attendeeIds.filter(x=>x!==u.id)}))} />
                      <span className="text-sm font-medium text-gray-800 w-16 flex-shrink-0">{u.name}</span>
                      <span className="text-xs text-gray-500 flex-shrink-0">{u.grade}</span>
                      <span className="text-xs text-gray-300 truncate flex-1">{u.dept}</span>
                      {form.attendeeIds.includes(u.id) && <span className="text-xs text-purple-600 font-medium flex-shrink-0">✓</span>}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={closeForm} className="btn-secondary text-sm">취소</button>
              <button onClick={handleSubmit} className="btn-primary text-sm">{editMode?'수정':'등록'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 일정 상세 모달 */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={()=>setShowDetail(null)}>
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={e=>e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-start gap-3">
              <div className="w-3 h-3 rounded-full mt-1 flex-shrink-0" style={{background:showDetail.color||'#534AB7'}}></div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-base font-semibold text-gray-800">{showDetail.title}</div>
                  {showDetail.is_locked && <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">🔒 잠금</span>}
                  {(()=>{ const c = getCatInfo(showDetail.calendar_type); return (
                    <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{c.icon} {c.name}</span>
                  )})()}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {showDetail.all_day
                    ? `${showDetail.start_at.slice(0,10)} ~ ${showDetail.end_at.slice(0,10)}`
                    : `${showDetail.start_at.slice(0,16).replace('T',' ')} ~ ${showDetail.end_at.slice(11,16)}`}
                </div>
                {showDetail.location && <div className="text-xs text-gray-400 mt-0.5">📍 {showDetail.location}</div>}
              </div>
            </div>
            <div className="p-5 space-y-3">
              {showDetail.description && (
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-1">내용</div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{showDetail.description}</div>
                </div>
              )}
              <div>
                <div className="text-xs font-medium text-gray-500 mb-2">등록자</div>
                <div className="flex items-center gap-2">
                  <Avatar u={showDetail.creator} size={5} />
                  <span className="text-sm text-gray-700">{(showDetail.creator as any)?.name}</span>
                  <span className="text-xs text-gray-400">{(showDetail.creator as any)?.grade}</span>
                </div>
              </div>
              {attendees.filter(a=>a.event_id===showDetail.id).length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-2">참석자</div>
                  <div className="space-y-1.5">
                    {attendees.filter(a=>a.event_id===showDetail.id).map((a:any)=>(
                      <div key={a.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar u={a.user} size={5} />
                          <span className="text-sm text-gray-700">{(a.user as any)?.name}</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full
                          ${a.status==='accepted'?'bg-green-50 text-green-700':a.status==='declined'?'bg-red-50 text-red-700':'bg-amber-50 text-amber-700'}`}>
                          {a.status==='accepted'?'✅ 수락':a.status==='declined'?'❌ 거절':'⏳ 대기'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* 수정 불가 안내 */}
              {!canEdit(showDetail) && editBlockReason(showDetail) && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-base flex-shrink-0">⚠️</span>
                  <p className="text-xs text-amber-700 leading-relaxed">{editBlockReason(showDetail)}</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2 justify-end flex-wrap">
              <button onClick={()=>setShowDetail(null)} className="btn-secondary text-sm">닫기</button>
              {/* 작성자 본인 또는 관리자만 잠금 토글 가능 */}
              {(showDetail.creator_id===profile?.id||profile?.role==='director') && (
                <button onClick={()=>toggleLock(showDetail)}
                  className={`text-sm px-3 py-1.5 rounded-lg border transition-colors
                    ${showDetail.is_locked?'bg-red-50 text-red-600 border-red-200 hover:bg-red-100':'btn-secondary text-gray-500'}`}>
                  {showDetail.is_locked?'🔓 잠금 해제':'🔒 잠금 설정'}
                </button>
              )}
              {canEdit(showDetail) && (
                <button onClick={()=>openEdit(showDetail)} className="btn-secondary text-sm">수정</button>
              )}
              {canDelete(showDetail) && (
                <button onClick={()=>handleDelete(showDetail.id)} className="btn-danger text-sm">삭제</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { GRADE_ORDER, isHoliday } from '@/lib/attendance'

const DAYS = ['일','월','화','수','목','금','토']
const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

const HOLIDAY_NAMES: Record<string,string> = {
  '2026-01-01':'신정', '2026-02-16':'설날연휴', '2026-02-17':'설날',
  '2026-02-18':'설날연휴', '2026-03-01':'삼일절', '2026-05-05':'어린이날',
  '2026-05-25':'부처님오신날', '2026-06-03':'현충일',
  '2026-08-17':'광복절대체', '2026-09-24':'추석연휴', '2026-09-25':'추석',
  '2026-09-26':'추석연휴', '2026-10-05':'개천절대체', '2026-10-09':'한글날',
  '2026-12-25':'성탄절',
}

const EVENT_COLORS = [
  {label:'보라', value:'#534AB7'},
  {label:'파랑', value:'#185FA5'},
  {label:'초록', value:'#0F6E56'},
  {label:'빨강', value:'#A32D2D'},
  {label:'주황', value:'#854F0B'},
  {label:'분홍', value:'#993556'},
]

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
  const [myInvites, setMyInvites] = useState<any[]>([])
  const [tab, setTab] = useState<'calendar'|'invites'>('calendar')

  const [form, setForm] = useState({
    title:'', description:'', start_date:'', start_time:'09:00',
    end_date:'', end_time:'18:00', all_day:false,
    location:'', color:'#534AB7', attendeeIds:[] as string[]
  })

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const { data: users } = await supabase.from('profiles').select('id,name,grade,color,tc,avatar_url').eq('status','active')
    setAllUsers(users||[])
    // 내가 만들었거나 초대받은 이벤트
    const { data: myAtt } = await supabase.from('event_attendees').select('event_id').eq('user_id', session.user.id)
    const attEventIds = (myAtt||[]).map(a=>a.event_id)
    const { data: evs } = await supabase.from('events').select('*, creator:creator_id(name,grade,color,tc)')
      .or(`creator_id.eq.${session.user.id}${attEventIds.length?`,id.in.(${attEventIds.join(',')})`:''}`).order('start_at')
    setEvents(evs||[])
    const { data: atts } = await supabase.from('event_attendees')
      .select('*, user:user_id(id,name,grade,color,tc,avatar_url)')
      .in('event_id', (evs||[]).map(e=>e.id))
    setAttendees(atts||[])
    // 내게 온 초대 (pending)
    const { data: inv } = await supabase.from('event_attendees')
      .select('*, event:event_id(title,start_at,end_at,creator:creator_id(name))')
      .eq('user_id', session.user.id).eq('status','pending')
    setMyInvites(inv||[])
  }, [])

  useEffect(() => { load() }, [load])

  // 달력 날짜 계산
  const firstDay = new Date(curYear, curMonth, 1).getDay()
  const daysInMonth = new Date(curYear, curMonth+1, 0).getDate()
  const today = toLocalDateStr(new Date())

  function getEventsForDate(dateStr: string) {
    return events.filter(e => {
      const s = e.start_at.slice(0,10)
      const en = e.end_at.slice(0,10)
      return s <= dateStr && dateStr <= en
    })
  }

  function canDelete(event: any) {
    if (!profile) return false
    if (event.creator_id === profile.id) return true
    if (profile.role === 'director') return true
    const creatorGrade = GRADE_ORDER[(event.creator as any)?.grade||''] || 99
    const myGrade = GRADE_ORDER[profile.grade||''] || 99
    return myGrade < creatorGrade // 내 직급이 높으면 삭제 가능
  }

  function canEdit(event: any) {
    return event.creator_id === profile?.id || profile?.role === 'director'
  }

  async function handleSubmit() {
    if (!form.title || !form.start_date) return
    const supabase = createClient()
    const startAt = form.all_day ? `${form.start_date}T00:00:00` : `${form.start_date}T${form.start_time}:00`
    const endAt   = form.all_day ? `${form.end_date||form.start_date}T23:59:59` : `${form.end_date||form.start_date}T${form.end_time}:00`

    if (editMode && showDetail) {
      await supabase.from('events').update({
        title:form.title, description:form.description,
        start_at:startAt, end_at:endAt, all_day:form.all_day,
        location:form.location, color:form.color,
      }).eq('id', showDetail.id)
      // 참석자 업데이트
      await supabase.from('event_attendees').delete().eq('event_id', showDetail.id).neq('user_id', profile.id)
      if (form.attendeeIds.length) {
        await supabase.from('event_attendees').upsert(
          form.attendeeIds.map(uid=>({event_id:showDetail.id, user_id:uid, status:'pending'})),
          {onConflict:'event_id,user_id'}
        )
      }
    } else {
      const { data: ev } = await supabase.from('events').insert({
        title:form.title, description:form.description,
        start_at:startAt, end_at:endAt, all_day:form.all_day,
        location:form.location, color:form.color, creator_id:profile.id,
      }).select().single()
      if (ev && form.attendeeIds.length) {
        await supabase.from('event_attendees').insert(
          form.attendeeIds.map(uid=>({event_id:ev.id, user_id:uid, status:'pending'}))
        )
      }
    }
    setShowForm(false); setEditMode(false); setShowDetail(null)
    resetForm(); load()
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
      end_date:selDate||'',end_time:'18:00',all_day:false,location:'',color:'#534AB7',attendeeIds:[]})
  }

  function openCreate(dateStr: string) {
    setSelDate(dateStr)
    setForm(f=>({...f, start_date:dateStr, end_date:dateStr}))
    setEditMode(false); setShowForm(true)
  }

  function openEdit(ev: any) {
    const atts = attendees.filter(a=>a.event_id===ev.id&&a.user_id!==profile?.id).map((a:any)=>a.user_id)
    setForm({
      title:ev.title, description:ev.description||'',
      start_date:ev.start_at.slice(0,10), start_time:ev.start_at.slice(11,16),
      end_date:ev.end_at.slice(0,10), end_time:ev.end_at.slice(11,16),
      all_day:ev.all_day||false, location:ev.location||'', color:ev.color||'#534AB7',
      attendeeIds:atts
    })
    setEditMode(true); setShowDetail(null); setShowForm(true)
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
            <button onClick={()=>setTab('invites')}
              className="flex items-center gap-1.5 btn-secondary text-sm relative">
              📬 초대 응답
              <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{myInvites.length}</span>
            </button>
          )}
          <button onClick={()=>setTab('calendar')} className={tab==='calendar'?'btn-primary text-sm':'btn-secondary text-sm'}>📅 캘린더</button>
        </div>
      </div>

      {/* 초대 응답 탭 */}
      {tab==='invites' && (
        <div className="card">
          <div className="text-sm font-medium text-gray-700 mb-4">📬 받은 일정 초대</div>
          {myInvites.length===0 ? (
            <div className="py-10 text-center text-gray-300 text-sm">대기 중인 초대가 없습니다</div>
          ) : myInvites.map((inv:any)=>(
            <div key={inv.id} className="flex items-center justify-between py-3 border-b border-gray-50">
              <div>
                <div className="text-sm font-medium text-gray-800">{(inv.event as any)?.title}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {(inv.event as any)?.start_at?.slice(0,16).replace('T',' ')} ~
                  {(inv.event as any)?.end_at?.slice(11,16)}
                </div>
                <div className="text-xs text-gray-400">주최: {(inv.event as any)?.creator?.name}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={()=>respondInvite(inv.id,'accepted')}
                  className="btn-secondary text-xs px-3 py-1.5 text-green-700 border-green-200 hover:bg-green-50">✅ 수락</button>
                <button onClick={()=>respondInvite(inv.id,'declined')}
                  className="btn-danger text-xs px-3 py-1.5">❌ 거절</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 캘린더 탭 */}
      {tab==='calendar' && (
        <>
          {/* 연/월 이동 */}
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
            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 border-b border-gray-100">
              {DAYS.map((d,i)=>(
                <div key={d} className={`text-center text-xs font-semibold py-2.5
                  ${i===0?'text-red-400':i===6?'text-blue-400':'text-gray-500'}`}>{d}</div>
              ))}
            </div>
            {/* 날짜 */}
            <div className="grid grid-cols-7">
              {Array.from({length: firstDay}).map((_,i)=>(
                <div key={`empty-${i}`} className="min-h-[90px] border-b border-r border-gray-50 bg-gray-50/50" />
              ))}
              {Array.from({length: daysInMonth}).map((_,i)=>{
                const day = i+1
                const dateStr = `${curYear}-${String(curMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                const dayEvents = getEventsForDate(dateStr)
                const isToday = dateStr === today
                const dow = (firstDay + i) % 7
                const isWeekend = dow===0||dow===6
                return (
                  <div key={day}
                    className={`min-h-[90px] border-b border-r border-gray-50 p-1 cursor-pointer transition-colors
                      ${isWeekend?'bg-gray-50/50':''}
                      hover:bg-purple-50/30`}
                    onClick={()=>openCreate(dateStr)}>
                    <div className="flex items-center gap-1 mb-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0
                        ${isToday?'bg-purple-600 text-white':isHoliday(dateStr)||dow===0?'text-red-400':dow===6?'text-blue-400':'text-gray-600'}`}>
                        {day}
                      </div>
                      {HOLIDAY_NAMES[dateStr] && (
                        <span className="text-red-400 text-xs truncate">{HOLIDAY_NAMES[dateStr]}</span>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0,3).map(ev=>(
                        <div key={ev.id}
                          className="text-xs px-1.5 py-0.5 rounded truncate text-white cursor-pointer hover:opacity-80"
                          style={{background:ev.color||'#534AB7'}}
                          onClick={e=>{e.stopPropagation();setShowDetail(ev)}}>
                          {ev.title}
                        </div>
                      ))}
                      {dayEvents.length>3 && (
                        <div className="text-xs text-gray-400 pl-1">+{dayEvents.length-3}개</div>
                      )}
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-800">{editMode?'일정 수정':'일정 등록'}</div>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">제목 *</label>
                <input className="input" placeholder="일정 제목" value={form.title}
                  onChange={e=>setForm(f=>({...f,title:e.target.value}))} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="allday" checked={form.all_day}
                  onChange={e=>setForm(f=>({...f,all_day:e.target.checked}))} className="accent-purple-600" />
                <label htmlFor="allday" className="text-xs text-gray-500 cursor-pointer">종일</label>
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
                <label className="block text-xs font-medium text-gray-500 mb-2">참석자 초대</label>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {allUsers.filter(u=>u.id!==profile?.id).map(u=>(
                    <label key={u.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" className="accent-purple-600"
                        checked={form.attendeeIds.includes(u.id)}
                        onChange={e=>setForm(f=>({...f,
                          attendeeIds:e.target.checked?[...f.attendeeIds,u.id]:f.attendeeIds.filter(x=>x!==u.id)
                        }))} />
                      <Avatar u={u} />
                      <span className="text-sm text-gray-700">{u.name}</span>
                      <span className="text-xs text-gray-400">{u.grade}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={()=>{setShowForm(false);setEditMode(false);resetForm()}} className="btn-secondary text-sm">취소</button>
              <button onClick={handleSubmit} className="btn-primary text-sm">{editMode?'수정':'등록'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 일정 상세 모달 */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="p-5 border-b border-gray-100 flex items-start gap-3">
              <div className="w-3 h-3 rounded-full mt-1 flex-shrink-0" style={{background:showDetail.color||'#534AB7'}}></div>
              <div className="flex-1">
                <div className="text-base font-semibold text-gray-800">{showDetail.title}</div>
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
                <div className="text-xs font-medium text-gray-500 mb-2">주최자</div>
                <div className="flex items-center gap-2">
                  <Avatar u={showDetail.creator} />
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
                          <Avatar u={a.user} />
                          <span className="text-sm text-gray-700">{(a.user as any)?.name}</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full
                          ${a.status==='accepted'?'bg-green-50 text-green-700':
                            a.status==='declined'?'bg-red-50 text-red-700':'bg-amber-50 text-amber-700'}`}>
                          {a.status==='accepted'?'✅ 수락':a.status==='declined'?'❌ 거절':'⏳ 대기'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={()=>setShowDetail(null)} className="btn-secondary text-sm">닫기</button>
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

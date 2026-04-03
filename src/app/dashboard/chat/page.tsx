'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'

export default function ChatPage() {
  const [profile, setProfile] = useState<any>(null)
  const [rooms, setRooms] = useState<any[]>([])
  const [activeRoom, setActiveRoom] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const supabase = createClient()

  const loadProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const { data: users } = await supabase.from('profiles').select('id,name,color,tc').eq('status','active')
    setAllUsers(users || [])
    return session.user.id
  }, [])

  const loadRooms = useCallback(async (uid: string) => {
    const { data: memberRooms } = await supabase.from('chat_members').select('room_id').eq('user_id', uid)
    if (!memberRooms?.length) { setRooms([]); return }
    const roomIds = memberRooms.map(m=>m.room_id)
    const { data } = await supabase.from('chat_rooms').select('*').in('id', roomIds).order('created_at')
    setRooms(data || [])
  }, [])

  const loadMessages = useCallback(async (roomId: string) => {
    const { data } = await supabase.from('chat_messages')
      .select('*, sender:sender_id(name,color,tc)').eq('room_id', roomId).order('created_at')
    setMessages(data || [])
    const { data: mems } = await supabase.from('chat_members')
      .select('*, user:user_id(id,name,color,tc)').eq('room_id', roomId)
    setMembers(mems || [])
  }, [])

  useEffect(() => {
    loadProfile().then(uid => { if (uid) loadRooms(uid) })
  }, [loadProfile, loadRooms])

  useEffect(() => {
    if (!activeRoom) return
    loadMessages(activeRoom.id)
    const ch = supabase.channel(`room:${activeRoom.id}`)
      .on('postgres_changes', {event:'INSERT', schema:'public', table:'chat_messages', filter:`room_id=eq.${activeRoom.id}`},
        () => loadMessages(activeRoom.id))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [activeRoom, loadMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({behavior:'smooth'})
  }, [messages])

  async function sendMessage() {
    if (!input.trim() || !activeRoom || !profile) return
    await supabase.from('chat_messages').insert({
      room_id: activeRoom.id, sender_id: profile.id, content: input.trim()
    })
    setInput('')
  }

  async function createRoom() {
    if (!newRoomName.trim() || !profile) return
    const { data: room } = await supabase.from('chat_rooms').insert({
      name: newRoomName, created_by: profile.id
    }).select().single()
    if (!room) return
    const memberInserts = [profile.id, ...selectedUsers].map(uid=>({room_id:room.id, user_id:uid}))
    await supabase.from('chat_members').insert(memberInserts)
    await supabase.from('chat_messages').insert({
      room_id: room.id, sender_id: profile.id,
      content: `${profile.name}님이 채팅방을 만들었습니다.`, is_system: true
    })
    setShowCreate(false); setNewRoomName(''); setSelectedUsers([])
    loadRooms(profile.id)
    setActiveRoom(room)
  }

  async function inviteMembers() {
    if (!activeRoom || !selectedUsers.length) return
    for (const uid of selectedUsers) {
      await supabase.from('chat_members').upsert({room_id:activeRoom.id, user_id:uid})
      const u = allUsers.find(u=>u.id===uid)
      await supabase.from('chat_messages').insert({
        room_id: activeRoom.id, sender_id: profile.id,
        content: `${u?.name}님이 초대되었습니다.`, is_system: true
      })
    }
    setShowInvite(false); setSelectedUsers([])
    loadMessages(activeRoom.id)
  }

  async function leaveRoom() {
    if (!activeRoom || !profile || !confirm(`"${activeRoom.name}" 채팅방에서 나가시겠습니까?`)) return
    await supabase.from('chat_messages').insert({
      room_id: activeRoom.id, sender_id: profile.id,
      content: `${profile.name}님이 나갔습니다.`, is_system: true
    })
    await supabase.from('chat_members').delete().eq('room_id', activeRoom.id).eq('user_id', profile.id)
    setActiveRoom(null); loadRooms(profile.id)
  }

  async function deleteRoom() {
    if (!activeRoom || !confirm(`"${activeRoom.name}" 채팅방을 삭제하시겠습니까?`)) return
    await supabase.from('chat_rooms').delete().eq('id', activeRoom.id)
    setActiveRoom(null); loadRooms(profile?.id)
  }

  const notInRoom = allUsers.filter(u=>!members.find(m=>(m.user as any)?.id===u.id))

  return (
    <div className="p-6 h-[calc(100vh-0px)] flex flex-col">
      <h1 className="text-lg font-semibold text-gray-800 mb-3 flex-shrink-0">메시지</h1>
      <div className="flex-1 flex border border-gray-100 rounded-xl overflow-hidden bg-white shadow-sm min-h-0">

        {/* 채팅방 목록 */}
        <div className="w-52 flex-shrink-0 border-r border-gray-100 flex flex-col">
          <div className="p-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">채팅방</span>
            <button onClick={()=>{setShowCreate(true);setSelectedUsers([])}}
              className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-md hover:bg-purple-100">+ 새 채팅방</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {rooms.length === 0 && (
              <div className="p-4 text-xs text-gray-300 text-center">참여 중인 채팅방이 없습니다</div>
            )}
            {rooms.map(r=>(
              <div key={r.id} onClick={()=>setActiveRoom(r)}
                className={`p-3 cursor-pointer border-b border-gray-50 transition-colors
                  ${activeRoom?.id===r.id?'bg-purple-50 border-l-2 border-l-purple-600':'hover:bg-gray-50'}`}>
                <div className="text-xs font-medium text-gray-800 truncate">{r.name}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 채팅 본문 */}
        {!activeRoom ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-2 text-gray-300">
            <div className="text-3xl">💬</div>
            <div className="text-sm">채팅방을 선택하거나 새로 만들어보세요</div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-w-0">
            <div className="p-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-shrink-0">
              <div>
                <div className="text-sm font-semibold text-gray-800">{activeRoom.name}</div>
                <div className="text-xs text-gray-400">{members.map(m=>(m.user as any)?.name).join(', ')} · {members.length}명</div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={()=>{setShowInvite(true);setSelectedUsers([])}} className="btn-secondary text-xs px-2 py-1">+ 초대</button>
                <button onClick={leaveRoom} className="btn-secondary text-xs px-2 py-1">나가기</button>
                <button onClick={deleteRoom} className="btn-danger text-xs px-2 py-1">삭제</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
              {messages.map(m=>{
                const isMe = m.sender_id === profile?.id
                if (m.is_system) return (
                  <div key={m.id} className="text-center text-xs text-gray-300 py-1">{m.content}</div>
                )
                const s = m.sender as any
                return (
                  <div key={m.id} className={`flex flex-col ${isMe?'items-end':'items-start'} max-w-[70%] ${isMe?'self-end':'self-start'}`}>
                    {!isMe && <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{background:s?.color,color:s?.tc}}>{s?.name?.[0]}</div>
                      <span className="text-xs text-gray-400">{s?.name}</span>
                    </div>}
                    <div className={`px-3 py-2 rounded-xl text-sm leading-relaxed
                      ${isMe?'bg-purple-600 text-white rounded-tr-sm':'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>
                      {m.content}
                    </div>
                    <div className="text-xs text-gray-300 mt-0.5">
                      {new Date(m.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-3 border-t border-gray-100 flex gap-2 flex-shrink-0">
              <input className="input flex-1" placeholder="메시지를 입력하세요..." value={input}
                onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}}} />
              <button onClick={sendMessage} className="btn-primary px-4">전송</button>
            </div>
          </div>
        )}
      </div>

      {/* 새 채팅방 모달 */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-5 w-80 shadow-xl">
            <div className="text-sm font-semibold text-gray-800 mb-3">새 채팅방 만들기</div>
            <input className="input mb-3" placeholder="채팅방 이름" value={newRoomName} onChange={e=>setNewRoomName(e.target.value)} />
            <div className="text-xs font-medium text-gray-500 mb-2">참여 멤버 선택</div>
            <div className="max-h-44 overflow-y-auto space-y-1 mb-4">
              {allUsers.filter(u=>u.id!==profile?.id).map(u=>(
                <label key={u.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" className="accent-purple-600" checked={selectedUsers.includes(u.id)}
                    onChange={e=>setSelectedUsers(s=>e.target.checked?[...s,u.id]:s.filter(x=>x!==u.id))} />
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{background:u.color,color:u.tc}}>{u.name[0]}</div>
                  <span className="text-sm text-gray-700">{u.name}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={()=>setShowCreate(false)} className="btn-secondary text-sm">취소</button>
              <button onClick={createRoom} className="btn-primary text-sm">만들기</button>
            </div>
          </div>
        </div>
      )}

      {/* 멤버 초대 모달 */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-5 w-80 shadow-xl">
            <div className="text-sm font-semibold text-gray-800 mb-3">멤버 초대</div>
            <div className="text-xs font-medium text-gray-500 mb-1">현재 멤버</div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {members.map(m=>(
                <span key={m.id} className="flex items-center gap-1 bg-gray-100 text-xs px-2 py-1 rounded-full text-gray-600">
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{background:(m.user as any)?.color,color:(m.user as any)?.tc}}>{(m.user as any)?.name?.[0]}</span>
                  {(m.user as any)?.name}
                </span>
              ))}
            </div>
            <div className="text-xs font-medium text-gray-500 mb-2">초대할 멤버</div>
            {notInRoom.length === 0 ? (
              <div className="text-xs text-gray-300 text-center py-4">초대 가능한 멤버가 없습니다</div>
            ) : (
              <div className="max-h-36 overflow-y-auto space-y-1 mb-4">
                {notInRoom.map(u=>(
                  <label key={u.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" className="accent-purple-600" checked={selectedUsers.includes(u.id)}
                      onChange={e=>setSelectedUsers(s=>e.target.checked?[...s,u.id]:s.filter(x=>x!==u.id))} />
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{background:u.color,color:u.tc}}>{u.name[0]}</div>
                    <span className="text-sm text-gray-700">{u.name}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={()=>setShowInvite(false)} className="btn-secondary text-sm">취소</button>
              <button onClick={inviteMembers} className="btn-primary text-sm">초대</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

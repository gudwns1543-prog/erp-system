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
  const [unreadCounts, setUnreadCounts] = useState<Record<string,number>>({})
  const [input, setInput] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState<{room:string,sender:string,text:string}|null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const loadProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const { data: users } = await supabase.from('profiles').select('id,name,color,tc,avatar_url,dept,grade').eq('status','active')
    setAllUsers(users||[])
    return session.user.id
  }, [])

  const loadRooms = useCallback(async (uid: string) => {
    const { data: memberRooms } = await supabase.from('chat_members').select('room_id').eq('user_id', uid)
    if (!memberRooms?.length) { setRooms([]); return }
    const roomIds = memberRooms.map((m:any) => m.room_id)
    const { data } = await supabase.from('chat_rooms').select('*').in('id', roomIds).order('created_at',{ascending:false})
    const { data: allMembers } = await supabase.from('chat_members')
      .select('room_id, user:user_id(name)').in('room_id', roomIds)
    const roomsWithMembers = (data||[]).map(r => {
      const roomMems = (allMembers||[]).filter((m:any) => m.room_id === r.id)
      const names = roomMems.map((m:any) => (m.user as any)?.name).filter(Boolean).join(', ')
      return {...r, _members: names}
    })
    setRooms(roomsWithMembers)
    const { data: reads } = await supabase.from('chat_reads').select('*').eq('user_id', uid)
    const counts: Record<string,number> = {}
    for (const room of (data||[])) {
      const lastRead = reads?.find((r:any) => r.room_id === room.id)?.last_read_at
      const { count } = await supabase.from('chat_messages')
        .select('*',{count:'exact',head:true}).eq('room_id',room.id).eq('is_system',false)
        .gt('created_at', lastRead || '2000-01-01')
      counts[room.id] = (count||0)
    }
    setUnreadCounts(counts)
  }, [])

  const loadMessages = useCallback(async (roomId: string) => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    const { data } = await supabase.from('chat_messages')
      .select('*, sender:sender_id(name,color,tc,avatar_url)').eq('room_id', roomId).order('created_at')
    const msgs = data || []
    setMessages(msgs)

    const { data: mems } = await supabase.from('chat_members')
      .select('*, user:user_id(id,name,color,tc,avatar_url)').eq('room_id', roomId)
    setMembers(mems||[])

    // 본인 읽음 시간 먼저 upsert
    if (session) {
      await supabase.from('chat_reads').upsert(
        {room_id:roomId, user_id:session.user.id, last_read_at:new Date().toISOString()},
        {onConflict:'room_id,user_id'}
      )
    }

    // upsert 완료 후 같은 클라이언트로 전체 reads 재조회 (본인 포함)
    const { data: reads } = await supabase.from('chat_reads')
      .select('user_id, last_read_at').eq('room_id', roomId)

    const receipts: Record<string,{readers:any[], nonReaders:any[]}> = {}
    for (const msg of msgs) {
      if (msg.is_system) continue
      const readers: any[] = []
      const nonReaders: any[] = []
      const msgTime = new Date(msg.created_at).getTime()
      for (const mem of (mems||[])) {
        const u = mem.user as any
        if (!u || u.id === msg.sender_id) continue  // 발신자 제외
        const read = reads?.find((r:any) => r.user_id === u.id)
        const readTime = read ? new Date(read.last_read_at).getTime() : 0
        if (readTime >= msgTime) {
          readers.push(u)
        } else {
          nonReaders.push(u)
        }
      }
      receipts[msg.id] = { readers, nonReaders }
    }
    setReadReceipts(receipts)
  }, [])

  useEffect(() => {
    loadProfile().then(uid => { if (uid) loadRooms(uid) })
  }, [loadProfile, loadRooms])

  useEffect(() => {
    if (!activeRoom) return
    loadMessages(activeRoom.id)
    const ch = supabase.channel(`room:${activeRoom.id}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages',filter:`room_id=eq.${activeRoom.id}`},
        () => { loadMessages(activeRoom.id) })
      .on('postgres_changes',{event:'UPSERT',schema:'public',table:'chat_reads',filter:`room_id=eq.${activeRoom.id}`},
        () => { loadMessages(activeRoom.id) })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [activeRoom, loadMessages])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({behavior:'smooth'}) }, [messages])

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    if (!profile) return
    const ch = supabase.channel('all-chat-notifications')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages'},
        async (payload: any) => {
          const msg = payload.new
          if (msg.sender_id === profile.id || msg.is_system) return
          const room = rooms.find(r => r.id === msg.room_id)
          if (!room) return
          if (msg.room_id !== activeRoom?.id) {
            setUnreadCounts(prev => ({...prev,[msg.room_id]:(prev[msg.room_id]||0)+1}))
            const { data: sender } = await supabase.from('profiles').select('name').eq('id', msg.sender_id).single()
            const senderName = sender?.name || '누군가'
            setToast({room: room.name, sender: senderName, text: msg.content?.substring(0,40) || '파일을 보냈습니다'})
            setTimeout(() => setToast(null), 4000)
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(`💬 ${room.name} - ${senderName}`, {
                body: msg.content?.substring(0,60) || '파일을 보냈습니다',
                icon: '/favicon.ico'
              })
            }
          } else {
            loadMessages(activeRoom.id)
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile, activeRoom, rooms, loadMessages])

  const [showReadReceipt, setShowReadReceipt] = useState<string|null>(null)
  const [readReceipts, setReadReceipts] = useState<Record<string,{readers:any[], nonReaders:any[]}>>({})

  async function loadReadReceipts(roomId: string, currentMessages: any[]) {
    const supabase2 = createClient()
    // 채팅방 전체 멤버
    const { data: roomMembers } = await supabase2.from('chat_members')
      .select('*, user:user_id(id,name,color,tc,avatar_url)').eq('room_id', roomId)
    // 각 멤버의 마지막 읽은 시간
    const { data: reads } = await supabase2.from('chat_reads')
      .select('user_id, last_read_at').eq('room_id', roomId)

    const receipts: Record<string,{readers:any[], nonReaders:any[]}> = {}
    for (const msg of currentMessages) {
      if (msg.is_system) continue
      const readers: any[] = []
      const nonReaders: any[] = []
      for (const mem of (roomMembers||[])) {
        const u = mem.user as any
        if (!u || u.id === msg.sender_id) continue // 발신자 제외
        const read = reads?.find((r:any) => r.user_id === u.id)
        // last_read_at이 메시지 created_at보다 같거나 이후면 읽은 것
        if (read && read.last_read_at >= msg.created_at) {
          readers.push(u)
        } else {
          nonReaders.push(u)
        }
      }
      receipts[msg.id] = { readers, nonReaders }
    }
    setReadReceipts(receipts)
  }

  async function sendMessage() {
    if (!input.trim() || !activeRoom || !profile) return
    await supabase.from('chat_messages').insert({
      room_id: activeRoom.id, sender_id: profile.id, content: input.trim()
    })
    setInput('')
  }

  async function handleFileUpload(file: File) {
    if (!activeRoom || !profile) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${activeRoom.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('chat-files').upload(path, file)
    if (error) { setUploading(false); return }
    const { data } = supabase.storage.from('chat-files').getPublicUrl(path)
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    await supabase.from('chat_messages').insert({
      room_id: activeRoom.id, sender_id: profile.id,
      content: isImage ? '📷 이미지' : isVideo ? '🎥 동영상' : `📎 ${file.name}`,
      file_url: data.publicUrl, file_type: file.type, file_name: file.name,
    })
    setUploading(false)
  }

  async function createRoom() {
    if (!newRoomName.trim() || !profile) return
    const { data: room } = await supabase.from('chat_rooms').insert({name:newRoomName,created_by:profile.id}).select().single()
    if (!room) return
    await supabase.from('chat_members').insert([profile.id,...selectedUsers].map(uid=>({room_id:room.id,user_id:uid})))
    await supabase.from('chat_messages').insert({room_id:room.id,sender_id:profile.id,content:`${profile.name}님이 채팅방을 만들었습니다.`,is_system:true})
    setShowCreate(false); setNewRoomName(''); setSelectedUsers([])
    loadRooms(profile.id); setActiveRoom(room)
  }

  async function inviteMembers() {
    if (!activeRoom || !selectedUsers.length) return
    for (const uid of selectedUsers) {
      await supabase.from('chat_members').upsert({room_id:activeRoom.id,user_id:uid})
      const u = allUsers.find(u=>u.id===uid)
      await supabase.from('chat_messages').insert({room_id:activeRoom.id,sender_id:profile.id,content:`${u?.name}님이 초대되었습니다.`,is_system:true})
    }
    setShowInvite(false); setSelectedUsers([]); loadMessages(activeRoom.id)
  }

  async function leaveRoom() {
    if (!activeRoom || !profile || !confirm(`"${activeRoom.name}" 에서 나가시겠습니까?`)) return
    await supabase.from('chat_messages').insert({room_id:activeRoom.id,sender_id:profile.id,content:`${profile.name}님이 나갔습니다.`,is_system:true})
    await supabase.from('chat_members').delete().eq('room_id',activeRoom.id).eq('user_id',profile.id)
    setActiveRoom(null); loadRooms(profile.id)
  }

  async function deleteRoom() {
    if (!activeRoom || !confirm(`"${activeRoom.name}" 을 삭제하시겠습니까?`)) return
    await supabase.from('chat_rooms').delete().eq('id',activeRoom.id)
    setActiveRoom(null); loadRooms(profile?.id)
  }

  const Avatar = ({u,size=5}:{u:any,size?:number}) => (
    u?.avatar_url
      ? <img src={u.avatar_url} alt="" className={`w-${size} h-${size} rounded-full object-cover flex-shrink-0`} />
      : <div className={`w-${size} h-${size} rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0`}
          style={{background:u?.color||'#EEEDFE',color:u?.tc||'#3C3489'}}>{u?.name?.[0]}</div>
  )

  const notInRoom = allUsers.filter(u => !members.find(m => (m.user as any)?.id === u.id))
  const totalUnread = Object.values(unreadCounts).reduce((a,b) => a+b, 0)

  return (
    <div className="p-6 h-[calc(100vh-48px)] flex flex-col">
      <style>{`@keyframes slideIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-800">메시지</h1>
        {totalUnread > 0 && (
          <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{totalUnread}</span>
        )}
      </div>
      <div className="flex-1 flex border border-gray-100 rounded-xl overflow-hidden bg-white shadow-sm min-h-0">
        {/* 채팅방 목록 */}
        <div className="w-56 flex-shrink-0 border-r border-gray-100 flex flex-col">
          <div className="p-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">채팅방</span>
            <button onClick={()=>{setShowCreate(true);setSelectedUsers([])}}
              className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-md hover:bg-purple-100">+ 새 채팅방</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {rooms.length===0 && <div className="p-4 text-xs text-gray-300 text-center">채팅방이 없습니다</div>}
            {[...rooms].sort((a,b)=>{
              const ua = unreadCounts[a.id]||0
              const ub = unreadCounts[b.id]||0
              if (ua!==ub) return ub-ua
              return 0
            }).map(r => {
              const unread = unreadCounts[r.id]||0
              return (
                <div key={r.id} onClick={()=>{setActiveRoom(r);setUnreadCounts(p=>({...p,[r.id]:0}))}}
                  className={`p-3 cursor-pointer border-b border-gray-50 transition-colors
                    ${activeRoom?.id===r.id?'bg-purple-50 border-l-2 border-l-purple-600':'hover:bg-gray-50'}`}>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-gray-800 truncate flex-1 mr-1">{r.name}</div>
                    {unread>0 && <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full flex-shrink-0">{unread}</span>}
                  </div>
                  {r._members && (
                    <div className="text-xs text-gray-300 truncate mt-0.5">{r._members}</div>
                  )}
                </div>
              )
            })}
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
              {messages.map(m => {
                const isMe = m.sender_id === profile?.id
                if (m.is_system) return <div key={m.id} className="text-center text-xs text-gray-300 py-1">{m.content}</div>
                const s = m.sender as any
                const receipt = readReceipts[m.id] || { readers: [], nonReaders: [] }
                const { readers, nonReaders } = receipt
                const totalMembers = readers.length + nonReaders.length
                const readCount = readers.length
                return (
                  <div key={m.id} className={`flex flex-col ${isMe?'items-end self-end':'items-start self-start'} max-w-[70%]`}>
                    {!isMe && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <Avatar u={s} size={4} />
                        <span className="text-xs text-gray-400">{s?.name}</span>
                      </div>
                    )}
                    {m.file_url ? (
                      <div className={`rounded-xl px-3 py-2 ${isMe?'bg-purple-600 text-white rounded-tr-sm':'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>
                        {m.file_type?.startsWith('image/') ? (
                          <a href={m.file_url} target="_blank" rel="noreferrer">
                            <img src={m.file_url} alt={m.file_name} className="max-w-[200px] max-h-[200px] rounded-lg object-cover" />
                          </a>
                        ) : m.file_type?.startsWith('video/') ? (
                          <video src={m.file_url} controls className="max-w-[240px] rounded-lg" />
                        ) : (
                          <a href={m.file_url} target="_blank" rel="noreferrer"
                            className={`text-xs flex items-center gap-1 ${isMe?'text-white/90':'text-purple-600'}`}>
                            📎 {m.file_name}
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className={`px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-wrap
                        ${isMe?'bg-purple-600 text-white rounded-tr-sm':'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>
                        {m.content}
                      </div>
                    )}
                    <div className={`flex items-center gap-1.5 mt-0.5 ${isMe?'flex-row-reverse':''}`}>
                      <div className="text-xs text-gray-300">
                        {new Date(m.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}
                      </div>
                      {/* 읽음 표시 - 모든 메시지 */}
                      {totalMembers > 0 && (
                        <div className="relative">
                          <button
                            className="text-xs cursor-pointer hover:opacity-70 transition-opacity"
                            onClick={e=>{
                              e.stopPropagation()
                              setShowReadReceipt(prev => prev===m.id ? null : m.id)
                            }}>
                            {readCount >= totalMembers ? (
                              <span className="text-purple-400 font-medium">읽음</span>
                            ) : readCount === 0 ? (
                              <span className="text-gray-300">안읽음</span>
                            ) : (
                              <span className="text-gray-400">{readCount}/{totalMembers}</span>
                            )}
                          </button>
                          {/* 읽음/안읽음 팝업 */}
                          {showReadReceipt===m.id && (
                            <>
                              {/* 바깥 클릭 시 닫기 오버레이 */}
                              <div className="fixed inset-0 z-40" onClick={()=>setShowReadReceipt(null)} />
                              <div className={`absolute bottom-7 ${isMe?'right-0':'left-0'} bg-white border border-gray-200 rounded-xl shadow-2xl p-3 z-50 min-w-[160px]`}>
                                {readers.length > 0 && (
                                  <div className={nonReaders.length>0?'mb-2 pb-2 border-b border-gray-100':''}>
                                    <div className="text-xs font-semibold text-purple-500 mb-1.5">✅ 읽음 ({readers.length}명)</div>
                                    {readers.map((u:any)=>(
                                      <div key={u?.id} className="flex items-center gap-1.5 py-0.5">
                                        <Avatar u={u} size={4} />
                                        <span className="text-xs text-gray-700">{u?.name}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {nonReaders.length > 0 && (
                                  <div>
                                    <div className="text-xs font-semibold text-gray-400 mb-1.5">⏳ 안읽음 ({nonReaders.length}명)</div>
                                    {nonReaders.map((u:any)=>(
                                      <div key={u?.id} className="flex items-center gap-1.5 py-0.5">
                                        <Avatar u={u} size={4} />
                                        <span className="text-xs text-gray-400">{u?.name}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-3 border-t border-gray-100 flex gap-2 flex-shrink-0 items-end">
              <input type="file" ref={fileInputRef} className="hidden"
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                onChange={e=>{ if(e.target.files?.[0]) handleFileUpload(e.target.files[0]) }} />
              <button onClick={()=>fileInputRef.current?.click()} disabled={uploading}
                className="btn-secondary px-2.5 text-sm flex-shrink-0 h-9" title="파일/이미지 첨부">
                {uploading ? '⏳' : '📎'}
              </button>
              <textarea
                className="input flex-1 resize-none min-h-[36px] max-h-[120px] py-2 leading-5"
                placeholder="메시지를 입력하세요... (Shift+Enter 줄바꿈)"
                value={input}
                rows={1}
                onChange={e=>{
                  setInput(e.target.value)
                  e.target.style.height='auto'
                  e.target.style.height=Math.min(e.target.scrollHeight,120)+'px'
                }}
                onKeyDown={e=>{
                  if(e.key==='Enter' && !e.shiftKey && !e.altKey){
                    e.preventDefault(); sendMessage()
                  }
                  // Shift+Enter 또는 Alt+Enter → 줄바꿈 (기본동작 허용)
                }}
              />
              <button onClick={sendMessage} className="btn-primary px-4 h-9 flex-shrink-0">전송</button>
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
                  <Avatar u={u} size={6} />
                  <span className="text-sm text-gray-700">{u.name}</span>
                  <span className="text-xs text-gray-400">{u.grade}</span>
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
            <div className="flex flex-wrap gap-1.5 mb-3">
              {members.map(m=>(
                <span key={m.id} className="flex items-center gap-1 bg-gray-100 text-xs px-2 py-1 rounded-full text-gray-600">
                  <Avatar u={m.user as any} size={4} />{(m.user as any)?.name}
                </span>
              ))}
            </div>
            <div className="text-xs font-medium text-gray-500 mb-2">초대할 멤버</div>
            {notInRoom.length===0 ? (
              <div className="text-xs text-gray-300 text-center py-4">초대 가능한 멤버가 없습니다</div>
            ) : (
              <div className="max-h-36 overflow-y-auto space-y-1 mb-4">
                {notInRoom.map(u=>(
                  <label key={u.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" className="accent-purple-600" checked={selectedUsers.includes(u.id)}
                      onChange={e=>setSelectedUsers(s=>e.target.checked?[...s,u.id]:s.filter(x=>x!==u.id))} />
                    <Avatar u={u} size={6} />
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

      {/* 토스트 알림 */}
      {toast && (
        <div onClick={()=>{
            const room = rooms.find(r=>r.name===toast.room)
            if (room) { setActiveRoom(room); setUnreadCounts(p=>({...p,[room.id]:0})) }
            setToast(null)
          }}
          style={{position:'fixed',bottom:'24px',right:'24px',zIndex:9999,cursor:'pointer',
            background:'white',border:'1px solid #e5e7eb',borderRadius:'12px',
            padding:'12px 16px',boxShadow:'0 4px 12px rgba(0,0,0,0.15)',
            maxWidth:'280px',animation:'slideIn .2s ease'}}>
          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}>
            <span style={{fontSize:'14px'}}>💬</span>
            <span style={{fontSize:'12px',fontWeight:'600',color:'#534AB7'}}>{toast.room}</span>
            <span style={{fontSize:'11px',color:'#9ca3af',marginLeft:'auto'}}>지금</span>
          </div>
          <div style={{fontSize:'12px',fontWeight:'500',color:'#374151'}}>{toast.sender}</div>
          <div style={{fontSize:'12px',color:'#6b7280',marginTop:'2px',overflow:'hidden',
            textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{toast.text}</div>
        </div>
      )}
    </div>
  )
}

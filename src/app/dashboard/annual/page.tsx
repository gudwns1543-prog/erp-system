'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { sortByGrade, isHoliday, calcLeaveBalance } from '@/lib/attendance'

export default function AnnualPage() {
  const [profile, setProfile] = useState<any>(null)
  const [staff, setStaff] = useState<any[]>([])
  const [leaveData, setLeaveData] = useState<Record<string,any>>({})
  const [tab, setTab] = useState<'all'|'mine'>('mine')
  const [alert, setAlert] = useState('')
  const [editingId, setEditingId] = useState<string|null>(null)
  const [editVal, setEditVal] = useState(0)
  const [addModal, setAddModal] = useState<any>(null)
  const [historyModal, setHistoryModal] = useState<any>(null) // 연차 추가지급 모달
  const [addDays, setAddDays] = useState(0)
  const [addReason, setAddReason] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)

    let targetProfiles: any[] = [p]
    if (p?.role === 'director') {
      const { data: s } = await supabase.from('profiles')
        .select('id,name,grade,dept,annual_leave,join_date,status,color,tc,avatar_url')
        .eq('status','active')
      targetProfiles = s || []
      setStaff(sortByGrade(targetProfiles))
    }

    const targetIds = targetProfiles.map((x:any)=>x.id).filter(Boolean)
    const { data: leaves } = await supabase.from('approvals')
      .select('requester_id,type,start_date,end_date,status')
      .in('requester_id', targetIds.length ? targetIds : [session.user.id])
      .in('type', ['연차','반차(오전)','반차(오후)','반반차'])
      .in('status', ['approved','pending'])

    const map: Record<string,any> = {}
    for (const u of targetProfiles) {
      const rows = (leaves || []).filter((l:any)=>l.requester_id === u.id)
      const bal = calcLeaveBalance(u.join_date, rows, new Date())
      map[u.id] = {
        base: bal.totalHours,
        used: bal.usedHours,
        usedApproved: bal.usedApprovedHours,
        usedPending: bal.usedPendingHours,
        remain: bal.remainingHours,
        grants: bal.validGrants,
        history: rows.map((l:any)=>({ ...l, days: l.type === '연차' ? 8 : l.type === '반반차' ? 2 : 4 }))
      }
    }
    setLeaveData(map)
  }, [])

  useEffect(() => { load() }, [load])

  // 기본 연차 수정 (발생연월차)
  async function saveBaseLeave(userId: string) {
    const supabase = createClient()
    await supabase.from('profiles').update({ annual_leave: editVal }).eq('id', userId)
    setEditingId(null)
    setAlert('기본 연차가 수정되었습니다.')
    load(); setTimeout(() => setAlert(''), 3000)
  }

  // 연차 추가 지급
  async function addExtraLeave() {
    if (!addModal || addDays <= 0) return
    const supabase = createClient()
    const newTotal = (addModal.annual_leave || 0) + addDays  // 시간 단위
    await supabase.from('profiles').update({ annual_leave: newTotal }).eq('id', addModal.id)
    setAddModal(null); setAddDays(0); setAddReason('')
    setAlert(addModal.name + '님에게 ' + addDays + '일 추가 지급 완료')
    load(); setTimeout(() => setAlert(''), 3000)
  }

  const Avatar = ({u}:{u:any}) => (
    u?.avatar_url
      ? <img src={u.avatar_url} className="w-16 h-16 rounded-full object-cover object-top flex-shrink-0" alt="" />
      : <div className="w-16 h-16 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0"
          style={{background:u?.color||'#EEEDFE',color:u?.tc||'#3C3489'}}>{u?.name?.[0]}</div>
  )

  const myData = leaveData[profile?.id] || { used: 0, history: [], grants: [], base: 0, remain: 0 }
  const myBase = myData.base || 0
  const myRemain = myData.remain || 0

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
        <h1 className="text-lg font-semibold text-gray-800">연차 관리 · 결재 신청</h1>
        <a href="/dashboard/leave"
          className="btn-primary text-sm px-4 py-2 inline-flex items-center gap-1">
          📝 새 결재 신청
        </a>
      </div>

      {/* 신청 가능 안내 */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
        <strong>💡 결재 신청</strong> 버튼을 눌러 다음 항목을 신청할 수 있습니다:
        <span className="ml-1">연차 · 반차(오전/오후) · 반반차 · 병가 · 공가 · 외근 · 특별휴가 · 퇴근시간수정</span>
      </div>

      {alert && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{alert}</div>}

      {profile?.role === 'director' && (
        <div className="flex gap-1 border-b border-gray-200 mb-5">
          {[{key:'mine',label:'내 연차'},{key:'all',label:'전체 연차 관리'}].map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key as any)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
                ${tab===t.key?'border-purple-600 text-purple-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* 내 연차 */}
      {(tab==='mine' || profile?.role !== 'director') && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              {label:'발생 연/월차', val:myBase+'H', c:'text-gray-700', sub:'입사일 기준'},
              {label:'사용 연차', val:myData.used+'H', c:'text-amber-600', sub:'올해 사용'},
              {label:'잔여 연차', val:myRemain+'H', c:myRemain<=24?'text-red-600':'text-teal-600', sub:'사용 가능'},
            ].map(m=>(
              <div key={m.label} className="card text-center py-4">
                <div className="text-xs text-gray-400 mb-1">{m.label}</div>
                <div className={`text-3xl font-bold ${m.c}`}>{m.val}</div>
                <div className="text-xs text-gray-400 mt-1">{m.sub}</div>
              </div>
            ))}
          </div>
          {/* 사용률 바 */}
          <div className="card">
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              <span>연차 사용률</span>
              <span>{myBase > 0 ? Math.round(myData.used/myBase*100) : 0}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full transition-all"
                style={{width: myBase > 0 ? Math.min(100, myData.used/myBase*100)+'%' : '0%'}} />
            </div>
          </div>
          {/* 사용 이력 */}
          {myData.history.length > 0 && (
            <div className="card">
              <div className="text-sm font-medium text-gray-700 mb-3">사용 이력 ({new Date().getFullYear()}년)</div>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100">
                  {['유형','시작일','종료일','사용H'].map(h=>(
                    <th key={h} className="pb-2 text-left text-xs font-medium text-gray-400 pr-4">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {myData.history.map((h:any,i:number)=>(
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-1.5 pr-4 text-xs">{h.type}</td>
                      <td className="py-1.5 pr-4 text-xs text-gray-500">{h.start_date}</td>
                      <td className="py-1.5 pr-4 text-xs text-gray-500">{h.end_date}</td>
                      <td className="py-1.5 text-xs font-medium text-purple-600">{h.days}H</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 전체 연차 관리 (관리자) */}
      {tab==='all' && profile?.role==='director' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">
              {['','이름','직급','발생연월차','사용','잔여','사용률',''].map(h=>(
                <th key={h} className="pb-2 text-left text-xs font-medium text-gray-400 pr-4 whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {staff.map(u=>{
                const data = leaveData[u.id] || { used:0, base:0, remain:0 }
                const base = data.base || 0
                const remain = data.remain || 0
                const pct = base > 0 ? Math.round(data.used/base*100) : 0
                return (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-3"><Avatar u={u} /></td>
                    <td className="py-2 pr-4 font-medium">{u.name}</td>
                    <td className="py-2 pr-4 text-gray-500 text-xs">{u.grade}</td>
                    <td className="py-2 pr-4">
                      {editingId === u.id ? (
                        <div className="flex items-center gap-1">
                          <input type="number" className="input w-16 text-xs text-center py-1" value={editVal}
                            onChange={e=>setEditVal(+e.target.value)} />
                          <button onClick={()=>saveBaseLeave(u.id)} className="btn-primary text-xs px-2 py-1">저장</button>
                          <button onClick={()=>setEditingId(null)} className="btn-secondary text-xs px-2 py-1">취소</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{base}H</span>
                          <button onClick={()=>{setEditingId(u.id);setEditVal(base)}}
                            className="text-xs text-gray-400 hover:text-purple-600">✏️</button>
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <button onClick={()=>setHistoryModal({user:u, data})}
                        className="text-amber-600 font-medium hover:underline hover:text-amber-700 cursor-pointer">
                        {data.used}H
                      </button>
                    </td>
                    <td className={`py-2 pr-4 font-semibold ${remain<=24?'text-red-600':'text-teal-600'}`}>{remain}H</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500 rounded-full" style={{width:pct+'%'}} />
                        </div>
                        <span className="text-xs text-gray-400">{pct}%</span>
                      </div>
                    </td>
                    <td className="py-2">
                      <button onClick={()=>{setAddModal(u);setAddDays(0);setAddReason('')}}
                        className="btn-secondary text-xs px-2 py-1 text-green-700 border-green-200 hover:bg-green-50">
                        + 추가지급
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 사용내역 조회 모달 */}
      {historyModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={()=>setHistoryModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-96 p-5" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-gray-800">{historyModal.user.name}님 연차 사용내역</div>
                <div className="text-xs text-gray-400 mt-0.5">올해 총 {historyModal.data.used}H 사용</div>
              </div>
              <button onClick={()=>setHistoryModal(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            {!historyModal.data.history?.length ? (
              <div className="text-center py-8 text-gray-300 text-sm">사용 내역이 없습니다</div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {historyModal.data.history.map((h:any, i:number) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          h.type==='연차'?'bg-red-100 text-red-700':
                          h.type.includes('반차')?'bg-orange-100 text-orange-700':
                          h.type==='반반차'?'bg-yellow-100 text-yellow-700':
                          'bg-gray-100 text-gray-700'}`}>{h.type}</span>
                        <span className="text-xs text-gray-700">
                          {h.start_date}{h.end_date&&h.end_date!==h.start_date?` ~ ${h.end_date}`:''}
                        </span>
                      </div>
                      {h.reason && <div className="text-xs text-gray-400">{h.reason}</div>}
                    </div>
                    <div className="text-sm font-bold text-amber-600 flex-shrink-0 ml-2">-{h.days}H</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 연차 추가지급 모달 */}
      {addModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={()=>setAddModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-80 p-5" onClick={e=>e.stopPropagation()}>
            <div className="text-sm font-semibold text-gray-800 mb-4">
              연차 추가 지급 — {addModal.name}
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-xs text-gray-500 p-2 bg-gray-50 rounded-lg">
                <span>현재 세팅 연차</span>
                <span className="font-semibold">{addModal.annual_leave}H</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">추가 지급H</label>
                <input type="number" className="input" placeholder="0" min="0.5" step="0.5"
                  value={addDays||0} onChange={e=>setAddDays(+e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">사유 (선택)</label>
                <input type="text" className="input" placeholder="예: 장기근속, 포상 등"
                  value={addReason} onChange={e=>setAddReason(e.target.value)} />
              </div>
              {addDays > 0 && (
                <div className="p-2 bg-green-50 rounded-lg text-xs text-green-700">
                  지급 후 세팅 연차: {addModal.annual_leave}H + {addDays}H = <span className="font-bold">{addModal.annual_leave + addDays}H</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={()=>setAddModal(null)} className="btn-secondary flex-1 text-sm">취소</button>
              <button onClick={addExtraLeave} disabled={addDays<=0}
                className="btn-primary flex-1 text-sm disabled:opacity-40">지급하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

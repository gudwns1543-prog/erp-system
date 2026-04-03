'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { sortByGrade } from '@/lib/attendance'

export default function AnnualPage() {
  const [profile, setProfile] = useState<any>(null)
  const [staffList, setStaffList] = useState<any[]>([])
  const [selUserId, setSelUserId] = useState('')
  const [selUserProfile, setSelUserProfile] = useState<any>(null)
  const [leaves, setLeaves] = useState<any[]>([])
  const [allStaffLeaves, setAllStaffLeaves] = useState<any[]>([])
  const [year] = useState(new Date().getFullYear())
  const [viewMode, setViewMode] = useState<'individual'|'all'>('individual')

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)

    if (p?.role === 'director') {
      const { data: sl } = await supabase.from('profiles').select('id,name,annual_leave,join_date,avatar_url,color,tc').eq('status','active')
      setStaffList(sortByGrade(sl||[]))
      if (!selUserId && sl?.[0]) setSelUserId(sl[0].id)

      // 전체 연차 조회
      const { data: allLeaves } = await supabase.from('approvals')
        .select('requester_id,type,start_date,end_date,status')
        .in('type',['연차','반차(오전)','반차(오후)'])
        .eq('status','approved')
        .gte('start_date',`${year}-01-01`)
      const summary = (sl||[]).map((s:any) => {
        const used = (allLeaves||[]).filter((l:any)=>l.requester_id===s.id).reduce((sum:number,l:any)=>{
          if (l.type==='반차(오전)'||l.type==='반차(오후)') return sum+0.5
          const start=new Date(l.start_date),end=new Date(l.end_date)
          return sum+Math.round((end.getTime()-start.getTime())/86400000)+1
        },0)
        return {...s, used, remain: s.annual_leave - used}
      })
      setAllStaffLeaves(summary)
    }

    const targetId = (p?.role==='director'&&selUserId) ? selUserId : session.user.id
    const { data: tp } = await supabase.from('profiles').select('*').eq('id', targetId).single()
    setSelUserProfile(tp)
    const { data: lv } = await supabase.from('approvals')
      .select('*, approver:approver_id(name)')
      .eq('requester_id', targetId)
      .in('type',['연차','반차(오전)','반차(오후)','병가','특별휴가'])
      .gte('start_date',`${year}-01-01`)
      .order('start_date',{ascending:false})
    setLeaves(lv||[])
  }, [selUserId, year])

  useEffect(() => { load() }, [load])

  const usedLeave = leaves.filter((l:any)=>l.status==='approved').reduce((sum:number,l:any)=>{
    if (l.type==='반차(오전)'||l.type==='반차(오후)') return sum+0.5
    if (l.type==='병가'||l.type==='특별휴가') return sum
    const s=new Date(l.start_date),e=new Date(l.end_date)
    return sum+Math.round((e.getTime()-s.getTime())/86400000)+1
  },0)

  const totalLeave = selUserProfile?.annual_leave||0
  const remainLeave = totalLeave - usedLeave
  const usedPct = totalLeave>0?Math.round((usedLeave/totalLeave)*100):0

  const Badge = ({s}:{s:string}) => (
    <span className={s==='pending'?'badge-pending':s==='approved'?'badge-approved':'badge-rejected'}>
      {s==='pending'?'대기':s==='approved'?'승인':'반려'}
    </span>
  )

  const Avatar = ({u}:{u:any}) => (
    u?.avatar_url
      ? <img src={u.avatar_url} alt={u.name} className="w-7 h-7 rounded-full object-cover" />
      : <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
          style={{background:u?.color||'#EEEDFE',color:u?.tc||'#3C3489'}}>{u?.name?.[0]}</div>
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-lg font-semibold text-gray-800">연차 관리</h1>
        <div className="flex gap-2 items-center">
          {profile?.role==='director' && (
            <>
              <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
                <button onClick={()=>setViewMode('individual')}
                  className={`px-3 py-1.5 ${viewMode==='individual'?'bg-purple-600 text-white':'text-gray-500 hover:bg-gray-50'}`}>개별</button>
                <button onClick={()=>setViewMode('all')}
                  className={`px-3 py-1.5 ${viewMode==='all'?'bg-purple-600 text-white':'text-gray-500 hover:bg-gray-50'}`}>전체</button>
              </div>
              {viewMode==='individual' && (
                <select className="input w-auto text-sm" value={selUserId} onChange={e=>setSelUserId(e.target.value)}>
                  {staffList.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </>
          )}
          <span className="text-sm text-gray-400">{year}년</span>
        </div>
      </div>

      {/* 전체 조회 (관리자) */}
      {viewMode==='all' && profile?.role==='director' && (
        <div className="card">
          <div className="text-sm font-medium text-gray-700 mb-3">전직원 연차 현황 ({year}년)</div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">
              {['','이름','총 연차','사용','잔여','사용률'].map(h=>(
                <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-4 text-xs">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {allStaffLeaves.map((s:any)=>(
                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 pr-3"><Avatar u={s} /></td>
                  <td className="py-2 pr-4 font-medium">{s.name}</td>
                  <td className="py-2 pr-4">{s.annual_leave}일</td>
                  <td className="py-2 pr-4 text-red-500">{s.used}일</td>
                  <td className="py-2 pr-4 text-teal-600 font-medium">{s.remain}일</td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden w-20">
                        <div className="h-full bg-purple-600 rounded-full"
                          style={{width:`${s.annual_leave>0?Math.min(Math.round(s.used/s.annual_leave*100),100):0}%`}}></div>
                      </div>
                      <span className="text-xs text-gray-400">
                        {s.annual_leave>0?Math.round(s.used/s.annual_leave*100):0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 개별 조회 */}
      {viewMode==='individual' && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-4">
            {[
              {label:'총 연차',val:totalLeave+'일',sub:`입사일: ${selUserProfile?.join_date||'-'}`,c:'text-gray-800'},
              {label:'사용 연차',val:usedLeave+'일',sub:'승인된 연차 기준',c:'text-red-500'},
              {label:'잔여 연차',val:remainLeave+'일',sub:'사용 가능',c:'text-teal-600'},
            ].map(m=>(
              <div key={m.label} className="card text-center py-4">
                <div className="text-xs text-gray-400 mb-1">{m.label}</div>
                <div className={`text-3xl font-bold ${m.c}`}>{m.val}</div>
                <div className="text-xs text-gray-400 mt-1">{m.sub}</div>
              </div>
            ))}
          </div>
          <div className="card mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">연차 사용률</span>
              <span className="text-sm font-semibold text-purple-600">{usedPct}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-purple-600 rounded-full transition-all" style={{width:`${Math.min(usedPct,100)}%`}}></div>
            </div>
          </div>
          <div className="card">
            <div className="text-sm font-medium text-gray-700 mb-3">{year}년 휴가 이력</div>
            {leaves.length===0 ? (
              <div className="py-10 text-center text-gray-300 text-sm">이력이 없습니다</div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100">
                  {['신청일','유형','기간','일수','상태'].map(h=>(
                    <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-4 text-xs">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {leaves.map((l:any)=>{
                    const s=new Date(l.start_date),e=new Date(l.end_date)
                    const days=l.type==='반차(오전)'||l.type==='반차(오후)'?'0.5일'
                      :l.type==='병가'||l.type==='특별휴가'?'-'
                      :(Math.round((e.getTime()-s.getTime())/86400000)+1)+'일'
                    return (
                      <tr key={l.id} className="border-b border-gray-50">
                        <td className="py-2 pr-4 text-xs text-gray-500">{l.created_at?.slice(0,10)}</td>
                        <td className="py-2 pr-4">{l.type}</td>
                        <td className="py-2 pr-4 text-xs">{l.start_date}{l.end_date!==l.start_date?' ~ '+l.end_date:''}</td>
                        <td className="py-2 pr-4 text-xs font-medium text-purple-600">{days}</td>
                        <td className="py-2"><Badge s={l.status} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { sortByGrade } from '@/lib/attendance'

export default function OrgPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles').select('*').eq('status','active').then(({ data }) => {
      setStaff(sortByGrade(data||[]))
    })
  }, [])

  const byDept: Record<string,any[]> = {}
  staff.forEach(u => {
    const d = u.dept || '기타'
    if (!byDept[d]) byDept[d] = []
    byDept[d].push(u)
  })

  const Card = ({u, large=false}:{u:any, large?:boolean}) => (
    <div onClick={()=>setSelected(u)}
      className={`bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden cursor-pointer
        hover:shadow-md hover:border-purple-200 transition-all group
        ${large?'w-36':'w-28'}`}>
      <div className={`${large?'h-36':'h-28'} bg-gray-50 flex items-center justify-center overflow-hidden`}>
        {u.avatar_url
          ? <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform" />
          : <div className="w-full h-full flex items-center justify-center text-3xl font-bold"
              style={{background:u.color||'#EEEDFE',color:u.tc||'#3C3489'}}>
              {u.name?.[0]}
            </div>
        }
      </div>
      <div className="p-2 text-center">
        <div className={`font-semibold text-gray-800 ${large?'text-sm':'text-xs'}`}>{u.name}</div>
        <div className={`text-gray-400 mt-0.5 ${large?'text-xs':'text-xs'}`}>{u.grade}</div>
        {large && <div className="text-xs text-gray-300 mt-0.5">{u.dept}</div>}
      </div>
    </div>
  )

  const director = staff.find(u => u.role === 'director')
  const others = staff.filter(u => u.role !== 'director')

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-6">조직도</h1>

      {/* 대표/임원 */}
      {director && (
        <div className="flex flex-col items-center mb-8">
          <Card u={director} large />
          <div className="w-px h-8 bg-gray-200 mt-2"></div>
        </div>
      )}

      {/* 부서별 */}
      <div className="space-y-8">
        {Object.entries(byDept).filter(([dept]) => {
          const deptDirector = staff.find(u => u.dept === dept && u.role === 'director')
          return !deptDirector || others.some(u => u.dept === dept)
        }).map(([dept, members]) => {
          const deptMembers = members.filter(u => u.role !== 'director')
          if (!deptMembers.length) return null
          return (
            <div key={dept}>
              <div className="flex items-center gap-3 mb-4">
                <div className="text-xs font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{dept}</div>
                <div className="flex-1 h-px bg-gray-100"></div>
                <div className="text-xs text-gray-300">{deptMembers.length}명</div>
              </div>
              <div className="flex flex-wrap gap-3 pl-4">
                {deptMembers.map(u => <Card key={u.id} u={u} />)}
              </div>
            </div>
          )
        })}
      </div>

      {/* 직원 상세 모달 */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={()=>setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-72 overflow-hidden"
            onClick={e=>e.stopPropagation()}>
            {/* 사진 - 크게 */}
            <div className="h-64 bg-gray-50 flex items-center justify-center overflow-hidden">
              {selected.avatar_url
                ? <img src={selected.avatar_url} alt={selected.name}
                    className="w-full h-full object-cover object-top" />
                : <div className="w-full h-full flex items-center justify-center text-6xl font-bold"
                    style={{background:selected.color||'#EEEDFE',color:selected.tc||'#3C3489'}}>
                    {selected.name?.[0]}
                  </div>
              }
            </div>
            {/* 정보 */}
            <div className="p-5">
              <div className="text-xl font-bold text-gray-800 mb-1">{selected.name}</div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm text-gray-500">{selected.dept}</span>
                <span className="text-gray-300">·</span>
                <span className="text-sm font-medium text-purple-600">{selected.grade}</span>
                {selected.role === 'director' && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">관리자</span>
                )}
              </div>
              <div className="space-y-2 text-sm border-t border-gray-100 pt-3">
                {selected.email && (
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-14 flex-shrink-0">이메일</span>
                    <span className="text-gray-700 text-xs break-all">{selected.email}</span>
                  </div>
                )}
                {selected.tel && (
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-14 flex-shrink-0">연락처</span>
                    <span className="text-gray-700">{selected.tel}</span>
                  </div>
                )}
                {selected.join_date && (
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-14 flex-shrink-0">입사일</span>
                    <span className="text-gray-700">{selected.join_date}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 pb-5">
              <button onClick={()=>setSelected(null)}
                className="btn-secondary w-full text-sm">닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { sortByGrade } from '@/lib/attendance'

export default function OrgPage() {
  const [staff, setStaff] = useState<any[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles').select('*').eq('status','active')
      .then(({data}) => setStaff(sortByGrade(data||[])))
  }, [])

  // 대표/이사 찾기
  const executives = staff.filter(u => ['대표','회장','사장','부사장','전무','상무','이사'].includes(u.grade))
  const others = staff.filter(u => !['대표','회장','사장','부사장','전무','상무','이사'].includes(u.grade))

  // 부서별 그룹핑 (일반 직원)
  const depts = others.reduce((acc:any, u:any) => {
    const d = u.dept || '미배정'
    if (!acc[d]) acc[d] = []
    acc[d].push(u)
    return acc
  }, {})

  const Avatar = ({u}:{u:any}) => (
    u?.avatar_url
      ? <img src={u.avatar_url} alt={u.name} className="w-10 h-10 rounded-full object-cover mx-auto mb-1.5" />
      : <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mx-auto mb-1.5"
          style={{background:u?.color||'#EEEDFE',color:u?.tc||'#3C3489'}}>{u?.name?.[0]}</div>
  )

  const PersonCard = ({u, highlight=false}:{u:any, highlight?:boolean}) => (
    <div className={`text-center p-3 rounded-xl border ${highlight
      ? 'bg-purple-50 border-purple-200 shadow-sm min-w-[100px]'
      : 'bg-white border-gray-100 shadow-sm min-w-[90px]'}`}>
      <Avatar u={u} />
      <div className={`text-xs font-semibold ${highlight?'text-purple-700':'text-gray-800'}`}>{u.name}</div>
      <div className={`text-xs mt-0.5 ${highlight?'text-purple-500':'text-gray-400'}`}>{u.grade}</div>
      <div className="text-xs text-gray-300 mt-0.5">{u.dept}</div>
    </div>
  )

  const DEPT_COLORS: Record<string,{bg:string,border:string,text:string}> = {
    '경영지원팀': {bg:'bg-blue-50',   border:'border-blue-200',   text:'text-blue-700'},
    '영업팀':     {bg:'bg-green-50',  border:'border-green-200',  text:'text-green-700'},
    '개발팀':     {bg:'bg-amber-50',  border:'border-amber-200',  text:'text-amber-700'},
    '운영팀':     {bg:'bg-rose-50',   border:'border-rose-200',   text:'text-rose-700'},
    '미배정':     {bg:'bg-gray-50',   border:'border-gray-200',   text:'text-gray-500'},
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-6">조직도</h1>

      {/* 최상위 - 임원진 */}
      <div className="flex flex-col items-center mb-2">
        <div className="flex gap-4 justify-center flex-wrap">
          {executives.map(u => <PersonCard key={u.id} u={u} highlight />)}
        </div>
      </div>

      {/* 연결선 */}
      {Object.keys(depts).length > 0 && (
        <>
          <div className="flex justify-center">
            <div className="w-px h-8 bg-gray-300"></div>
          </div>
          <div className="flex justify-center mb-1">
            <div className={`h-px bg-gray-300`} style={{width: `${Math.min(Object.keys(depts).length * 180, 800)}px`}}></div>
          </div>
        </>
      )}

      {/* 부서별 */}
      <div className="flex gap-4 justify-center flex-wrap items-start">
        {Object.entries(depts).map(([dept, members]: [string, any]) => {
          const color = DEPT_COLORS[dept] || DEPT_COLORS['미배정']
          return (
            <div key={dept} className="flex flex-col items-center">
              {/* 수직선 */}
              <div className="w-px h-6 bg-gray-300"></div>
              {/* 부서 박스 */}
              <div className={`rounded-xl border ${color.bg} ${color.border} p-3 min-w-[140px]`}>
                <div className={`text-xs font-bold text-center mb-3 ${color.text}`}>{dept}</div>
                <div className="flex flex-col gap-2">
                  {sortByGrade(members).map((u:any) => (
                    <div key={u.id} className="flex items-center gap-2 bg-white rounded-lg p-2 border border-white/80 shadow-sm">
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt={u.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                        : <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{background:u.color||'#EEEDFE',color:u.tc||'#3C3489'}}>{u.name[0]}</div>
                      }
                      <div>
                        <div className="text-xs font-medium text-gray-800">{u.name}</div>
                        <div className="text-xs text-gray-400">{u.grade}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 전체 직원 수 */}
      <div className="mt-8 text-center text-xs text-gray-400">
        총 {staff.length}명 재직 중
      </div>
    </div>
  )
}

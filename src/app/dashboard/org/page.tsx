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

  const executives = staff.filter(u => ['대표','회장','사장','부사장','전무','상무','이사'].includes(u.grade))
  const others = staff.filter(u => !['대표','회장','사장','부사장','전무','상무','이사'].includes(u.grade))

  const depts = others.reduce((acc:any, u:any) => {
    const d = u.dept || '미배정'
    if (!acc[d]) acc[d] = []
    acc[d].push(u)
    return acc
  }, {})

  const DEPT_COLORS: Record<string,{bg:string,border:string,text:string,header:string}> = {
    '경영지원팀': {bg:'bg-blue-50',  border:'border-blue-200',  text:'text-blue-800',  header:'bg-blue-100'},
    '영업팀':     {bg:'bg-green-50', border:'border-green-200', text:'text-green-800', header:'bg-green-100'},
    '개발팀':     {bg:'bg-amber-50', border:'border-amber-200', text:'text-amber-800', header:'bg-amber-100'},
    '운영팀':     {bg:'bg-rose-50',  border:'border-rose-200',  text:'text-rose-800',  header:'bg-rose-100'},
    '미배정':     {bg:'bg-gray-50',  border:'border-gray-200',  text:'text-gray-600',  header:'bg-gray-100'},
  }

  // 사원증 스타일 카드
  const IDCard = ({u, size='md'}:{u:any, size?:'lg'|'md'}) => {
    const isLg = size === 'lg'
    return (
      <div className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden
        ${isLg ? 'w-28' : 'w-24'} flex-shrink-0`}>
        {/* 사진 영역 */}
        <div className={`${isLg?'h-28':'h-24'} bg-gray-100 flex items-center justify-center overflow-hidden`}>
          {u.avatar_url
            ? <img src={u.avatar_url} alt={u.name}
                className="w-full h-full object-cover object-top" />
            : <div className="w-full h-full flex items-center justify-center text-3xl font-bold"
                style={{background:u.color||'#EEEDFE',color:u.tc||'#3C3489'}}>
                {u.name?.[0]}
              </div>
          }
        </div>
        {/* 이름/직급 영역 */}
        <div className="p-1.5 text-center border-t border-gray-100">
          <div className={`font-semibold text-gray-800 truncate ${isLg?'text-sm':'text-xs'}`}>{u.name}</div>
          <div className={`text-gray-400 mt-0.5 ${isLg?'text-xs':'text-xs'}`}>{u.grade}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-8">조직도</h1>

      {/* 임원진 */}
      {executives.length > 0 && (
        <div className="flex flex-col items-center mb-2">
          <div className="flex gap-5 justify-center flex-wrap">
            {executives.map(u => (
              <div key={u.id} className="flex flex-col items-center">
                <IDCard u={u} size="lg" />
                {u.dept && u.dept !== '미배정' && (
                  <div className="mt-1.5 text-xs text-purple-500 font-medium">{u.dept}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 연결선 */}
      {Object.keys(depts).length > 0 && executives.length > 0 && (
        <>
          <div className="flex justify-center my-1">
            <div className="w-px h-8 bg-gray-300"></div>
          </div>
          <div className="flex justify-center">
            <div className="h-px bg-gray-300"
              style={{width:`${Math.min(Object.keys(depts).length * 200, 780)}px`}}></div>
          </div>
        </>
      )}

      {/* 부서별 */}
      <div className="flex gap-5 justify-center flex-wrap items-start mt-1">
        {Object.entries(depts).map(([dept, members]: [string, any]) => {
          const color = DEPT_COLORS[dept] || DEPT_COLORS['미배정']
          return (
            <div key={dept} className="flex flex-col items-center">
              <div className="w-px h-6 bg-gray-300"></div>
              <div className={`rounded-xl border ${color.border} overflow-hidden min-w-[140px]`}>
                {/* 부서 헤더 */}
                <div className={`${color.header} px-3 py-2 text-center`}>
                  <span className={`text-xs font-bold ${color.text}`}>{dept}</span>
                  <span className={`text-xs ml-1 ${color.text} opacity-60`}>{members.length}명</span>
                </div>
                {/* 직원 카드 목록 */}
                <div className={`${color.bg} p-3 flex flex-wrap gap-2 justify-center`}>
                  {sortByGrade(members).map((u:any) => (
                    <IDCard key={u.id} u={u} size="md" />
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-8 text-center text-xs text-gray-400">총 {staff.length}명 재직 중</div>
    </div>
  )
}

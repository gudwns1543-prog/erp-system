'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { GRADE_ORDER, sortByGrade } from '@/lib/attendance'

// 부서별 고유 색상 (최대 12개 부서)
const DEPT_COLORS = [
  '#534AB7','#185FA5','#0F6E56','#A32D2D',
  '#854F0B','#2E7FA3','#6B3FA0','#B5451B',
  '#1A6B45','#7B3F6E','#2C5F8A','#5C6B1A',
]

export default function OrgPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles').select('*').eq('status','active').then(({ data }) => {
      setStaff(sortByGrade(data||[]))
    })
  }, [])

  const directors = staff.filter(u => u.role === 'director')

  // 부서별 그룹 (director 제외, 직급순 정렬)
  const byDept: Record<string,any[]> = {}
  staff.filter(u => u.role !== 'director').forEach(u => {
    const d = u.dept || '기타'
    if (!byDept[d]) byDept[d] = []
    byDept[d].push(u)
  })
  Object.keys(byDept).forEach(d => {
    byDept[d].sort((a,b) => (GRADE_ORDER[a.grade||'']||99) - (GRADE_ORDER[b.grade||'']||99))
  })
  const deptEntries = Object.entries(byDept)

  // 부서별 색상 맵 생성
  const deptColorMap: Record<string,string> = {}
  const allDepts = [...new Set(staff.map(u => u.dept||'기타'))]
  allDepts.forEach((d, i) => { deptColorMap[d] = DEPT_COLORS[i % DEPT_COLORS.length] })

  const getColor = (u: any) => deptColorMap[u.dept||'기타'] || DEPT_COLORS[0]

  const Card = ({u, large=false}: {u:any, large?:boolean}) => {
    const color = getColor(u)
    return (
      <div onClick={()=>setSelected(u)}
        className={`rounded-xl overflow-hidden shadow-sm cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-200 flex-shrink-0 ${large?'w-32':'w-24'}`}
        style={{border:`2px solid ${color}30`}}>
        <div className={`${large?'h-32':'h-24'} flex items-center justify-center overflow-hidden`}
          style={{background:`${color}12`}}>
          {u.avatar_url
            ? <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover object-top" />
            : <div className="w-full h-full flex items-center justify-center text-2xl font-bold"
                style={{background:color,color:'#fff'}}>{u.name?.[0]}</div>
          }
        </div>
        <div className="p-1.5 text-center" style={{background:color}}>
          <div className={`font-bold text-white truncate ${large?'text-xs':'text-xs'}`}>{u.name}</div>
          <div className="text-white/75 text-xs">{u.grade}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-6">조직도</h1>

      {/* 최상단: 임원/대표 */}
      {directors.length > 0 && (
        <div className="flex flex-col items-center mb-6">
          <div className="flex gap-4 justify-center">
            {directors.map(u => <Card key={u.id} u={u} large />)}
          </div>
          {deptEntries.length > 0 && (
            <div className="mt-3 flex flex-col items-center">
              <div className="w-px h-5 bg-gray-300"/>
              <div className="relative w-full flex justify-center">
                <div className="absolute top-0 h-px bg-gray-300"
                  style={{width: `${Math.min(deptEntries.length * 200, 800)}px`}}/>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 부서 병렬 배치 */}
      {deptEntries.length > 0 && (
        <div className="flex gap-6 overflow-x-auto pb-4 justify-center flex-wrap">
          {deptEntries.map(([dept, members]) => (
            <div key={dept}
              className="flex-shrink-0 bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden"
              style={{minWidth:'160px'}}>
              {/* 팀 헤더 */}
              <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600">{dept}</span>
                <span className="text-xs text-gray-300 ml-2">{members.length}명</span>
              </div>
              {/* 팀원 카드 목록 - 직급순 */}
              <div className="p-3 flex flex-col gap-2 items-center">
                {members.map(u => <Card key={u.id} u={u} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 직원 상세 모달 */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={()=>setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-72 overflow-hidden"
            onClick={e=>e.stopPropagation()}>
            <div className="bg-gray-50 flex items-center justify-center p-5"
              style={{minHeight:'220px'}}>
              {selected.avatar_url
                ? <img src={selected.avatar_url} alt={selected.name}
                    className="max-w-full max-h-52 object-contain rounded-xl" />
                : <div className="w-36 h-36 rounded-full flex items-center justify-center text-5xl font-bold"
                    style={{background:getColor(selected),color:'#fff'}}>
                    {selected.name?.[0]}
                  </div>
              }
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-xl font-bold text-gray-800">{selected.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-gray-500">{selected.dept}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-sm font-semibold text-purple-600">{selected.grade}</span>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0
                  ${selected.role==='director'?'bg-purple-100 text-purple-700':'bg-gray-100 text-gray-500'}`}>
                  {selected.role==='director'?'관리자':'직원'}
                </span>
              </div>
              <div className="space-y-2 border-t border-gray-100 pt-3">
                {[['이메일',selected.email],['연락처',selected.tel],['입사일',selected.join_date]]
                  .filter(([,v])=>v).map(([l,v])=>(
                  <div key={String(l)} className="flex gap-3">
                    <span className="text-gray-400 w-14 flex-shrink-0 text-xs">{l}</span>
                    <span className="text-gray-700 text-xs">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 pb-5">
              <button onClick={()=>setSelected(null)} className="btn-secondary w-full text-sm">닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

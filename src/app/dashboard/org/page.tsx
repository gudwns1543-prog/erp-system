'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { GRADE_ORDER, sortByGrade } from '@/lib/attendance'

export default function OrgPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles').select('*').eq('status','active').then(({ data }) => {
      setStaff(sortByGrade(data||[]))
    })
  }, [])

  // 부서별 그룹 (직급순 정렬)
  const byDept: Record<string,any[]> = {}
  staff.forEach(u => {
    const d = u.dept || '기타'
    if (!byDept[d]) byDept[d] = []
    byDept[d].push(u)
  })
  // 각 부서 내 직급순 정렬
  Object.keys(byDept).forEach(d => {
    byDept[d].sort((a,b) => (GRADE_ORDER[a.grade]||99) - (GRADE_ORDER[b.grade]||99))
  })

  // 관리자(director)는 최상단에만 표시 (부서에서 제외)
  const directors = staff.filter(u => u.role === 'director')
  // director를 부서 목록에서 제거
  directors.forEach(dir => {
    const d = dir.dept || '기타'
    if (byDept[d]) {
      byDept[d] = byDept[d].filter(u => u.id !== dir.id)
      if (byDept[d].length === 0) delete byDept[d]
    }
  })
  const deptEntries = Object.entries(byDept)

  // 카드 컴포넌트 - 기존 사원증 스타일 유지
  const Card = ({u}:{u:any}) => {
    const isLg = u.role === 'director'
    const colors = [
      {bg:'#534AB7',tc:'#FFFFFF'},{bg:'#185FA5',tc:'#FFFFFF'},
      {bg:'#0F6E56',tc:'#FFFFFF'},{bg:'#A32D2D',tc:'#FFFFFF'},
      {bg:'#854F0B',tc:'#FFFFFF'},{bg:'#2E7FA3',tc:'#FFFFFF'},
    ]
    const colorIdx = u.name ? u.name.charCodeAt(0) % colors.length : 0
    // DB에 저장된 color가 있으면 사용, 없으면 다채로운 기본 색상
    const cardColor = colors[colorIdx].bg  // 항상 다채로운 색상 사용
    const textColor = colors[colorIdx].tc

    return (
      <div onClick={()=>setSelected(u)}
        className={`rounded-xl overflow-hidden shadow-sm cursor-pointer
          hover:shadow-lg hover:-translate-y-1 transition-all duration-200
          ${isLg ? 'w-36' : 'w-28'} flex-shrink-0`}
        style={{border:`2px solid ${cardColor}20`}}>
        {/* 사진 영역 */}
        <div className={`${isLg?'h-36':'h-28'} flex items-center justify-center overflow-hidden`}
          style={{background:`${cardColor}15`}}>
          {u.avatar_url
            ? <img src={u.avatar_url} alt={u.name}
                className="w-full h-full object-contain" />
            : <div className="w-full h-full flex items-center justify-center text-3xl font-bold"
                style={{background:cardColor,color:textColor}}>
                {u.name?.[0]}
              </div>
          }
        </div>
        {/* 정보 영역 */}
        <div className="p-2 text-center" style={{background:cardColor}}>
          <div className={`font-bold text-white ${isLg?'text-sm':'text-xs'}`}>{u.name}</div>
          <div className="text-white/80 text-xs mt-0.5">{u.grade}</div>
          {isLg && <div className="text-white/60 text-xs">{u.dept}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-6">조직도</h1>

      {/* 최상단: 관리자/임원 */}
      {directors.length > 0 && (
        <div className="flex flex-col items-center mb-2">
          <div className="flex gap-4 justify-center">
            {directors.map(u => <Card key={u.id} u={u} />)}
          </div>
          {/* 연결선 */}
          <div className="flex flex-col items-center mt-2">
            <div className="w-px h-6 bg-gray-300"></div>
            <div className="w-32 h-px bg-gray-300"></div>
            <div className="w-px h-6 bg-gray-300"></div>
          </div>
        </div>
      )}

      {/* 부서별 */}
      <div className="space-y-8 mt-2">
        {deptEntries.map(([dept, members]) => (
          <div key={dept}>
            {/* 부서 헤더 */}
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-gray-200"></div>
              <div className="text-xs font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-full whitespace-nowrap">
                {dept}
              </div>
              <div className="text-xs text-gray-300 whitespace-nowrap">{members.length}명</div>
              <div className="h-px flex-1 bg-gray-200"></div>
            </div>
            {/* 카드 목록 - 직급순 */}
            <div className="flex flex-wrap gap-3 justify-center">
              {members.map(u => <Card key={u.id} u={u} />)}
            </div>
          </div>
        ))}
      </div>

      {/* 직원 상세 모달 */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={()=>setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-72 overflow-hidden"
            onClick={e=>e.stopPropagation()}>
            {/* 사진 - 전체 보이게 (크롭 없음) */}
            <div className="bg-gray-50 flex items-center justify-center p-4"
              style={{minHeight:'220px'}}>
              {selected.avatar_url
                ? <img src={selected.avatar_url} alt={selected.name}
                    className="max-w-full max-h-52 object-contain rounded-lg" />
                : <div className="w-40 h-40 rounded-full flex items-center justify-center text-6xl font-bold"
                    style={{background:selected.color||'#534AB7',color:selected.tc||'#FFFFFF'}}>
                    {selected.name?.[0]}
                  </div>
              }
            </div>
            {/* 정보 */}
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-xl font-bold text-gray-800">{selected.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-gray-500">{selected.dept}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-sm font-medium text-purple-600">{selected.grade}</span>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0
                  ${selected.role==='director'?'bg-purple-100 text-purple-700':'bg-gray-100 text-gray-500'}`}>
                  {selected.role==='director'?'관리자':'직원'}
                </span>
              </div>
              <div className="space-y-2 border-t border-gray-100 pt-3">
                {[
                  ['이메일', selected.email],
                  ['연락처', selected.tel],
                  ['입사일', selected.join_date],
                ].filter(([,v])=>v).map(([l,v])=>(
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

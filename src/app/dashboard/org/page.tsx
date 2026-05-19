'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { GRADE_ORDER } from '@/lib/attendance'
import { sortByOrgAuthority } from '@/lib/org'

const DEPT_COLORS = [
  '#534AB7','#185FA5','#0F6E56','#A32D2D',
  '#854F0B','#2E7FA3','#6B3FA0','#B5451B',
  '#1A6B45','#7B3F6E','#2C5F8A','#5C6B1A',
]

const TEAM_ORDER = ['경영지원팀', '운영팀', '실무팀']
const NAME_ORDER: Record<string, number> = {
  '송영아': 10,
  '박팔주': 20,
  '박형준': 30,
  '박황규': 41,
  '박형규': 41,
  '김재현': 42,
  '박희원': 43,
  '김경세': 44,
}

function sortMembers(a: any, b: any) {
  const oa = typeof a.org_sort === 'number' ? a.org_sort : NAME_ORDER[a.name] || 999
  const ob = typeof b.org_sort === 'number' ? b.org_sort : NAME_ORDER[b.name] || 999
  if (oa !== ob) return oa - ob
  const gradeDiff = (GRADE_ORDER[a.grade || ''] || 99) - (GRADE_ORDER[b.grade || ''] || 99)
  if (gradeDiff !== 0) return gradeDiff
  return String(a.name || '').localeCompare(String(b.name || ''), 'ko')
}

export default function OrgPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles').select('*').eq('status','active').then(({ data }) => {
      setStaff(sortByOrgAuthority(data || []))
    })
  }, [])

  const deptColorMap = useMemo(() => {
    const map: Record<string,string> = {}
    const allDepts = staff.map(u => u.dept || '기타').filter((d, i, arr) => arr.indexOf(d) === i)
    allDepts.forEach((d, i) => { map[d] = DEPT_COLORS[i % DEPT_COLORS.length] })
    return map
  }, [staff])

  const getColor = (u: any) => deptColorMap[u.dept || '기타'] || DEPT_COLORS[0]

  const ceo = staff.find(u => u.name === '송영아')
  const executive = staff.find(u => u.name === '박팔주')
  const hyungjoon = staff.find(u => u.name === '박형준')

  const teamGroups = useMemo(() => {
    const exclude = new Set(['송영아', '박팔주', '박형준'])
    const groups: Record<string, any[]> = {}
    staff.filter(u => !exclude.has(u.name)).forEach(u => {
      const dept = u.dept || '기타'
      if (!groups[dept]) groups[dept] = []
      groups[dept].push(u)
    })
    Object.keys(groups).forEach(dept => groups[dept].sort(sortMembers))
    return Object.entries(groups).sort(([a], [b]) => {
      const ai = TEAM_ORDER.indexOf(a)
      const bi = TEAM_ORDER.indexOf(b)
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      return a.localeCompare(b, 'ko')
    })
  }, [staff])

  const Card = ({u, size='normal'}: {u:any, size?:'large'|'normal'|'small'}) => {
    const color = getColor(u)
    const large = size === 'large'
    const small = size === 'small'
    return (
      <button onClick={()=>setSelected(u)}
        className={`rounded-xl overflow-hidden shadow-sm cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-200 bg-white text-left flex-shrink-0 ${large?'w-36':small?'w-24':'w-28'}`}
        style={{border:`2px solid ${color}35`}}>
        <div className={`${large?'h-36':small?'h-24':'h-28'} flex items-center justify-center overflow-hidden`}
          style={{background:`${color}12`}}>
          {u.avatar_url
            ? <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover object-top" />
            : <div className="w-full h-full flex items-center justify-center text-2xl font-bold"
                style={{background:color,color:'#fff'}}>{u.name?.[0]}</div>
          }
        </div>
        <div className="p-2 text-center" style={{background:color}}>
          <div className="font-bold text-white truncate text-xs">{u.name}</div>
          <div className="text-white/85 text-[11px] truncate">{u.grade}</div>
        </div>
        <div className="px-2 py-1 text-center bg-white">
          <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-600">
            {u.dept || '기타'}
          </span>
        </div>
      </button>
    )
  }

  const Connector = ({wide=false}:{wide?:boolean}) => (
    <div className="flex flex-col items-center w-full" aria-hidden="true">
      <div className="w-px h-6 bg-gray-300" />
      {wide && <div className="h-px bg-gray-300 w-full max-w-3xl" />}
    </div>
  )

  const managementLine = [ceo, executive, hyungjoon].filter(Boolean) as any[]

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-800">조직도</h1>
        <p className="text-xs text-gray-500 mt-1">
          대표 → 이사 → 박형준 과장 중심의 관리 체계와 실제 부서 구성을 함께 표시합니다.
        </p>
      </div>

      <div className="bg-white border border-gray-100 rounded-3xl shadow-sm p-4 sm:p-6 overflow-x-auto">
        <div className="min-w-[620px] flex flex-col items-center">
          <section className="rounded-2xl border border-purple-100 bg-purple-50/40 px-6 py-5 flex flex-col items-center">
            <div className="text-xs font-semibold text-purple-600 mb-4">경영지원팀 / 관리 라인</div>
            <div className="flex flex-col items-center">
              {managementLine.map((u, idx) => (
                <div key={u.id || u.name} className="flex flex-col items-center">
                  {idx > 0 && <div className="w-px h-6 bg-gray-300" />}
                  <Card u={u} size={idx === 0 ? 'large' : 'normal'} />
                </div>
              ))}
            </div>
          </section>

          {teamGroups.length > 0 && <Connector wide />}

          {teamGroups.length > 0 && (
            <div className="flex flex-wrap justify-center gap-6 w-full">
              {teamGroups.map(([dept, members]) => (
                <section key={dept} className="bg-gray-50 border border-gray-100 rounded-2xl min-w-[220px] max-w-[380px] flex-1 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-white flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-gray-700">{dept}</div>
                      <div className="text-[11px] text-gray-400">소속 직원</div>
                    </div>
                    <span className="text-xs text-gray-400">{members.length}명</span>
                  </div>
                  <div className="p-4 flex flex-wrap justify-center gap-3">
                    {members.map(u => <Card key={u.id} u={u} size="small" />)}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 bg-white border border-gray-100 rounded-2xl p-4 text-xs text-gray-500 leading-relaxed">
        <div className="font-semibold text-gray-700 mb-1">조직 운영 기준</div>
        <p>결재·관리 체계는 대표 → 이사 → 박형준 과장 순으로 적용하고, 실무자는 소속 부서와 내부 순서에 따라 표시합니다.</p>
        <p className="mt-1">박희원 대리는 김경세 대리보다 선임으로 정렬되도록 반영했습니다.</p>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={()=>setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-80 overflow-hidden"
            onClick={e=>e.stopPropagation()}>
            <div className="bg-gray-50 flex items-center justify-center p-5" style={{minHeight:'220px'}}>
              {selected.avatar_url
                ? <img src={selected.avatar_url} alt={selected.name} className="max-w-full max-h-52 object-contain rounded-xl" />
                : <div className="w-36 h-36 rounded-full flex items-center justify-center text-5xl font-bold"
                    style={{background:getColor(selected),color:'#fff'}}>{selected.name?.[0]}</div>
              }
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between mb-3 gap-3">
                <div>
                  <div className="text-xl font-bold text-gray-800">{selected.name}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-sm text-gray-500">{selected.dept}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-sm font-semibold text-purple-600">{selected.grade}</span>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${selected.role==='director'?'bg-purple-100 text-purple-700':'bg-gray-100 text-gray-500'}`}>
                  {selected.role==='director'?'관리자':'직원'}
                </span>
              </div>
              <div className="space-y-2 border-t border-gray-100 pt-3">
                {[
                  ['부서', selected.dept], ['직급', selected.grade], ['이메일', selected.email], ['연락처', selected.tel], ['입사일', selected.join_date]
                ].filter(([,v])=>v).map(([l,v])=>(
                  <div key={String(l)} className="flex gap-3">
                    <span className="text-gray-400 w-16 flex-shrink-0 text-xs">{l}</span>
                    <span className="text-gray-700 text-xs break-all">{v}</span>
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

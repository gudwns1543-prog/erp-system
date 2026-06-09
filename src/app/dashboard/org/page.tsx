'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'

const DEPT_COLORS = [
  '#534AB7','#185FA5','#0F6E56','#A32D2D',
  '#854F0B','#2E7FA3','#6B3FA0','#B5451B',
  '#1A6B45','#7B3F6E','#2C5F8A','#5C6B1A',
]

const RANK_ORDER: Record<string, number> = {
  '대표': 1, '대표이사': 1,
  '이사': 2, '전무': 2, '상무': 2,
  '부장': 10,
  '차장': 11,
  '과장': 12,
  '대리': 20,
  '주임': 21,
  '사원': 22,
}

function rankOf(u: any) {
  const grade = String(u?.grade || '')
  for (const [key, rank] of Object.entries(RANK_ORDER)) {
    if (grade.includes(key)) return rank
  }
  return 99
}

function sortPeople(list: any[]) {
  return [...list].sort((a, b) => {
    const ra = rankOf(a)
    const rb = rankOf(b)
    if (ra !== rb) return ra - rb
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'ko')
  })
}

export default function OrgPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles').select('*').eq('status','active').then(({ data }) => {
      setStaff(data || [])
    })
  }, [])

  const deptColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    const allDepts = staff.map(u => u.dept || '기타').filter((d, i, arr) => arr.indexOf(d) === i)
    allDepts.forEach((d, i) => { map[d] = DEPT_COLORS[i % DEPT_COLORS.length] })
    return map
  }, [staff])

  const getColor = (u: any) => deptColorMap[u.dept || '기타'] || DEPT_COLORS[0]

  const directors = sortPeople(staff.filter(u => u.role === 'director' || ['송영아','박팔주'].includes(u.name)))
  const devTeam = sortPeople(staff.filter(u => (u.dept || '') === '개발팀' || u.name === '박형준'))
    .filter(u => !directors.some((d:any) => d.id === u.id))
  const opsTeam = sortPeople(staff.filter(u => (u.dept || '') === '운영팀'))
    .filter(u => !directors.some((d:any) => d.id === u.id) && !devTeam.some((d:any) => d.id === u.id))
  const workTeam = sortPeople(staff.filter(u => (u.dept || '') === '실무팀'))
    .filter(u => !directors.some((d:any) => d.id === u.id) && !devTeam.some((d:any) => d.id === u.id))

  const excludedIds = new Set([...directors, ...devTeam, ...opsTeam, ...workTeam].map(u => u.id))
  const otherByDept: Record<string, any[]> = {}
  staff.filter(u => !excludedIds.has(u.id)).forEach(u => {
    const d = u.dept || '기타'
    if (!otherByDept[d]) otherByDept[d] = []
    otherByDept[d].push(u)
  })
  const otherDeptEntries = Object.entries(otherByDept).map(([dept, members]) => [dept, sortPeople(members)] as [string, any[]])

  const Card = ({ u, large=false }: { u: any, large?: boolean }) => {
    const color = getColor(u)
    return (
      <div
        onClick={() => setSelected(u)}
        className={`rounded-xl overflow-hidden shadow-sm cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-200 flex-shrink-0 ${large ? 'w-36' : 'w-32'}`}
        style={{ border: `2px solid ${color}30` }}
      >
        <div className={`${large ? 'h-36' : 'h-32'} flex items-center justify-center overflow-hidden`} style={{ background: `${color}12` }}>
          {u.avatar_url ? (
            <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover object-top" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl font-bold" style={{ background: color, color: '#fff' }}>{u.name?.[0]}</div>
          )}
        </div>
        <div className="p-2 text-center" style={{ background: color }}>
          <div className="font-bold text-white truncate text-base">{u.name}</div>
          <div className="text-white/80 text-sm">{u.grade}</div>
        </div>
      </div>
    )
  }

  const DeptBox = ({ title, members, align='center' }: { title: string, members: any[], align?: 'center'|'left' }) => {
    if (!members.length) return null
    return (
      <div className="bg-white border border-indigo-100 rounded-2xl shadow-sm overflow-hidden min-w-[280px]">
        <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">{title}</span>
          <span className="text-xs text-gray-400">{members.length}명</span>
        </div>
        <div className={`p-5 flex gap-4 flex-wrap ${align === 'left' ? 'justify-start' : 'justify-center'}`}>
          {sortPeople(members).map((u:any) => <Card key={u.id} u={u} large />)}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-6">조직도</h1>

      <div className="relative overflow-x-auto pb-4">
        <div className="min-w-[980px] mx-auto px-6">
          <div className="flex justify-center">
            <div className="w-[420px]">
              <DeptBox title="경영지원팀" members={directors} />
            </div>
          </div>

          <div className="h-10 flex justify-center">
            <div className="w-px h-full bg-gray-300" />
          </div>

          <div className="grid grid-cols-[1fr_1fr] gap-20 items-center">
            <div className="relative h-full min-h-[130px]">
              <div className="absolute right-0 top-1/2 w-1/2 h-px bg-gray-300" />
            </div>
            <div className="relative">
              <div className="absolute -left-10 top-1/2 w-10 h-px bg-gray-300" />
              <DeptBox title="개발팀" members={devTeam} />
            </div>
          </div>

          <div className="h-10 flex justify-center">
            <div className="w-px h-full bg-gray-300" />
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-8">
            <div className="relative flex justify-end pt-4">
              <div className="absolute right-0 top-0 w-1/2 h-px bg-gray-300" />
              <div className="w-[390px]">
                <DeptBox title="운영팀" members={opsTeam} align="left" />
              </div>
            </div>

            <div className="w-px h-4 bg-gray-300 self-start" />

            <div className="relative flex justify-start pt-4">
              <div className="absolute left-0 top-0 w-1/2 h-px bg-gray-300" />
              <div className="w-[390px]">
                <DeptBox title="실무팀" members={workTeam} align="left" />
              </div>
            </div>
          </div>

          {otherDeptEntries.length > 0 && (
            <div className="mt-10">
              <div className="border-t border-gray-200 pt-6">
                <div className="flex gap-6 justify-center flex-wrap">
                  {otherDeptEntries.map(([dept, members]) => (
                    <div key={dept} className="w-[320px]">
                      <DeptBox title={dept} members={members} align="left" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-72 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-50 flex items-center justify-center p-5" style={{ minHeight: '220px' }}>
              {selected.avatar_url ? (
                <img src={selected.avatar_url} alt={selected.name} className="max-w-full max-h-52 object-contain rounded-xl" />
              ) : (
                <div className="w-36 h-36 rounded-full flex items-center justify-center text-5xl font-bold" style={{ background: getColor(selected), color: '#fff' }}>
                  {selected.name?.[0]}
                </div>
              )}
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
                <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${selected.role==='director'?'bg-purple-100 text-purple-700':'bg-gray-100 text-gray-500'}`}>
                  {selected.role==='director' ? '관리자' : '직원'}
                </span>
              </div>
              <div className="space-y-2 border-t border-gray-100 pt-3">
                {[['이메일', selected.email], ['연락처', selected.tel], ['입사일', selected.join_date]]
                  .filter(([,v]) => v)
                  .map(([l, v]) => (
                    <div key={String(l)} className="flex gap-3">
                      <span className="text-gray-400 w-14 flex-shrink-0 text-xs">{l}</span>
                      <span className="text-gray-700 text-xs">{v}</span>
                    </div>
                  ))}
              </div>
            </div>
            <div className="px-5 pb-5">
              <button onClick={() => setSelected(null)} className="btn-secondary w-full text-sm">닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { GRADE_ORDER } from '@/lib/attendance'

const DEPT_COLORS = [
  '#534AB7','#185FA5','#0F6E56','#A32D2D',
  '#854F0B','#2E7FA3','#6B3FA0','#B5451B',
  '#1A6B45','#7B3F6E','#2C5F8A','#5C6B1A',
]

const TEAM_ORDER = ['운영팀', '실무팀', '기타']
const NAME_ORDER: Record<string, number> = {
  '송영아': 10,
  '박팔주': 20,
  '박형준': 30,
  '박황규': 41,
  '박형규': 41,
  '김덕규': 42,
  '김경세': 43,
  '김재현': 44,
}

function sortMembers(a: any, b: any) {
  const oa = typeof a.org_sort === 'number' ? a.org_sort : NAME_ORDER[a.name] || 999
  const ob = typeof b.org_sort === 'number' ? b.org_sort : NAME_ORDER[b.name] || 999
  if (oa !== ob) return oa - ob
  const gradeDiff = (GRADE_ORDER[a.grade || ''] || 99) - (GRADE_ORDER[b.grade || ''] || 99)
  if (gradeDiff !== 0) return gradeDiff
  return String(a.name || '').localeCompare(String(b.name || ''), 'ko')
}

function line(className = '') {
  return <div className={`bg-gray-300 ${className}`} aria-hidden="true" />
}

export default function OrgPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles').select('*').eq('status','active').then(({ data }) => {
      setStaff((data || []).sort(sortMembers))
    })
  }, [])

  const ceo = staff.find(u => u.name === '송영아')
  const executive = staff.find(u => u.name === '박팔주')
  const hyungjoon = staff.find(u => u.name === '박형준')

  const displayDept = (u: any) => {
    if (u?.name === '송영아' || u?.name === '박팔주') return '경영지원팀'
    if (u?.name === '박형준') return '개발팀'
    return u?.dept || '기타'
  }

  const deptColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    const allDepts = staff.map(displayDept).filter((d, i, arr) => arr.indexOf(d) === i)
    allDepts.forEach((d, i) => { map[d] = DEPT_COLORS[i % DEPT_COLORS.length] })
    return map
  }, [staff])

  const getColor = (u: any) => deptColorMap[displayDept(u)] || DEPT_COLORS[0]

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

  const Card = ({ u, large = false }: { u: any, large?: boolean }) => {
    const color = getColor(u)
    return (
      <button
        onClick={() => setSelected({...u, dept: displayDept(u)})}
        className={`${large ? 'w-40' : 'w-36'} rounded-2xl overflow-hidden shadow-sm cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-200 bg-white text-left flex-shrink-0`}
        style={{ border: `2px solid ${color}35` }}
      >
        <div className={`${large ? 'h-44' : 'h-36'} flex items-center justify-center overflow-hidden`} style={{ background: `${color}10` }}>
          {u.avatar_url
            ? <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover object-top" />
            : <div className="w-full h-full flex items-center justify-center text-4xl font-bold" style={{ background: color, color: '#fff' }}>{u.name?.[0]}</div>}
        </div>
        <div className="p-3 text-center" style={{ background: color }}>
          <div className="font-bold text-white truncate text-base">{u.name}</div>
          <div className="text-white/90 text-sm truncate mt-0.5">{u.grade}</div>
        </div>
      </button>
    )
  }

  const GroupBox = ({ title, count, children, className = '' }: any) => (
    <section className={`bg-gray-50 border border-[#cfcdf6] rounded-2xl overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-gray-100 bg-white flex items-center justify-between">
        <div className="text-sm font-bold text-gray-800">{title}</div>
        {typeof count === 'number' ? <span className="text-xs text-gray-400">{count}명</span> : <span />}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-800">조직도</h1>
        <p className="text-xs text-gray-500 mt-1">경영지원팀, 개발팀 협업 포지션, 운영/실무팀을 분리 표시합니다.</p>
      </div>

      <div className="bg-white border border-gray-100 rounded-3xl shadow-sm p-4 sm:p-6 overflow-x-auto">
        <div className="min-w-[920px] flex flex-col items-center">
          <GroupBox title="경영지원팀" className="w-[620px]">
            <div className="flex justify-center gap-16 w-full">
              {ceo && <Card u={{...ceo, dept:'경영지원팀'}} large />}
              {executive && <Card u={{...executive, dept:'경영지원팀'}} large />}
            </div>
          </GroupBox>

          {hyungjoon && (
            <>
              <div className="flex flex-col items-center my-4">{line('w-px h-6')}</div>
              <GroupBox title="개발팀 · 외부 협업" count={1} className="w-[380px] bg-blue-50/40">
                <div className="flex flex-col items-center gap-2">
                  <Card u={{...hyungjoon, dept:'개발팀'}} />
                  <div className="text-[11px] text-gray-500 text-center leading-relaxed">
                    퇴사 후 간헐적으로 개발·업무 보조를 수행하는 별도 협업 포지션입니다.<br />
                    운영팀/실무팀 일반 직원 라인과 분리 표시합니다.
                  </div>
                </div>
              </GroupBox>
            </>
          )}

          {teamGroups.length > 0 && (
            <>
              <div className="flex flex-col items-center my-4">
                {line('w-px h-6')}
                {line('w-[340px] h-px')}
              </div>
              <div className="grid grid-cols-2 gap-8 w-full max-w-[820px] items-start">
                {teamGroups.map(([dept, members]) => (
                  <GroupBox key={dept} title={dept} count={members.length}>
                    <div className="flex flex-wrap justify-center gap-4">
                      {members.map((u: any) => <Card key={u.id} u={u} />)}
                    </div>
                  </GroupBox>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-80 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-50 flex items-center justify-center p-5" style={{ minHeight: '220px' }}>
              {selected.avatar_url
                ? <img src={selected.avatar_url} alt={selected.name} className="max-w-full max-h-52 object-contain rounded-xl" />
                : <div className="w-36 h-36 rounded-full flex items-center justify-center text-5xl font-bold" style={{ background: getColor(selected), color: '#fff' }}>{selected.name?.[0]}</div>}
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
                <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${selected.role === 'director' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                  {selected.role === 'director' ? '관리자' : '직원'}
                </span>
              </div>
              <div className="space-y-2 border-t border-gray-100 pt-3">
                {[
                  ['부서', selected.dept],
                  ['직급', selected.grade],
                  ['이메일', selected.email],
                  ['연락처', selected.tel],
                  ['입사일', selected.join_date],
                ].filter(([, v]) => v).map(([l, v]) => (
                  <div key={String(l)} className="flex gap-3">
                    <span className="text-gray-400 w-16 flex-shrink-0 text-xs">{l}</span>
                    <span className="text-gray-700 text-xs break-all">{v}</span>
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

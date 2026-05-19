'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { GRADE_ORDER } from '@/lib/attendance'
import { AUTHORITY_BADGE_CLASS, getAuthorityLabel, getAuthorityRole, getOrgLevel, sortByOrgAuthority } from '@/lib/org'

const DEPT_COLORS = [
  '#534AB7','#185FA5','#0F6E56','#A32D2D',
  '#854F0B','#2E7FA3','#6B3FA0','#B5451B',
  '#1A6B45','#7B3F6E','#2C5F8A','#5C6B1A',
]

function roleDescription(role: string) {
  if (role === 'ceo') return '회사 전체 의사결정 최상위 책임자'
  if (role === 'executive_admin') return '실질 운영·결재 최종관리자'
  if (role === 'manager_admin') return '현장·실무 하위관리자'
  return '실무 담당자'
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

  const ceo = staff.find(u => getAuthorityRole(u) === 'ceo')
  const executiveAdmin = staff.find(u => getAuthorityRole(u) === 'executive_admin')
  const managerAdmins = staff.filter(u => getAuthorityRole(u) === 'manager_admin')
  const workers = staff.filter(u => getAuthorityRole(u) === 'staff')

  const workersByManager: Record<string, any[]> = {}
  workers.forEach(u => {
    const key = u.manager_id || managerAdmins[0]?.id || 'no-manager'
    if (!workersByManager[key]) workersByManager[key] = []
    workersByManager[key].push(u)
  })
  Object.keys(workersByManager).forEach(key => {
    workersByManager[key].sort((a,b) => {
      const g = (GRADE_ORDER[a.grade||'']||99) - (GRADE_ORDER[b.grade||'']||99)
      if (g !== 0) return g
      return String(a.name || '').localeCompare(String(b.name || ''), 'ko')
    })
  })

  const Card = ({u, size='normal'}: {u:any, size?:'large'|'normal'|'small'}) => {
    const color = getColor(u)
    const role = getAuthorityRole(u)
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
          <div className="text-white/80 text-[11px] truncate">{u.grade}</div>
        </div>
        <div className="px-2 py-1 text-center bg-white">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${AUTHORITY_BADGE_CLASS[role] || AUTHORITY_BADGE_CLASS.staff}`}>
            {getAuthorityLabel(u)}
          </span>
        </div>
      </button>
    )
  }

  const Connector = ({wide=false}:{wide?:boolean}) => (
    <div className="flex flex-col items-center" aria-hidden="true">
      <div className="w-px h-6 bg-gray-300" />
      {wide && <div className="h-px bg-gray-300 w-full max-w-3xl" />}
    </div>
  )

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-800">조직도</h1>
        <p className="text-xs text-gray-500 mt-1">
          대표 → 최종관리자 → 하위관리자 → 실무자 순으로 실제 경영·결재 체계를 반영합니다.
        </p>
      </div>

      <div className="bg-white border border-gray-100 rounded-3xl shadow-sm p-4 sm:p-6 overflow-x-auto">
        <div className="min-w-[620px] flex flex-col items-center">
          {ceo && <Card u={ceo} size="large" />}

          {ceo && executiveAdmin && <Connector />}
          {executiveAdmin && <Card u={executiveAdmin} size="large" />}

          {executiveAdmin && managerAdmins.length > 0 && <Connector wide />}
          {managerAdmins.length > 0 && (
            <div className="flex flex-wrap justify-center gap-5">
              {managerAdmins.map(u => <Card key={u.id} u={u} />)}
            </div>
          )}

          {managerAdmins.length > 0 && workers.length > 0 && <Connector wide />}
          {managerAdmins.length > 0 && (
            <div className="flex flex-wrap justify-center gap-6 w-full">
              {managerAdmins.map(manager => {
                const members = workersByManager[manager.id] || []
                return (
                  <section key={manager.id} className="bg-gray-50 border border-gray-100 rounded-2xl min-w-[220px] max-w-[360px] flex-1 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 bg-white flex items-center justify-between">
                      <div>
                        <div className="text-xs text-gray-400">하위관리자</div>
                        <div className="text-sm font-bold text-gray-700">{manager.name} {manager.grade}</div>
                      </div>
                      <span className="text-xs text-gray-400">{members.length}명</span>
                    </div>
                    <div className="p-4 flex flex-wrap justify-center gap-3">
                      {members.length > 0
                        ? members.map(u => <Card key={u.id} u={u} size="small" />)
                        : <div className="text-xs text-gray-400 py-6">배정된 실무자가 없습니다.</div>
                      }
                    </div>
                  </section>
                )
              })}
              {workersByManager['no-manager']?.length > 0 && (
                <section className="bg-gray-50 border border-gray-100 rounded-2xl min-w-[220px] max-w-[360px] flex-1 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-white flex items-center justify-between">
                    <div className="text-sm font-bold text-gray-700">미배정 실무자</div>
                    <span className="text-xs text-gray-400">{workersByManager['no-manager'].length}명</span>
                  </div>
                  <div className="p-4 flex flex-wrap justify-center gap-3">
                    {workersByManager['no-manager'].map(u => <Card key={u.id} u={u} size="small" />)}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
        {(['ceo','executive_admin','manager_admin','staff'] as const).map(key => (
          <div key={key} className="bg-white border border-gray-100 rounded-xl p-3">
            <span className={`inline-block rounded-full px-2 py-0.5 font-semibold ${AUTHORITY_BADGE_CLASS[key]}`}>{getAuthorityLabel({authority_role:key})}</span>
            <p className="text-gray-500 mt-2">{roleDescription(key)}</p>
          </div>
        ))}
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
                <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${AUTHORITY_BADGE_CLASS[getAuthorityRole(selected)] || AUTHORITY_BADGE_CLASS.staff}`}>
                  {getAuthorityLabel(selected)}
                </span>
              </div>
              <div className="space-y-2 border-t border-gray-100 pt-3">
                {[
                  ['조직 단계', `${getOrgLevel(selected)}단계`],
                  ['이메일', selected.email], ['연락처', selected.tel], ['입사일', selected.join_date]
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

'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { sortByGrade, formatWon } from '@/lib/attendance'

async function uploadAvatar(file: File, userId: string) {
  const supabase = createClient()
  const ext = file.name.split('.').pop()
  const path = `avatars/${userId}.${ext}`
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
  if (error) return null
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return data.publicUrl + '?t=' + Date.now()
}

export default function HrmPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [salaries, setSalaries] = useState<any[]>([])
  const [tab, setTab] = useState<'info'|'salary'>('info')
  const [viewing, setViewing] = useState<any>(null)
  const [editing, setEditing] = useState<any>(null)
  const [alert, setAlert] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: s } = await supabase.from('profiles').select('*').eq('status','active')
    setStaff(sortByGrade(s||[]))
    const { data: sal } = await supabase.from('salary_info').select('*')
    setSalaries(sal||[])
  }, [])

  useEffect(() => { load() }, [load])

  async function saveInfo() {
    if (!editing) return
    let avatarUrl = editing.avatar_url
    if (editing._newFile) {
      const url = await uploadAvatar(editing._newFile, editing.id)
      if (url) avatarUrl = url
    }
    const supabase = createClient()
    await supabase.from('profiles').update({
      name: editing.name, dept: editing.dept, grade: editing.grade,
      role: editing.role, join_date: editing.join_date, gender: editing.gender,
      birth_date: editing.birth_date, tel: editing.tel, address: editing.address,
      annual_leave: editing.annual_leave, avatar_url: avatarUrl, status: editing.status,
    }).eq('id', editing.id)
    setAlert('저장되었습니다.')
    setEditing(null)
    load()
    setTimeout(()=>setAlert(''), 3000)
  }

  async function saveSalary(userId: string, data: any) {
    const supabase = createClient()
    await supabase.from('salary_info').upsert({user_id:userId,...data},{onConflict:'user_id'})
    setAlert('급여 정보 저장 완료')
    load()
    setTimeout(()=>setAlert(''), 3000)
  }

  const Avatar = ({u,size=10}:{u:any,size?:number}) => (
    u?.avatar_url
      ? <img src={u.avatar_url} alt="" className={`w-${size} h-${size} rounded-full object-cover flex-shrink-0`} />
      : <div className={`w-${size} h-${size} rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0`}
          style={{background:u?.color||'#EEEDFE',color:u?.tc||'#3C3489'}}>{u?.name?.[0]}</div>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">인사정보 관리</h1>
      {alert && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{alert}</div>}

      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {(['info','salary'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${tab===t?'border-purple-600 text-purple-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t==='info'?'인사 정보':'계약연봉 관리'}
          </button>
        ))}
      </div>

      {/* 인사정보 탭 */}
      {tab==='info' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">
              {['사진','이름','부서','직급','입사일','성별','연락처','권한',''].map(h=>(
                <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-3 text-xs whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {staff.map(u=>(
                <tr key={u.id}
                  onClick={()=>setViewing(u)}
                  className="border-b border-gray-50 hover:bg-purple-50 cursor-pointer transition-colors">
                  <td className="py-2 pr-3"><Avatar u={u} size={8} /></td>
                  <td className="py-2 pr-3 font-medium">{u.name}</td>
                  <td className="py-2 pr-3 text-gray-500 text-xs">{u.dept}</td>
                  <td className="py-2 pr-3">{u.grade}</td>
                  <td className="py-2 pr-3 text-gray-500 text-xs">{u.join_date}</td>
                  <td className="py-2 pr-3 text-gray-500 text-xs">{u.gender||'-'}</td>
                  <td className="py-2 pr-3 text-gray-500 text-xs">{u.tel||'-'}</td>
                  <td className="py-2 pr-3">
                    <span className={u.role==='director'?'badge-pending':'badge-work'}>
                      {u.role==='director'?'관리자':'직원'}
                    </span>
                  </td>
                  <td className="py-2">
                    <button onClick={e=>{e.stopPropagation();setEditing({...u})}}
                      className="btn-secondary text-xs px-2 py-1">수정</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 계약연봉 탭 */}
      {tab==='salary' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">
              {['사진','이름','직급','계약연봉','부양가족','식대','교통비','통신비','시간단가','편집'].map(h=>(
                <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-3 text-xs whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {staff.filter(u=>u.status==='active').map(u=>{
                const sal = salaries.find(s=>s.user_id===u.id)
                const rate = sal ? Math.round(sal.annual/12/209) : 0
                return (
                  <SalaryRow key={u.id} u={u} sal={sal} rate={rate}
                    onSave={saveSalary} Avatar={Avatar} />
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 직원 조회 모달 */}
      {viewing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={()=>setViewing(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-96 max-h-[90vh] overflow-y-auto"
            onClick={e=>e.stopPropagation()}>
            {/* 사진 */}
            <div className="h-56 bg-gray-50 flex items-center justify-center overflow-hidden rounded-t-2xl">
              {viewing.avatar_url
                ? <img src={viewing.avatar_url} alt={viewing.name}
                    className="max-w-full max-h-56 object-contain" />
                : <div className="w-40 h-40 rounded-full flex items-center justify-center text-6xl font-bold"
                    style={{background:viewing.color||'#EEEDFE',color:viewing.tc||'#3C3489'}}>
                    {viewing.name?.[0]}
                  </div>
              }
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-xl font-bold text-gray-800">{viewing.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-gray-500">{viewing.dept}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-sm font-semibold text-purple-600">{viewing.grade}</span>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0
                  ${viewing.role==='director'?'bg-purple-100 text-purple-700':'bg-gray-100 text-gray-500'}`}>
                  {viewing.role==='director'?'관리자':'직원'}
                </span>
              </div>
              {/* 전체 정보 */}
              <div className="space-y-2.5 border-t border-gray-100 pt-4">
                {[
                  ['이메일', viewing.email],
                  ['연락처', viewing.tel],
                  ['입사일', viewing.join_date],
                  ['생년월일', viewing.birth_date],
                  ['성별', viewing.gender],
                  ['주소', viewing.address],
                  ['잔여연차', viewing.annual_leave != null ? viewing.annual_leave+'일' : null],
                  ['상태', viewing.status==='active'?'재직중':'퇴직'],
                ].filter(([,v])=>v!=null&&v!=='').map(([l,v])=>(
                  <div key={String(l)} className="flex gap-4">
                    <span className="text-xs text-gray-400 w-16 flex-shrink-0 pt-0.5">{l}</span>
                    <span className="text-sm text-gray-800 flex-1">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={()=>{setViewing(null);setEditing({...viewing})}}
                className="btn-secondary flex-1 text-sm">수정</button>
              <button onClick={()=>setViewing(null)}
                className="btn-primary flex-1 text-sm">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 수정 모달 - 팝업으로 */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={()=>setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={e=>e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="text-base font-semibold text-gray-800">직원 정보 수정 — {editing.name}</div>
              <button onClick={()=>setEditing(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-5">
              {/* 사진 */}
              <div className="flex items-center gap-5 mb-5 pb-5 border-b border-gray-100">
                <div className="w-24 h-24 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0 flex items-center justify-center">
                  {editing._preview || editing.avatar_url
                    ? <img src={editing._preview||editing.avatar_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-3xl font-bold"
                        style={{background:editing.color||'#EEEDFE',color:editing.tc||'#3C3489'}}>{editing.name?.[0]}</div>
                  }
                </div>
                <div>
                  <input type="file" ref={fileRef} className="hidden" accept="image/*"
                    onChange={e=>{
                      const f = e.target.files?.[0]
                      if (f) setEditing((p:any)=>({...p,_newFile:f,_preview:URL.createObjectURL(f)}))
                    }} />
                  <button onClick={()=>fileRef.current?.click()} className="btn-secondary text-xs px-3 py-1.5">
                    사진 변경
                  </button>
                  <div className="text-xs text-gray-400 mt-1">JPG, PNG 권장</div>
                </div>
              </div>
              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  {label:'이름', key:'name'},
                  {label:'부서', key:'dept'},
                  {label:'직급', key:'grade'},
                  {label:'입사일', key:'join_date', type:'date'},
                  {label:'생년월일', key:'birth_date', type:'date'},
                  {label:'연락처', key:'tel'},
                ].map(f=>(
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
                    <input type={f.type||'text'} className="input text-sm"
                      value={editing[f.key]||''}
                      onChange={e=>setEditing((p:any)=>({...p,[f.key]:e.target.value}))} />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">성별</label>
                  <select className="input text-sm" value={editing.gender||''}
                    onChange={e=>setEditing((p:any)=>({...p,gender:e.target.value}))}>
                    <option value="">선택</option>
                    <option value="남">남</option>
                    <option value="여">여</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">권한</label>
                  <select className="input text-sm" value={editing.role||'staff'}
                    onChange={e=>setEditing((p:any)=>({...p,role:e.target.value}))}>
                    <option value="staff">일반직원</option>
                    <option value="director">관리자</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">재직 상태</label>
                  <select className="input text-sm" value={editing.status||'active'}
                    onChange={e=>setEditing((p:any)=>({...p,status:e.target.value}))}>
                    <option value="active">재직중</option>
                    <option value="inactive">퇴직</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">잔여 연차</label>
                  <input type="number" className="input text-sm" value={editing.annual_leave||0}
                    onChange={e=>setEditing((p:any)=>({...p,annual_leave:+e.target.value}))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">주소</label>
                  <input type="text" className="input text-sm" value={editing.address||''}
                    onChange={e=>setEditing((p:any)=>({...p,address:e.target.value}))} />
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2 justify-end border-t border-gray-100 pt-4">
              <button onClick={()=>setEditing(null)} className="btn-secondary text-sm">취소</button>
              <button onClick={saveInfo} className="btn-primary text-sm">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 계약연봉 행 컴포넌트
function SalaryRow({u, sal, rate, onSave, Avatar}: any) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    annual: sal?.annual||0, dependents: sal?.dependents||1,
    meal: sal?.meal||0, transport: sal?.transport||0, comm: sal?.comm||0,
  })
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50">
      <td className="py-2 pr-3"><Avatar u={u} size={8} /></td>
      <td className="py-2 pr-3 font-medium">{u.name}</td>
      <td className="py-2 pr-3 text-gray-500">{u.grade}</td>
      {editing ? (
        <>
          <td className="py-1.5 pr-2"><input type="number" className="input text-xs w-28" value={form.annual} onChange={e=>setForm(p=>({...p,annual:+e.target.value}))} /></td>
          <td className="py-1.5 pr-2"><input type="number" className="input text-xs w-14" value={form.dependents} onChange={e=>setForm(p=>({...p,dependents:+e.target.value}))} /></td>
          <td className="py-1.5 pr-2"><input type="number" className="input text-xs w-20" value={form.meal} onChange={e=>setForm(p=>({...p,meal:+e.target.value}))} /></td>
          <td className="py-1.5 pr-2"><input type="number" className="input text-xs w-20" value={form.transport} onChange={e=>setForm(p=>({...p,transport:+e.target.value}))} /></td>
          <td className="py-1.5 pr-2"><input type="number" className="input text-xs w-20" value={form.comm} onChange={e=>setForm(p=>({...p,comm:+e.target.value}))} /></td>
          <td className="py-1.5 pr-2 text-xs text-gray-400">{Math.round((form.annual||0)/12/209).toLocaleString()}원</td>
          <td className="py-1.5">
            <div className="flex gap-1">
              <button onClick={()=>{onSave(u.id,form);setEditing(false)}} className="btn-primary text-xs px-2 py-1">저장</button>
              <button onClick={()=>setEditing(false)} className="btn-secondary text-xs px-2 py-1">취소</button>
            </div>
          </td>
        </>
      ) : (
        <>
          <td className="py-2 pr-3 text-purple-600 font-medium">{sal?formatWon(sal.annual):'-'}</td>
          <td className="py-2 pr-3 text-gray-500">{sal?.dependents||'-'}명</td>
          <td className="py-2 pr-3 text-gray-500 text-xs">{sal?formatWon(sal.meal):'-'}</td>
          <td className="py-2 pr-3 text-gray-500 text-xs">{sal?formatWon(sal.transport):'-'}</td>
          <td className="py-2 pr-3 text-gray-500 text-xs">{sal?formatWon(sal.comm):'-'}</td>
          <td className="py-2 pr-3 text-gray-500 text-xs">{sal?rate.toLocaleString()+'원':'-'}</td>
          <td className="py-2">
            <button onClick={()=>setEditing(true)} className="btn-secondary text-xs px-2 py-1">편집</button>
          </td>
        </>
      )}
    </tr>
  )
}

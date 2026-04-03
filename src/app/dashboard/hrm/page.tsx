'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { formatWon } from '@/lib/attendance'

export default function HrmPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [salaries, setSalaries] = useState<any[]>([])
  const [editing, setEditing] = useState<any>(null)
  const [editSalary, setEditSalary] = useState<any>(null)
  const [alert, setAlert] = useState('')
  const [tab, setTab] = useState<'info'|'salary'>('info')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: p } = await supabase.from('profiles').select('*').order('join_date')
    setStaff(p||[])
    const { data: s } = await supabase.from('salary_info').select('*')
    setSalaries(s||[])
  }, [])

  useEffect(() => { load() }, [load])

  async function uploadAvatar(file: File, userId: string) {
    setUploading(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${userId}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (error) { setAlert('사진 업로드 실패: '+error.message); setUploading(false); return null }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    setUploading(false)
    return data.publicUrl + '?t=' + Date.now()
  }

  async function saveProfile() {
    if (!editing) return
    let avatarUrl = editing.avatar_url
    if (editing._newFile) {
      const url = await uploadAvatar(editing._newFile, editing.id)
      if (url) avatarUrl = url
    }
    const supabase = createClient()
    await supabase.from('profiles').update({
      name: editing.name, dept: editing.dept, grade: editing.grade,
      join_date: editing.join_date, email: editing.email, tel: editing.tel,
      role: editing.role, status: editing.status, annual_leave: Number(editing.annual_leave),
      address: editing.address, gender: editing.gender, birth_date: editing.birth_date || null,
      avatar_url: avatarUrl,
    }).eq('id', editing.id)
    setEditing(null); setAlert('저장되었습니다.'); load(); setTimeout(()=>setAlert(''),3000)
  }

  async function saveSalary() {
    if (!editSalary) return
    const supabase = createClient()
    await supabase.from('salary_info').upsert({
      user_id: editSalary.user_id, annual: Number(editSalary.annual),
      dependents: Number(editSalary.dependents), meal: Number(editSalary.meal),
      transport: Number(editSalary.transport), comm: Number(editSalary.comm),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    setEditSalary(null); setAlert('급여정보 저장됨.'); load(); setTimeout(()=>setAlert(''),3000)
  }

  const Avatar = ({u, size=8}: {u:any, size?:number}) => (
    u?.avatar_url
      ? <img src={u.avatar_url} alt={u.name} className={`w-${size} h-${size} rounded-full object-cover flex-shrink-0`} />
      : <div className={`w-${size} h-${size} rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0`}
          style={{background:u?.color||'#EEEDFE',color:u?.tc||'#3C3489'}}>
          {u?.name?.[0]}
        </div>
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
            {t==='info'?'인사정보':'계약연봉 관리'}
          </button>
        ))}
      </div>

      {tab==='info' && (
        <>
          <div className="card overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                {['','이름','부서','직급','입사일','성별','연락처','권한','상태','편집'].map(h=>(
                  <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-3 text-xs whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {staff.map(u=>(
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-3"><Avatar u={u} size={7} /></td>
                    <td className="py-2 pr-3 font-medium">{u.name}</td>
                    <td className="py-2 pr-3 text-gray-500 text-xs">{u.dept}</td>
                    <td className="py-2 pr-3">{u.grade}</td>
                    <td className="py-2 pr-3 text-gray-500 text-xs">{u.join_date}</td>
                    <td className="py-2 pr-3 text-gray-500 text-xs">{u.gender||'-'}</td>
                    <td className="py-2 pr-3 text-gray-500 text-xs">{u.tel||'-'}</td>
                    <td className="py-2 pr-3"><span className={u.role==='director'?'badge-pending':'badge-work'}>{u.role==='director'?'관리자':'직원'}</span></td>
                    <td className="py-2 pr-3"><span className={u.status==='active'?'badge-approved':u.status==='pending'?'badge-pending':'badge-rejected'}>{u.status==='active'?'재직':u.status==='pending'?'대기':'퇴직'}</span></td>
                    <td className="py-2"><button onClick={()=>setEditing({...u,_newFile:null})} className="btn-secondary text-xs px-2 py-1">수정</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editing && (
            <div className="card">
              <div className="text-sm font-medium text-gray-700 mb-4">인사정보 수정 — {editing.name}</div>
              {/* 사진 */}
              <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-100">
                {editing._newFile
                  ? <img src={URL.createObjectURL(editing._newFile)} className="w-16 h-16 rounded-full object-cover" alt="preview" />
                  : <Avatar u={editing} size={16} />
                }
                <div>
                  <div className="text-xs text-gray-500 mb-1.5">증명사진</div>
                  <button onClick={()=>fileRef.current?.click()} className="btn-secondary text-xs px-3 py-1.5">
                    {uploading ? '업로드 중...' : '사진 선택'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={e=>{ if(e.target.files?.[0]) setEditing((p:any)=>({...p,_newFile:e.target.files![0]})) }} />
                  <div className="text-xs text-gray-400 mt-1">JPG, PNG 권장</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  {label:'이름', key:'name', type:'text'},
                  {label:'이메일', key:'email', type:'email'},
                  {label:'연락처', key:'tel', type:'text'},
                  {label:'입사일', key:'join_date', type:'date'},
                  {label:'생년월일', key:'birth_date', type:'date'},
                  {label:'주소', key:'address', type:'text'},
                  {label:'잔여 연차', key:'annual_leave', type:'number'},
                ].map(f=>(
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
                    <input type={f.type} className="input" value={editing[f.key]||''}
                      onChange={e=>setEditing((p:any)=>({...p,[f.key]:e.target.value}))} />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">성별</label>
                  <select className="input" value={editing.gender||''} onChange={e=>setEditing((p:any)=>({...p,gender:e.target.value}))}>
                    <option value="">선택</option><option value="남">남</option><option value="여">여</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">부서</label>
                  <select className="input" value={editing.dept||''} onChange={e=>setEditing((p:any)=>({...p,dept:e.target.value}))}>
                    {['경영지원팀','영업팀','개발팀','운영팀'].map(d=><option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">직급</label>
                  <select className="input" value={editing.grade||''} onChange={e=>setEditing((p:any)=>({...p,grade:e.target.value}))}>
                    {['대표','이사','과장','대리','사원'].map(g=><option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">권한</label>
                  <select className="input" value={editing.role} onChange={e=>setEditing((p:any)=>({...p,role:e.target.value}))}>
                    <option value="staff">일반직원</option><option value="director">관리자</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">상태</label>
                  <select className="input" value={editing.status} onChange={e=>setEditing((p:any)=>({...p,status:e.target.value}))}>
                    <option value="active">재직</option><option value="pending">대기</option><option value="inactive">퇴직</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={()=>setEditing(null)} className="btn-secondary">취소</button>
                <button onClick={saveProfile} disabled={uploading} className="btn-primary">{uploading?'저장 중...':'저장'}</button>
              </div>
            </div>
          )}
        </>
      )}

      {tab==='salary' && (
        <>
          <div className="card overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                {['이름','직급','계약연봉','부양가족','식대','교통비','통신비','시간단가','편집'].map(h=>(
                  <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-3 text-xs whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {staff.filter(u=>u.status==='active').map(u=>{
                  const sal = salaries.find(s=>s.user_id===u.id)
                  return (
                    <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 pr-3 font-medium">{u.name}</td>
                      <td className="py-2 pr-3 text-gray-500">{u.grade}</td>
                      <td className="py-2 pr-3 text-purple-600 font-medium">{sal?formatWon(sal.annual):'미등록'}</td>
                      <td className="py-2 pr-3">{sal?sal.dependents+'명':'-'}</td>
                      <td className="py-2 pr-3 text-xs text-gray-500">{sal?formatWon(sal.meal):'-'}</td>
                      <td className="py-2 pr-3 text-xs text-gray-500">{sal?formatWon(sal.transport):'-'}</td>
                      <td className="py-2 pr-3 text-xs text-gray-500">{sal?formatWon(sal.comm):'-'}</td>
                      <td className="py-2 pr-3 text-xs text-blue-600">{sal?Math.round(sal.annual/12/209).toLocaleString()+'원/h':'-'}</td>
                      <td className="py-2">
                        <button onClick={()=>setEditSalary(sal?{...sal}:{user_id:u.id,annual:0,dependents:1,meal:200000,transport:200000,comm:100000})}
                          className="btn-secondary text-xs px-2 py-1">{sal?'수정':'등록'}</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {editSalary && (
            <div className="card">
              <div className="text-sm font-medium text-gray-700 mb-4">
                계약연봉 — {staff.find(u=>u.id===editSalary.user_id)?.name}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[{l:'계약연봉(원)',k:'annual'},{l:'부양가족',k:'dependents'},{l:'식대(원)',k:'meal'},{l:'교통비(원)',k:'transport'},{l:'통신비(원)',k:'comm'}].map(f=>(
                  <div key={f.k}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{f.l}</label>
                    <input type="number" className="input" value={editSalary[f.k]||0}
                      onChange={e=>setEditSalary((p:any)=>({...p,[f.k]:e.target.value}))} />
                  </div>
                ))}
                <div className="flex items-end pb-1">
                  <div className="text-xs text-gray-400">시간단가: <span className="text-purple-600 font-medium">
                    {editSalary.annual>0?Math.round(editSalary.annual/12/209).toLocaleString()+'원/h':'-'}
                  </span></div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={()=>setEditSalary(null)} className="btn-secondary">취소</button>
                <button onClick={saveSalary} className="btn-primary">저장</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

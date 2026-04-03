'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { formatWon } from '@/lib/attendance'

export default function HrmPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [editing, setEditing] = useState<any>(null)
  const [alert, setAlert] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('profiles').select('*').order('join_date')
    setStaff(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!editing) return
    const supabase = createClient()
    await supabase.from('profiles').update({
      name: editing.name, dept: editing.dept, grade: editing.grade,
      join_date: editing.join_date, email: editing.email,
      tel: editing.tel, role: editing.role, status: editing.status,
      annual_leave: editing.annual_leave,
    }).eq('id', editing.id)
    setEditing(null); setAlert('저장되었습니다.')
    load(); setTimeout(()=>setAlert(''), 3000)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">인사정보 관리</h1>
      {alert && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{alert}</div>}
      <div className="card overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100">
            {['이름','부서','직급','입사일','이메일','연차','권한','상태','편집'].map(h=>(
              <th key={h} className="pb-2 text-left font-medium text-gray-400 pr-4 text-xs whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {staff.map(u=>(
              <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-2 pr-4 font-medium">{u.name}</td>
                <td className="py-2 pr-4 text-gray-500">{u.dept}</td>
                <td className="py-2 pr-4">{u.grade}</td>
                <td className="py-2 pr-4 text-gray-500 text-xs">{u.join_date}</td>
                <td className="py-2 pr-4 text-gray-500 text-xs">{u.email}</td>
                <td className="py-2 pr-4">{u.annual_leave}일</td>
                <td className="py-2 pr-4">
                  <span className={`badge-${u.role==='director'?'pending':'work'}`}>
                    {u.role==='director'?'관리자':'직원'}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  <span className={`badge-${u.status==='active'?'approved':u.status==='pending'?'pending':'rejected'}`}>
                    {u.status==='active'?'재직':u.status==='pending'?'대기':'퇴직'}
                  </span>
                </td>
                <td className="py-2">
                  <button onClick={()=>setEditing({...u})} className="btn-secondary text-xs px-2 py-1">수정</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="card">
          <div className="text-sm font-medium text-gray-700 mb-4">인사정보 수정 — {editing.name}</div>
          <div className="grid grid-cols-3 gap-3">
            {[
              {label:'이름', key:'name', type:'text'},
              {label:'이메일', key:'email', type:'email'},
              {label:'연락처', key:'tel', type:'text'},
              {label:'입사일', key:'join_date', type:'date'},
              {label:'잔여 연차', key:'annual_leave', type:'number'},
            ].map(f=>(
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
                <input type={f.type} className="input" value={editing[f.key]||''}
                  onChange={e=>setEditing((p:any)=>({...p,[f.key]:e.target.value}))} />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">부서</label>
              <select className="input" value={editing.dept} onChange={e=>setEditing((p:any)=>({...p,dept:e.target.value}))}>
                {['경영지원팀','영업팀','개발팀','운영팀'].map(d=><option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">직급</label>
              <select className="input" value={editing.grade} onChange={e=>setEditing((p:any)=>({...p,grade:e.target.value}))}>
                {['대표','이사','과장','대리','사원'].map(g=><option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">권한</label>
              <select className="input" value={editing.role} onChange={e=>setEditing((p:any)=>({...p,role:e.target.value}))}>
                <option value="staff">일반직원</option>
                <option value="director">관리자</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">상태</label>
              <select className="input" value={editing.status} onChange={e=>setEditing((p:any)=>({...p,status:e.target.value}))}>
                <option value="active">재직</option>
                <option value="pending">대기</option>
                <option value="inactive">퇴직</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={()=>setEditing(null)} className="btn-secondary">취소</button>
            <button onClick={save} className="btn-primary">저장</button>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function OrgPage() {
  const [staff, setStaff] = useState<any[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles').select('*').eq('status','active').order('join_date')
      .then(({data})=>{
        setStaff(data||[])
      })
  }, [])

  const depts = staff.reduce((acc:any, u:any) => {
    if (!acc[u.dept]) acc[u.dept] = []
    acc[u.dept].push(u)
    return acc
  }, {})

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-5">조직도 · 인사표</h1>
      {Object.entries(depts).map(([dept, members]: [string, any]) => (
        <div key={dept} className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="bg-purple-50 text-purple-700 text-sm font-semibold px-3 py-1 rounded-full">{dept}</span>
            <span className="text-xs text-gray-400">{members.length}명</span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {members.map((u:any) => (
              <div key={u.id} className="card flex items-center gap-3 py-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{background:u.color||'#EEEDFE', color:u.tc||'#3C3489'}}>
                  {u.name?.[0]}
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-800">{u.name}</div>
                  <div className="text-xs text-gray-400">{u.grade}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

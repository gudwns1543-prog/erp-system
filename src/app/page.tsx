'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function Home() {
  const router = useRouter()
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/dashboard')
      else router.replace('/login')
    })
  }, [router])
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">로딩 중...</div>
    </div>
  )
}

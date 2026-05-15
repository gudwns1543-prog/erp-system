'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DashboardIndex() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard/home')
  }, [router])
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">홈으로 이동 중...</div>
    </div>
  )
}

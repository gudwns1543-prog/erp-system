import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '(주)솔루션 ERP',
  description: '인사·급여 통합 관리 시스템',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}

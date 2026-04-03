import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '근태 ERP 시스템',
  description: '인사·급여 통합 관리 시스템',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}

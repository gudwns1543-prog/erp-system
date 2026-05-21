import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '(주)솔루션 ERP',
  description: '(주)솔루션 인사·근태·급여 통합 관리 시스템',
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
  openGraph: {
    title: '(주)솔루션 ERP',
    description: '(주)솔루션 인사·근태·급여 통합 관리 시스템',
    images: [
      {
        url: '/logo-solution.jpg',
        width: 106,
        height: 91,
        alt: '(주)솔루션 로고',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: '(주)솔루션 ERP',
    description: '(주)솔루션 인사·근태·급여 통합 관리 시스템',
    images: ['/logo-solution.jpg'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={inter.className}>{children}</body>
    </html>
  )
}

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '(주)솔루션 ERP',
  description: '(주)솔루션 인사·근태·급여 통합 관리 시스템',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.png', type: 'image/png', sizes: '32x32' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: '(주)솔루션 ERP',
    description: '(주)솔루션 인사·근태·급여 통합 관리 시스템',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: '(주)솔루션 ERP',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '(주)솔루션 ERP',
    description: '(주)솔루션 인사·근태·급여 통합 관리 시스템',
    images: ['/og-image.jpg'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  )
}

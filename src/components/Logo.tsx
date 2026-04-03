export function Logo({ size = 40 }: { size?: number }) {
  const h = size
  const w = size * 2
  const unit = size / 30

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={w} height={h} viewBox="0 0 120 60">
      {/* 왼쪽 진한 박스 */}
      <rect x="2" y="2" width="54" height="54" rx="6" fill="#2E7FA3"/>
      <rect x="16" y="14" width="7" height="10" rx="3.5" fill="white"/>
      <rect x="35" y="14" width="7" height="10" rx="3.5" fill="white"/>
      <path d="M14 34 Q29 48 44 34" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round"/>
      {/* 오른쪽 연한 박스 */}
      <rect x="64" y="2" width="54" height="54" rx="6" fill="#A8D4E8"/>
      <rect x="78" y="14" width="7" height="10" rx="3.5" fill="white"/>
      <rect x="97" y="14" width="7" height="10" rx="3.5" fill="white"/>
      <path d="M76 34 Q91 48 106 34" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

export function Logo({ size = 40 }: { size?: number }) {
  const width = size * 2
  return (
    <img
      src="/logo-solution.jpg"
      alt="(주)솔루션 로고"
      width={width}
      height={size}
      style={{ width, height: size, objectFit: 'contain' }}
    />
  )
}

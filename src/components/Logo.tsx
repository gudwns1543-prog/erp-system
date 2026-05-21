import Image from 'next/image'

export function Logo({ size = 40 }: { size?: number }) {
  const height = size
  const width = Math.round((106 / 91) * size)

  return (
    <Image
      src="/logo-solution.jpg"
      alt="(주)솔루션 로고"
      width={width}
      height={height}
      className="object-contain"
      priority
    />
  )
}

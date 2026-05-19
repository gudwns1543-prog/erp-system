export type AuthorityRole = 'ceo' | 'executive_admin' | 'manager_admin' | 'staff'

// 내부 정책용 역할명입니다. 화면에서는 직급/부서를 우선 표시합니다.
export const AUTHORITY_LABEL: Record<string, string> = {
  ceo: '대표',
  executive_admin: '이사',
  manager_admin: '관리자',
  staff: '직원',
}

export const AUTHORITY_BADGE_CLASS: Record<string, string> = {
  ceo: 'bg-purple-100 text-purple-700',
  executive_admin: 'bg-indigo-100 text-indigo-700',
  manager_admin: 'bg-blue-100 text-blue-700',
  staff: 'bg-gray-100 text-gray-600',
}

export function getAuthorityRole(u: any): AuthorityRole {
  if (u?.authority_role) return u.authority_role
  if (u?.name === '송영아') return 'ceo'
  if (u?.name === '박팔주') return 'executive_admin'
  if (u?.name === '박형준') return 'manager_admin'
  return 'staff'
}

export function getAuthorityLabel(u: any): string {
  const key = getAuthorityRole(u)
  return AUTHORITY_LABEL[key] || '직원'
}

export function getOrgLevel(u: any): number {
  if (typeof u?.org_level === 'number') return u.org_level
  const role = getAuthorityRole(u)
  if (role === 'ceo') return 10
  if (role === 'executive_admin') return 20
  if (role === 'manager_admin') return 30
  return 40
}

export function canApprove(u: any): boolean {
  if (typeof u?.can_approve === 'boolean') return u.can_approve
  return ['ceo', 'executive_admin', 'manager_admin'].includes(getAuthorityRole(u))
}

export function sortByOrgAuthority<T extends Record<string, any>>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const sortA = typeof a.org_sort === 'number' ? a.org_sort : 999
    const sortB = typeof b.org_sort === 'number' ? b.org_sort : 999
    if (sortA !== sortB) return sortA - sortB
    const levelDiff = getOrgLevel(a) - getOrgLevel(b)
    if (levelDiff !== 0) return levelDiff
    return String(a.name || '').localeCompare(String(b.name || ''), 'ko')
  })
}

export function isAdminLike(u: any): boolean {
  return u?.role === 'director' || canApprove(u)
}

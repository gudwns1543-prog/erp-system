// 공휴일 목록 (2026년)
const HOLIDAYS_2026 = [
  '2026-01-01','2026-02-16','2026-02-17','2026-02-18',
  '2026-03-01','2026-05-05','2026-05-25','2026-06-03',
  '2026-08-17','2026-09-24','2026-09-25','2026-09-26',
  '2026-10-05','2026-10-09','2026-12-25'
]

export function isHoliday(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00')
  return d.getDay() === 0 || d.getDay() === 6 || HOLIDAYS_2026.includes(dateStr)
}

// HH:MM 또는 HH:MM:SS → 초 단위로 변환
function parseTime(t: string): number {
  const parts = t.split(':').map(Number)
  return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0)
}

// 초 단위로 겹치는 시간 계산 (기존과 동일한 구조, 단위만 초로)
function overlap(s1: number, e1: number, s2: number, e2: number): number {
  return Math.max(0, Math.min(e1, e2) - Math.max(s1, s2))
}

export interface WorkResult {
  isHoliday: boolean
  ignored: number
  total: number
  reg: number
  ext: number
  night: number
  hReg: number
  hEve: number
  hNight: number
}

export function classifyWork(dateStr: string, inTime: string, outTime: string): WorkResult {
  const hol = isHoliday(dateStr)
  let inS = parseTime(inTime)    // 초 단위
  let outS = parseTime(outTime)  // 초 단위

  if (outS < inS) outS += 86400  // 다음날로 넘어간 경우
  if (outS === inS) {
    return { isHoliday: hol, ignored:0, total:0, reg:0, ext:0, night:0, hReg:0, hEve:0, hNight:0 }
  }

  // 시간대 경계값 (초 단위로 변환: 기존 분×60)
  // 미인정: 07:00(25200초) ~ 09:00(32400초)
  // 점심: 12:00(43200초) ~ 13:00(46800초)
  // 저녁: 18:00(64800초) ~ 19:00(68400초)
  // 정규: 09:00(32400초) ~ 18:00(64800초)
  // 시간외: 19:00(68400초) ~ 22:00(79200초)
  // 야간: 22:00(79200초) ~ 익일07:00(111600초)

  const ignored = overlap(inS, outS, 25200, 32400)   // 07~09 미인정
  const lunch   = overlap(inS, outS, 43200, 46800)   // 12~13 점심
  const dinner  = overlap(inS, outS, 64800, 68400)   // 18~19 저녁

  const total = Math.max(0, outS - inS - ignored - lunch - dinner)

  if (!hol) {
    return {
      isHoliday: false, ignored, total,
      reg:   Math.max(0, overlap(inS, outS, 32400, 64800) - lunch),
      ext:   overlap(inS, outS, 68400, 79200),
      night: overlap(inS, outS, 79200, 111600),
      hReg: 0, hEve: 0, hNight: 0,
    }
  } else {
    return {
      isHoliday: true, ignored, total,
      reg: 0, ext: 0, night: 0,
      hReg:  Math.max(0, overlap(inS, outS, 32400, 64800) - lunch),
      hEve:  Math.max(0, overlap(inS, outS, 68400, 79200) - dinner),
      hNight: overlap(inS, outS, 79200, 111600),
    }
  }
}

// 초 → 시간(소수점 1자리), 최소 단위 1분(60초)
export function minutesToHours(seconds: number): number {
  if (seconds <= 0) return 0
  const effectiveSecs = Math.max(seconds, 60)
  // toFixed로 부동소수점 오류 방지
  return parseFloat((Math.round(effectiveSecs / 360) / 10).toFixed(1))
}

// 연차 계산 (입사일 기준, 1년차 15일, 매년 자동부여)
export function calcAnnualLeave(joinDate: string): number {
  const ent = getCurrentLeaveEntitlement(joinDate)
  return ent.totalHours
}

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function toDateLocal(dateStr: string): Date {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number)
  return new Date(y || 1970, (m || 1) - 1, d || 1)
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function addMonthsLocal(date: Date, months: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  if (d.getDate() !== day) d.setDate(0)
  return d
}

function addYearsLocal(date: Date, years: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setFullYear(d.getFullYear() + years)
  return d
}

function fullYearsBetween(join: Date, base: Date): number {
  let years = base.getFullYear() - join.getFullYear()
  const anniv = addYearsLocal(join, years)
  if (base < anniv) years--
  return Math.max(0, years)
}

function fullMonthsBetween(join: Date, base: Date): number {
  let months = (base.getFullYear() - join.getFullYear()) * 12 + (base.getMonth() - join.getMonth())
  const monthly = addMonthsLocal(join, months)
  if (base < monthly) months--
  return Math.max(0, months)
}

export type LeaveEntitlement = {
  type: 'monthly' | 'annual' | 'none'
  label: string
  yearNo: number
  generatedAt: string
  expiresAt: string
  totalDays: number
  totalHours: number
}

export function annualDaysByServiceYear(yearNo: number): number {
  if (yearNo < 1) return 0
  return Math.min(25, 15 + Math.floor((yearNo - 1) / 2))
}

export function getCurrentLeaveEntitlement(joinDate?: string | null, baseDate: Date = new Date()): LeaveEntitlement {
  if (!joinDate) {
    return { type: 'none', label: '입사일 미등록', yearNo: 0, generatedAt: '', expiresAt: '', totalDays: 0, totalHours: 0 }
  }
  const join = toDateLocal(joinDate)
  const today = dateOnly(baseDate)

  if (today < join) {
    return { type: 'none', label: '입사 전', yearNo: 0, generatedAt: '', expiresAt: '', totalDays: 0, totalHours: 0 }
  }

  const years = fullYearsBetween(join, today)

  // 입사 1년 미만: 전월 만근분 월단위 휴가 1일(8H). 발생월 안에서만 사용.
  if (years < 1) {
    const months = fullMonthsBetween(join, today)
    if (months < 1) {
      return { type: 'none', label: '1개월 미만', yearNo: 0, generatedAt: '', expiresAt: '', totalDays: 0, totalHours: 0 }
    }
    const generated = addMonthsLocal(join, months)
    const expires = addMonthsLocal(generated, 1)
    return {
      type: 'monthly',
      label: '1년 미만 월단위 휴가',
      yearNo: 0,
      generatedAt: fmtDate(generated),
      expiresAt: fmtDate(expires),
      totalDays: 1,
      totalHours: 8,
    }
  }

  // 입사 1년 이후: 입사일마다 연차 생성, 1년 유효. 이월/수당대체 없음.
  const generated = addYearsLocal(join, years)
  const expires = addYearsLocal(generated, 1)
  const days = annualDaysByServiceYear(years)
  return {
    type: 'annual',
    label: `${years}년차 연차`,
    yearNo: years,
    generatedAt: fmtDate(generated),
    expiresAt: fmtDate(expires),
    totalDays: days,
    totalHours: days * 8,
  }
}

export function leaveHoursForApproval(a: { type: string, start_date: string, end_date?: string | null }): number {
  if (a.type === '반반차') return 2
  if (a.type === '반차(오전)' || a.type === '반차(오후)') return 4
  if (a.type === '연차') {
    const start = toDateLocal(a.start_date)
    const end = toDateLocal(a.end_date || a.start_date)
    let hours = 0
    const cur = new Date(start)
    while (cur <= end) {
      const ds = fmtDate(cur)
      const dow = cur.getDay()
      if (dow !== 0 && dow !== 6 && !isHoliday(ds)) hours += 8
      cur.setDate(cur.getDate() + 1)
    }
    return hours
  }
  return 0
}

export function calcLeaveUsageForEntitlement(
  approvals: { type: string, start_date: string, end_date?: string | null, status?: string }[],
  entitlement: LeaveEntitlement,
): { approvedHours: number, pendingHours: number, usedHours: number, remainHours: number } {
  if (!entitlement.generatedAt || !entitlement.expiresAt || entitlement.totalHours <= 0) {
    return { approvedHours: 0, pendingHours: 0, usedHours: 0, remainHours: 0 }
  }

  const start = entitlement.generatedAt
  const end = entitlement.expiresAt
  let approvedHours = 0
  let pendingHours = 0

  for (const a of approvals || []) {
    if (!['연차','반차(오전)','반차(오후)','반반차'].includes(a.type)) continue
    const s = String(a.start_date).slice(0, 10)
    if (s < start || s >= end) continue
    const hours = leaveHoursForApproval(a)
    if (a.status === 'approved') approvedHours += hours
    else if (a.status === 'pending') pendingHours += hours
  }

  const usedHours = approvedHours + pendingHours
  return {
    approvedHours,
    pendingHours,
    usedHours,
    remainHours: Math.max(0, entitlement.totalHours - usedHours),
  }
}

export interface SalaryInput {
  annual: number; dependents: number; meal: number; transport: number; comm: number
  regH: number; extH: number; nightH: number; holH: number; holExtH: number; holNightH: number
}

export interface SalaryResult {
  rate: number; base: number; payExt: number; payNight: number; payHol: number
  payHolExt: number; payHolNight: number; allowance: number; grossTaxable: number
  grossTotal: number; pension: number; health: number; ltc: number; employ: number
  incomeTax: number; localTax: number; totalDeduct: number; netPay: number
}

function calcIncomeTax(taxable: number, dep: number): number {
  const d = Math.max(1, dep)
  let tax = 0
  if      (taxable <= 1060000)  tax = 0
  else if (taxable <= 1500000)  tax = (taxable - 1060000) * 0.06
  else if (taxable <= 3000000)  tax = 26400 + (taxable - 1500000) * 0.15
  else if (taxable <= 4500000)  tax = 251400 + (taxable - 3000000) * 0.24
  else if (taxable <= 7800000)  tax = 611400 + (taxable - 4500000) * 0.35
  else if (taxable <= 12000000) tax = 1766400 + (taxable - 7800000) * 0.38
  else                          tax = 3362400 + (taxable - 12000000) * 0.40
  return Math.max(0, Math.round(tax - (d - 1) * 12500))
}

export function calcSalary(input: SalaryInput): SalaryResult {
  const rate = input.annual / 12 / 209
  const base = input.annual / 12
  const payExt      = input.extH      * rate * 1.5
  const payNight    = input.nightH    * rate * 2.0
  const payHol      = input.holH      * rate * 1.5
  const payHolExt   = input.holExtH   * rate * 2.0
  const payHolNight = input.holNightH * rate * 2.5
  const allowance   = input.meal + input.transport + input.comm
  const grossTaxable = base + payExt + payNight + payHol + payHolExt + payHolNight
  const grossTotal   = grossTaxable + allowance
  const pension    = Math.round(grossTaxable * 0.045)
  const health     = Math.round(grossTaxable * 0.03545)
  const ltc        = Math.round(health * 0.1295)
  const employ     = Math.round(grossTaxable * 0.009)
  const incomeTax  = calcIncomeTax(grossTaxable, input.dependents)
  const localTax   = Math.round(incomeTax * 0.1)
  const totalDeduct = pension + health + ltc + employ + incomeTax + localTax
  return {
    rate, base, payExt, payNight, payHol, payHolExt, payHolNight,
    allowance, grossTaxable, grossTotal,
    pension, health, ltc, employ, incomeTax, localTax,
    totalDeduct, netPay: grossTotal - totalDeduct,
  }
}

export function formatWon(n: number): string {
  return Math.round(n).toLocaleString('ko-KR') + '원'
}

// 직급 정렬 순서
export const GRADE_ORDER: Record<string,number> = {
  // 최고 경영진
  '회장':1,'대표이사':2,'대표':2,'사장':3,'부사장':4,
  // 임원
  '전무이사':5,'전무':5,'상무이사':6,'상무':6,'이사':7,'감사':8,
  // 부서장급
  '본부장':9,'실장':10,'센터장':10,'팀장':11,
  // 관리자급
  '수석':12,'책임':13,'선임':14,'부장':15,'차장':16,
  // 실무자급
  '과장':17,'대리':18,'주임':19,'사원':20,
  // 기타
  '계약직':21,'인턴':22,'파견':23,
}
export function sortByGrade<T extends Record<string, any>>(arr: T[]): T[] {
  return [...arr].sort((a,b)=>(GRADE_ORDER[a.grade||'']||99)-(GRADE_ORDER[b.grade||'']||99))
}

// ─── 급여 관련 ──────
// 회사 급여 지급일 (매월 10일)
// 4월 근무분 → 5월 10일 지급
export const PAY_DAY = 10

/**
 * 오늘 날짜 기준으로 "가장 최근에 지급된 급여명세서의 근무월"을 반환
 * 예: 오늘이 5/14 → 5/10 지난 후 → {year:2026, month:4} (4월 근무분)
 * 예: 오늘이 5/9 → 아직 5/10 지급 안 됨 → {year:2026, month:3} (3월 근무분)
 */
export function getLatestPayMonth(today: Date = new Date()): { year: number, month: number } {
  const y = today.getFullYear()
  const m = today.getMonth() + 1 // 1~12
  const d = today.getDate()
  // 지급일(10일)을 지났는지로 결정
  // 5월 10일 이후 → 4월 근무분이 최신 명세서
  // 5월 10일 이전 → 3월 근무분이 최신 명세서
  let workMonth: number, workYear: number
  if (d >= PAY_DAY) {
    // 지급일 지남 → 한 달 전 근무분이 최신
    workMonth = m - 1
    workYear = y
  } else {
    // 지급일 안 지남 → 두 달 전 근무분이 최신
    workMonth = m - 2
    workYear = y
  }
  if (workMonth <= 0) {
    workMonth += 12
    workYear -= 1
  }
  return { year: workYear, month: workMonth }
}

/**
 * 근무월 → 지급월/지급일 계산
 * 예: {year:2026, month:4} → "5월 10일 지급" 
 */
export function getPayDate(workYear: number, workMonth: number): { payYear: number, payMonth: number, payDay: number } {
  let payMonth = workMonth + 1
  let payYear = workYear
  if (payMonth > 12) {
    payMonth -= 12
    payYear += 1
  }
  return { payYear, payMonth, payDay: PAY_DAY }
}

/**
 * 급여 표기 (예: "4월 근무 · 5월 10일 지급")
 */
export function formatPayLabel(workYear: number, workMonth: number): string {
  const { payMonth, payDay } = getPayDate(workYear, workMonth)
  return `${workMonth}월 근무 · ${payMonth}월 ${payDay}일 지급`
}

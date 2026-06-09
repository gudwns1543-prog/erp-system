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
  const join = new Date(joinDate)
  const today = new Date()
  const diffMs = today.getTime() - join.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 365) return Math.min(Math.floor(diffDays / 30), 11)
  const years = Math.floor(diffDays / 365)
  return Math.min(15 + Math.floor((years - 1) / 2), 25)
}


// ─── 입사일 기준 연/월차 발생 계산 ──────
// 내부 단위: 1일 = 8H. 1년 미만 월차는 입사 후 1개월 만근 시 1일씩, 최대 11일로 계산합니다.
export type LeaveGrantKind = 'monthly' | 'annual'
export interface LeaveGrantBucket {
  kind: LeaveGrantKind
  label: string
  grantDate: string
  expireDate: string
  days: number
  hours: number
  remainingHours: number
}

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function parseDateOnly(s?: string | null): Date | null {
  if (!s) return null
  const [y,m,d] = String(s).slice(0,10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m-1, d)
}
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function addMonthsSafe(d: Date, months: number): Date {
  const r = new Date(d)
  const day = r.getDate()
  r.setMonth(r.getMonth() + months)
  if (r.getDate() !== day) r.setDate(0)
  return dateOnly(r)
}
function addYearsSafe(d: Date, years: number): Date {
  const r = new Date(d)
  r.setFullYear(r.getFullYear() + years)
  return dateOnly(r)
}

export function leaveRequestHours(type: string, startDate?: string | null, endDate?: string | null): number {
  if (type === '반반차') return 2
  if (type === '반차(오전)' || type === '반차(오후)') return 4
  if (type !== '연차') return 0
  if (!startDate) return 0
  const start = parseDateOnly(startDate)
  const end = parseDateOnly(endDate || startDate)
  if (!start || !end) return 0
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const ds = fmtDate(cur)
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6 && !isHoliday(ds)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count * 8
}

export function buildLeaveGrants(joinDate?: string | null, asOfInput: Date = new Date()): LeaveGrantBucket[] {
  const join = parseDateOnly(joinDate)
  if (!join) return []
  const asOf = dateOnly(asOfInput)
  const buckets: LeaveGrantBucket[] = []

  for (let m = 1; m <= 11; m++) {
    const grant = addMonthsSafe(join, m)
    if (grant > asOf) break
    const expire = addYearsSafe(grant, 1)
    buckets.push({
      kind: 'monthly',
      label: `${m}개월 만근 월차`,
      grantDate: fmtDate(grant),
      expireDate: fmtDate(expire),
      days: 1,
      hours: 8,
      remainingHours: 8,
    })
  }

  for (let year = 1; year <= 40; year++) {
    const grant = addYearsSafe(join, year)
    if (grant > asOf) break
    const days = Math.min(15 + Math.floor((year - 1) / 2), 25)
    const expire = addYearsSafe(grant, 1)
    buckets.push({
      kind: 'annual',
      label: `${year}년 근속 연차`,
      grantDate: fmtDate(grant),
      expireDate: fmtDate(expire),
      days,
      hours: days * 8,
      remainingHours: days * 8,
    })
  }

  return buckets.sort((a,b) => a.expireDate.localeCompare(b.expireDate) || a.grantDate.localeCompare(b.grantDate))
}

export function calcLeaveBalance(joinDate: string | null | undefined, approvals: any[] = [], asOfInput: Date = new Date()) {
  const asOf = dateOnly(asOfInput)
  const buckets = buildLeaveGrants(joinDate, asOf)
  const usageRows = (approvals || [])
    .filter((a:any) => ['연차','반차(오전)','반차(오후)','반반차'].includes(a.type))
    .filter((a:any) => ['approved','pending'].includes(a.status || 'approved'))
    .map((a:any) => ({ ...a, hours: leaveRequestHours(a.type, a.start_date, a.end_date || a.start_date) }))
    .filter((a:any) => a.hours > 0)
    .sort((a:any,b:any) => String(a.start_date).localeCompare(String(b.start_date)))

  let usedApprovedHours = 0
  let usedPendingHours = 0

  for (const u of usageRows) {
    let need = u.hours
    const useDate = parseDateOnly(u.start_date) || asOf
    const available = buckets
      .filter(b => parseDateOnly(b.grantDate)! <= useDate && parseDateOnly(b.expireDate)! > useDate && b.remainingHours > 0)
      .sort((a,b) => a.expireDate.localeCompare(b.expireDate) || a.grantDate.localeCompare(b.grantDate))
    for (const b of available) {
      if (need <= 0) break
      const take = Math.min(b.remainingHours, need)
      b.remainingHours -= take
      need -= take
      if (u.status === 'pending') usedPendingHours += take
      else usedApprovedHours += take
    }
  }

  const validBuckets = buckets.filter(b => parseDateOnly(b.expireDate)! > asOf)
  const totalHours = validBuckets.reduce((s,b)=>s+b.hours,0)
  const remainingHours = validBuckets.reduce((s,b)=>s+b.remainingHours,0)
  const usedHours = Math.max(0, totalHours - remainingHours)

  return {
    totalHours,
    remainingHours,
    usedHours,
    usedApprovedHours,
    usedPendingHours,
    grants: buckets,
    validGrants: validBuckets,
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

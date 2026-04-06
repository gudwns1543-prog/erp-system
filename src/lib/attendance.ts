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

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

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function overlap(s1: number, e1: number, s2: number, e2: number): number {
  return Math.max(0, Math.min(e1, e2) - Math.max(s1, s2))
}

export interface WorkResult {
  isHoliday: boolean
  ignored: number   // 미인정 07~09
  total: number     // 총 실근무(분)
  reg: number       // 평일 정규
  ext: number       // 평일 시간외
  night: number     // 평일 야간
  hReg: number      // 휴일 근로
  hEve: number      // 휴일 저녁
  hNight: number    // 휴일 야간
}

export function classifyWork(dateStr: string, inTime: string, outTime: string): WorkResult {
  const hol = isHoliday(dateStr)
  let inM = parseTime(inTime)
  let outM = parseTime(outTime)
  if (outM <= inM) outM += 1440  // 다음날 새벽

  const ignored = overlap(inM, outM, 420, 540)   // 07~09 미인정
  const lunch   = overlap(inM, outM, 720, 780)   // 12~13 점심
  const dinner  = overlap(inM, outM, 1080, 1140) // 18~19 저녁
  const total   = outM - inM - ignored - lunch - dinner

  if (!hol) {
    return {
      isHoliday: false, ignored, total,
      reg:   Math.max(0, overlap(inM, outM, 540, 1080) - lunch),
      ext:   overlap(inM, outM, 1140, 1320),
      night: overlap(inM, outM, 1320, 1860),
      hReg: 0, hEve: 0, hNight: 0,
    }
  } else {
    return {
      isHoliday: true, ignored, total,
      reg: 0, ext: 0, night: 0,
      hReg:  Math.max(0, overlap(inM, outM, 540, 1080) - lunch),
      hEve:  Math.max(0, overlap(inM, outM, 1080, 1320) - dinner),
      hNight: overlap(inM, outM, 1320, 1860),
    }
  }
}

export function minutesToHours(minutes: number): number {
  return Math.round(minutes / 6) / 10
}

// 급여 계산
export interface SalaryInput {
  annual: number
  dependents: number
  meal: number
  transport: number
  comm: number
  regH: number
  extH: number
  nightH: number
  holH: number
  holExtH: number
  holNightH: number
}

export interface SalaryResult {
  rate: number
  base: number
  payExt: number
  payNight: number
  payHol: number
  payHolExt: number
  payHolNight: number
  allowance: number
  grossTaxable: number
  grossTotal: number
  pension: number
  health: number
  ltc: number
  employ: number
  incomeTax: number
  localTax: number
  totalDeduct: number
  netPay: number
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
  const netPay     = grossTotal - totalDeduct

  return {
    rate, base, payExt, payNight, payHol, payHolExt, payHolNight,
    allowance, grossTaxable, grossTotal,
    pension, health, ltc, employ, incomeTax, localTax,
    totalDeduct, netPay,
  }
}

export function formatWon(n: number): string {
  return Math.round(n).toLocaleString('ko-KR') + '원'
}

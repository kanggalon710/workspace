/** PRD-HR Fase HR-2 - mesin hitung payroll murni (unit-tested, tanpa I/O).
 *  PPh 21 metode GROSS dengan TER bulanan (PMK 168/2023) + BPJS TK & Kesehatan.
 *  CATATAN: tarif TER & batas upah BPJS tersimpan sebagai data di file ini -
 *  verifikasi terhadap regulasi terbaru sebelum dipakai membayar sungguhan. */

export type PtkpStatus = "TK/0" | "TK/1" | "TK/2" | "TK/3" | "K/0" | "K/1" | "K/2" | "K/3";

/** Kategori TER (PMK 168/2023): A = TK/0,TK/1,K/0 · B = TK/2,TK/3,K/1,K/2 · C = K/3. */
export function terCategory(ptkp: PtkpStatus): "A" | "B" | "C" {
  if (ptkp === "K/3") return "C";
  if (ptkp === "TK/2" || ptkp === "TK/3" || ptkp === "K/1" || ptkp === "K/2") return "B";
  return "A";
}

// [batas_atas_bulanan, tarif_persen] - bracket terakhir Infinity.
const TER_A: Array<[number, number]> = [
  [5_400_000, 0], [5_650_000, 0.25], [5_950_000, 0.5], [6_300_000, 0.75], [6_750_000, 1],
  [7_500_000, 1.25], [8_550_000, 1.5], [9_650_000, 1.75], [10_050_000, 2], [10_350_000, 2.25],
  [10_700_000, 2.5], [11_050_000, 3], [11_600_000, 3.5], [12_500_000, 4], [13_750_000, 5],
  [15_100_000, 6], [16_950_000, 7], [19_750_000, 8], [24_150_000, 9], [26_450_000, 10],
  [28_000_000, 11], [30_050_000, 12], [32_400_000, 13], [35_400_000, 14], [39_100_000, 15],
  [43_850_000, 16], [47_800_000, 17], [51_400_000, 18], [56_300_000, 19], [62_200_000, 20],
  [68_600_000, 21], [77_500_000, 22], [89_000_000, 23], [103_000_000, 24], [125_000_000, 25],
  [157_000_000, 26], [206_000_000, 27], [337_000_000, 28], [454_000_000, 29], [550_000_000, 30],
  [695_000_000, 31], [910_000_000, 32], [1_400_000_000, 33], [Infinity, 34],
];
const TER_B: Array<[number, number]> = [
  [6_200_000, 0], [6_500_000, 0.25], [6_850_000, 0.5], [7_300_000, 0.75], [9_200_000, 1],
  [10_750_000, 1.5], [11_250_000, 2], [11_600_000, 2.5], [12_600_000, 3], [13_600_000, 4],
  [14_950_000, 5], [16_400_000, 6], [18_450_000, 7], [21_850_000, 8], [26_000_000, 9],
  [27_700_000, 10], [29_350_000, 11], [31_450_000, 12], [33_950_000, 13], [37_100_000, 14],
  [41_100_000, 15], [45_800_000, 16], [49_500_000, 17], [53_800_000, 18], [58_500_000, 19],
  [64_000_000, 20], [71_000_000, 21], [80_000_000, 22], [93_000_000, 23], [109_000_000, 24],
  [129_000_000, 25], [163_000_000, 26], [211_000_000, 27], [374_000_000, 28], [459_000_000, 29],
  [555_000_000, 30], [704_000_000, 31], [957_000_000, 32], [1_405_000_000, 33], [Infinity, 34],
];
const TER_C: Array<[number, number]> = [
  [6_600_000, 0], [6_950_000, 0.25], [7_350_000, 0.5], [7_800_000, 0.75], [8_850_000, 1],
  [9_800_000, 1.25], [10_950_000, 1.5], [11_200_000, 1.75], [12_050_000, 2], [12_950_000, 3],
  [14_150_000, 4], [15_550_000, 5], [17_050_000, 6], [19_500_000, 7], [22_700_000, 8],
  [26_600_000, 9], [28_100_000, 10], [30_100_000, 11], [32_600_000, 12], [35_400_000, 13],
  [38_900_000, 14], [43_000_000, 15], [47_400_000, 16], [51_200_000, 17], [55_800_000, 18],
  [60_400_000, 19], [66_700_000, 20], [74_500_000, 21], [83_200_000, 22], [95_600_000, 23],
  [110_000_000, 24], [134_000_000, 25], [169_000_000, 26], [221_000_000, 27], [390_000_000, 28],
  [463_000_000, 29], [561_000_000, 30], [709_000_000, 31], [965_000_000, 32], [1_419_000_000, 33],
  [Infinity, 34],
];

/** Tarif TER bulanan (%) untuk penghasilan bruto sebulan. */
export function terRate(ptkp: PtkpStatus, monthlyGross: number): number {
  const table = terCategory(ptkp) === "A" ? TER_A : terCategory(ptkp) === "B" ? TER_B : TER_C;
  for (const [cap, rate] of table) if (monthlyGross <= cap) return rate;
  return table[table.length - 1][1];
}

export interface BpjsConfig {
  jhtEmp: number; jhtCo: number;        // % JHT karyawan / perusahaan
  jpEmp: number; jpCo: number; jpCap: number;   // % JP + batas upah JP
  jkk: number; jkm: number;             // % perusahaan
  kesEmp: number; kesCo: number; kesCap: number; // % BPJS Kesehatan + batas upah
}
export const DEFAULT_BPJS: BpjsConfig = {
  jhtEmp: 2, jhtCo: 3.7, jpEmp: 1, jpCo: 2, jpCap: 10_547_400,
  jkk: 0.24, jkm: 0.3, kesEmp: 1, kesCo: 4, kesCap: 12_000_000,
};

export interface PayslipInput {
  baseSalary: number;
  fixedAllowance: number;       // total tunjangan tetap
  variableAllowance: number;    // tunjangan tidak tetap periode ini (bonus/komisi)
  overtimeHours: number;        // jam lembur approved
  alphaDays: number;            // hari alpha (potong harian)
  unpaidLeaveDays: number;      // cuti tidak dibayar
  workingDays: number;          // basis pembagi harian (default 22)
  fixedDeduction: number;       // potongan tetap lain
  ptkp: PtkpStatus;
  bpjs?: BpjsConfig;
  enrollBpjsTk?: boolean;
  enrollBpjsKes?: boolean;
}

export interface PayslipResult {
  gross: number;
  overtimePay: number;
  absenceDeduction: number;
  bpjsTkEmp: number; bpjsKesEmp: number;   // dipotong dari karyawan
  bpjsTkCo: number; bpjsKesCo: number;     // beban perusahaan (info)
  pph21: number;
  totalAllowance: number;
  totalDeduction: number;
  takeHomePay: number;
  terRatePct: number;
}

const round = (n: number) => Math.round(n);

/** Hitung 1 slip bulanan (metode GROSS: PPh dipotong dari karyawan). */
export function computePayslip(inp: PayslipInput): PayslipResult {
  const workingDays = inp.workingDays > 0 ? inp.workingDays : 22;
  const daily = inp.baseSalary / workingDays;
  // Upah lembur sederhana: 1/173 × (gaji pokok + tunjangan tetap) per jam (kaidah umum).
  const overtimePay = round((inp.baseSalary + inp.fixedAllowance) / 173 * inp.overtimeHours);
  const absenceDeduction = round(daily * (inp.alphaDays + inp.unpaidLeaveDays));

  const bruto = inp.baseSalary + inp.fixedAllowance + inp.variableAllowance + overtimePay;
  const cfg = inp.bpjs ?? DEFAULT_BPJS;
  // QA M3: dasar iuran BPJS = UPAH TETAP (gaji pokok + tunjangan tetap), TIDAK
  // termasuk lembur & tunjangan tidak tetap - sesuai kaidah umum upah BPJS.
  const bpjsWage = inp.baseSalary + inp.fixedAllowance;
  const jpBase = Math.min(bpjsWage, cfg.jpCap);
  const kesBase = Math.min(bpjsWage, cfg.kesCap);
  const bpjsTkEmp = inp.enrollBpjsTk === false ? 0 : round(bpjsWage * cfg.jhtEmp / 100 + jpBase * cfg.jpEmp / 100);
  const bpjsTkCo = inp.enrollBpjsTk === false ? 0 : round(bpjsWage * (cfg.jhtCo + cfg.jkk + cfg.jkm) / 100 + jpBase * cfg.jpCo / 100);
  const bpjsKesEmp = inp.enrollBpjsKes === false ? 0 : round(kesBase * cfg.kesEmp / 100);
  const bpjsKesCo = inp.enrollBpjsKes === false ? 0 : round(kesBase * cfg.kesCo / 100);

  // TER: dasar = bruto sebulan (termasuk JKK/JKM/Kes perusahaan secara aturan;
  // penyederhanaan v1 pakai bruto tunai - konsisten & konservatif).
  const rate = terRate(inp.ptkp, bruto);
  const pph21 = round(bruto * rate / 100);

  const totalAllowance = inp.fixedAllowance + inp.variableAllowance + overtimePay;
  const totalDeduction = absenceDeduction + bpjsTkEmp + bpjsKesEmp + pph21 + inp.fixedDeduction;
  return {
    gross: round(bruto), overtimePay, absenceDeduction,
    bpjsTkEmp, bpjsKesEmp, bpjsTkCo, bpjsKesCo, pph21,
    totalAllowance: round(totalAllowance), totalDeduction: round(totalDeduction),
    takeHomePay: round(inp.baseSalary + totalAllowance - totalDeduction),
    terRatePct: rate,
  };
}

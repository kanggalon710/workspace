import test from "node:test";
import assert from "node:assert/strict";
import { computePayslip, terRate, terCategory, type PtkpStatus } from "./payroll.js";

test("kategori TER sesuai PMK 168/2023", () => {
  assert.equal(terCategory("TK/0"), "A");
  assert.equal(terCategory("K/0"), "A");
  assert.equal(terCategory("TK/2"), "B");
  assert.equal(terCategory("K/2"), "B");
  assert.equal(terCategory("K/3"), "C");
});

test("TER nol di bawah ambang PTKP bulanan", () => {
  assert.equal(terRate("TK/0", 5_000_000), 0);
  assert.equal(terRate("K/1", 6_000_000), 0);
  assert.equal(terRate("K/3", 6_500_000), 0);
});

test("TER monoton naik terhadap penghasilan", () => {
  for (const ptkp of ["TK/0", "K/1", "K/3"] as PtkpStatus[]) {
    let prev = -1;
    for (let g = 1_000_000; g <= 60_000_000; g += 500_000) {
      const r = terRate(ptkp, g);
      assert.ok(r >= prev, `${ptkp} ${g}: ${r} < ${prev}`);
      prev = r;
    }
  }
});

test("slip dasar: THP = pokok + tunjangan - potongan, komponen konsisten", () => {
  const r = computePayslip({
    baseSalary: 5_000_000, fixedAllowance: 500_000, variableAllowance: 0,
    overtimeHours: 0, alphaDays: 0, unpaidLeaveDays: 0, workingDays: 22,
    fixedDeduction: 0, ptkp: "TK/0",
  });
  assert.equal(r.gross, 5_500_000);
  assert.equal(r.pph21, round2(5_500_000 * terRate("TK/0", 5_500_000) / 100));
  assert.equal(r.takeHomePay, 5_000_000 + r.totalAllowance - r.totalDeduction);
  assert.ok(r.bpjsTkEmp > 0 && r.bpjsKesEmp > 0);
});

test("alpha & cuti tidak dibayar memotong harian; lembur menambah", () => {
  const base = computePayslip({ baseSalary: 4_400_000, fixedAllowance: 0, variableAllowance: 0, overtimeHours: 0, alphaDays: 0, unpaidLeaveDays: 0, workingDays: 22, fixedDeduction: 0, ptkp: "TK/0" });
  const cut = computePayslip({ baseSalary: 4_400_000, fixedAllowance: 0, variableAllowance: 0, overtimeHours: 0, alphaDays: 2, unpaidLeaveDays: 1, workingDays: 22, fixedDeduction: 0, ptkp: "TK/0" });
  assert.equal(cut.absenceDeduction, Math.round((4_400_000 / 22) * 3));
  assert.ok(cut.takeHomePay < base.takeHomePay);
  const ot = computePayslip({ baseSalary: 4_400_000, fixedAllowance: 0, variableAllowance: 0, overtimeHours: 10, alphaDays: 0, unpaidLeaveDays: 0, workingDays: 22, fixedDeduction: 0, ptkp: "TK/0" });
  assert.equal(ot.overtimePay, Math.round(4_400_000 / 173 * 10));
  assert.ok(ot.takeHomePay > base.takeHomePay);
});

test("opt-out BPJS meniadakan potongannya", () => {
  const r = computePayslip({ baseSalary: 6_000_000, fixedAllowance: 0, variableAllowance: 0, overtimeHours: 0, alphaDays: 0, unpaidLeaveDays: 0, workingDays: 22, fixedDeduction: 0, ptkp: "TK/0", enrollBpjsTk: false, enrollBpjsKes: false });
  assert.equal(r.bpjsTkEmp, 0);
  assert.equal(r.bpjsKesEmp, 0);
});

function round2(n: number) { return Math.round(n); }

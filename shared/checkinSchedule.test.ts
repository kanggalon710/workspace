import { test } from "node:test";
import assert from "node:assert/strict";
import { isoDow, localDateStr, localTimeStr, parseSendDays, isValidSendTime, shouldSendNow, completionRate } from "./checkinSchedule.js";

// 2026-07-13 = Senin (ISO 1). Pakai jam lokal eksplisit.
const senin0900 = new Date(2026, 6, 13, 9, 0, 0);
const senin0859 = new Date(2026, 6, 13, 8, 59, 0);
const minggu = new Date(2026, 6, 12, 9, 0, 0);

test("isoDow: Senin=1 … Minggu=7", () => {
  assert.equal(isoDow(senin0900), 1);
  assert.equal(isoDow(minggu), 7);
  assert.equal(isoDow(new Date(2026, 6, 18, 0, 0)), 6);   // Sabtu
});

test("localDateStr/localTimeStr format", () => {
  assert.equal(localDateStr(senin0900), "2026-07-13");
  assert.equal(localTimeStr(senin0859), "08:59");
});

test("parseSendDays: filter, dedupe, sort; invalid → []", () => {
  assert.deepEqual(parseSendDays("[5,1,1,9,0,3]"), [1, 3, 5]);
  assert.deepEqual(parseSendDays(null), []);
  assert.deepEqual(parseSendDays("oops"), []);
  assert.deepEqual(parseSendDays("{}"), []);
});

test("isValidSendTime", () => {
  assert.ok(isValidSendTime("09:00"));
  assert.ok(isValidSendTime("23:59"));
  assert.ok(!isValidSendTime("24:00"));
  assert.ok(!isValidSendTime("9:00"));
  assert.ok(!isValidSendTime(null));
});

const baseQ = { isActive: 1, sendDays: "[1,4]", sendTime: "09:00", lastSentDate: null as string | null };

test("shouldSendNow: kirim saat hari cocok + waktu >= sendTime + belum terkirim", () => {
  assert.ok(shouldSendNow(baseQ, senin0900));
  assert.ok(shouldSendNow(baseQ, new Date(2026, 6, 13, 14, 30)));   // catch-up setelah downtime
});

test("shouldSendNow: tidak kirim — sebelum jam / hari salah / nonaktif / sudah terkirim", () => {
  assert.ok(!shouldSendNow(baseQ, senin0859));
  assert.ok(!shouldSendNow(baseQ, minggu));
  assert.ok(!shouldSendNow({ ...baseQ, isActive: 0 }, senin0900));
  assert.ok(!shouldSendNow({ ...baseQ, lastSentDate: "2026-07-13" }, senin0900));
  assert.ok(!shouldSendNow({ ...baseQ, sendTime: "bad" }, senin0900));
  assert.ok(!shouldSendNow({ ...baseQ, sendDays: "[]" }, senin0900));
});

test("shouldSendNow: lastSentDate hari lain tetap kirim", () => {
  assert.ok(shouldSendNow({ ...baseQ, lastSentDate: "2026-07-06" }, senin0900));
});

test("completionRate", () => {
  assert.equal(completionRate(4, 3), 75);
  assert.equal(completionRate(0, 0), 0);
  assert.equal(completionRate(3, 5), 100);   // clamp
});

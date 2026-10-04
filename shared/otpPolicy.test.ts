import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideOtpRequest,
  decideOtpVerify,
  OTP_UNIFORM_MESSAGE,
  OTP_GENERIC_FAIL,
} from "./otpPolicy.js";

// ---- request-otp: semua jalur publik harus seragam (anti-enumeration) ----

test("request: unknown customer id -> silent drop, uniform response", () => {
  const d = decideOtpRequest({ customerExists: false, hasPhone: false, recentCustomerRequests: 0, maxPerWindow: 3 });
  assert.deepEqual(d, { action: "silent_drop", reason: "unknown_customer" });
});

test("request: known customer without phone -> silent drop (same public shape)", () => {
  const d = decideOtpRequest({ customerExists: true, hasPhone: false, recentCustomerRequests: 0, maxPerWindow: 3 });
  assert.deepEqual(d, { action: "silent_drop", reason: "no_phone" });
});

test("request: known customer under quota -> send", () => {
  const d = decideOtpRequest({ customerExists: true, hasPhone: true, recentCustomerRequests: 2, maxPerWindow: 3 });
  assert.deepEqual(d, { action: "send" });
});

test("request: repeated requests over per-customer quota -> silent drop, NOT a distinct 429", () => {
  const d = decideOtpRequest({ customerExists: true, hasPhone: true, recentCustomerRequests: 3, maxPerWindow: 3 });
  assert.deepEqual(d, { action: "silent_drop", reason: "customer_quota" });
});

test("uniform message does not mention phone or registration status specifics", () => {
  assert.ok(!OTP_UNIFORM_MESSAGE.toLowerCase().includes("tidak terdaftar"));
});

// ---- verify-otp: satu pesan generik untuk semua kegagalan ----

test("verify: no pending otp (unknown customer / never requested) -> generic reject", () => {
  const d = decideOtpVerify({ otpFound: false, nowMs: 1000, maxAttempts: 5 });
  assert.equal(d.outcome, "reject");
  if (d.outcome !== "reject") return;
  assert.equal(d.incrementAttempts, false);
  assert.equal(d.markExpired, false);
});

test("verify: expired otp -> generic reject + mark expired", () => {
  const d = decideOtpVerify({
    otpFound: true, status: "pending", expiresAtMs: 500, nowMs: 1000,
    attempts: 0, maxAttempts: 5, codeMatches: true,
  });
  assert.equal(d.outcome, "reject");
  if (d.outcome !== "reject") return;
  assert.equal(d.markExpired, true);
});

test("verify: wrong code -> increment attempts, no lock yet", () => {
  const d = decideOtpVerify({
    otpFound: true, status: "pending", expiresAtMs: 2000, nowMs: 1000,
    attempts: 0, maxAttempts: 5, codeMatches: false,
  });
  assert.equal(d.outcome, "reject");
  if (d.outcome !== "reject") return;
  assert.equal(d.incrementAttempts, true);
  assert.equal(d.lock, false);
});

test("verify: wrong code at final attempt -> lock", () => {
  const d = decideOtpVerify({
    otpFound: true, status: "pending", expiresAtMs: 2000, nowMs: 1000,
    attempts: 4, maxAttempts: 5, codeMatches: false,
  });
  assert.equal(d.outcome, "reject");
  if (d.outcome !== "reject") return;
  assert.equal(d.lock, true);
});

test("verify: locked otp rejects even with correct code", () => {
  const d = decideOtpVerify({
    otpFound: true, status: "locked", expiresAtMs: 2000, nowMs: 1000,
    attempts: 5, maxAttempts: 5, codeMatches: true,
  });
  assert.equal(d.outcome, "reject");
});

test("verify: already-verified otp rejects (no replay)", () => {
  const d = decideOtpVerify({
    otpFound: true, status: "verified", expiresAtMs: 2000, nowMs: 1000,
    attempts: 0, maxAttempts: 5, codeMatches: true,
  });
  assert.equal(d.outcome, "reject");
});

test("verify: correct code on pending unexpired otp -> success", () => {
  const d = decideOtpVerify({
    otpFound: true, status: "pending", expiresAtMs: 2000, nowMs: 1000,
    attempts: 2, maxAttempts: 5, codeMatches: true,
  });
  assert.equal(d.outcome, "success");
});

test("generic fail message reveals nothing about which step failed", () => {
  assert.ok(!OTP_GENERIC_FAIL.includes("sisa"));
  assert.ok(!OTP_GENERIC_FAIL.toLowerCase().includes("tidak ditemukan"));
});

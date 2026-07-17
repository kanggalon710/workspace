import { test } from "node:test";
import assert from "node:assert/strict";
import { toWhatsappNumber, telHref, whatsappHref } from "./phone.js";

test("toWhatsappNumber normalizes Indonesian formats", () => {
  assert.equal(toWhatsappNumber("08123456789"), "628123456789");
  assert.equal(toWhatsappNumber("628123456789"), "628123456789");
  assert.equal(toWhatsappNumber("8123456789"), "628123456789");
  assert.equal(toWhatsappNumber("+62 812-345-678"), "62812345678");
  assert.equal(toWhatsappNumber(""), "");
  assert.equal(toWhatsappNumber("abc"), "");
});

test("telHref keeps + and digits, strips spacing; empty when no dialable chars", () => {
  assert.equal(telHref("08123456789"), "tel:08123456789");
  assert.equal(telHref("+62 812 345"), "tel:+62812345");
  assert.equal(telHref(""), "");
  assert.equal(telHref("abc"), "");
});

test("whatsappHref builds wa.me link with encoded greeting; empty when not normalizable", () => {
  assert.equal(whatsappHref("08123456789"), "https://wa.me/628123456789?text=Halo");
  assert.equal(whatsappHref("08123456789", "Halo kak"), "https://wa.me/628123456789?text=Halo%20kak");
  assert.equal(whatsappHref("abc"), "");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CARD_COMMENT_TYPES, CARD_COMMENT_TYPE_KEYS, cardCommentType, isCardCommentType,
} from "./cardCommentTypes.js";

test("catalog has the 5 expected types in order", () => {
  assert.deepEqual(CARD_COMMENT_TYPE_KEYS, ["note", "call", "whatsapp", "visit", "activity"]);
  assert.equal(CARD_COMMENT_TYPES.length, 5);
});

test("cardCommentType returns the matching entry", () => {
  assert.equal(cardCommentType("whatsapp").label, "WhatsApp");
  assert.equal(cardCommentType("visit").icon, "MapPin");
});

test("cardCommentType falls back to note for unknown/empty", () => {
  assert.equal(cardCommentType("bogus").key, "note");
  assert.equal(cardCommentType(null).key, "note");
  assert.equal(cardCommentType(undefined).key, "note");
});

test("isCardCommentType validates membership", () => {
  assert.equal(isCardCommentType("call"), true);
  assert.equal(isCardCommentType("bogus"), false);
});

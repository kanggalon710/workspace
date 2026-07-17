import { test } from "node:test";
import assert from "node:assert/strict";
import { DIALOG_SIZES, nextDialogSize, dialogSizeClass } from "./dialogSize.js";

test("DIALOG_SIZES: normal, wide, full", () => {
  assert.deepEqual(DIALOG_SIZES, ["normal", "wide", "full"]);
});

test("nextDialogSize cycles normal → wide → full → normal", () => {
  assert.equal(nextDialogSize("normal"), "wide");
  assert.equal(nextDialogSize("wide"), "full");
  assert.equal(nextDialogSize("full"), "normal");
});

test("nextDialogSize: garbage → wide (treats unknown as normal)", () => {
  assert.equal(nextDialogSize("bogus" as any), "wide");
});

test("dialogSizeClass: mobile-first (full-width base) + sm: presets", () => {
  // every size is full-bleed-ish on mobile, widening only at sm+
  for (const s of DIALOG_SIZES) {
    const c = dialogSizeClass(s);
    assert.match(c, /w-\[/, `${s} should set a mobile width`);
    assert.match(c, /sm:/, `${s} should widen at sm+`);
  }
  assert.match(dialogSizeClass("wide"), /sm:max-w-5xl/);
  assert.match(dialogSizeClass("full"), /h-\[/); // full controls height too
});

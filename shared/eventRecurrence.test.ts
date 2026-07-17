import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEventRecurrence, expandOccurrences, toIcsRRule, icsEscape, buildTeamCalendarIcs } from "./eventRecurrence.js";

test("parseEventRecurrence: normalisasi + invalid → none", () => {
  assert.deepEqual(parseEventRecurrence(null), { freq: "none", interval: 1, until: null });
  assert.deepEqual(parseEventRecurrence("oops"), { freq: "none", interval: 1, until: null });
  assert.deepEqual(parseEventRecurrence('{"freq":"weekly","interval":2}'), { freq: "weekly", interval: 2, until: null });
  assert.deepEqual(parseEventRecurrence('{"freq":"daily","interval":0}'), { freq: "daily", interval: 1, until: null });
  assert.deepEqual(parseEventRecurrence('{"freq":"none","interval":5,"until":"2026-12-31"}'), { freq: "none", interval: 1, until: null });
});

const ev = (recurrence: string | null) => ({
  startAt: new Date(2026, 0, 5, 10, 0).toISOString(),   // Senin 5 Jan 2026 10:00
  endAt: new Date(2026, 0, 5, 11, 0).toISOString(),
  recurrence,
});

test("expandOccurrences: none → 1 occurrence dalam range", () => {
  const out = expandOccurrences(ev(null), new Date(2026, 0, 1), new Date(2026, 0, 31));
  assert.equal(out.length, 1);
  assert.equal(out[0].end.getTime() - out[0].start.getTime(), 3600_000);
});

test("expandOccurrences: none di luar range → kosong", () => {
  assert.equal(expandOccurrences(ev(null), new Date(2026, 1, 1), new Date(2026, 1, 28)).length, 0);
});

test("expandOccurrences: weekly dalam Januari", () => {
  const out = expandOccurrences(ev('{"freq":"weekly","interval":1}'), new Date(2026, 0, 1), new Date(2026, 0, 31));
  assert.equal(out.length, 4);   // 5, 12, 19, 26 Jan
  assert.equal(out[1].start.getDate(), 12);
});

test("expandOccurrences: daily interval 2 + until", () => {
  const out = expandOccurrences(
    { ...ev('{"freq":"daily","interval":2,"until":"2026-01-09"}') },
    new Date(2026, 0, 1), new Date(2026, 0, 31),
  );
  assert.equal(out.length, 3);   // 5, 7, 9 Jan
});

test("expandOccurrences: monthly same day-of-month, skip bulan tanpa tanggal", () => {
  const e31 = {
    startAt: new Date(2026, 0, 31, 9, 0).toISOString(),
    endAt: new Date(2026, 0, 31, 10, 0).toISOString(),
    recurrence: '{"freq":"monthly","interval":1}',
  };
  const out = expandOccurrences(e31, new Date(2026, 0, 1), new Date(2026, 3, 30));
  // Jan 31 & Mar 31 (Feb dilewati), Apr tidak punya 31
  assert.deepEqual(out.map((o) => [o.start.getMonth(), o.start.getDate()]), [[0, 31], [2, 31]]);
});

test("toIcsRRule", () => {
  assert.equal(toIcsRRule({ freq: "none", interval: 1, until: null }), null);
  assert.equal(toIcsRRule({ freq: "weekly", interval: 1, until: null }), "FREQ=WEEKLY");
  assert.equal(toIcsRRule({ freq: "daily", interval: 3, until: "2026-12-31" }), "FREQ=DAILY;INTERVAL=3;UNTIL=20261231T235959Z");
});

test("icsEscape", () => {
  assert.equal(icsEscape("a;b,c\nd\\e"), "a\\;b\\,c\\nd\\\\e");
});

test("buildTeamCalendarIcs: struktur valid + RRULE + escape", () => {
  const ics = buildTeamCalendarIcs("Tim NOC", [
    { id: 7, title: "Standup; pagi", startAt: "2026-01-05T03:00:00.000Z", endAt: "2026-01-05T04:00:00.000Z", recurrence: '{"freq":"weekly","interval":1}', notes: "Bahas insiden, rencana" },
  ], new Date("2026-01-01T00:00:00.000Z"));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.includes("X-WR-CALNAME:Tim NOC"));
  assert.ok(ics.includes("UID:teamspace-event-7@workspace.jabnet.id"));
  assert.ok(ics.includes("DTSTART:20260105T030000Z"));
  assert.ok(ics.includes("SUMMARY:Standup\\; pagi"));
  assert.ok(ics.includes("RRULE:FREQ=WEEKLY"));
  assert.ok(ics.trimEnd().endsWith("END:VCALENDAR"));
  // Event dengan tanggal invalid dilewati tanpa crash
  const ics2 = buildTeamCalendarIcs("X", [{ id: 1, title: "b", startAt: "bad", endAt: "bad", recurrence: null }], new Date());
  assert.ok(!ics2.includes("BEGIN:VEVENT"));
});

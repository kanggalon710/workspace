import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTeamRole, resolveTeamPipelineCapabilities, canManageTeam, canCreateTeam,
  canSeePrivateCard, parseMovePermission, canMoveWithStage, parseEnabledViews,
} from "./teamAccess.js";
import { ALL_PIPELINE_CAPABILITIES } from "./pipelineCapabilities.js";

test("parseTeamRole: manager passes, everything else member", () => {
  assert.equal(parseTeamRole("manager"), "manager");
  assert.equal(parseTeamRole("member"), "member");
  assert.equal(parseTeamRole("weird"), "member");
  assert.equal(parseTeamRole(null), "member");
  assert.equal(parseTeamRole(undefined), "member");
});

test("resolveTeamPipelineCapabilities: admin & creator full", () => {
  const admin = resolveTeamPipelineCapabilities({ isAdmin: true, isCreator: false, teamRole: null, keyLevel: "none" });
  assert.equal(admin.size, ALL_PIPELINE_CAPABILITIES.length);
  const creator = resolveTeamPipelineCapabilities({ isAdmin: false, isCreator: true, teamRole: null, keyLevel: "none" });
  assert.equal(creator.size, ALL_PIPELINE_CAPABILITIES.length);
});

test("resolveTeamPipelineCapabilities: non-anggota nol - walau keyLevel write", () => {
  const caps = resolveTeamPipelineCapabilities({ isAdmin: false, isCreator: false, teamRole: null, keyLevel: "write" });
  assert.equal(caps.size, 0);
});

test("resolveTeamPipelineCapabilities: manager tim full", () => {
  const caps = resolveTeamPipelineCapabilities({ isAdmin: false, isCreator: false, teamRole: "manager", keyLevel: "none" });
  assert.equal(caps.size, ALL_PIPELINE_CAPABILITIES.length);
});

test("resolveTeamPipelineCapabilities: member write → working set tanpa kelola struktur", () => {
  const caps = resolveTeamPipelineCapabilities({ isAdmin: false, isCreator: false, teamRole: "member", keyLevel: "write" });
  assert.ok(caps.has("view"));
  assert.ok(caps.has("cards"));
  assert.ok(caps.has("comment"));
  assert.ok(caps.has("assign"));
  assert.ok(!caps.has("stages"));
  assert.ok(!caps.has("fields"));
  assert.ok(!caps.has("automation"));
  assert.ok(!caps.has("manage"));
  assert.ok(!caps.has("delete"));
});

test("resolveTeamPipelineCapabilities: member read → view saja; none → nol", () => {
  const read = resolveTeamPipelineCapabilities({ isAdmin: false, isCreator: false, teamRole: "member", keyLevel: "read" });
  assert.deepEqual([...read], ["view"]);
  const none = resolveTeamPipelineCapabilities({ isAdmin: false, isCreator: false, teamRole: "member", keyLevel: "none" });
  assert.equal(none.size, 0);
});

test("canManageTeam: admin / teams:write / manager - member tidak", () => {
  assert.ok(canManageTeam({ isAdmin: true, teamsKeyLevel: "none", teamRole: null }));
  assert.ok(canManageTeam({ isAdmin: false, teamsKeyLevel: "write", teamRole: null }));
  assert.ok(canManageTeam({ isAdmin: false, teamsKeyLevel: "none", teamRole: "manager" }));
  assert.ok(!canManageTeam({ isAdmin: false, teamsKeyLevel: "read", teamRole: "member" }));
  assert.ok(!canManageTeam({ isAdmin: false, teamsKeyLevel: "none", teamRole: null }));
});

test("canCreateTeam: hanya admin / teams:write", () => {
  assert.ok(canCreateTeam({ isAdmin: true, teamsKeyLevel: "none" }));
  assert.ok(canCreateTeam({ isAdmin: false, teamsKeyLevel: "write" }));
  assert.ok(!canCreateTeam({ isAdmin: false, teamsKeyLevel: "read" }));
});

test("canSeePrivateCard: creator/assignee/follower/admin ya - lainnya tidak", () => {
  const base = { isAdmin: false, createdBy: 1, assigneeIds: [2, 3], followerIds: [4] };
  assert.ok(canSeePrivateCard({ ...base, userId: 1 }));       // creator
  assert.ok(canSeePrivateCard({ ...base, userId: 2 }));       // assignee
  assert.ok(canSeePrivateCard({ ...base, userId: 4 }));       // follower
  assert.ok(canSeePrivateCard({ ...base, userId: 9, isAdmin: true }));
  assert.ok(!canSeePrivateCard({ ...base, userId: 9 }));      // orang lain (termasuk manager)
});

test("parseMovePermission: null/invalid/kosong → null (semua boleh)", () => {
  assert.equal(parseMovePermission(null), null);
  assert.equal(parseMovePermission(""), null);
  assert.equal(parseMovePermission("not-json"), null);
  assert.equal(parseMovePermission("{}"), null);
  assert.equal(parseMovePermission('{"userIds":[],"roleIds":[]}'), null);
  assert.equal(parseMovePermission('{"userIds":["x",-1,0]}'), null);   // semua invalid tersaring
});

test("parseMovePermission: valid parsing + filter angka", () => {
  const p = parseMovePermission('{"userIds":[5,"7",0],"roleIds":[2]}');
  assert.deepEqual(p, { userIds: [5, 7], roleIds: [2] });
});

test("canMoveWithStage: aturan enforcement", () => {
  const mp = { userIds: [5], roleIds: [2] };
  const base = { movePermission: mp, isAdmin: false, isManager: false, roleId: null as number | null };
  assert.ok(canMoveWithStage({ ...base, userId: 5 }));                     // user terdaftar
  assert.ok(canMoveWithStage({ ...base, userId: 9, roleId: 2 }));          // role terdaftar
  assert.ok(!canMoveWithStage({ ...base, userId: 9, roleId: 3 }));         // tidak terdaftar
  assert.ok(canMoveWithStage({ ...base, userId: 9, isAdmin: true }));      // admin bypass
  assert.ok(canMoveWithStage({ ...base, userId: 9, isManager: true }));    // manager bypass
  assert.ok(canMoveWithStage({ movePermission: null, isAdmin: false, isManager: false, userId: 9, roleId: null })); // tanpa aturan
});

test("parseEnabledViews: default, filter, dedupe, urutan terjaga", () => {
  assert.deepEqual(parseEnabledViews(null), ["summary", "tasks"]);
  assert.deepEqual(parseEnabledViews("oops"), ["summary", "tasks"]);
  assert.deepEqual(parseEnabledViews('["tasks","summary"]'), ["tasks", "summary"]);
  assert.deepEqual(parseEnabledViews('["tasks","bogus","tasks","chat"]'), ["tasks", "chat"]);
  assert.deepEqual(parseEnabledViews("[]"), ["summary", "tasks"]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mapAgent, suggestAgentMatchesByEmail } from "./chatwootAgent.js";

test("mapAgent maps fields + availability", () => {
  assert.deepEqual(
    mapAgent({ id: 7, name: "CS Sari", email: "sari@jabnet.id", role: "agent", availability_status: "online" }),
    { id: 7, name: "CS Sari", email: "sari@jabnet.id", role: "agent", available: true },
  );
  assert.equal(mapAgent({ id: 8, name: "X", availability_status: "offline" }).available, false);
  assert.equal(mapAgent({ id: 9, name: "Y" }).email, null);
});

test("suggestAgentMatchesByEmail matches case-insensitively, skips empty", () => {
  const agents = [
    { id: 1, name: "A", email: "Sari@Jabnet.id", role: null, available: true },
    { id: 2, name: "B", email: "budi@jabnet.id", role: null, available: false },
  ];
  const users = [
    { id: 10, email: "sari@jabnet.id" },
    { id: 11, email: null },
    { id: 12, email: "none@x.id" },
  ];
  assert.deepEqual(suggestAgentMatchesByEmail(agents, users), [{ userId: 10, agentId: 1 }]);
});

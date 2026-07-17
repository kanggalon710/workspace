import { test } from "node:test";
import assert from "node:assert/strict";
import { mapInbox, mapConversation, mapMessage, mapConversationsPage } from "./chatwootMappers.js";

test("mapInbox", () => {
  assert.deepEqual(mapInbox({ id: 1, name: "WhatsApp", channel_type: "Channel::Whatsapp" }),
    { id: 1, name: "WhatsApp", channelType: "Channel::Whatsapp" });
});

test("mapMessage decodes message_type int + private", () => {
  assert.equal(mapMessage({ id: 5, content: "hai", message_type: 0, created_at: 1700000000, sender: { name: "Budi" } }).type, "incoming");
  assert.equal(mapMessage({ id: 6, content: "balas", message_type: 1, created_at: 1700000000 }).type, "outgoing");
  assert.equal(mapMessage({ id: 7, content: "x", message_type: 2 }).type, "activity");
  assert.equal(mapMessage({ id: 8, content: "note", message_type: 1, private: true }).type, "private");
});

test("mapMessage created_at epoch-seconds → ISO; tolerates missing", () => {
  const m = mapMessage({ id: 9, content: null, message_type: 0, created_at: 1700000000 });
  assert.equal(m.createdAt, new Date(1700000000 * 1000).toISOString());
  assert.equal(mapMessage({ id: 10, message_type: 0 }).createdAt, null);
});

test("mapConversation pulls last message + assignee + contact", () => {
  const c = mapConversation({
    id: 42, inbox_id: 1, status: "open",
    messages: [{ content: "halo", created_at: 1700000000 }],
    last_non_activity_message: { content: "halo terakhir" },
    meta: { assignee: { id: 5, name: "CS Sari" }, sender: { name: "Budi" } },
    unread_count: 2,
    timestamp: 1700000500,
  });
  assert.equal(c.id, 42);
  assert.equal(c.inboxId, 1);
  assert.equal(c.status, "open");
  assert.equal(c.lastMessage, "halo terakhir");
  assert.equal(c.assigneeName, "CS Sari");
  assert.equal(c.assigneeId, 5);
  assert.equal(c.contactName, "Budi");
  assert.equal(c.unread, 2);
});

test("mapConversationsPage reads data.payload + data.meta", () => {
  const page = mapConversationsPage({ data: { meta: { all_count: 3, current_page: "1" }, payload: [{ id: 1, status: "open" }, { id: 2, status: "resolved" }] } });
  assert.equal(page.conversations.length, 2);
  assert.equal(page.meta.count, 3);
  assert.equal(page.meta.currentPage, 1);
});

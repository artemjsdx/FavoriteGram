import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.js";

class MockD1Statement {
  constructor(database, sql) { this.database = database; this.sql = sql.replace(/\s+/g, " ").trim(); this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() {
    if (this.sql.startsWith("SELECT data, updated_at FROM app_state")) return this.database.row ? { ...this.database.row } : null;
    if (this.sql.startsWith("SELECT data FROM app_file_chunks")) {
      const [fileName, chunkIndex] = this.values;
      const data = this.database.files.get(fileName)?.get(chunkIndex);
      return data ? { data } : null;
    }
    throw new Error(`Unsupported first(): ${this.sql}`);
  }
  async run() {
    if (this.sql.startsWith("INSERT OR IGNORE INTO app_state")) {
      if (!this.database.row) this.database.row = { data: this.values[0], updated_at: 0 };
      return { meta: { changes: 1 } };
    }
    if (this.sql.startsWith("UPDATE app_state SET data")) {
      const [data, nextRevision, expectedRevision] = this.values;
      if (!this.database.row || this.database.row.updated_at !== expectedRevision) return { meta: { changes: 0 } };
      this.database.row = { data, updated_at: nextRevision };
      return { meta: { changes: 1 } };
    }
    if (this.sql.startsWith("INSERT INTO app_file_chunks")) {
      const [fileName, chunkIndex, data] = this.values;
      const chunks = this.database.files.get(fileName) || new Map();
      chunks.set(chunkIndex, data);
      this.database.files.set(fileName, chunks);
      return { meta: { changes: 1 } };
    }
    if (this.sql.startsWith("DELETE FROM app_file_chunks")) {
      const deleted = this.database.files.delete(this.values[0]);
      return { meta: { changes: deleted ? 1 : 0 } };
    }
    throw new Error(`Unsupported run(): ${this.sql}`);
  }
}

class MockD1 {
  row = null;
  files = new Map();
  prepare(sql) { return new MockD1Statement(this, sql); }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
}

let nextIp = 10;

function session(env) {
  let cookie = "";
  const ip = `203.0.113.${nextIp++}`;
  return {
    async request(path, init = {}) {
      const headers = new Headers(init.headers || {});
      if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
      if (cookie) headers.set("cookie", cookie);
      headers.set("cf-connecting-ip", ip);
      const request = new Request(`https://favouritegram.example${path}`, { ...init, headers });
      const response = await worker.fetch(request, env);
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await response.json() : await response.text();
      return { response, data };
    },
  };
}

test("Sites Worker persists accounts, chats, polling events and D1 uploads", async () => {
  const env = { DB: new MockD1() };
  const alice = session(env);
  const bob = session(env);

  const aliceRegistration = await alice.request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "hosted_alice", password: "alice-pass" }) });
  assert.equal(aliceRegistration.response.status, 201);
  assert.equal(aliceRegistration.data.recoveryCodes.length, 8);
  const recoveryCode = aliceRegistration.data.recoveryCodes[0];
  assert.equal((await bob.request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "hosted_bob", password: "bob-pass" }) })).response.status, 201);

  const profile = await alice.request("/api/me", { method: "PATCH", body: JSON.stringify({ name: "Алиса", bio: "Hosted backend" }) });
  assert.equal(profile.data.user.name, "Алиса");
  const savedPreferences = await alice.request("/api/me/preferences", { method: "PATCH", body: JSON.stringify({ appearance: { accent: "rose", bubbleOutline: "accent" }, notifications: { vibration: false, quietHours: true } }) });
  assert.equal(savedPreferences.response.status, 200);
  assert.equal(savedPreferences.data.appearance.accent, "rose");
  assert.equal(savedPreferences.data.appearance.bubbleOutline, "accent");
  assert.equal(savedPreferences.data.notifications.vibration, false);
  assert.equal((await alice.request("/api/me/preferences")).data.notifications.quietHours, true);
  assert.deepEqual((await bob.request("/api/users?query=ali")).data.users.map((user) => user.username), ["@hosted_alice"]);

  const created = await alice.request("/api/chats", { method: "POST", body: JSON.stringify({ username: "hosted_bob" }) });
  assert.equal(created.response.status, 200);
  const chatId = created.data.chat.id;
  const sent = await alice.request(`/api/chats/${chatId}/messages`, { method: "POST", body: JSON.stringify({ kind: "text", body: "Привет из Worker", clientId: "hosted-1" }) });
  assert.equal(sent.response.status, 201);
  const duplicate = await alice.request(`/api/chats/${chatId}/messages`, { method: "POST", body: JSON.stringify({ kind: "text", body: "Дубликат", clientId: "hosted-1" }) });
  assert.equal(duplicate.data.message.id, sent.data.message.id);
  const bobChats = await bob.request("/api/chats");
  assert.equal(bobChats.data.chats[0].messages[0].body, "Привет из Worker");
  assert.equal(bobChats.data.chats[0].unread, 1);
  assert.equal((await bob.request(`/api/chats/${chatId}/read`, { method: "POST", body: "{}" })).response.status, 200);
  assert.equal((await bob.request("/api/chats")).data.chats[0].unread, 0);

  const reply = await bob.request(`/api/chats/${chatId}/messages`, { method: "POST", body: JSON.stringify({ kind: "text", body: "Ответ", replyToId: sent.data.message.id, clientId: "hosted-2" }) });
  assert.equal(reply.data.message.replyTo.body, "Привет из Worker");
  const edited = await bob.request(`/api/chats/${chatId}/messages/${reply.data.message.id}`, { method: "PATCH", body: JSON.stringify({ body: "Ответ изменён" }) });
  assert.equal(edited.data.message.body, "Ответ изменён");
  assert.ok(edited.data.message.editedAt);
  const reacted = await alice.request(`/api/chats/${chatId}/messages/${reply.data.message.id}/reactions`, { method: "POST", body: JSON.stringify({ emoji: "🔥" }) });
  assert.equal(reacted.data.message.reactions[0].count, 1);
  assert.equal(reacted.data.message.reactions[0].reactedByMe, true);
  const customReaction = await alice.request(`/api/chats/${chatId}/messages/${reply.data.message.id}/reactions`, { method: "POST", body: JSON.stringify({ emoji: "🧠" }) });
  assert.equal(customReaction.response.status, 200);
  assert.ok(customReaction.data.message.reactions.some((reaction) => reaction.emoji === "🧠" && reaction.reactedByMe));
  const invalidReaction = await alice.request(`/api/chats/${chatId}/messages/${reply.data.message.id}/reactions`, { method: "POST", body: JSON.stringify({ emoji: "🔥👍" }) });
  assert.equal(invalidReaction.response.status, 400);
  const page = await alice.request(`/api/chats/${chatId}/messages?limit=1`);
  assert.equal(page.data.messages.length, 1);
  assert.equal(page.data.hasMore, true);
  const deleted = await bob.request(`/api/chats/${chatId}/messages/${reply.data.message.id}`, { method: "DELETE" });
  assert.ok(deleted.data.message.deletedAt);

  const events = await bob.request("/api/events");
  assert.match(events.data, /event: refresh/);

  const uploaded = await alice.request("/api/uploads", { method: "POST", body: JSON.stringify({ name: "note.txt", dataUrl: "data:text/plain;base64,0KLQtdGB0YI=" }) });
  assert.equal(uploaded.response.status, 201);
  assert.equal(env.DB.files.size, 1);
  const file = await alice.request(uploaded.data.url);
  assert.equal(file.response.status, 200);
  assert.equal(file.data, "Тест");
  assert.equal((await alice.request(`/api/chats/${chatId}/messages`, { method: "POST", body: JSON.stringify({ kind: "file", mediaUrl: uploaded.data.url, fileName: "note.txt", fileSize: 8, fileType: "text/plain" }) })).response.status, 201);

  const bobSecond = session(env);
  assert.equal((await bobSecond.request("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "hosted_bob", password: "bob-pass" }) })).response.status, 200);
  const sessions = await bob.request("/api/sessions");
  assert.equal(sessions.data.sessions.length, 2);
  const otherSession = sessions.data.sessions.find((item) => !item.current);
  assert.equal((await bob.request(`/api/sessions/${otherSession.id}`, { method: "DELETE" })).response.status, 200);
  assert.equal((await bobSecond.request("/api/me")).response.status, 401);
  assert.equal((await bob.request("/api/me/recovery-codes", { method: "POST", body: JSON.stringify({ password: "bob-pass" }) })).data.recoveryCodes.length, 8);
  assert.equal((await bob.request("/api/me/password", { method: "POST", body: JSON.stringify({ currentPassword: "bob-pass", newPassword: "bob-new-pass" }) })).response.status, 200);
  assert.equal((await session(env).request("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "hosted_bob", password: "bob-pass" }) })).response.status, 401);

  const charlie = session(env);
  await charlie.request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "hosted_charlie", password: "charlie-pass" }) });
  assert.equal((await charlie.request("/api/me", { method: "DELETE", body: JSON.stringify({ password: "charlie-pass" }) })).response.status, 200);
  assert.equal((await session(env).request("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "hosted_charlie", password: "charlie-pass" }) })).response.status, 401);

  assert.equal((await bob.request("/api/users/hosted_alice/block", { method: "POST", body: "{}" })).response.status, 200);
  assert.equal((await bob.request("/api/users?query=ali")).data.users.length, 0);
  assert.equal((await bob.request("/api/users/hosted_alice/block", { method: "DELETE" })).response.status, 200);
  assert.equal((await bob.request("/api/users?query=ali")).data.users.length, 1);

  const csrf = await alice.request("/api/me", { method: "PATCH", headers: { origin: "https://evil.example" }, body: JSON.stringify({ name: "Hacked" }) });
  assert.equal(csrf.response.status, 403);

  const recovered = session(env);
  const recovery = await recovered.request("/api/auth/recover", { method: "POST", body: JSON.stringify({ username: "hosted_alice", recoveryCode, newPassword: "alice-new-pass" }) });
  assert.equal(recovery.response.status, 200);
  assert.equal((await recovered.request("/api/me")).data.user.username, "@hosted_alice");
  assert.equal((await session(env).request("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "hosted_alice", password: "alice-pass" }) })).response.status, 401);

  assert.equal((await bob.request(`/api/chats/${chatId}`, { method: "DELETE" })).response.status, 200);
  assert.equal((await bob.request("/api/chats")).data.chats.length, 0);
});

test("Sites Worker supports groups, privacy and WebRTC signaling state", async () => {
  const env = { DB: new MockD1() };
  const owner = session(env);
  const a = session(env);
  const b = session(env);
  await owner.request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "owner", password: "owner-pass" }) });
  await a.request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "worker_a", password: "member-pass" }) });
  await b.request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "worker_b", password: "member-pass" }) });
  assert.equal((await a.request("/api/me/privacy", { method: "PATCH", body: JSON.stringify({ discoverable: false }) })).data.privacy.discoverable, false);
  assert.equal((await owner.request("/api/users?query=worker_a")).data.users.length, 0);
  await a.request("/api/me/privacy", { method: "PATCH", body: JSON.stringify({ discoverable: true }) });

  const direct = await owner.request("/api/chats", { method: "POST", body: JSON.stringify({ username: "worker_a" }) });
  const group = await owner.request("/api/groups", { method: "POST", body: JSON.stringify({ name: "Worker group", usernames: ["worker_a", "worker_b"] }) });
  assert.equal(group.data.chat.group, true);
  assert.equal(group.data.chat.members.length, 3);

  const call = await owner.request("/api/calls", { method: "POST", body: JSON.stringify({ conversationId: direct.data.chat.id, mode: "video", offer: { type: "offer", sdp: "worker-offer" } }) });
  assert.equal(call.response.status, 201);
  assert.equal((await a.request("/api/calls")).data.calls[0].role, "callee");
  const answer = await a.request(`/api/calls/${call.data.call.id}`, { method: "PATCH", body: JSON.stringify({ answer: { type: "answer", sdp: "worker-answer" }, status: "active", candidate: { candidate: "candidate:1" } }) });
  assert.equal(answer.data.call.status, "active");
  assert.equal((await owner.request(`/api/calls/${call.data.call.id}`)).data.call.answer.sdp, "worker-answer");
});

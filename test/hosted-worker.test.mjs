import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.js";

class MockD1Statement {
  constructor(database, sql) { this.database = database; this.sql = sql.replace(/\s+/g, " ").trim(); this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() {
    if (this.sql.startsWith("SELECT data, updated_at FROM app_state")) return this.database.row ? { ...this.database.row } : null;
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
    throw new Error(`Unsupported run(): ${this.sql}`);
  }
}

class MockD1 {
  row = null;
  prepare(sql) { return new MockD1Statement(this, sql); }
}

class MockR2 {
  objects = new Map();
  async put(key, value, options = {}) { this.objects.set(key, { value: new Uint8Array(value), type: options.httpMetadata?.contentType || "application/octet-stream" }); }
  async delete(key) { this.objects.delete(key); }
  async get(key) {
    const item = this.objects.get(key);
    if (!item) return null;
    return { body: item.value, httpEtag: `\"${key}\"`, writeHttpMetadata(headers) { headers.set("content-type", item.type); } };
  }
}

function session(env) {
  let cookie = "";
  return {
    async request(path, init = {}) {
      const headers = new Headers(init.headers || {});
      if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
      if (cookie) headers.set("cookie", cookie);
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

test("Sites Worker persists accounts, chats, polling events and R2 uploads", async () => {
  const env = { DB: new MockD1(), BUCKET: new MockR2() };
  const alice = session(env);
  const bob = session(env);

  assert.equal((await alice.request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "hosted_alice", password: "alice-pass" }) })).response.status, 201);
  assert.equal((await bob.request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "hosted_bob", password: "bob-pass" }) })).response.status, 201);

  const created = await alice.request("/api/chats", { method: "POST", body: JSON.stringify({ username: "hosted_bob" }) });
  assert.equal(created.response.status, 200);
  const chatId = created.data.chat.id;
  const sent = await alice.request(`/api/chats/${chatId}/messages`, { method: "POST", body: JSON.stringify({ kind: "text", body: "Привет из Worker", clientId: "hosted-1" }) });
  assert.equal(sent.response.status, 201);
  assert.equal((await bob.request("/api/chats")).data.chats[0].messages[0].body, "Привет из Worker");

  const events = await bob.request("/api/events");
  assert.match(events.data, /event: refresh/);

  const uploaded = await alice.request("/api/uploads", { method: "POST", body: JSON.stringify({ name: "note.txt", dataUrl: "data:text/plain;base64,0KLQtdGB0YI=" }) });
  assert.equal(uploaded.response.status, 201);
  assert.equal(env.BUCKET.objects.size, 1);
  const file = await alice.request(uploaded.data.url);
  assert.equal(file.response.status, 200);
  assert.equal(file.data, "Тест");
});

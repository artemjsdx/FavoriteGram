import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

const port = 34000 + (process.pid % 1000)
const origin = `http://127.0.0.1:${port}`
let dataDir
let server

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`${origin}/api/health`)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error("Test server did not start")
}

function startServer() {
  server = spawn(process.execPath, ["server/index.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATA_DIR: dataDir, PUBLIC_DIR: "out", NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  })
}

function stopServer() {
  return new Promise((resolve) => {
    if (!server || server.exitCode !== null) return resolve()
    server.once("exit", resolve)
    server.kill("SIGTERM")
  })
}

function session() {
  let cookie = ""
  return {
    async request(path, init = {}) {
      const response = await fetch(`${origin}${path}`, {
        ...init,
        headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...init.headers },
      })
      const setCookie = response.headers.get("set-cookie")
      if (setCookie) cookie = setCookie.split(";")[0]
      const data = (response.headers.get("content-type") || "").includes("application/json") ? await response.json() : null
      return { response, data }
    },
  }
}

test.before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "favourite-gram-test-"))
  startServer()
  await waitForServer()
})

test.after(async () => {
  await stopServer()
  await rm(dataDir, { recursive: true, force: true })
})

test("accounts, profiles, chats, uploads, unread state, persistence and recovery", async () => {
  const alice = session()
  const bob = session()

  const aliceRegistration = await alice.request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "alice", password: "alice-pass" }) })
  assert.equal(aliceRegistration.response.status, 201)
  assert.equal(aliceRegistration.data.user.username, "@alice")
  assert.equal(aliceRegistration.data.recoveryCodes.length, 8)
  const recoveryCode = aliceRegistration.data.recoveryCodes[0]

  const bobRegistration = await bob.request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "bob", password: "bob-pass" }) })
  assert.equal(bobRegistration.response.status, 201)

  const profile = await alice.request("/api/me", { method: "PATCH", body: JSON.stringify({ name: "Алиса", bio: "Проверяю realtime" }) })
  assert.equal(profile.response.status, 200)
  assert.equal(profile.data.user.name, "Алиса")

  const search = await bob.request("/api/users?query=ali")
  assert.deepEqual(search.data.users.map((user) => user.username), ["@alice"])

  const created = await alice.request("/api/chats", { method: "POST", body: JSON.stringify({ username: "@bob" }) })
  assert.equal(created.response.status, 200)
  const chatId = created.data.chat.id

  const sent = await alice.request(`/api/chats/${chatId}/messages`, { method: "POST", body: JSON.stringify({ kind: "text", body: "Привет, Боб" }) })
  assert.equal(sent.response.status, 201)

  const bobChats = await bob.request("/api/chats")
  assert.equal(bobChats.data.chats.length, 1)
  assert.equal(bobChats.data.chats[0].messages[0].body, "Привет, Боб")
  assert.equal(bobChats.data.chats[0].unread, 1)

  const read = await bob.request(`/api/chats/${chatId}/read`, { method: "POST", body: "{}" })
  assert.equal(read.response.status, 200)
  assert.equal((await bob.request("/api/chats")).data.chats[0].unread, 0)

  const uploaded = await alice.request("/api/uploads", { method: "POST", body: JSON.stringify({ name: "note.txt", dataUrl: "data:text/plain;base64,0KLQtdGB0YI=" }) })
  assert.equal(uploaded.response.status, 201)
  assert.match(uploaded.data.url, /^\/uploads\/[a-f0-9-]+\.txt$/)
  const fileMessage = await alice.request(`/api/chats/${chatId}/messages`, { method: "POST", body: JSON.stringify({ kind: "file", mediaUrl: uploaded.data.url, fileName: "note.txt", fileSize: 8, fileType: "text/plain" }) })
  assert.equal(fileMessage.response.status, 201)

  const csrf = await alice.request("/api/me", { method: "PATCH", headers: { origin: "https://evil.example" }, body: JSON.stringify({ name: "Hacked" }) })
  assert.equal(csrf.response.status, 403)

  await bob.request(`/api/chats/${chatId}`, { method: "DELETE" })
  assert.equal((await bob.request("/api/chats")).data.chats.length, 0)

  const recoverySession = session()
  const recovered = await recoverySession.request("/api/auth/recover", { method: "POST", body: JSON.stringify({ username: "alice", recoveryCode, newPassword: "new-pass" }) })
  assert.equal(recovered.response.status, 200)
  assert.equal(recovered.data.recoveryCodesLeft, 7)
  assert.equal((await recoverySession.request("/api/me")).data.user.username, "@alice")

  const oldPassword = await session().request("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "alice", password: "alice-pass" }) })
  assert.equal(oldPassword.response.status, 401)
  const newPassword = await session().request("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "alice", password: "new-pass" }) })
  assert.equal(newPassword.response.status, 200)

  await stopServer()
  startServer()
  await waitForServer()
  const afterRestart = session()
  const persisted = await afterRestart.request("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "alice", password: "new-pass" }) })
  assert.equal(persisted.response.status, 200)
  const persistedChats = await afterRestart.request("/api/chats")
  assert.equal(persistedChats.data.chats[0].messages.length, 2)
})

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
  const savedPreferences = await alice.request("/api/me/preferences", { method: "PATCH", body: JSON.stringify({ appearance: { accent: "ocean", bubbleShape: "round" }, notifications: { sound: false, quietHours: true } }) })
  assert.equal(savedPreferences.response.status, 200)
  assert.equal(savedPreferences.data.appearance.accent, "ocean")
  assert.equal(savedPreferences.data.appearance.bubbleShape, "round")
  assert.equal(savedPreferences.data.notifications.sound, false)
  assert.equal((await alice.request("/api/me/preferences")).data.notifications.quietHours, true)

  const search = await bob.request("/api/users?query=ali")
  assert.deepEqual(search.data.users.map((user) => user.username), ["@alice"])

  const created = await alice.request("/api/chats", { method: "POST", body: JSON.stringify({ username: "@bob" }) })
  assert.equal(created.response.status, 200)
  const chatId = created.data.chat.id

  const sent = await alice.request(`/api/chats/${chatId}/messages`, { method: "POST", body: JSON.stringify({ kind: "text", body: "Привет, Боб", clientId: "alice-message-1" }) })
  assert.equal(sent.response.status, 201)
  const duplicate = await alice.request(`/api/chats/${chatId}/messages`, { method: "POST", body: JSON.stringify({ kind: "text", body: "Дубликат", clientId: "alice-message-1" }) })
  assert.equal(duplicate.response.status, 200)
  assert.equal(duplicate.data.message.id, sent.data.message.id)

  const bobChats = await bob.request("/api/chats")
  assert.equal(bobChats.data.chats.length, 1)
  assert.equal(bobChats.data.chats[0].messages[0].body, "Привет, Боб")
  assert.equal(bobChats.data.chats[0].unread, 1)

  const read = await bob.request(`/api/chats/${chatId}/read`, { method: "POST", body: "{}" })
  assert.equal(read.response.status, 200)
  assert.equal((await bob.request("/api/chats")).data.chats[0].unread, 0)

  const reply = await bob.request(`/api/chats/${chatId}/messages`, { method: "POST", body: JSON.stringify({ kind: "text", body: "Привет, Алиса", replyToId: sent.data.message.id, clientId: "bob-reply-1" }) })
  assert.equal(reply.response.status, 201)
  assert.equal(reply.data.message.replyTo.body, "Привет, Боб")
  const edited = await bob.request(`/api/chats/${chatId}/messages/${reply.data.message.id}`, { method: "PATCH", body: JSON.stringify({ body: "Рад тебя видеть" }) })
  assert.equal(edited.response.status, 200)
  assert.equal(edited.data.message.body, "Рад тебя видеть")
  assert.ok(edited.data.message.editedAt)
  const reacted = await alice.request(`/api/chats/${chatId}/messages/${reply.data.message.id}/reactions`, { method: "POST", body: JSON.stringify({ emoji: "🔥" }) })
  assert.equal(reacted.data.message.reactions[0].count, 1)
  assert.equal(reacted.data.message.reactions[0].reactedByMe, true)
  const customReaction = await alice.request(`/api/chats/${chatId}/messages/${reply.data.message.id}/reactions`, { method: "POST", body: JSON.stringify({ emoji: "🧠" }) })
  assert.equal(customReaction.response.status, 200)
  assert.ok(customReaction.data.message.reactions.some((reaction) => reaction.emoji === "🧠" && reaction.reactedByMe))
  const invalidReaction = await alice.request(`/api/chats/${chatId}/messages/${reply.data.message.id}/reactions`, { method: "POST", body: JSON.stringify({ emoji: "🔥👍" }) })
  assert.equal(invalidReaction.response.status, 400)
  const page = await alice.request(`/api/chats/${chatId}/messages?limit=1`)
  assert.equal(page.data.messages.length, 1)
  assert.equal(page.data.hasMore, true)
  const deleted = await bob.request(`/api/chats/${chatId}/messages/${reply.data.message.id}`, { method: "DELETE" })
  assert.equal(deleted.response.status, 200)
  assert.ok(deleted.data.message.deletedAt)

  const uploaded = await alice.request("/api/uploads", { method: "POST", body: JSON.stringify({ name: "note.txt", dataUrl: "data:text/plain;base64,0KLQtdGB0YI=" }) })
  assert.equal(uploaded.response.status, 201)
  assert.match(uploaded.data.url, /^\/uploads\/[a-f0-9-]+\.txt$/)
  const fileMessage = await alice.request(`/api/chats/${chatId}/messages`, { method: "POST", body: JSON.stringify({ kind: "file", mediaUrl: uploaded.data.url, fileName: "note.txt", fileSize: 8, fileType: "text/plain" }) })
  assert.equal(fileMessage.response.status, 201)

  const bobSecond = session()
  assert.equal((await bobSecond.request("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "bob", password: "bob-pass" }) })).response.status, 200)
  const activeSessions = await bob.request("/api/sessions")
  assert.equal(activeSessions.data.sessions.length, 2)
  const otherSession = activeSessions.data.sessions.find((item) => !item.current)
  assert.equal((await bob.request(`/api/sessions/${otherSession.id}`, { method: "DELETE" })).response.status, 200)
  assert.equal((await bobSecond.request("/api/me")).response.status, 401)
  const newCodes = await bob.request("/api/me/recovery-codes", { method: "POST", body: JSON.stringify({ password: "bob-pass" }) })
  assert.equal(newCodes.data.recoveryCodes.length, 8)
  const changedPassword = await bob.request("/api/me/password", { method: "POST", body: JSON.stringify({ currentPassword: "bob-pass", newPassword: "bob-new-pass" }) })
  assert.equal(changedPassword.response.status, 200)
  assert.equal((await session().request("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "bob", password: "bob-pass" }) })).response.status, 401)

  const charlie = session()
  await charlie.request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "charlie", password: "charlie-pass" }) })
  assert.equal((await charlie.request("/api/me", { method: "DELETE", body: JSON.stringify({ password: "charlie-pass" }) })).response.status, 200)
  assert.equal((await session().request("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "charlie", password: "charlie-pass" }) })).response.status, 401)

  assert.equal((await bob.request("/api/users/alice/block", { method: "POST", body: "{}" })).response.status, 200)
  assert.equal((await bob.request("/api/users?query=ali")).data.users.length, 0)
  assert.equal((await bob.request("/api/users/alice/block", { method: "DELETE" })).response.status, 200)
  assert.equal((await bob.request("/api/users?query=ali")).data.users.length, 1)

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
  assert.equal(persistedChats.data.chats[0].messages.length, 3)
})

test("privacy, chat preferences, groups, search, forwarding, pinning, reports and call signaling", async () => {
  const owner = session()
  const memberA = session()
  const memberB = session()
  await owner.request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "group_owner", password: "owner-pass" }) })
  await memberA.request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "member_a", password: "member-pass" }) })
  await memberB.request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "member_b", password: "member-pass" }) })

  const privacy = await memberA.request("/api/me/privacy", { method: "PATCH", body: JSON.stringify({ discoverable: false, showOnline: false, messagesFrom: "contacts" }) })
  assert.equal(privacy.data.privacy.discoverable, false)
  assert.equal((await owner.request("/api/users?query=member_a")).data.users.length, 0)
  await memberA.request("/api/me/privacy", { method: "PATCH", body: JSON.stringify({ discoverable: true, messagesFrom: "everyone" }) })

  const direct = await owner.request("/api/chats", { method: "POST", body: JSON.stringify({ username: "member_a" }) })
  const directId = direct.data.chat.id
  const sent = await owner.request(`/api/chats/${directId}/messages`, { method: "POST", body: JSON.stringify({ kind: "text", body: "уникальный поисковый текст" }) })
  assert.equal((await owner.request("/api/messages/search?query=поисковый")).data.results.length, 1)
  assert.equal((await owner.request(`/api/chats/${directId}/preferences`, { method: "PATCH", body: JSON.stringify({ pinned: true, muted: true, archived: true }) })).data.chat.archived, true)
  assert.equal((await owner.request(`/api/chats/${directId}/messages/${sent.data.message.id}/pin`, { method: "POST", body: "{}" })).data.pinned, true)

  const second = await owner.request("/api/chats", { method: "POST", body: JSON.stringify({ username: "member_b" }) })
  const forwarded = await owner.request(`/api/chats/${directId}/messages/${sent.data.message.id}/forward`, { method: "POST", body: JSON.stringify({ conversationId: second.data.chat.id }) })
  assert.equal(forwarded.response.status, 201)
  assert.equal(forwarded.data.message.body, "уникальный поисковый текст")

  const group = await owner.request("/api/groups", { method: "POST", body: JSON.stringify({ name: "Тестовая группа", usernames: ["member_a", "member_b"] }) })
  assert.equal(group.response.status, 201)
  assert.equal(group.data.chat.group, true)
  assert.equal(group.data.chat.members.length, 3)
  assert.equal((await memberB.request("/api/chats")).data.chats.some((chat) => chat.id === group.data.chat.id), true)

  const call = await owner.request("/api/calls", { method: "POST", body: JSON.stringify({ conversationId: directId, mode: "audio", offer: { type: "offer", sdp: "test-offer" } }) })
  assert.equal(call.response.status, 201)
  const incoming = await memberA.request("/api/calls")
  assert.equal(incoming.data.calls[0].role, "callee")
  const answered = await memberA.request(`/api/calls/${call.data.call.id}`, { method: "PATCH", body: JSON.stringify({ answer: { type: "answer", sdp: "test-answer" }, status: "active" }) })
  assert.equal(answered.data.call.status, "active")
  assert.equal((await owner.request(`/api/calls/${call.data.call.id}`)).data.call.answer.sdp, "test-answer")
  assert.equal((await owner.request("/api/reports", { method: "POST", body: JSON.stringify({ username: "member_a", messageId: sent.data.message.id, reason: "Тест" }) })).response.status, 201)
})

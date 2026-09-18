import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, join, normalize, resolve, sep } from "node:path"
import { promisify } from "node:util"

const scrypt = promisify(scryptCallback)
const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || "0.0.0.0"
const dataDir = resolve(process.env.DATA_DIR || ".data")
const uploadsDir = join(dataDir, "uploads")
const databaseFile = join(dataDir, "database.json")
const publicDir = resolve(process.env.PUBLIC_DIR || "out")
const sessionMaxAge = 60 * 60 * 24 * 30
const maxJsonBytes = 36 * 1024 * 1024
const secureCookie = process.env.NODE_ENV === "production"
const allowedOrigin = process.env.PUBLIC_ORIGIN || ""
const sseClients = new Map()
const authAttempts = new Map()
let persistQueue = Promise.resolve()

const mimeTypes = {
  ".aac": "audio/aac",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".zip": "application/zip",
}

const emptyDatabase = () => ({ version: 6, users: [], sessions: [], conversations: [], messages: [], uploads: [], reports: [], calls: [] })
let database = emptyDatabase()

const recoveryAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function createRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(10)
    const value = Array.from(bytes, (byte) => recoveryAlphabet[byte % recoveryAlphabet.length]).join("")
    return `${value.slice(0, 5)}-${value.slice(5)}`
  })
}

function normalizeRecoveryCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
}

function normalizeUsername(value) {
  return String(value || "").trim().replace(/^@/, "").toLowerCase()
}

function publicUser(user) {
  return {
    id: user.id,
    username: `@${user.username}`,
    name: user.name,
    bio: user.bio,
    avatarUrl: user.avatarUrl || "",
    online: privacyFor(user).showOnline && Boolean(sseClients.get(user.id)?.size),
  }
}

function privacyFor(user) {
  return { discoverable: user.privacy?.discoverable !== false, messagesFrom: ["everyone", "contacts", "nobody"].includes(user.privacy?.messagesFrom) ? user.privacy.messagesFrom : "everyone", showOnline: user.privacy?.showOnline !== false }
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers })
  response.end(JSON.stringify(body))
}

function parseCookies(request) {
  return Object.fromEntries(String(request.headers.cookie || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=")
    return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))]
  }))
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex")
}

async function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const result = await scrypt(password, salt, 64)
  return { salt, hash: Buffer.from(result).toString("hex") }
}

async function verifyPassword(password, salt, expectedHex) {
  const result = Buffer.from(await scrypt(password, salt, 64))
  const expected = Buffer.from(expectedHex, "hex")
  return result.length === expected.length && timingSafeEqual(result, expected)
}

async function readBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxJsonBytes) throw Object.assign(new Error("Payload too large"), { status: 413 })
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) }
  catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }) }
}

function persist() {
  persistQueue = persistQueue.then(async () => {
    const temporary = `${databaseFile}.tmp`
    await writeFile(temporary, JSON.stringify(database, null, 2), { mode: 0o600 })
    await rename(temporary, databaseFile)
  })
  return persistQueue
}

function getSessionUser(request) {
  const session = getSession(request)
  return session ? database.users.find((user) => user.id === session.userId) || null : null
}

function getSession(request) {
  const token = parseCookies(request).fg_session
  if (!token) return null
  return database.sessions.find((item) => item.tokenHash === hashToken(token) && item.expiresAt > Date.now()) || null
}

async function createSession(response, userId, request) {
  const token = randomBytes(32).toString("base64url")
  database.sessions = database.sessions.filter((session) => session.expiresAt > Date.now())
  database.sessions.push({ id: randomUUID(), userId, tokenHash: hashToken(token), createdAt: Date.now(), lastSeenAt: Date.now(), userAgent: String(request?.headers?.["user-agent"] || "Неизвестное устройство").slice(0, 240), ip: String(request?.headers?.["x-forwarded-for"] || request?.socket?.remoteAddress || "").split(",")[0].trim(), expiresAt: Date.now() + sessionMaxAge * 1000 })
  await persist()
  const cookie = [`fg_session=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${sessionMaxAge}`]
  if (secureCookie) cookie.push("Secure")
  response.setHeader("set-cookie", cookie.join("; "))
}

function clearSession(response) {
  const cookie = ["fg_session=", "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"]
  if (secureCookie) cookie.push("Secure")
  response.setHeader("set-cookie", cookie.join("; "))
}

function rateLimited(request) {
  const ip = String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "unknown").split(",")[0].trim()
  const now = Date.now()
  const attempts = (authAttempts.get(ip) || []).filter((time) => now - time < 60_000)
  attempts.push(now)
  authAttempts.set(ip, attempts)
  return attempts.length > 12
}

function originAllowed(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method || "GET")) return true
  const origin = request.headers.origin
  if (!origin) return true
  if (allowedOrigin) return origin === allowedOrigin
  const protocol = String(request.headers["x-forwarded-proto"] || (secureCookie ? "https" : "http")).split(",")[0].trim()
  return origin === `${protocol}://${request.headers.host}`
}

function getConversationForUser(id, userId) {
  return database.conversations.find((conversation) => conversation.id === id && conversation.participants.includes(userId))
}

function relatedUserIds(userId) {
  return [...new Set([userId, ...database.conversations.filter((conversation) => conversation.participants.includes(userId)).flatMap((conversation) => conversation.participants)])]
}

function serializeMessage(message, currentUserId, conversation) {
  const sender = database.users.find((user) => user.id === message.senderId)
  const reply = message.replyToId ? database.messages.find((item) => item.id === message.replyToId && item.conversationId === message.conversationId) : null
  const replySender = reply ? database.users.find((user) => user.id === reply.senderId) : null
  const otherId = conversation?.participants.find((id) => id !== message.senderId)
  const otherReadAt = Number(conversation?.readAt?.[otherId] || 0)
  const delivery = message.senderId === currentUserId ? (otherReadAt >= message.createdAt ? "read" : "delivered") : "delivered"
  const reactionGroups = Object.entries(message.reactions || {}).map(([emoji, userIds]) => ({ emoji, count: userIds.length, reactedByMe: userIds.includes(currentUserId) })).filter((reaction) => reaction.count > 0)
  return { ...message, sender: sender ? publicUser(sender) : null, delivery, reactions: reactionGroups, replyTo: reply ? { id: reply.id, kind: reply.kind, body: reply.deletedAt ? "Сообщение удалено" : reply.body, senderName: replySender?.name || replySender?.username || "Пользователь" } : null }
}

function serializeConversation(conversation, currentUserId, limit = 50) {
  const otherId = conversation.participants.find((id) => id !== currentUserId) || currentUserId
  const other = database.users.find((user) => user.id === otherId)
  const members = conversation.participants.map((id) => database.users.find((user) => user.id === id)).filter(Boolean).map(publicUser)
  const person = conversation.type === "group" ? { id: conversation.id, username: `@group_${conversation.id.slice(0, 8)}`, name: conversation.name || "Группа", bio: `${members.length} участников`, avatarUrl: "", online: false } : (other ? publicUser(other) : null)
  const allMessages = database.messages.filter((message) => message.conversationId === conversation.id).sort((a, b) => a.createdAt - b.createdAt)
  const messages = allMessages.slice(-limit)
  const readAt = Number(conversation.readAt?.[currentUserId] || 0)
  const unread = allMessages.filter((message) => message.senderId !== currentUserId && message.createdAt > readAt).length
  return { id: conversation.id, person, group: conversation.type === "group", members, messages: messages.map((message) => serializeMessage(message, currentUserId, conversation)), unread, updatedAt: conversation.updatedAt, hasMore: allMessages.length > messages.length, oldestMessageAt: messages[0]?.createdAt || null, archived: conversation.archivedFor?.includes(currentUserId) || false, muted: conversation.mutedFor?.includes(currentUserId) || false, pinned: conversation.pinnedFor?.includes(currentUserId) || false, pinnedMessageIds: conversation.pinnedMessageIds || [] }
}

function broadcast(userIds, event, payload) {
  const body = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
  for (const userId of userIds) for (const response of sseClients.get(userId) || []) response.write(body)
}

function broadcastConversation(conversation, event, message) {
  for (const participantId of conversation.participants) {
    broadcast([participantId], event, { conversationId: conversation.id, message: serializeMessage(message, participantId, conversation), chat: serializeConversation(conversation, participantId) })
  }
}

async function cleanupOrphanUploads() {
  const referenced = new Set([
    ...database.messages.map((message) => message.mediaUrl).filter(Boolean),
    ...database.users.map((user) => user.avatarUrl).filter(Boolean),
  ])
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const orphaned = database.uploads.filter((upload) => upload.createdAt < cutoff && !referenced.has(upload.url))
  if (!orphaned.length) return
  const orphanIds = new Set(orphaned.map((upload) => upload.id))
  database.uploads = database.uploads.filter((upload) => !orphanIds.has(upload.id))
  await Promise.all(orphaned.map((upload) => unlink(join(uploadsDir, upload.fileName)).catch(() => undefined)))
  await persist()
}

async function handleApi(request, response, url) {
  if (!originAllowed(request)) return json(response, 403, { error: "Origin is not allowed" })
  if (url.pathname === "/api/health" && request.method === "GET") return json(response, 200, { ok: true, service: "favourite-gram", host: "Wispbyte" })

  if ((url.pathname === "/api/auth/register" || url.pathname === "/api/auth/login") && request.method === "POST") {
    if (rateLimited(request)) return json(response, 429, { error: "Слишком много попыток. Подождите минуту." })
    const body = await readBody(request)
    const username = normalizeUsername(body.username)
    const password = String(body.password || "")
    if (!/^[a-z0-9_]{3,32}$/.test(username)) return json(response, 400, { error: "Юзернейм: 3–32 символа, латиница, цифры и подчёркивание." })
    if (password.length < 5 || password.length > 256) return json(response, 400, { error: "Пароль должен содержать от 5 до 256 символов." })
    let user = database.users.find((item) => item.username === username)
    if (url.pathname.endsWith("register")) {
      if (user) return json(response, 409, { error: "Этот юзернейм уже занят." })
      const passwordData = await hashPassword(password)
      const recoveryCodes = createRecoveryCodes()
      user = { id: randomUUID(), username, passwordSalt: passwordData.salt, passwordHash: passwordData.hash, recoveryCodeHashes: recoveryCodes.map((code) => hashToken(normalizeRecoveryCode(code))), blockedUserIds: [], name: username, bio: "В сети", avatarUrl: "", createdAt: Date.now(), updatedAt: Date.now() }
      database.users.push(user)
      await persist()
      await createSession(response, user.id, request)
      return json(response, 201, { user: publicUser(user), recoveryCodes })
    } else {
      if (!user || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) return json(response, 401, { error: "Неверный юзернейм или пароль." })
    }
    await createSession(response, user.id, request)
    return json(response, 200, { user: publicUser(user) })
  }

  if (url.pathname === "/api/auth/recover" && request.method === "POST") {
    if (rateLimited(request)) return json(response, 429, { error: "Слишком много попыток. Подождите минуту." })
    const body = await readBody(request)
    const username = normalizeUsername(body.username)
    const password = String(body.newPassword || "")
    const codeHash = hashToken(normalizeRecoveryCode(body.recoveryCode))
    const user = database.users.find((item) => item.username === username)
    const index = user?.recoveryCodeHashes?.findIndex((item) => item === codeHash) ?? -1
    if (!user || index < 0) return json(response, 401, { error: "Неверный юзернейм или код восстановления." })
    if (password.length < 5 || password.length > 256) return json(response, 400, { error: "Новый пароль должен содержать от 5 до 256 символов." })
    const passwordData = await hashPassword(password)
    user.passwordSalt = passwordData.salt
    user.passwordHash = passwordData.hash
    user.recoveryCodeHashes.splice(index, 1)
    user.updatedAt = Date.now()
    database.sessions = database.sessions.filter((session) => session.userId !== user.id)
    await persist()
    await createSession(response, user.id, request)
    return json(response, 200, { user: publicUser(user), recoveryCodesLeft: user.recoveryCodeHashes.length })
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    const token = parseCookies(request).fg_session
    if (token) database.sessions = database.sessions.filter((session) => session.tokenHash !== hashToken(token))
    await persist()
    clearSession(response)
    return json(response, 200, { ok: true })
  }

  const user = getSessionUser(request)
  if (!user) return json(response, 401, { error: "Нужно войти в аккаунт." })

  if (url.pathname === "/api/me" && request.method === "GET") return json(response, 200, { user: publicUser(user) })
  if (url.pathname === "/api/me/privacy" && request.method === "GET") return json(response, 200, { privacy: privacyFor(user) })
  if (url.pathname === "/api/me/privacy" && request.method === "PATCH") {
    const body = await readBody(request)
    const current = privacyFor(user)
    user.privacy = {
      discoverable: typeof body.discoverable === "boolean" ? body.discoverable : current.discoverable,
      messagesFrom: ["everyone", "contacts", "nobody"].includes(body.messagesFrom) ? body.messagesFrom : current.messagesFrom,
      showOnline: typeof body.showOnline === "boolean" ? body.showOnline : current.showOnline,
    }
    user.updatedAt = Date.now()
    await persist()
    return json(response, 200, { privacy: user.privacy })
  }
  if (url.pathname === "/api/me" && request.method === "PATCH") {
    const body = await readBody(request)
    if (typeof body.name === "string") user.name = body.name.trim().slice(0, 48) || user.username
    if (typeof body.bio === "string") user.bio = body.bio.trim().slice(0, 160)
    if (typeof body.avatarUrl === "string" && (!body.avatarUrl || /^\/uploads\/[a-f0-9-]+\.[a-z0-9]+$/i.test(body.avatarUrl))) user.avatarUrl = body.avatarUrl.slice(0, 512)
    user.updatedAt = Date.now()
    await persist()
    broadcast(relatedUserIds(user.id), "profile.updated", { user: publicUser(user) })
    return json(response, 200, { user: publicUser(user) })
  }

  if (url.pathname === "/api/me/password" && request.method === "POST") {
    const body = await readBody(request)
    const currentPassword = String(body.currentPassword || "")
    const newPassword = String(body.newPassword || "")
    if (!(await verifyPassword(currentPassword, user.passwordSalt, user.passwordHash))) return json(response, 403, { error: "Текущий пароль указан неверно." })
    if (newPassword.length < 5 || newPassword.length > 256) return json(response, 400, { error: "Новый пароль должен содержать от 5 до 256 символов." })
    const passwordData = await hashPassword(newPassword)
    user.passwordSalt = passwordData.salt
    user.passwordHash = passwordData.hash
    user.updatedAt = Date.now()
    const currentSession = getSession(request)
    database.sessions = database.sessions.filter((session) => session.userId !== user.id || session.id === currentSession?.id)
    await persist()
    return json(response, 200, { ok: true })
  }

  if (url.pathname === "/api/me/recovery-codes" && request.method === "POST") {
    const body = await readBody(request)
    if (!(await verifyPassword(String(body.password || ""), user.passwordSalt, user.passwordHash))) return json(response, 403, { error: "Пароль указан неверно." })
    const recoveryCodes = createRecoveryCodes()
    user.recoveryCodeHashes = recoveryCodes.map((code) => hashToken(normalizeRecoveryCode(code)))
    user.updatedAt = Date.now()
    await persist()
    return json(response, 200, { recoveryCodes })
  }

  if (url.pathname === "/api/sessions" && request.method === "GET") {
    const current = getSession(request)
    const sessions = database.sessions.filter((session) => session.userId === user.id && session.expiresAt > Date.now()).map((session) => ({ id: session.id, current: session.id === current?.id, userAgent: session.userAgent || "Неизвестное устройство", ip: session.ip || "", createdAt: session.createdAt || session.expiresAt - sessionMaxAge * 1000, lastSeenAt: session.lastSeenAt || session.createdAt || Date.now() }))
    return json(response, 200, { sessions })
  }

  const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/)
  if (sessionMatch && request.method === "DELETE") {
    const current = getSession(request)
    const target = database.sessions.find((session) => session.id === sessionMatch[1] && session.userId === user.id)
    if (!target) return json(response, 404, { error: "Сессия не найдена." })
    database.sessions = database.sessions.filter((session) => session.id !== target.id)
    await persist()
    if (target.id === current?.id) clearSession(response)
    return json(response, 200, { ok: true, current: target.id === current?.id })
  }

  if (url.pathname === "/api/me" && request.method === "DELETE") {
    const body = await readBody(request)
    if (!(await verifyPassword(String(body.password || ""), user.passwordSalt, user.passwordHash))) return json(response, 403, { error: "Пароль указан неверно." })
    const conversationIds = database.conversations.filter((conversation) => conversation.participants.includes(user.id) && conversation.type !== "group").map((conversation) => conversation.id)
    const groupIds = database.conversations.filter((conversation) => conversation.participants.includes(user.id) && conversation.type === "group").map((conversation) => conversation.id)
    const ownedUploads = database.uploads.filter((upload) => upload.userId === user.id)
    database.messages = database.messages.filter((message) => !conversationIds.includes(message.conversationId) && !(groupIds.includes(message.conversationId) && message.senderId === user.id))
    database.conversations = database.conversations.filter((conversation) => !conversationIds.includes(conversation.id))
    for (const conversation of database.conversations.filter((item) => groupIds.includes(item.id))) {
      conversation.participants = conversation.participants.filter((id) => id !== user.id)
      if (conversation.createdBy === user.id) conversation.createdBy = conversation.participants[0]
    }
    database.conversations = database.conversations.filter((conversation) => conversation.type !== "group" || conversation.participants.length >= 2)
    database.sessions = database.sessions.filter((session) => session.userId !== user.id)
    database.uploads = database.uploads.filter((upload) => upload.userId !== user.id)
    database.users = database.users.filter((item) => item.id !== user.id).map((item) => ({ ...item, blockedUserIds: (item.blockedUserIds || []).filter((id) => id !== user.id) }))
    await persist()
    await Promise.all(ownedUploads.map((upload) => unlink(join(uploadsDir, upload.fileName)).catch(() => undefined)))
    clearSession(response)
    return json(response, 200, { ok: true })
  }

  const blockMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/block$/)
  if (blockMatch && (request.method === "POST" || request.method === "DELETE")) {
    const target = database.users.find((item) => item.username === normalizeUsername(blockMatch[1]))
    if (!target || target.id === user.id) return json(response, 404, { error: "Пользователь не найден." })
    const blocked = new Set(user.blockedUserIds || [])
    if (request.method === "POST") blocked.add(target.id); else blocked.delete(target.id)
    user.blockedUserIds = [...blocked]
    await persist()
    return json(response, 200, { blocked: request.method === "POST" })
  }

  if (url.pathname === "/api/blocked" && request.method === "GET") {
    const blocked = (user.blockedUserIds || []).map((id) => database.users.find((item) => item.id === id)).filter(Boolean).map(publicUser)
    return json(response, 200, { users: blocked })
  }

  if (url.pathname === "/api/users" && request.method === "GET") {
    const query = normalizeUsername(url.searchParams.get("query"))
    const users = query.length < 2 ? [] : database.users.filter((item) => item.id !== user.id && privacyFor(item).discoverable && !(user.blockedUserIds || []).includes(item.id) && !(item.blockedUserIds || []).includes(user.id) && `${item.username} ${item.name}`.toLowerCase().includes(query)).slice(0, 20).map(publicUser)
    return json(response, 200, { users })
  }

  if (url.pathname === "/api/messages/search" && request.method === "GET") {
    const query = String(url.searchParams.get("query") || "").trim().toLowerCase()
    if (query.length < 2) return json(response, 200, { results: [] })
    const allowed = new Set(database.conversations.filter((conversation) => conversation.participants.includes(user.id) && !conversation.hiddenFor?.includes(user.id)).map((conversation) => conversation.id))
    const results = database.messages.filter((message) => allowed.has(message.conversationId) && !message.deletedAt && `${message.body || ""} ${message.fileName || ""}`.toLowerCase().includes(query)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50).map((message) => {
      const conversation = database.conversations.find((item) => item.id === message.conversationId)
      return { conversationId: message.conversationId, message: serializeMessage(message, user.id, conversation), chat: serializeConversation(conversation, user.id, 1) }
    })
    return json(response, 200, { results })
  }

  if (url.pathname === "/api/chats" && request.method === "GET") {
    const chats = database.conversations.filter((conversation) => conversation.participants.includes(user.id) && !conversation.hiddenFor?.includes(user.id)).sort((a, b) => b.updatedAt - a.updatedAt).map((conversation) => serializeConversation(conversation, user.id))
    return json(response, 200, { chats })
  }

  if (url.pathname === "/api/chats" && request.method === "POST") {
    const body = await readBody(request)
    const target = database.users.find((item) => item.username === normalizeUsername(body.username))
    if (!target || target.id === user.id) return json(response, 404, { error: "Пользователь не найден." })
    if ((user.blockedUserIds || []).includes(target.id) || (target.blockedUserIds || []).includes(user.id)) return json(response, 403, { error: "Диалог недоступен из-за блокировки." })
    let conversation = database.conversations.find((item) => item.participants.length === 2 && item.participants.includes(user.id) && item.participants.includes(target.id))
    if (!conversation) {
      const targetPrivacy = privacyFor(target)
      const existingContact = database.conversations.some((item) => item.participants.includes(user.id) && item.participants.includes(target.id))
      if (targetPrivacy.messagesFrom === "nobody" || (targetPrivacy.messagesFrom === "contacts" && !existingContact)) return json(response, 403, { error: "Пользователь ограничил новые сообщения." })
      conversation = { id: randomUUID(), participants: [user.id, target.id], hiddenFor: [], archivedFor: [], mutedFor: [], pinnedFor: [], pinnedMessageIds: [], readAt: { [user.id]: Date.now(), [target.id]: 0 }, createdAt: Date.now(), updatedAt: Date.now() }
      database.conversations.push(conversation)
    } else conversation.hiddenFor = (conversation.hiddenFor || []).filter((id) => id !== user.id)
    await persist()
    return json(response, 200, { chat: serializeConversation(conversation, user.id) })
  }

  if (url.pathname === "/api/groups" && request.method === "POST") {
    const body = await readBody(request)
    const name = String(body.name || "").trim().slice(0, 64)
    const usernames = [...new Set((Array.isArray(body.usernames) ? body.usernames : []).map(normalizeUsername).filter(Boolean))]
    if (name.length < 2) return json(response, 400, { error: "Название группы должно содержать минимум 2 символа." })
    const invited = usernames.map((username) => database.users.find((item) => item.username === username)).filter(Boolean).filter((item) => item.id !== user.id)
    if (invited.length < 2 || invited.length !== usernames.filter((username) => username !== user.username).length) return json(response, 400, { error: "Добавьте минимум двух существующих пользователей." })
    if (invited.length > 99) return json(response, 400, { error: "В группе может быть не больше 100 участников." })
    if (invited.some((item) => (user.blockedUserIds || []).includes(item.id) || (item.blockedUserIds || []).includes(user.id))) return json(response, 403, { error: "Нельзя добавить заблокированного пользователя." })
    const participants = [user.id, ...invited.map((item) => item.id)]
    const now = Date.now()
    const conversation = { id: randomUUID(), type: "group", name, createdBy: user.id, participants, hiddenFor: [], archivedFor: [], mutedFor: [], pinnedFor: [], pinnedMessageIds: [], readAt: Object.fromEntries(participants.map((id) => [id, id === user.id ? now : 0])), createdAt: now, updatedAt: now }
    database.conversations.push(conversation)
    await persist()
    broadcast(participants.filter((id) => id !== user.id), "refresh", { conversationId: conversation.id })
    return json(response, 201, { chat: serializeConversation(conversation, user.id) })
  }

  if (url.pathname === "/api/calls" && request.method === "GET") {
    const now = Date.now()
    database.calls = database.calls.filter((call) => call.expiresAt > now)
    const calls = database.calls.filter((call) => call.participants.includes(user.id) && !["ended", "declined"].includes(call.status)).map((call) => ({ ...call, role: call.callerId === user.id ? "caller" : "callee" }))
    return json(response, 200, { calls })
  }

  if (url.pathname === "/api/calls" && request.method === "POST") {
    const body = await readBody(request)
    const conversation = getConversationForUser(String(body.conversationId || ""), user.id)
    if (!conversation || conversation.participants.length !== 2) return json(response, 400, { error: "Звонки доступны только в личных чатах." })
    const now = Date.now()
    const call = { id: randomUUID(), conversationId: conversation.id, callerId: user.id, participants: [...conversation.participants], mode: body.mode === "video" ? "video" : "audio", status: "ringing", offer: body.offer || null, answer: null, candidates: {}, createdAt: now, updatedAt: now, expiresAt: now + 5 * 60_000 }
    database.calls.push(call)
    await persist()
    broadcast(conversation.participants.filter((id) => id !== user.id), "call.updated", { call })
    return json(response, 201, { call: { ...call, role: "caller" } })
  }

  const callMatch = url.pathname.match(/^\/api\/calls\/([^/]+)$/)
  if (callMatch && (request.method === "GET" || request.method === "PATCH")) {
    const call = database.calls.find((item) => item.id === callMatch[1] && item.participants.includes(user.id))
    if (!call) return json(response, 404, { error: "Звонок не найден." })
    if (request.method === "GET") return json(response, 200, { call: { ...call, role: call.callerId === user.id ? "caller" : "callee" } })
    const body = await readBody(request)
    if (body.offer && call.callerId === user.id) call.offer = body.offer
    if (body.answer && call.callerId !== user.id) call.answer = body.answer
    if (body.candidate) {
      call.candidates ||= {}
      call.candidates[user.id] ||= []
      if (call.candidates[user.id].length < 128) call.candidates[user.id].push(body.candidate)
    }
    if (["active", "declined", "ended"].includes(body.status)) call.status = body.status
    call.updatedAt = Date.now()
    call.expiresAt = call.status === "active" ? Date.now() + 2 * 60 * 60_000 : Math.min(call.expiresAt, Date.now() + 5 * 60_000)
    await persist()
    broadcast(call.participants.filter((id) => id !== user.id), "call.updated", { call })
    return json(response, 200, { call: { ...call, role: call.callerId === user.id ? "caller" : "callee" } })
  }

  const groupMatch = url.pathname.match(/^\/api\/groups\/([^/]+)$/)
  if (groupMatch && request.method === "PATCH") {
    const conversation = getConversationForUser(groupMatch[1], user.id)
    if (!conversation || conversation.type !== "group") return json(response, 404, { error: "Группа не найдена." })
    if (conversation.createdBy !== user.id) return json(response, 403, { error: "Изменять группу может только создатель." })
    const body = await readBody(request)
    if (typeof body.name === "string") conversation.name = body.name.trim().slice(0, 64) || conversation.name
    if (Array.isArray(body.usernames)) {
      const invited = [...new Set(body.usernames.map(normalizeUsername))].map((username) => database.users.find((item) => item.username === username)).filter(Boolean).filter((item) => item.id !== user.id)
      if (invited.length < 2) return json(response, 400, { error: "В группе должно остаться минимум три участника." })
      if (invited.some((item) => (user.blockedUserIds || []).includes(item.id) || (item.blockedUserIds || []).includes(user.id))) return json(response, 403, { error: "Нельзя добавить заблокированного пользователя." })
      conversation.participants = [user.id, ...invited.map((item) => item.id)].slice(0, 100)
    }
    conversation.updatedAt = Date.now()
    await persist()
    broadcast(conversation.participants, "refresh", { conversationId: conversation.id })
    return json(response, 200, { chat: serializeConversation(conversation, user.id) })
  }

  const chatMatch = url.pathname.match(/^\/api\/chats\/([^/]+)$/)
  if (chatMatch && request.method === "DELETE") {
    const conversation = getConversationForUser(chatMatch[1], user.id)
    if (!conversation) return json(response, 404, { error: "Чат не найден." })
    conversation.hiddenFor = [...new Set([...(conversation.hiddenFor || []), user.id])]
    await persist()
    return json(response, 200, { ok: true })
  }

  const preferenceMatch = url.pathname.match(/^\/api\/chats\/([^/]+)\/preferences$/)
  if (preferenceMatch && request.method === "PATCH") {
    const conversation = getConversationForUser(preferenceMatch[1], user.id)
    if (!conversation) return json(response, 404, { error: "Чат не найден." })
    const body = await readBody(request)
    for (const [field, list] of [["archived", "archivedFor"], ["muted", "mutedFor"], ["pinned", "pinnedFor"]]) {
      if (typeof body[field] !== "boolean") continue
      const values = new Set(conversation[list] || [])
      if (body[field]) values.add(user.id); else values.delete(user.id)
      conversation[list] = [...values]
    }
    await persist()
    return json(response, 200, { chat: serializeConversation(conversation, user.id) })
  }

  const readMatch = url.pathname.match(/^\/api\/chats\/([^/]+)\/read$/)
  if (readMatch && request.method === "POST") {
    const conversation = getConversationForUser(readMatch[1], user.id)
    if (!conversation) return json(response, 404, { error: "Чат не найден." })
    conversation.readAt = { ...(conversation.readAt || {}), [user.id]: Date.now() }
    await persist()
    const otherIds = conversation.participants.filter((id) => id !== user.id)
    broadcast(otherIds, "chat.read", { conversationId: conversation.id, username: `@${user.username}`, readAt: conversation.readAt[user.id] })
    return json(response, 200, { ok: true })
  }

  const typingMatch = url.pathname.match(/^\/api\/chats\/([^/]+)\/typing$/)
  if (typingMatch && request.method === "POST") {
    const conversation = getConversationForUser(typingMatch[1], user.id)
    if (!conversation) return json(response, 404, { error: "Чат не найден." })
    const body = await readBody(request)
    broadcast(conversation.participants.filter((id) => id !== user.id), "typing.updated", { conversationId: conversation.id, username: `@${user.username}`, typing: Boolean(body.typing) })
    return json(response, 200, { ok: true })
  }

  const messageMatch = url.pathname.match(/^\/api\/chats\/([^/]+)\/messages$/)
  if (messageMatch && request.method === "GET") {
    const conversation = getConversationForUser(messageMatch[1], user.id)
    if (!conversation) return json(response, 404, { error: "Чат не найден." })
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 50)))
    const before = Number(url.searchParams.get("before") || Number.MAX_SAFE_INTEGER)
    const all = database.messages.filter((message) => message.conversationId === conversation.id && message.createdAt < before).sort((a, b) => b.createdAt - a.createdAt)
    const page = all.slice(0, limit).reverse()
    return json(response, 200, { messages: page.map((message) => serializeMessage(message, user.id, conversation)), hasMore: all.length > page.length, nextBefore: page[0]?.createdAt || null })
  }
  if (messageMatch && request.method === "POST") {
    const conversation = getConversationForUser(messageMatch[1], user.id)
    if (!conversation) return json(response, 404, { error: "Чат не найден." })
    const others = conversation.participants.filter((id) => id !== user.id).map((id) => database.users.find((item) => item.id === id)).filter(Boolean)
    if (others.some((other) => (user.blockedUserIds || []).includes(other.id) || (other.blockedUserIds || []).includes(user.id))) return json(response, 403, { error: "Сообщения недоступны из-за блокировки." })
    const body = await readBody(request)
    const kind = ["text", "voice", "video", "file"].includes(body.kind) ? body.kind : "text"
    const text = String(body.body || "").trim().slice(0, 4000)
    if (kind === "text" && !text) return json(response, 400, { error: "Пустое сообщение отправить нельзя." })
    const mediaUrl = String(body.mediaUrl || "").slice(0, 512)
    if (kind !== "text" && !/^\/uploads\/[a-f0-9-]+\.[a-z0-9]+$/i.test(mediaUrl)) return json(response, 400, { error: "Сначала загрузите вложение." })
    const replyTo = body.replyToId ? database.messages.find((item) => item.id === body.replyToId && item.conversationId === conversation.id) : null
    if (body.replyToId && !replyTo) return json(response, 400, { error: "Сообщение для ответа не найдено." })
    const clientId = String(body.clientId || "").slice(0, 80)
    const duplicate = clientId && database.messages.find((item) => item.senderId === user.id && item.clientId === clientId)
    if (duplicate) return json(response, 200, { message: serializeMessage(duplicate, user.id, conversation) })
    const message = { id: randomUUID(), clientId, conversationId: conversation.id, senderId: user.id, kind, body: text, duration: Math.max(0, Math.min(3600, Number(body.duration || 0))), mediaUrl, fileName: String(body.fileName || "").slice(0, 180), fileSize: Math.max(0, Number(body.fileSize || 0)), fileType: String(body.fileType || "").slice(0, 120), replyToId: replyTo?.id || null, reactions: {}, createdAt: Date.now(), editedAt: null, deletedAt: null }
    database.messages.push(message)
    conversation.updatedAt = message.createdAt
    conversation.hiddenFor = []
    conversation.readAt = { ...(conversation.readAt || {}), [user.id]: message.createdAt }
    await persist()
    broadcastConversation(conversation, "message.created", message)
    return json(response, 201, { message: serializeMessage(message, user.id, conversation) })
  }

  const messageItemMatch = url.pathname.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)$/)
  if (messageItemMatch && (request.method === "PATCH" || request.method === "DELETE")) {
    const conversation = getConversationForUser(messageItemMatch[1], user.id)
    const message = conversation && database.messages.find((item) => item.id === messageItemMatch[2] && item.conversationId === conversation.id)
    if (!conversation || !message) return json(response, 404, { error: "Сообщение не найдено." })
    if (message.senderId !== user.id) return json(response, 403, { error: "Можно изменять только свои сообщения." })
    if (request.method === "PATCH") {
      if (message.kind !== "text" || message.deletedAt) return json(response, 400, { error: "Это сообщение нельзя редактировать." })
      const body = await readBody(request)
      const text = String(body.body || "").trim().slice(0, 4000)
      if (!text) return json(response, 400, { error: "Пустое сообщение сохранить нельзя." })
      message.body = text
      message.editedAt = Date.now()
    } else {
      message.body = ""
      message.mediaUrl = ""
      message.fileName = ""
      message.deletedAt = Date.now()
    }
    conversation.updatedAt = Date.now()
    await persist()
    broadcastConversation(conversation, "message.updated", message)
    return json(response, 200, { message: serializeMessage(message, user.id, conversation) })
  }

  const reactionMatch = url.pathname.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/reactions$/)
  if (reactionMatch && request.method === "POST") {
    const conversation = getConversationForUser(reactionMatch[1], user.id)
    const message = conversation && database.messages.find((item) => item.id === reactionMatch[2] && item.conversationId === conversation.id)
    if (!conversation || !message) return json(response, 404, { error: "Сообщение не найдено." })
    if (message.deletedAt) return json(response, 400, { error: "Удалённое сообщение нельзя оценить." })
    const body = await readBody(request)
    const emoji = String(body.emoji || "")
    if (!["👍", "❤️", "😂", "🔥", "👏", "😮"].includes(emoji)) return json(response, 400, { error: "Эта реакция не поддерживается." })
    message.reactions ||= {}
    const users = new Set(message.reactions[emoji] || [])
    if (users.has(user.id)) users.delete(user.id); else users.add(user.id)
    message.reactions[emoji] = [...users]
    await persist()
    broadcastConversation(conversation, "message.updated", message)
    return json(response, 200, { message: serializeMessage(message, user.id, conversation) })
  }

  const pinMatch = url.pathname.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/pin$/)
  if (pinMatch && (request.method === "POST" || request.method === "DELETE")) {
    const conversation = getConversationForUser(pinMatch[1], user.id)
    const message = conversation && database.messages.find((item) => item.id === pinMatch[2] && item.conversationId === conversation.id)
    if (!conversation || !message) return json(response, 404, { error: "Сообщение не найдено." })
    const pinned = new Set(conversation.pinnedMessageIds || [])
    if (request.method === "POST") pinned.add(message.id); else pinned.delete(message.id)
    conversation.pinnedMessageIds = [...pinned]
    await persist()
    return json(response, 200, { pinned: request.method === "POST", pinnedMessageIds: conversation.pinnedMessageIds })
  }

  const forwardMatch = url.pathname.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/forward$/)
  if (forwardMatch && request.method === "POST") {
    const sourceConversation = getConversationForUser(forwardMatch[1], user.id)
    const source = sourceConversation && database.messages.find((item) => item.id === forwardMatch[2] && item.conversationId === sourceConversation.id && !item.deletedAt)
    if (!sourceConversation || !source) return json(response, 404, { error: "Сообщение не найдено." })
    const body = await readBody(request)
    const target = getConversationForUser(String(body.conversationId || ""), user.id)
    if (!target) return json(response, 404, { error: "Чат для пересылки не найден." })
    const message = { ...source, id: randomUUID(), clientId: String(body.clientId || "").slice(0, 80), conversationId: target.id, senderId: user.id, replyToId: null, reactions: {}, createdAt: Date.now(), editedAt: null, deletedAt: null, forwardedFrom: source.senderId }
    database.messages.push(message)
    target.updatedAt = message.createdAt
    target.hiddenFor = []
    target.readAt = { ...(target.readAt || {}), [user.id]: message.createdAt }
    await persist()
    broadcastConversation(target, "message.created", message)
    return json(response, 201, { message: serializeMessage(message, user.id, target), chat: serializeConversation(target, user.id) })
  }

  if (url.pathname === "/api/reports" && request.method === "POST") {
    const body = await readBody(request)
    const target = database.users.find((item) => item.username === normalizeUsername(body.username))
    if (!target || target.id === user.id) return json(response, 404, { error: "Пользователь не найден." })
    database.reports.push({ id: randomUUID(), reporterId: user.id, targetUserId: target.id, messageId: String(body.messageId || "").slice(0, 80), reason: String(body.reason || "Другое").trim().slice(0, 500), createdAt: Date.now(), status: "new" })
    await persist()
    return json(response, 201, { ok: true })
  }

  if (url.pathname === "/api/uploads" && request.method === "POST") {
    const body = await readBody(request)
    const match = String(body.dataUrl || "").match(/^data:([a-z0-9+.-]+\/[a-z0-9+.-]+);base64,(.+)$/i)
    if (!match) return json(response, 400, { error: "Неверный формат файла." })
    const bytes = Buffer.from(match[2], "base64")
    if (bytes.length > 25 * 1024 * 1024) return json(response, 413, { error: "Файл больше 25 МБ." })
    const usedBytes = database.uploads.filter((upload) => upload.userId === user.id).reduce((total, upload) => total + Number(upload.size || 0), 0)
    if (usedBytes + bytes.length > 250 * 1024 * 1024) return json(response, 413, { error: "Хранилище аккаунта заполнено (лимит 250 МБ)." })
    const extensionByMime = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp", "audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "video/webm": ".webm", "video/mp4": ".mp4", "application/pdf": ".pdf", "text/plain": ".txt", "application/zip": ".zip" }
    const extension = extensionByMime[match[1].toLowerCase()] || ".bin"
    const fileName = `${randomUUID()}${extension}`
    await writeFile(join(uploadsDir, fileName), bytes, { mode: 0o600 })
    database.uploads.push({ id: randomUUID(), userId: user.id, fileName, url: `/uploads/${fileName}`, size: bytes.length, createdAt: Date.now() })
    await persist()
    return json(response, 201, { url: `/uploads/${fileName}`, type: match[1], size: bytes.length })
  }

  if (url.pathname === "/api/events" && request.method === "GET") {
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" })
    response.write(`event: ready\ndata: ${JSON.stringify({ user: publicUser(user) })}\n\n`)
    const clients = sseClients.get(user.id) || new Set()
    clients.add(response)
    sseClients.set(user.id, clients)
    broadcast(relatedUserIds(user.id), "presence.updated", { userId: user.id, username: `@${user.username}`, online: true })
    const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 20_000)
    request.on("close", () => {
      clearInterval(heartbeat)
      clients.delete(response)
      if (!clients.size) {
        sseClients.delete(user.id)
        broadcast(relatedUserIds(user.id), "presence.updated", { userId: user.id, username: `@${user.username}`, online: false })
      }
    })
    return
  }

  return json(response, 404, { error: "API route not found" })
}

async function serveFile(response, filePath, cache = true) {
  const info = await stat(filePath)
  if (!info.isFile()) return false
  response.writeHead(200, { "content-type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream", "content-length": info.size, "cache-control": cache ? "public, max-age=31536000, immutable" : "no-cache" })
  createReadStream(filePath).pipe(response)
  return true
}

async function serveStatic(request, response, url) {
  if (url.pathname.startsWith("/uploads/")) {
    const user = getSessionUser(request)
    if (!user) return json(response, 401, { error: "Нужно войти в аккаунт." })
    const name = url.pathname.slice("/uploads/".length)
    if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(name)) return json(response, 404, { error: "File not found" })
    const upload = database.uploads.find((item) => item.fileName === name)
    const urlPath = `/uploads/${name}`
    const inProfile = database.users.some((item) => item.avatarUrl === urlPath)
    const inConversation = database.messages.some((message) => message.mediaUrl === urlPath && database.conversations.some((conversation) => conversation.id === message.conversationId && conversation.participants.includes(user.id)))
    if (!inProfile && !inConversation && upload?.userId !== user.id) return json(response, 404, { error: "File not found" })
    try { if (await serveFile(response, join(uploadsDir, name), false)) return } catch {}
    return json(response, 404, { error: "File not found" })
  }
  const decoded = decodeURIComponent(url.pathname)
  const relative = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^[/\\]+/, "")
  const candidates = relative ? [resolve(publicDir, relative), resolve(publicDir, relative, "index.html")] : [resolve(publicDir, "index.html")]
  for (const candidate of candidates) {
    if (candidate !== publicDir && !candidate.startsWith(`${publicDir}${sep}`)) continue
    try { if (await serveFile(response, candidate, !candidate.endsWith(".html"))) return } catch {}
  }
  try { if (await serveFile(response, join(publicDir, "404.html"), false)) return } catch {}
  response.writeHead(404).end("Not found")
}

async function initialize() {
  await mkdir(uploadsDir, { recursive: true })
  try {
    const parsed = JSON.parse(await readFile(databaseFile, "utf8"))
    if (![parsed.users, parsed.sessions, parsed.conversations, parsed.messages].every(Array.isArray)) throw new Error("Database has an invalid shape")
    database = { ...emptyDatabase(), ...parsed, version: 6 }
    for (const user of database.users) { user.blockedUserIds ||= []; user.privacy = privacyFor(user) }
    for (const session of database.sessions) { session.createdAt ||= session.expiresAt - sessionMaxAge * 1000; session.lastSeenAt ||= session.createdAt; session.userAgent ||= "Неизвестное устройство"; session.ip ||= "" }
    for (const conversation of database.conversations) { conversation.readAt ||= {}; conversation.archivedFor ||= []; conversation.mutedFor ||= []; conversation.pinnedFor ||= []; conversation.pinnedMessageIds ||= [] }
    for (const message of database.messages) { message.reactions ||= {}; message.editedAt ||= null; message.deletedAt ||= null; message.replyToId ||= null; message.clientId ||= "" }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
    await persist()
  }
  database.sessions = database.sessions.filter((session) => session.expiresAt > Date.now())
  await cleanupOrphanUploads()
}

await initialize()

const server = createServer(async (request, response) => {
  response.setHeader("x-content-type-options", "nosniff")
  response.setHeader("referrer-policy", "same-origin")
  response.setHeader("permissions-policy", "camera=(self), microphone=(self)")
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`)
    if (url.pathname.startsWith("/api/")) await handleApi(request, response, url)
    else await serveStatic(request, response, url)
  } catch (error) {
    console.error(error)
    if (!response.headersSent) json(response, error.status || 500, { error: error.status ? error.message : "Внутренняя ошибка сервера." })
    else response.end()
  }
})

server.listen(port, host, () => console.log(`Favourite Gram is listening on http://${host}:${port}`))

  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)))

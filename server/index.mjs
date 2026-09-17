import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
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

const emptyDatabase = () => ({ version: 2, users: [], sessions: [], conversations: [], messages: [] })
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
    online: Boolean(sseClients.get(user.id)?.size),
  }
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
  const token = parseCookies(request).fg_session
  if (!token) return null
  const session = database.sessions.find((item) => item.tokenHash === hashToken(token) && item.expiresAt > Date.now())
  return session ? database.users.find((user) => user.id === session.userId) || null : null
}

async function createSession(response, userId) {
  const token = randomBytes(32).toString("base64url")
  database.sessions = database.sessions.filter((session) => session.expiresAt > Date.now())
  database.sessions.push({ id: randomUUID(), userId, tokenHash: hashToken(token), expiresAt: Date.now() + sessionMaxAge * 1000 })
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

function serializeMessage(message) {
  const sender = database.users.find((user) => user.id === message.senderId)
  return { ...message, sender: sender ? publicUser(sender) : null }
}

function serializeConversation(conversation, currentUserId) {
  const otherId = conversation.participants.find((id) => id !== currentUserId) || currentUserId
  const other = database.users.find((user) => user.id === otherId)
  const messages = database.messages.filter((message) => message.conversationId === conversation.id).sort((a, b) => a.createdAt - b.createdAt)
  const readAt = Number(conversation.readAt?.[currentUserId] || 0)
  const unread = messages.filter((message) => message.senderId !== currentUserId && message.createdAt > readAt).length
  return { id: conversation.id, person: other ? publicUser(other) : null, messages: messages.map(serializeMessage), unread, updatedAt: conversation.updatedAt }
}

function broadcast(userIds, event, payload) {
  const body = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
  for (const userId of userIds) for (const response of sseClients.get(userId) || []) response.write(body)
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
      user = { id: randomUUID(), username, passwordSalt: passwordData.salt, passwordHash: passwordData.hash, recoveryCodeHashes: recoveryCodes.map((code) => hashToken(normalizeRecoveryCode(code))), name: username, bio: "В сети", avatarUrl: "", createdAt: Date.now(), updatedAt: Date.now() }
      database.users.push(user)
      await persist()
      await createSession(response, user.id)
      return json(response, 201, { user: publicUser(user), recoveryCodes })
    } else {
      if (!user || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) return json(response, 401, { error: "Неверный юзернейм или пароль." })
    }
    await createSession(response, user.id)
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
    await createSession(response, user.id)
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
  if (url.pathname === "/api/me" && request.method === "PATCH") {
    const body = await readBody(request)
    if (typeof body.name === "string") user.name = body.name.trim().slice(0, 48) || user.username
    if (typeof body.bio === "string") user.bio = body.bio.trim().slice(0, 160)
    if (typeof body.avatarUrl === "string" && (!body.avatarUrl || /^\/uploads\/[a-f0-9-]+\.[a-z0-9]+$/i.test(body.avatarUrl))) user.avatarUrl = body.avatarUrl.slice(0, 512)
    user.updatedAt = Date.now()
    await persist()
    broadcast(database.users.map((item) => item.id), "profile.updated", { user: publicUser(user) })
    return json(response, 200, { user: publicUser(user) })
  }

  if (url.pathname === "/api/users" && request.method === "GET") {
    const query = normalizeUsername(url.searchParams.get("query"))
    const users = query.length < 2 ? [] : database.users.filter((item) => item.id !== user.id && `${item.username} ${item.name}`.toLowerCase().includes(query)).slice(0, 20).map(publicUser)
    return json(response, 200, { users })
  }

  if (url.pathname === "/api/chats" && request.method === "GET") {
    const chats = database.conversations.filter((conversation) => conversation.participants.includes(user.id) && !conversation.hiddenFor?.includes(user.id)).sort((a, b) => b.updatedAt - a.updatedAt).map((conversation) => serializeConversation(conversation, user.id))
    return json(response, 200, { chats })
  }

  if (url.pathname === "/api/chats" && request.method === "POST") {
    const body = await readBody(request)
    const target = database.users.find((item) => item.username === normalizeUsername(body.username))
    if (!target || target.id === user.id) return json(response, 404, { error: "Пользователь не найден." })
    let conversation = database.conversations.find((item) => item.participants.length === 2 && item.participants.includes(user.id) && item.participants.includes(target.id))
    if (!conversation) {
      conversation = { id: randomUUID(), participants: [user.id, target.id], hiddenFor: [], readAt: { [user.id]: Date.now(), [target.id]: 0 }, createdAt: Date.now(), updatedAt: Date.now() }
      database.conversations.push(conversation)
    } else conversation.hiddenFor = (conversation.hiddenFor || []).filter((id) => id !== user.id)
    await persist()
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
  if (messageMatch && request.method === "POST") {
    const conversation = getConversationForUser(messageMatch[1], user.id)
    if (!conversation) return json(response, 404, { error: "Чат не найден." })
    const body = await readBody(request)
    const kind = ["text", "voice", "video", "file"].includes(body.kind) ? body.kind : "text"
    const text = String(body.body || "").trim().slice(0, 4000)
    if (kind === "text" && !text) return json(response, 400, { error: "Пустое сообщение отправить нельзя." })
    const mediaUrl = String(body.mediaUrl || "").slice(0, 512)
    if (kind !== "text" && !/^\/uploads\/[a-f0-9-]+\.[a-z0-9]+$/i.test(mediaUrl)) return json(response, 400, { error: "Сначала загрузите вложение." })
    const message = { id: randomUUID(), conversationId: conversation.id, senderId: user.id, kind, body: text, duration: Math.max(0, Math.min(3600, Number(body.duration || 0))), mediaUrl, fileName: String(body.fileName || "").slice(0, 180), fileSize: Math.max(0, Number(body.fileSize || 0)), fileType: String(body.fileType || "").slice(0, 120), createdAt: Date.now() }
    database.messages.push(message)
    conversation.updatedAt = message.createdAt
    conversation.hiddenFor = []
    conversation.readAt = { ...(conversation.readAt || {}), [user.id]: message.createdAt }
    await persist()
    const serialized = serializeMessage(message)
    for (const participantId of conversation.participants) {
      broadcast([participantId], "message.created", { conversationId: conversation.id, message: serialized, chat: serializeConversation(conversation, participantId) })
    }
    return json(response, 201, { message: serialized })
  }

  if (url.pathname === "/api/uploads" && request.method === "POST") {
    const body = await readBody(request)
    const match = String(body.dataUrl || "").match(/^data:([a-z0-9+.-]+\/[a-z0-9+.-]+);base64,(.+)$/i)
    if (!match) return json(response, 400, { error: "Неверный формат файла." })
    const bytes = Buffer.from(match[2], "base64")
    if (bytes.length > 25 * 1024 * 1024) return json(response, 413, { error: "Файл больше 25 МБ." })
    const extensionByMime = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp", "audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "video/webm": ".webm", "video/mp4": ".mp4", "application/pdf": ".pdf", "text/plain": ".txt", "application/zip": ".zip" }
    const extension = extensionByMime[match[1].toLowerCase()] || ".bin"
    const fileName = `${randomUUID()}${extension}`
    await writeFile(join(uploadsDir, fileName), bytes, { mode: 0o600 })
    return json(response, 201, { url: `/uploads/${fileName}`, type: match[1], size: bytes.length })
  }

  if (url.pathname === "/api/events" && request.method === "GET") {
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" })
    response.write(`event: ready\ndata: ${JSON.stringify({ user: publicUser(user) })}\n\n`)
    const clients = sseClients.get(user.id) || new Set()
    clients.add(response)
    sseClients.set(user.id, clients)
    broadcast(database.users.map((item) => item.id), "presence.updated", { userId: user.id, username: `@${user.username}`, online: true })
    const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 20_000)
    request.on("close", () => {
      clearInterval(heartbeat)
      clients.delete(response)
      if (!clients.size) sseClients.delete(user.id)
      broadcast(database.users.map((item) => item.id), "presence.updated", { userId: user.id, username: `@${user.username}`, online: false })
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
    if (!getSessionUser(request)) return json(response, 401, { error: "Нужно войти в аккаунт." })
    const name = url.pathname.slice("/uploads/".length)
    if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(name)) return json(response, 404, { error: "File not found" })
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
    database = { ...emptyDatabase(), ...parsed, version: 2 }
    for (const conversation of database.conversations) conversation.readAt ||= {}
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
    await persist()
  }
  database.sessions = database.sessions.filter((session) => session.expiresAt > Date.now())
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

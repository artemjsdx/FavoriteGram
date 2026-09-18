const STATIC_ASSETS = {};

const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const MAX_JSON_BYTES = 36 * 1024 * 1024;
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const authAttempts = new Map();

const emptyDatabase = () => ({ version: 6, users: [], sessions: [], conversations: [], messages: [], uploads: [], reports: [], calls: [] });

function normalizeDatabase(value) {
  const database = { ...emptyDatabase(), ...(value && typeof value === "object" ? value : {}) };
  for (const key of ["users", "sessions", "conversations", "messages", "uploads", "reports", "calls"]) if (!Array.isArray(database[key])) database[key] = [];
  for (const user of database.users) { user.blockedUserIds ||= []; user.privacy = privacyFor(user); }
  for (const session of database.sessions) {
    session.createdAt ||= session.expiresAt - SESSION_MAX_AGE * 1000;
    session.lastSeenAt ||= session.createdAt;
    session.userAgent ||= "Неизвестное устройство";
    session.ip ||= "";
  }
  for (const conversation of database.conversations) { conversation.readAt ||= {}; conversation.archivedFor ||= []; conversation.mutedFor ||= []; conversation.pinnedFor ||= []; conversation.pinnedMessageIds ||= []; }
  for (const message of database.messages) {
    message.reactions ||= {};
    message.editedAt ||= null;
    message.deletedAt ||= null;
    message.replyToId ||= null;
    message.clientId ||= "";
  }
  database.sessions = database.sessions.filter((session) => session.expiresAt > Date.now());
  return database;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value) {
  const bytes = new Uint8Array(Math.floor(value.length / 2));
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function randomHex(length = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return bytesToHex(bytes);
}

function randomToken(length = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

async function sha256(value) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

async function hashPassword(password, salt = randomHex(16)) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: hexToBytes(salt), iterations: 150000, hash: "SHA-256" }, material, 256);
  return { salt, hash: bytesToHex(new Uint8Array(bits)) };
}

async function verifyPassword(password, salt, expectedHash) {
  const actual = (await hashPassword(password, salt)).hash;
  if (actual.length !== String(expectedHash || "").length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  return difference === 0;
}

function createRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const value = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]).join("");
    return `${value.slice(0, 5)}-${value.slice(5)}`;
  });
}

function normalizeRecoveryCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeUsername(value) {
  return String(value || "").trim().replace(/^@/, "").toLowerCase();
}

function parseCookies(request) {
  return Object.fromEntries(String(request.headers.get("cookie") || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
  }));
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}

function result(status, body, options = {}) {
  return { status, body, headers: options.headers || {}, changed: Boolean(options.changed), afterPersist: options.afterPersist };
}

async function readBody(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_JSON_BYTES) throw Object.assign(new Error("Payload too large"), { status: 413 });
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) throw Object.assign(new Error("Payload too large"), { status: 413 });
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
}

function originAllowed(request, url) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  return !origin || origin === url.origin;
}

function rateLimited(request) {
  const key = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
  const now = Date.now();
  const attempts = (authAttempts.get(key) || []).filter((time) => now - time < 60_000);
  attempts.push(now);
  authAttempts.set(key, attempts);
  return attempts.length > 12;
}

async function loadDatabase(env) {
  let row = await env.DB.prepare("SELECT data, updated_at FROM app_state WHERE id = 1").first();
  if (!row) {
    const initial = JSON.stringify(emptyDatabase());
    await env.DB.prepare("INSERT OR IGNORE INTO app_state (id, data, updated_at) VALUES (1, ?, 0)").bind(initial).run();
    row = await env.DB.prepare("SELECT data, updated_at FROM app_state WHERE id = 1").first();
  }
  return { database: normalizeDatabase(JSON.parse(String(row?.data || "{}"))), revision: Number(row?.updated_at || 0) };
}

async function saveDatabase(env, database, revision) {
  const nextRevision = Math.max(Date.now(), revision + 1);
  const saved = await env.DB.prepare("UPDATE app_state SET data = ?, updated_at = ? WHERE id = 1 AND updated_at = ?")
    .bind(JSON.stringify(database), nextRevision, revision).run();
  return Number(saved?.meta?.changes || 0) === 1;
}

async function executeWithState(request, env, url) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { database, revision } = await loadDatabase(env);
    const handled = await handleApi(database, request, env, url);
    if (!handled.changed) return json(handled.status, handled.body, handled.headers);
    if (await saveDatabase(env, database, revision)) {
      if (handled.afterPersist) await handled.afterPersist();
      return json(handled.status, handled.body, handled.headers);
    }
  }
  return json(409, { error: "Данные изменились одновременно. Повторите действие." });
}

function publicUser(user) {
  return { id: user.id, username: `@${user.username}`, name: user.name, bio: user.bio, avatarUrl: user.avatarUrl || "", online: false };
}

function privacyFor(user) {
  return { discoverable: user.privacy?.discoverable !== false, messagesFrom: ["everyone", "contacts", "nobody"].includes(user.privacy?.messagesFrom) ? user.privacy.messagesFrom : "everyone", showOnline: user.privacy?.showOnline !== false };
}

async function getSession(database, request) {
  const token = parseCookies(request).fg_session;
  if (!token) return null;
  const tokenHash = await sha256(token);
  return database.sessions.find((item) => item.tokenHash === tokenHash && item.expiresAt > Date.now()) || null;
}

async function getSessionUser(database, request) {
  const session = await getSession(database, request);
  return session ? database.users.find((user) => user.id === session.userId) || null : null;
}

async function createSession(database, userId, request) {
  const token = randomToken();
  database.sessions = database.sessions.filter((session) => session.expiresAt > Date.now());
  const forwarded = request.headers.get("x-forwarded-for") || request.headers.get("cf-connecting-ip") || "";
  database.sessions.push({ id: crypto.randomUUID(), userId, tokenHash: await sha256(token), createdAt: Date.now(), lastSeenAt: Date.now(), userAgent: String(request.headers.get("user-agent") || "Неизвестное устройство").slice(0, 240), ip: forwarded.split(",")[0].trim(), expiresAt: Date.now() + SESSION_MAX_AGE * 1000 });
  return [`fg_session=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", "Secure", "SameSite=Lax", `Max-Age=${SESSION_MAX_AGE}`].join("; ");
}

function clearSessionCookie() {
  return "fg_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

function getConversationForUser(database, id, userId) {
  return database.conversations.find((conversation) => conversation.id === id && conversation.participants.includes(userId));
}

function serializeMessage(database, message, currentUserId, conversation) {
  const sender = database.users.find((user) => user.id === message.senderId);
  const reply = message.replyToId ? database.messages.find((item) => item.id === message.replyToId && item.conversationId === message.conversationId) : null;
  const replySender = reply ? database.users.find((user) => user.id === reply.senderId) : null;
  const otherId = conversation?.participants.find((id) => id !== message.senderId);
  const otherReadAt = Number(conversation?.readAt?.[otherId] || 0);
  const delivery = message.senderId === currentUserId ? (otherReadAt >= message.createdAt ? "read" : "delivered") : "delivered";
  const reactions = Object.entries(message.reactions || {}).map(([emoji, userIds]) => ({ emoji, count: userIds.length, reactedByMe: userIds.includes(currentUserId) })).filter((reaction) => reaction.count > 0);
  return { ...message, sender: sender ? publicUser(sender) : null, delivery, reactions, replyTo: reply ? { id: reply.id, kind: reply.kind, body: reply.deletedAt ? "Сообщение удалено" : reply.body, senderName: replySender?.name || replySender?.username || "Пользователь" } : null };
}

function serializeConversation(database, conversation, currentUserId, limit = 50) {
  const otherId = conversation.participants.find((id) => id !== currentUserId) || currentUserId;
  const other = database.users.find((user) => user.id === otherId);
  const members = conversation.participants.map((id) => database.users.find((user) => user.id === id)).filter(Boolean).map(publicUser);
  const person = conversation.type === "group" ? { id: conversation.id, username: `@group_${conversation.id.slice(0, 8)}`, name: conversation.name || "Группа", bio: `${members.length} участников`, avatarUrl: "", online: false } : (other ? publicUser(other) : null);
  const allMessages = database.messages.filter((message) => message.conversationId === conversation.id).sort((a, b) => a.createdAt - b.createdAt);
  const messages = allMessages.slice(-limit);
  const readAt = Number(conversation.readAt?.[currentUserId] || 0);
  const unread = allMessages.filter((message) => message.senderId !== currentUserId && message.createdAt > readAt).length;
  return { id: conversation.id, person, group: conversation.type === "group", members, messages: messages.map((message) => serializeMessage(database, message, currentUserId, conversation)), unread, updatedAt: conversation.updatedAt, hasMore: allMessages.length > messages.length, oldestMessageAt: messages[0]?.createdAt || null, archived: conversation.archivedFor?.includes(currentUserId) || false, muted: conversation.mutedFor?.includes(currentUserId) || false, pinned: conversation.pinnedFor?.includes(currentUserId) || false, pinnedMessageIds: conversation.pinnedMessageIds || [] };
}

async function handleApi(database, request, env, url) {
  if (!originAllowed(request, url)) return result(403, { error: "Origin is not allowed" });
  if (url.pathname === "/api/health" && request.method === "GET") return result(200, { ok: true, service: "favourite-gram", host: "Cloudflare Workers" });

  if ((url.pathname === "/api/auth/register" || url.pathname === "/api/auth/login") && request.method === "POST") {
    if (rateLimited(request)) return result(429, { error: "Слишком много попыток. Подождите минуту." });
    const body = await readBody(request);
    const username = normalizeUsername(body.username);
    const password = String(body.password || "");
    if (!/^[a-z0-9_]{3,32}$/.test(username)) return result(400, { error: "Юзернейм: 3–32 символа, латиница, цифры и подчёркивание." });
    if (password.length < 5 || password.length > 256) return result(400, { error: "Пароль должен содержать от 5 до 256 символов." });
    let user = database.users.find((item) => item.username === username);
    let recoveryCodes;
    if (url.pathname.endsWith("register")) {
      if (user) return result(409, { error: "Этот юзернейм уже занят." });
      const passwordData = await hashPassword(password);
      recoveryCodes = createRecoveryCodes();
      user = { id: crypto.randomUUID(), username, passwordSalt: passwordData.salt, passwordHash: passwordData.hash, recoveryCodeHashes: await Promise.all(recoveryCodes.map((code) => sha256(normalizeRecoveryCode(code)))), blockedUserIds: [], name: username, bio: "В сети", avatarUrl: "", createdAt: Date.now(), updatedAt: Date.now() };
      database.users.push(user);
    } else if (!user || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) {
      return result(401, { error: "Неверный юзернейм или пароль." });
    }
    const cookie = await createSession(database, user.id, request);
    return result(url.pathname.endsWith("register") ? 201 : 200, { user: publicUser(user), ...(recoveryCodes ? { recoveryCodes } : {}) }, { changed: true, headers: { "set-cookie": cookie } });
  }

  if (url.pathname === "/api/auth/recover" && request.method === "POST") {
    if (rateLimited(request)) return result(429, { error: "Слишком много попыток. Подождите минуту." });
    const body = await readBody(request);
    const username = normalizeUsername(body.username);
    const password = String(body.newPassword || "");
    const codeHash = await sha256(normalizeRecoveryCode(body.recoveryCode));
    const user = database.users.find((item) => item.username === username);
    const index = user?.recoveryCodeHashes?.findIndex((item) => item === codeHash) ?? -1;
    if (!user || index < 0) return result(401, { error: "Неверный юзернейм или код восстановления." });
    if (password.length < 5 || password.length > 256) return result(400, { error: "Новый пароль должен содержать от 5 до 256 символов." });
    const passwordData = await hashPassword(password);
    user.passwordSalt = passwordData.salt;
    user.passwordHash = passwordData.hash;
    user.recoveryCodeHashes.splice(index, 1);
    user.updatedAt = Date.now();
    database.sessions = database.sessions.filter((session) => session.userId !== user.id);
    const cookie = await createSession(database, user.id, request);
    return result(200, { user: publicUser(user), recoveryCodesLeft: user.recoveryCodeHashes.length }, { changed: true, headers: { "set-cookie": cookie } });
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    const token = parseCookies(request).fg_session;
    if (token) {
      const tokenHash = await sha256(token);
      database.sessions = database.sessions.filter((session) => session.tokenHash !== tokenHash);
    }
    return result(200, { ok: true }, { changed: true, headers: { "set-cookie": clearSessionCookie() } });
  }

  const user = await getSessionUser(database, request);
  if (!user) return result(401, { error: "Нужно войти в аккаунт." });

  if (url.pathname === "/api/me" && request.method === "GET") return result(200, { user: publicUser(user) });
  if (url.pathname === "/api/me/privacy" && request.method === "GET") return result(200, { privacy: privacyFor(user) });
  if (url.pathname === "/api/me/privacy" && request.method === "PATCH") {
    const body = await readBody(request);
    const current = privacyFor(user);
    user.privacy = { discoverable: typeof body.discoverable === "boolean" ? body.discoverable : current.discoverable, messagesFrom: ["everyone", "contacts", "nobody"].includes(body.messagesFrom) ? body.messagesFrom : current.messagesFrom, showOnline: typeof body.showOnline === "boolean" ? body.showOnline : current.showOnline };
    user.updatedAt = Date.now();
    return result(200, { privacy: user.privacy }, { changed: true });
  }
  if (url.pathname === "/api/me" && request.method === "PATCH") {
    const body = await readBody(request);
    if (typeof body.name === "string") user.name = body.name.trim().slice(0, 48) || user.username;
    if (typeof body.bio === "string") user.bio = body.bio.trim().slice(0, 160);
    if (typeof body.avatarUrl === "string" && (!body.avatarUrl || /^\/uploads\/[a-f0-9-]+\.[a-z0-9]+$/i.test(body.avatarUrl))) user.avatarUrl = body.avatarUrl.slice(0, 512);
    user.updatedAt = Date.now();
    return result(200, { user: publicUser(user) }, { changed: true });
  }

  if (url.pathname === "/api/me/password" && request.method === "POST") {
    const body = await readBody(request);
    if (!(await verifyPassword(String(body.currentPassword || ""), user.passwordSalt, user.passwordHash))) return result(403, { error: "Текущий пароль указан неверно." });
    const newPassword = String(body.newPassword || "");
    if (newPassword.length < 5 || newPassword.length > 256) return result(400, { error: "Новый пароль должен содержать от 5 до 256 символов." });
    const passwordData = await hashPassword(newPassword);
    user.passwordSalt = passwordData.salt;
    user.passwordHash = passwordData.hash;
    user.updatedAt = Date.now();
    const currentSession = await getSession(database, request);
    database.sessions = database.sessions.filter((session) => session.userId !== user.id || session.id === currentSession?.id);
    return result(200, { ok: true }, { changed: true });
  }

  if (url.pathname === "/api/me/recovery-codes" && request.method === "POST") {
    const body = await readBody(request);
    if (!(await verifyPassword(String(body.password || ""), user.passwordSalt, user.passwordHash))) return result(403, { error: "Пароль указан неверно." });
    const recoveryCodes = createRecoveryCodes();
    user.recoveryCodeHashes = await Promise.all(recoveryCodes.map((code) => sha256(normalizeRecoveryCode(code))));
    user.updatedAt = Date.now();
    return result(200, { recoveryCodes }, { changed: true });
  }

  if (url.pathname === "/api/sessions" && request.method === "GET") {
    const current = await getSession(database, request);
    const sessions = database.sessions.filter((session) => session.userId === user.id && session.expiresAt > Date.now()).map((session) => ({ id: session.id, current: session.id === current?.id, userAgent: session.userAgent, ip: session.ip, createdAt: session.createdAt, lastSeenAt: session.lastSeenAt }));
    return result(200, { sessions });
  }

  const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionMatch && request.method === "DELETE") {
    const current = await getSession(database, request);
    const target = database.sessions.find((session) => session.id === sessionMatch[1] && session.userId === user.id);
    if (!target) return result(404, { error: "Сессия не найдена." });
    database.sessions = database.sessions.filter((session) => session.id !== target.id);
    return result(200, { ok: true, current: target.id === current?.id }, { changed: true, headers: target.id === current?.id ? { "set-cookie": clearSessionCookie() } : {} });
  }

  if (url.pathname === "/api/me" && request.method === "DELETE") {
    const body = await readBody(request);
    if (!(await verifyPassword(String(body.password || ""), user.passwordSalt, user.passwordHash))) return result(403, { error: "Пароль указан неверно." });
    const conversationIds = database.conversations.filter((conversation) => conversation.participants.includes(user.id) && conversation.type !== "group").map((conversation) => conversation.id);
    const groupIds = database.conversations.filter((conversation) => conversation.participants.includes(user.id) && conversation.type === "group").map((conversation) => conversation.id);
    const ownedUploads = database.uploads.filter((upload) => upload.userId === user.id);
    database.messages = database.messages.filter((message) => !conversationIds.includes(message.conversationId) && !(groupIds.includes(message.conversationId) && message.senderId === user.id));
    database.conversations = database.conversations.filter((conversation) => !conversationIds.includes(conversation.id));
    for (const conversation of database.conversations.filter((item) => groupIds.includes(item.id))) {
      conversation.participants = conversation.participants.filter((id) => id !== user.id);
      if (conversation.createdBy === user.id) conversation.createdBy = conversation.participants[0];
    }
    database.conversations = database.conversations.filter((conversation) => conversation.type !== "group" || conversation.participants.length >= 2);
    database.sessions = database.sessions.filter((session) => session.userId !== user.id);
    database.uploads = database.uploads.filter((upload) => upload.userId !== user.id);
    database.users = database.users.filter((item) => item.id !== user.id).map((item) => ({ ...item, blockedUserIds: (item.blockedUserIds || []).filter((id) => id !== user.id) }));
    return result(200, { ok: true }, { changed: true, headers: { "set-cookie": clearSessionCookie() }, afterPersist: () => Promise.all(ownedUploads.map((upload) => env.BUCKET.delete(upload.fileName))) });
  }

  const blockMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/block$/);
  if (blockMatch && (request.method === "POST" || request.method === "DELETE")) {
    const target = database.users.find((item) => item.username === normalizeUsername(blockMatch[1]));
    if (!target || target.id === user.id) return result(404, { error: "Пользователь не найден." });
    const blocked = new Set(user.blockedUserIds || []);
    if (request.method === "POST") blocked.add(target.id); else blocked.delete(target.id);
    user.blockedUserIds = [...blocked];
    return result(200, { blocked: request.method === "POST" }, { changed: true });
  }

  if (url.pathname === "/api/blocked" && request.method === "GET") {
    const blocked = (user.blockedUserIds || []).map((id) => database.users.find((item) => item.id === id)).filter(Boolean).map(publicUser);
    return result(200, { users: blocked });
  }

  if (url.pathname === "/api/users" && request.method === "GET") {
    const query = normalizeUsername(url.searchParams.get("query"));
    const users = query.length < 2 ? [] : database.users.filter((item) => item.id !== user.id && privacyFor(item).discoverable && !(user.blockedUserIds || []).includes(item.id) && !(item.blockedUserIds || []).includes(user.id) && `${item.username} ${item.name}`.toLowerCase().includes(query)).slice(0, 20).map(publicUser);
    return result(200, { users });
  }

  if (url.pathname === "/api/messages/search" && request.method === "GET") {
    const query = String(url.searchParams.get("query") || "").trim().toLowerCase();
    if (query.length < 2) return result(200, { results: [] });
    const allowed = new Set(database.conversations.filter((conversation) => conversation.participants.includes(user.id) && !conversation.hiddenFor?.includes(user.id)).map((conversation) => conversation.id));
    const results = database.messages.filter((message) => allowed.has(message.conversationId) && !message.deletedAt && `${message.body || ""} ${message.fileName || ""}`.toLowerCase().includes(query)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50).map((message) => {
      const conversation = database.conversations.find((item) => item.id === message.conversationId);
      return { conversationId: message.conversationId, message: serializeMessage(database, message, user.id, conversation), chat: serializeConversation(database, conversation, user.id, 1) };
    });
    return result(200, { results });
  }

  if (url.pathname === "/api/chats" && request.method === "GET") {
    const chats = database.conversations.filter((conversation) => conversation.participants.includes(user.id) && !conversation.hiddenFor?.includes(user.id)).sort((a, b) => b.updatedAt - a.updatedAt).map((conversation) => serializeConversation(database, conversation, user.id));
    return result(200, { chats });
  }

  if (url.pathname === "/api/chats" && request.method === "POST") {
    const body = await readBody(request);
    const target = database.users.find((item) => item.username === normalizeUsername(body.username));
    if (!target || target.id === user.id) return result(404, { error: "Пользователь не найден." });
    if ((user.blockedUserIds || []).includes(target.id) || (target.blockedUserIds || []).includes(user.id)) return result(403, { error: "Диалог недоступен из-за блокировки." });
    let conversation = database.conversations.find((item) => item.participants.length === 2 && item.participants.includes(user.id) && item.participants.includes(target.id));
    if (!conversation) {
      const targetPrivacy = privacyFor(target);
      const existingContact = database.conversations.some((item) => item.participants.includes(user.id) && item.participants.includes(target.id));
      if (targetPrivacy.messagesFrom === "nobody" || (targetPrivacy.messagesFrom === "contacts" && !existingContact)) return result(403, { error: "Пользователь ограничил новые сообщения." });
      conversation = { id: crypto.randomUUID(), participants: [user.id, target.id], hiddenFor: [], archivedFor: [], mutedFor: [], pinnedFor: [], pinnedMessageIds: [], readAt: { [user.id]: Date.now(), [target.id]: 0 }, createdAt: Date.now(), updatedAt: Date.now() };
      database.conversations.push(conversation);
    } else conversation.hiddenFor = (conversation.hiddenFor || []).filter((id) => id !== user.id);
    return result(200, { chat: serializeConversation(database, conversation, user.id) }, { changed: true });
  }

  if (url.pathname === "/api/groups" && request.method === "POST") {
    const body = await readBody(request);
    const name = String(body.name || "").trim().slice(0, 64);
    const usernames = [...new Set((Array.isArray(body.usernames) ? body.usernames : []).map(normalizeUsername).filter(Boolean))];
    if (name.length < 2) return result(400, { error: "Название группы должно содержать минимум 2 символа." });
    const invited = usernames.map((username) => database.users.find((item) => item.username === username)).filter(Boolean).filter((item) => item.id !== user.id);
    if (invited.length < 2 || invited.length !== usernames.filter((username) => username !== user.username).length) return result(400, { error: "Добавьте минимум двух существующих пользователей." });
    if (invited.length > 99) return result(400, { error: "В группе может быть не больше 100 участников." });
    if (invited.some((item) => (user.blockedUserIds || []).includes(item.id) || (item.blockedUserIds || []).includes(user.id))) return result(403, { error: "Нельзя добавить заблокированного пользователя." });
    const participants = [user.id, ...invited.map((item) => item.id)];
    const now = Date.now();
    const conversation = { id: crypto.randomUUID(), type: "group", name, createdBy: user.id, participants, hiddenFor: [], archivedFor: [], mutedFor: [], pinnedFor: [], pinnedMessageIds: [], readAt: Object.fromEntries(participants.map((id) => [id, id === user.id ? now : 0])), createdAt: now, updatedAt: now };
    database.conversations.push(conversation);
    return result(201, { chat: serializeConversation(database, conversation, user.id) }, { changed: true });
  }

  if (url.pathname === "/api/calls" && request.method === "GET") {
    const now = Date.now();
    database.calls = database.calls.filter((call) => call.expiresAt > now);
    const calls = database.calls.filter((call) => call.participants.includes(user.id) && !["ended", "declined"].includes(call.status)).map((call) => ({ ...call, role: call.callerId === user.id ? "caller" : "callee" }));
    return result(200, { calls });
  }

  if (url.pathname === "/api/calls" && request.method === "POST") {
    const body = await readBody(request);
    const conversation = getConversationForUser(database, String(body.conversationId || ""), user.id);
    if (!conversation || conversation.participants.length !== 2) return result(400, { error: "Звонки доступны только в личных чатах." });
    const now = Date.now();
    const call = { id: crypto.randomUUID(), conversationId: conversation.id, callerId: user.id, participants: [...conversation.participants], mode: body.mode === "video" ? "video" : "audio", status: "ringing", offer: body.offer || null, answer: null, candidates: {}, createdAt: now, updatedAt: now, expiresAt: now + 5 * 60_000 };
    database.calls.push(call);
    return result(201, { call: { ...call, role: "caller" } }, { changed: true });
  }

  const callMatch = url.pathname.match(/^\/api\/calls\/([^/]+)$/);
  if (callMatch && (request.method === "GET" || request.method === "PATCH")) {
    const call = database.calls.find((item) => item.id === callMatch[1] && item.participants.includes(user.id));
    if (!call) return result(404, { error: "Звонок не найден." });
    if (request.method === "GET") return result(200, { call: { ...call, role: call.callerId === user.id ? "caller" : "callee" } });
    const body = await readBody(request);
    if (body.offer && call.callerId === user.id) call.offer = body.offer;
    if (body.answer && call.callerId !== user.id) call.answer = body.answer;
    if (body.candidate) {
      call.candidates ||= {};
      call.candidates[user.id] ||= [];
      if (call.candidates[user.id].length < 128) call.candidates[user.id].push(body.candidate);
    }
    if (["active", "declined", "ended"].includes(body.status)) call.status = body.status;
    call.updatedAt = Date.now();
    call.expiresAt = call.status === "active" ? Date.now() + 2 * 60 * 60_000 : Math.min(call.expiresAt, Date.now() + 5 * 60_000);
    return result(200, { call: { ...call, role: call.callerId === user.id ? "caller" : "callee" } }, { changed: true });
  }

  const groupMatch = url.pathname.match(/^\/api\/groups\/([^/]+)$/);
  if (groupMatch && request.method === "PATCH") {
    const conversation = getConversationForUser(database, groupMatch[1], user.id);
    if (!conversation || conversation.type !== "group") return result(404, { error: "Группа не найдена." });
    if (conversation.createdBy !== user.id) return result(403, { error: "Изменять группу может только создатель." });
    const body = await readBody(request);
    if (typeof body.name === "string") conversation.name = body.name.trim().slice(0, 64) || conversation.name;
    if (Array.isArray(body.usernames)) {
      const invited = [...new Set(body.usernames.map(normalizeUsername))].map((username) => database.users.find((item) => item.username === username)).filter(Boolean).filter((item) => item.id !== user.id);
      if (invited.length < 2) return result(400, { error: "В группе должно остаться минимум три участника." });
      if (invited.some((item) => (user.blockedUserIds || []).includes(item.id) || (item.blockedUserIds || []).includes(user.id))) return result(403, { error: "Нельзя добавить заблокированного пользователя." });
      conversation.participants = [user.id, ...invited.map((item) => item.id)].slice(0, 100);
    }
    conversation.updatedAt = Date.now();
    return result(200, { chat: serializeConversation(database, conversation, user.id) }, { changed: true });
  }

  const chatMatch = url.pathname.match(/^\/api\/chats\/([^/]+)$/);
  if (chatMatch && request.method === "DELETE") {
    const conversation = getConversationForUser(database, chatMatch[1], user.id);
    if (!conversation) return result(404, { error: "Чат не найден." });
    conversation.hiddenFor = [...new Set([...(conversation.hiddenFor || []), user.id])];
    return result(200, { ok: true }, { changed: true });
  }

  const preferenceMatch = url.pathname.match(/^\/api\/chats\/([^/]+)\/preferences$/);
  if (preferenceMatch && request.method === "PATCH") {
    const conversation = getConversationForUser(database, preferenceMatch[1], user.id);
    if (!conversation) return result(404, { error: "Чат не найден." });
    const body = await readBody(request);
    for (const [field, list] of [["archived", "archivedFor"], ["muted", "mutedFor"], ["pinned", "pinnedFor"]]) {
      if (typeof body[field] !== "boolean") continue;
      const values = new Set(conversation[list] || []);
      if (body[field]) values.add(user.id); else values.delete(user.id);
      conversation[list] = [...values];
    }
    return result(200, { chat: serializeConversation(database, conversation, user.id) }, { changed: true });
  }

  const readMatch = url.pathname.match(/^\/api\/chats\/([^/]+)\/read$/);
  if (readMatch && request.method === "POST") {
    const conversation = getConversationForUser(database, readMatch[1], user.id);
    if (!conversation) return result(404, { error: "Чат не найден." });
    conversation.readAt = { ...(conversation.readAt || {}), [user.id]: Date.now() };
    return result(200, { ok: true }, { changed: true });
  }

  const typingMatch = url.pathname.match(/^\/api\/chats\/([^/]+)\/typing$/);
  if (typingMatch && request.method === "POST") {
    const conversation = getConversationForUser(database, typingMatch[1], user.id);
    return conversation ? result(200, { ok: true }) : result(404, { error: "Чат не найден." });
  }

  const messageMatch = url.pathname.match(/^\/api\/chats\/([^/]+)\/messages$/);
  if (messageMatch && request.method === "GET") {
    const conversation = getConversationForUser(database, messageMatch[1], user.id);
    if (!conversation) return result(404, { error: "Чат не найден." });
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 50)));
    const before = Number(url.searchParams.get("before") || Number.MAX_SAFE_INTEGER);
    const all = database.messages.filter((message) => message.conversationId === conversation.id && message.createdAt < before).sort((a, b) => b.createdAt - a.createdAt);
    const page = all.slice(0, limit).reverse();
    return result(200, { messages: page.map((message) => serializeMessage(database, message, user.id, conversation)), hasMore: all.length > page.length, nextBefore: page[0]?.createdAt || null });
  }
  if (messageMatch && request.method === "POST") {
    const conversation = getConversationForUser(database, messageMatch[1], user.id);
    if (!conversation) return result(404, { error: "Чат не найден." });
    const others = conversation.participants.filter((id) => id !== user.id).map((id) => database.users.find((item) => item.id === id)).filter(Boolean);
    if (others.some((other) => (user.blockedUserIds || []).includes(other.id) || (other.blockedUserIds || []).includes(user.id))) return result(403, { error: "Сообщения недоступны из-за блокировки." });
    const body = await readBody(request);
    const kind = ["text", "voice", "video", "file"].includes(body.kind) ? body.kind : "text";
    const text = String(body.body || "").trim().slice(0, 4000);
    if (kind === "text" && !text) return result(400, { error: "Пустое сообщение отправить нельзя." });
    const mediaUrl = String(body.mediaUrl || "").slice(0, 512);
    if (kind !== "text" && !/^\/uploads\/[a-f0-9-]+\.[a-z0-9]+$/i.test(mediaUrl)) return result(400, { error: "Сначала загрузите вложение." });
    const replyTo = body.replyToId ? database.messages.find((item) => item.id === body.replyToId && item.conversationId === conversation.id) : null;
    if (body.replyToId && !replyTo) return result(400, { error: "Сообщение для ответа не найдено." });
    const clientId = String(body.clientId || "").slice(0, 80);
    const duplicate = clientId && database.messages.find((item) => item.senderId === user.id && item.clientId === clientId);
    if (duplicate) return result(200, { message: serializeMessage(database, duplicate, user.id, conversation) });
    const message = { id: crypto.randomUUID(), clientId, conversationId: conversation.id, senderId: user.id, kind, body: text, duration: Math.max(0, Math.min(3600, Number(body.duration || 0))), mediaUrl, fileName: String(body.fileName || "").slice(0, 180), fileSize: Math.max(0, Number(body.fileSize || 0)), fileType: String(body.fileType || "").slice(0, 120), replyToId: replyTo?.id || null, reactions: {}, createdAt: Date.now(), editedAt: null, deletedAt: null };
    database.messages.push(message);
    conversation.updatedAt = message.createdAt;
    conversation.hiddenFor = [];
    conversation.readAt = { ...(conversation.readAt || {}), [user.id]: message.createdAt };
    return result(201, { message: serializeMessage(database, message, user.id, conversation) }, { changed: true });
  }

  const messageItemMatch = url.pathname.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)$/);
  if (messageItemMatch && (request.method === "PATCH" || request.method === "DELETE")) {
    const conversation = getConversationForUser(database, messageItemMatch[1], user.id);
    const message = conversation && database.messages.find((item) => item.id === messageItemMatch[2] && item.conversationId === conversation.id);
    if (!conversation || !message) return result(404, { error: "Сообщение не найдено." });
    if (message.senderId !== user.id) return result(403, { error: "Можно изменять только свои сообщения." });
    if (request.method === "PATCH") {
      if (message.kind !== "text" || message.deletedAt) return result(400, { error: "Это сообщение нельзя редактировать." });
      const body = await readBody(request);
      const text = String(body.body || "").trim().slice(0, 4000);
      if (!text) return result(400, { error: "Пустое сообщение сохранить нельзя." });
      message.body = text;
      message.editedAt = Date.now();
    } else {
      message.body = "";
      message.mediaUrl = "";
      message.fileName = "";
      message.deletedAt = Date.now();
    }
    conversation.updatedAt = Date.now();
    return result(200, { message: serializeMessage(database, message, user.id, conversation) }, { changed: true });
  }

  const reactionMatch = url.pathname.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/reactions$/);
  if (reactionMatch && request.method === "POST") {
    const conversation = getConversationForUser(database, reactionMatch[1], user.id);
    const message = conversation && database.messages.find((item) => item.id === reactionMatch[2] && item.conversationId === conversation.id);
    if (!conversation || !message) return result(404, { error: "Сообщение не найдено." });
    if (message.deletedAt) return result(400, { error: "Удалённое сообщение нельзя оценить." });
    const body = await readBody(request);
    const emoji = String(body.emoji || "");
    if (!["👍", "❤️", "😂", "🔥", "👏", "😮"].includes(emoji)) return result(400, { error: "Эта реакция не поддерживается." });
    message.reactions ||= {};
    const users = new Set(message.reactions[emoji] || []);
    if (users.has(user.id)) users.delete(user.id); else users.add(user.id);
    message.reactions[emoji] = [...users];
    return result(200, { message: serializeMessage(database, message, user.id, conversation) }, { changed: true });
  }

  const pinMatch = url.pathname.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/pin$/);
  if (pinMatch && (request.method === "POST" || request.method === "DELETE")) {
    const conversation = getConversationForUser(database, pinMatch[1], user.id);
    const message = conversation && database.messages.find((item) => item.id === pinMatch[2] && item.conversationId === conversation.id);
    if (!conversation || !message) return result(404, { error: "Сообщение не найдено." });
    const pinned = new Set(conversation.pinnedMessageIds || []);
    if (request.method === "POST") pinned.add(message.id); else pinned.delete(message.id);
    conversation.pinnedMessageIds = [...pinned];
    return result(200, { pinned: request.method === "POST", pinnedMessageIds: conversation.pinnedMessageIds }, { changed: true });
  }

  const forwardMatch = url.pathname.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/forward$/);
  if (forwardMatch && request.method === "POST") {
    const sourceConversation = getConversationForUser(database, forwardMatch[1], user.id);
    const source = sourceConversation && database.messages.find((item) => item.id === forwardMatch[2] && item.conversationId === sourceConversation.id && !item.deletedAt);
    if (!sourceConversation || !source) return result(404, { error: "Сообщение не найдено." });
    const body = await readBody(request);
    const target = getConversationForUser(database, String(body.conversationId || ""), user.id);
    if (!target) return result(404, { error: "Чат для пересылки не найден." });
    const message = { ...source, id: crypto.randomUUID(), clientId: String(body.clientId || "").slice(0, 80), conversationId: target.id, senderId: user.id, replyToId: null, reactions: {}, createdAt: Date.now(), editedAt: null, deletedAt: null, forwardedFrom: source.senderId };
    database.messages.push(message);
    target.updatedAt = message.createdAt;
    target.hiddenFor = [];
    target.readAt = { ...(target.readAt || {}), [user.id]: message.createdAt };
    return result(201, { message: serializeMessage(database, message, user.id, target), chat: serializeConversation(database, target, user.id) }, { changed: true });
  }

  if (url.pathname === "/api/reports" && request.method === "POST") {
    const body = await readBody(request);
    const target = database.users.find((item) => item.username === normalizeUsername(body.username));
    if (!target || target.id === user.id) return result(404, { error: "Пользователь не найден." });
    database.reports.push({ id: crypto.randomUUID(), reporterId: user.id, targetUserId: target.id, messageId: String(body.messageId || "").slice(0, 80), reason: String(body.reason || "Другое").trim().slice(0, 500), createdAt: Date.now(), status: "new" });
    return result(201, { ok: true }, { changed: true });
  }

  if (url.pathname === "/api/uploads" && request.method === "POST") {
    const body = await readBody(request);
    const match = String(body.dataUrl || "").match(/^data:([a-z0-9+.-]+\/[a-z0-9+.-]+);base64,(.+)$/i);
    if (!match) return result(400, { error: "Неверный формат файла." });
    const binary = atob(match[2]);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.length > 25 * 1024 * 1024) return result(413, { error: "Файл больше 25 МБ." });
    const usedBytes = database.uploads.filter((upload) => upload.userId === user.id).reduce((total, upload) => total + Number(upload.size || 0), 0);
    if (usedBytes + bytes.length > 250 * 1024 * 1024) return result(413, { error: "Хранилище аккаунта заполнено (лимит 250 МБ)." });
    const extensionByMime = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp", "audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "video/webm": ".webm", "video/mp4": ".mp4", "application/pdf": ".pdf", "text/plain": ".txt", "application/zip": ".zip" };
    const extension = extensionByMime[match[1].toLowerCase()] || ".bin";
    const fileName = `${crypto.randomUUID()}${extension}`;
    database.uploads.push({ id: crypto.randomUUID(), userId: user.id, fileName, url: `/uploads/${fileName}`, size: bytes.length, type: match[1], createdAt: Date.now() });
    return result(201, { url: `/uploads/${fileName}`, type: match[1], size: bytes.length }, { changed: true, afterPersist: () => env.BUCKET.put(fileName, bytes, { httpMetadata: { contentType: match[1] } }) });
  }

  if (url.pathname === "/api/events" && request.method === "GET") return { status: 200, body: null, sse: true, changed: false };
  return result(404, { error: "API route not found" });
}

async function serveUpload(request, env, url) {
  const { database } = await loadDatabase(env);
  const user = await getSessionUser(database, request);
  if (!user) return json(401, { error: "Нужно войти в аккаунт." });
  const name = url.pathname.slice("/uploads/".length);
  if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(name)) return json(404, { error: "File not found" });
  const upload = database.uploads.find((item) => item.fileName === name);
  const path = `/uploads/${name}`;
  const inProfile = database.users.some((item) => item.avatarUrl === path);
  const inConversation = database.messages.some((message) => message.mediaUrl === path && database.conversations.some((conversation) => conversation.id === message.conversationId && conversation.participants.includes(user.id)));
  if (!inProfile && !inConversation && upload?.userId !== user.id) return json(404, { error: "File not found" });
  const object = await env.BUCKET.get(name);
  if (!object) return json(404, { error: "File not found" });
  const headers = new Headers({ "cache-control": "private, max-age=300" });
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
}

function decodeBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function serveStatic(url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return new Response("Not found", { status: 404 }); }
  const candidates = pathname === "/" ? ["/index.html"] : [pathname, `${pathname.replace(/\/$/, "")}/index.html`];
  const entry = candidates.map((candidate) => STATIC_ASSETS[candidate]).find(Boolean) || STATIC_ASSETS["/404.html"];
  if (!entry) return new Response("Not found", { status: 404 });
  const headers = new Headers({ "content-type": entry.type, "x-content-type-options": "nosniff" });
  if (entry.type.startsWith("text/html")) {
    headers.set("cache-control", "no-cache");
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
    headers.set("content-security-policy", "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; base-uri 'self'; frame-ancestors 'self'");
  } else headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(decodeBase64(entry.body), { status: candidates.some((candidate) => STATIC_ASSETS[candidate]) ? 200 : 404, headers });
}

const worker = {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { allow: "GET,HEAD,POST,PATCH,DELETE,OPTIONS" } });
      if (url.pathname.startsWith("/uploads/")) return serveUpload(request, env, url);
      if (url.pathname === "/api/events" && request.method === "GET") {
        const { database } = await loadDatabase(env);
        if (!(await getSessionUser(database, request))) return json(401, { error: "Нужно войти в аккаунт." });
        return new Response("retry: 1200\nevent: refresh\ndata: {}\n\n", { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform" } });
      }
      if (url.pathname.startsWith("/api/")) return executeWithState(request, env, url);
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
      return serveStatic(url);
    } catch (error) {
      console.error("FavouriteGram Worker error", error);
      return json(Number(error?.status || 500), { error: error?.status ? error.message : "Временная ошибка сервера." });
    }
  },
};

export default worker;

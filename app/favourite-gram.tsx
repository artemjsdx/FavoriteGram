"use client"

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { MeshGradient } from "@paper-design/shaders-react"
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  AtSign,
  Bell,
  BellOff,
  Camera,
  Check,
  ChevronRight,
  Circle,
  Download,
  Eye,
  EyeOff,
  FileText,
  Flag,
  Forward,
  Home,
  ImagePlus,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Paperclip,
  Pause,
  Pencil,
  Pin,
  Play,
  Phone,
  PhoneOff,
  Palette,
  Paintbrush,
  Search,
  Send,
  SmilePlus,
  Reply,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  UsersRound,
  Video,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Toaster } from "@/components/ui/sonner"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type Screen = "landing" | "auth" | "messenger"
type MessageKind = "text" | "voice" | "video" | "file"

type Message = {
  id: string
  clientId?: string
  sender: "me" | "them"
  kind: MessageKind
  body?: string
  duration?: number
  mediaUrl?: string
  fileName?: string
  fileSize?: number
  fileType?: string
  time: string
  createdAt?: number
  editedAt?: number | null
  deletedAt?: number | null
  status?: "sending" | "delivered" | "read" | "error"
  replyToId?: string | null
  replyTo?: { id: string; kind: MessageKind; body?: string; senderName: string } | null
  reactions?: Array<{ emoji: string; count: number; reactedByMe: boolean }>
  uploadProgress?: number
}

type Chat = {
  id: string
  serverId?: string
  name: string
  username: string
  initials: string
  imageUrl?: string
  hue: string
  online: boolean
  bio: string
  unread: number
  messages: Message[]
  hasMore?: boolean
  oldestMessageAt?: number | null
  archived?: boolean
  muted?: boolean
  pinned?: boolean
  pinnedMessageIds?: string[]
  group?: boolean
  members?: ServerUser[]
}

type Profile = {
  username: string
  name: string
  bio: string
  initials: string
  imageUrl: string
}

type AccentTheme = "sand" | "violet" | "ocean" | "rose" | "lime" | "custom"
type BubbleShape = "soft" | "round" | "compact"
type BubbleOutline = "none" | "subtle" | "accent"
type ChatBackdrop = "quiet" | "aurora" | "grain" | "none"
type MotionLevel = "full" | "calm" | "off"
type WorkspaceView = "settings" | "appearance" | "notifications" | "profile" | "privacy" | "security" | "contact" | null

type AppearanceSettings = {
  accent: AccentTheme
  customAccent: string
  bubbleShape: BubbleShape
  bubbleOutline: BubbleOutline
  compact: boolean
  backdrop: ChatBackdrop
  motion: MotionLevel
}

type NotificationSettings = {
  enabled: boolean
  directMessages: boolean
  groupMessages: boolean
  calls: boolean
  reactions: boolean
  previews: boolean
  sound: boolean
  vibration: boolean
  quietHours: boolean
}

type WebMCPContext = {
  registerTool: (
    tool: {
      name: string
      title?: string
      description: string
      inputSchema: Record<string, unknown>
      annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }
      execute: (input: unknown) => unknown | Promise<unknown>
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>
}

type DirectoryPerson = { name: string; username: string; initials: string; hue: string; bio: string; imageUrl?: string }

const REACTION_EMOJIS = [
  "👍", "❤️", "😂", "🔥", "👏", "😮", "🥰", "😍", "🤩", "🥳", "😭", "🥹",
  "😁", "😅", "🤣", "😉", "😌", "🤔", "🫡", "🤝", "🙏", "💪", "👌", "✌️",
  "👀", "💯", "✨", "⭐", "🎉", "🚀", "💀", "🤡", "😎", "🙃", "😡", "🤯",
  "💔", "💜", "🖤", "🤍", "🌚", "🌝", "🍾", "🎸", "⚡", "✅", "❌", "🇧🇾",
]
const RECENT_REACTIONS_KEY = "favourite-gram.recent-reactions"

function isSingleEmoji(value: string) {
  const emoji = value.trim()
  if (!emoji || emoji.length > 24) return false
  const segments = [...new Intl.Segmenter("und", { granularity: "grapheme" }).segment(emoji)]
  return segments.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u.test(emoji)
}

const ease = [0.2, 0.8, 0.2, 1] as const
const SESSION_KEY = "favourite-gram.session"
const PROFILE_KEY = "favourite-gram.profile"
const CHATS_KEY = "favourite-gram.chats"
const THEME_KEY = "favourite-gram.theme"
const APPEARANCE_KEY = "favourite-gram.appearance.v2"
const NOTIFICATION_KEY = "favourite-gram.notifications.v1"
const BACKEND_KEY = "favourite-gram.backend"

const DEFAULT_APPEARANCE: AppearanceSettings = {
  accent: "violet",
  customAccent: "#8b76ff",
  bubbleShape: "soft",
  bubbleOutline: "subtle",
  compact: false,
  backdrop: "quiet",
  motion: "full",
}

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  enabled: true,
  directMessages: true,
  groupMessages: true,
  calls: true,
  reactions: true,
  previews: true,
  sound: true,
  vibration: true,
  quietHours: false,
}

type ServerUser = { id?: string; username: string; name: string; bio: string; avatarUrl: string; online?: boolean }
type ServerMessage = { id: string; clientId?: string; sender: ServerUser; kind: MessageKind; body?: string; duration?: number; mediaUrl?: string; fileName?: string; fileSize?: number; fileType?: string; createdAt: number; editedAt?: number | null; deletedAt?: number | null; delivery?: "delivered" | "read"; replyToId?: string | null; replyTo?: { id: string; kind: MessageKind; body?: string; senderName: string } | null; reactions?: Array<{ emoji: string; count: number; reactedByMe: boolean }> }
type ServerChat = { id: string; person: ServerUser; messages: ServerMessage[]; unread: number; updatedAt: number; hasMore?: boolean; oldestMessageAt?: number | null; archived?: boolean; muted?: boolean; pinned?: boolean; pinnedMessageIds?: string[]; group?: boolean; members?: ServerUser[] }
type SearchResult = { conversationId: string; message: ServerMessage; chat: ServerChat }
type CallSignal = { id: string; conversationId: string; callerId: string; mode: "audio" | "video"; status: "ringing" | "active" | "declined" | "ended"; offer?: RTCSessionDescriptionInit | null; answer?: RTCSessionDescriptionInit | null; candidates?: Record<string, RTCIceCandidateInit[]>; role: "caller" | "callee" }

function storageKey(base: string, username: string) {
  return `${base}:${username.replace(/^@/, "").toLowerCase() || "guest"}`
}

type BackendResult<T> = { available: boolean; ok: boolean; status: number; data?: T }

async function backendRequest<T>(path: string, init?: RequestInit): Promise<BackendResult<T>> {
  try {
    const response = await fetch(path, {
      ...init,
      credentials: "include",
      headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
    })
    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) return { available: false, ok: false, status: response.status }
    return { available: true, ok: response.ok, status: response.status, data: await response.json() as T }
  } catch {
    return { available: false, ok: false, status: 0 }
  }
}

function fileToDataUrl(file: Blob, onProgress?: (progress: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.onerror = () => reject(reader.error)
    reader.onprogress = (event) => { if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 45)) }
    reader.readAsDataURL(file)
  })
}

function mapServerMessage(message: ServerMessage, myUsername: string): Message {
  return {
    id: message.id,
    clientId: message.clientId,
    sender: message.sender.username === myUsername ? "me" : "them",
    kind: message.kind,
    body: message.body,
    duration: message.duration,
    mediaUrl: message.mediaUrl,
    fileName: message.fileName,
    fileSize: message.fileSize,
    fileType: message.fileType,
    time: new Date(message.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    status: message.sender.username === myUsername ? message.delivery || "delivered" : "delivered",
    replyToId: message.replyToId,
    replyTo: message.replyTo,
    reactions: message.reactions || [],
  }
}

function mapServerChat(chat: ServerChat, myUsername: string): Chat {
  return {
    id: `server-${chat.id}`,
    serverId: chat.id,
    name: chat.person.name,
    username: chat.person.username,
    initials: getInitials(chat.person.name),
    imageUrl: chat.person.avatarUrl,
    hue: "from-stone-400 to-stone-800",
    online: Boolean(chat.person.online),
    bio: chat.person.bio || "Описание пока не добавлено.",
    unread: chat.unread || 0,
    messages: chat.messages.map((message) => mapServerMessage(message, myUsername)),
    hasMore: Boolean(chat.hasMore),
    oldestMessageAt: chat.oldestMessageAt,
    archived: Boolean(chat.archived),
    muted: Boolean(chat.muted),
    pinned: Boolean(chat.pinned),
    pinnedMessageIds: chat.pinnedMessageIds || [],
    group: Boolean(chat.group),
    members: chat.members || [],
  }
}

export function FavouriteGram() {
  const [screen, setScreen] = useState<Screen>("landing")
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup")
  const [sessionUsername, setSessionUsername] = useState("")
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js")
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const me = await backendRequest<{ user?: ServerUser }>("/api/me")
      if (cancelled || !me.available) return
      if (me.ok && me.data?.user) {
        window.localStorage.setItem(BACKEND_KEY, "1")
        window.localStorage.setItem(SESSION_KEY, me.data.user.username)
        setSessionUsername(me.data.user.username)
      } else if (me.status === 401) {
        window.localStorage.removeItem(BACKEND_KEY)
        window.localStorage.removeItem(SESSION_KEY)
        setSessionUsername("")
      }
    })()
    return () => { cancelled = true }
  }, [])

  const openAuth = (mode: "signup" | "login") => {
    setAuthMode(mode)
    setScreen("auth")
  }

  const completeAuth = (username: string) => {
    const normalized = `@${username.replace(/^@/, "")}`
    window.localStorage.setItem(SESSION_KEY, normalized)
    setSessionUsername(normalized)
    setScreen("messenger")
  }

  const signOut = useCallback(() => {
    void backendRequest("/api/auth/logout", { method: "POST" })
    window.localStorage.removeItem(SESSION_KEY)
    window.localStorage.removeItem(BACKEND_KEY)
    setSessionUsername("")
    setScreen("landing")
  }, [])

  return (
    <div className="min-h-svh bg-background text-foreground selection:bg-white selection:text-black">
      <AnimatePresence mode="wait">
        {screen === "landing" && <Landing key="landing" onOpenAuth={openAuth} onOpenMessenger={() => setScreen("messenger")} sessionUsername={sessionUsername} reducedMotion={Boolean(reducedMotion)} />}
        {screen === "auth" && (
          <AuthScreen
            key="auth"
            initialMode={authMode}
            onBack={() => setScreen("landing")}
            onComplete={completeAuth}
            reducedMotion={Boolean(reducedMotion)}
          />
        )}
        {screen === "messenger" && <Messenger key="messenger" username={sessionUsername || "@guest"} onHome={() => setScreen("landing")} onSignOut={signOut} />}
      </AnimatePresence>
      <Toaster position="top-center" richColors />
    </div>
  )
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img src="/favourite-gram-icon.png" alt="" className={compact ? "size-9 rounded-[12px]" : "size-11 rounded-[15px]"} />
      {!compact && (
        <div className="leading-none">
          <span className="block text-[15px] font-semibold tracking-[-0.02em]">Favourite</span>
          <span className="mt-1 block text-[11px] font-medium uppercase tracking-[0.22em] text-white/42">Gram</span>
        </div>
      )}
    </div>
  )
}

function Landing({ onOpenAuth, onOpenMessenger, sessionUsername, reducedMotion }: { onOpenAuth: (mode: "signup" | "login") => void; onOpenMessenger: () => void; sessionUsername: string; reducedMotion: boolean }) {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: reducedMotion ? 0.01 : 0.35 }}
      className="relative min-h-svh overflow-hidden bg-[#050506]"
    >
      <div className="landing-shader absolute inset-0 opacity-95" aria-hidden="true">
        <MeshGradient className="h-full w-full" colors={["#050505", "#1a1713", "#655b4d", "#d6c5a9"]} distortion={0.82} swirl={0.46} speed={reducedMotion ? 0 : 0.28} maxPixelCount={720000} minPixelRatio={0.56} />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_34%,transparent_0,rgba(5,5,6,.12)_44%,rgba(5,5,6,.9)_100%)]" />
      <div className="noise-layer absolute inset-0 opacity-[0.11]" aria-hidden="true" />

      <header className="relative z-20 mx-auto flex w-full max-w-[1240px] items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <Brand />
        <div className="flex shrink-0 items-center gap-2">
          {sessionUsername ? <Button className="rounded-full bg-white px-5 text-black hover:bg-white/88" onClick={onOpenMessenger}>Открыть чаты</Button> : <><Button variant="ghost" className="rounded-full px-4 text-white/72 hover:bg-white/8 hover:text-white" onClick={() => onOpenAuth("login")}>Войти</Button><Button className="hidden rounded-full bg-white px-5 text-black hover:bg-white/88 sm:inline-flex" onClick={() => onOpenAuth("signup")}>Создать аккаунт</Button></>}
        </div>
      </header>

      <section className="relative z-10 mx-auto flex min-h-[calc(100svh-84px)] w-full max-w-[1240px] flex-col items-center justify-center px-5 pb-24 pt-14 text-center sm:px-8">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reducedMotion ? 0 : 0.15, duration: 0.45, ease }} className="glass-chip mb-7 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-white/78">
          <Sparkles className="size-4" />Личное пространство для разговоров
        </motion.div>
        <motion.h1
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: reducedMotion ? 0 : 0.11 } } }}
          className="landing-title"
        >
          <motion.span className="landing-title-main" variants={{ hidden: { opacity: 0, y: reducedMotion ? 0 : 28, filter: reducedMotion ? "none" : "blur(8px)" }, visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.58, ease } } }}><span>Слова</span> <em>доходят.</em></motion.span>
          <motion.span className="landing-title-accent" variants={{ hidden: { opacity: 0, y: reducedMotion ? 0 : 28, filter: reducedMotion ? "none" : "blur(8px)" }, visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.58, ease } } }}><span className="landing-title-dash">—</span>люди остаются.</motion.span>
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reducedMotion ? 0 : 0.75, duration: 0.5, ease }} className="mt-7 max-w-[620px] text-balance text-base leading-7 text-white/60 sm:text-lg">
          Личные и групповые чаты, голосовые, кружочки и звонки — в одном спокойном пространстве. Без номера телефона: только ваш юзернейм.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reducedMotion ? 0 : 0.9, duration: 0.5, ease }} className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          {sessionUsername ? <button className="neon-button group" onClick={onOpenMessenger}><span>Продолжить как {sessionUsername}</span><ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></button> : <><button className="neon-button group" onClick={() => onOpenAuth("signup")}><span>Создать аккаунт</span><ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></button><Button variant="outline" className="h-12 rounded-full border-white/14 bg-black/20 px-6 text-white backdrop-blur-xl hover:bg-white/8 hover:text-white" onClick={() => onOpenAuth("login")}>У меня уже есть аккаунт</Button></>}
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reducedMotion ? 0 : 1.05, duration: 0.5 }} className="mt-6 flex max-w-[540px] items-start gap-2 text-left text-xs leading-5 text-white/40 sm:text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-white/54" />После регистрации сохраните коды восстановления — без почты и номера вернуть доступ можно только ими.
        </motion.div>
      </section>

      <section className="relative z-10 mx-auto grid w-full max-w-[1120px] gap-5 px-5 pb-28 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
        <motion.div initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} className="dark-card relative overflow-hidden rounded-[28px] p-7 sm:p-9">
          <p className="eyebrow">Всё в одном окне</p><h2 className="mt-4 max-w-[360px] text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Разговор начинается без лишних шагов.</h2>
          <p className="mt-4 max-w-[410px] leading-7 text-white/48">Найдите человека по юзернейму и выберите формат: текст, голос или короткое видео.</p><FeatureGrid />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ delay: 0.08 }} className="dark-card rounded-[28px] p-7 sm:p-9">
          <p className="eyebrow">Как начать</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Четыре коротких шага.</h2><Timeline />
        </motion.div>
      </section>
    </motion.main>
  )
}

function FeatureGrid() {
  const features = [
    { icon: AtSign, label: "Юзернейм" }, { icon: Search, label: "Поиск" }, { icon: MessageCircle, label: "Текст" },
    { icon: Mic, label: "Голос" }, { icon: Video, label: "Кружочки" }, { icon: LockKeyhole, label: "Сессии" },
  ]
  return <div className="mt-10 grid grid-cols-3 gap-2.5">{features.map(({ icon: Icon, label }, index) => (
    <motion.div key={label} whileHover={{ y: -4, scale: 1.015 }} transition={{ type: "spring", stiffness: 340, damping: 24 }} className={index === 2 ? "feature-tile feature-tile-active" : "feature-tile"}><Icon className="size-5" /><span>{label}</span></motion.div>
  ))}</div>
}

function Timeline() {
  const items = [
    ["01", "Создайте аккаунт", "Придумайте свободный юзернейм и надёжный пароль."],
    ["02", "Сохраните коды", "Они понадобятся, если вы потеряете пароль и все активные сессии."],
    ["03", "Найдите человека", "Введите его юзернейм — без телефонной книги и контактов."],
    ["04", "Начните разговор", "Отправьте текст, голосовое сообщение или кружочек."],
  ]
  return <div className="relative mt-8 space-y-4 before:absolute before:bottom-7 before:left-[23px] before:top-7 before:border-l before:border-dashed before:border-white/14">{items.map(([number, title, copy], index) => (
    <motion.div key={number} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.07 }} className="relative grid grid-cols-[48px_1fr] gap-4">
      <div className="z-10 flex size-12 items-center justify-center rounded-full border border-white/12 bg-[#101012] text-sm text-white/72">{number}</div>
      <div className="rounded-[20px] border border-white/9 bg-white/[0.035] p-5"><h3 className="font-medium text-white/92">{title}</h3><p className="mt-2 text-sm leading-6 text-white/45">{copy}</p></div>
    </motion.div>
  ))}</div>
}

function AuthScreen({ initialMode, onBack, onComplete, reducedMotion }: { initialMode: "signup" | "login"; onBack: () => void; onComplete: (username: string) => void; reducedMotion: boolean }) {
  const [mode, setMode] = useState(initialMode)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<"idle" | "checking" | "success" | "error">("idle")
  const [error, setError] = useState("")
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [resetOpen, setResetOpen] = useState(false)

  const strength = useMemo(() => {
    let score = 0
    if (password.length >= 5) score++
    if (password.length >= 8) score++
    if (/[A-Za-zА-Яа-я]/.test(password) && /\d/.test(password)) score++
    if (/[^A-Za-zА-Яа-я0-9]/.test(password) || password.length >= 12) score++
    return score
  }, [password])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    if (!/^[a-z0-9_]{3,32}$/i.test(username)) { setError("Юзернейм: 3–32 символа, латиница, цифры и подчёркивание."); setStatus("error"); return }
    if (password.length < 5) { setError("Используйте не меньше 5 символов."); setStatus("error"); return }
    setStatus("checking")
    const backend = await backendRequest<{ user?: ServerUser; recoveryCodes?: string[]; error?: string }>(`/api/auth/${mode === "signup" ? "register" : "login"}`, { method: "POST", body: JSON.stringify({ username, password }) })
    if (!backend.available) { setError("Сервис временно недоступен. Обновите страницу и попробуйте снова."); setStatus("error"); return }
    if (!backend.ok) { setError(backend.data?.error || "Не удалось войти."); setStatus("error"); return }
    window.localStorage.setItem(BACKEND_KEY, "1")
    if (backend.data?.recoveryCodes) setRecoveryCodes(backend.data.recoveryCodes)
    setStatus("success")
    window.setTimeout(() => { if (mode === "signup") setShowRecovery(true); else onComplete(username) }, reducedMotion ? 80 : 420)
  }
  const resetStatus = () => { if (status === "error") setStatus("idle") }

  return (
    <motion.main initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: reducedMotion ? 0.01 : 0.32, ease }} className="auth-screen relative bg-[#050506]">
      <div className="absolute inset-0 opacity-55" aria-hidden="true"><MeshGradient className="h-full w-full" colors={["#050506", "#171513", "#3b352f", "#b9ae9d"]} distortion={0.68} swirl={0.28} maxPixelCount={520000} minPixelRatio={0.5} speed={reducedMotion ? 0 : 0.08} /></div>
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
      <Button variant="ghost" size="icon" aria-label="Вернуться на главную" onClick={onBack} className="absolute left-5 top-5 z-20 rounded-full border border-white/10 bg-black/20 text-white hover:bg-white/8 hover:text-white sm:left-8 sm:top-8"><ArrowLeft /></Button>
      <div className="auth-stage">
        <div className="auth-brand"><Brand /></div>
        <div className="neon-frame rounded-[28px] bg-[#0b0b0d]/94 p-1 shadow-[0_30px_100px_rgba(0,0,0,.6)] backdrop-blur-2xl">
          <div className="rounded-[25px] border border-white/8 bg-[#0b0b0d] p-5 sm:p-8">
            <Tabs value={mode} onValueChange={(value) => { setMode(value as "signup" | "login"); setStatus("idle"); setError("") }}>
              <TabsList className="grid h-12 w-full grid-cols-2 gap-3 bg-transparent p-0">
                <TabsTrigger value="signup" className="rounded-[12px] border border-white/10 bg-transparent data-[state=active]:border-white data-[state=active]:bg-white data-[state=active]:text-black">Создать аккаунт</TabsTrigger>
                <TabsTrigger value="login" className="rounded-[12px] border border-white/10 bg-transparent data-[state=active]:border-white data-[state=active]:bg-white data-[state=active]:text-black">Войти</TabsTrigger>
              </TabsList>
              {(["signup", "login"] as const).map((tab) => (
                <TabsContent key={tab} value={tab} className="mt-7">
                  <div className="mb-6 text-center">
                    <p className="eyebrow">{tab === "signup" ? "Новый аккаунт" : "С возвращением"}</p>
                    <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em]">{tab === "signup" ? "Два поля — и готово." : "Продолжите разговор."}</h1>
                    <p className="mt-2 text-sm leading-6 text-white/44">{tab === "signup" ? "Телефон и почта не понадобятся." : "Введите юзернейм и пароль."}</p>
                  </div>
                  <form onSubmit={submit} className={status === "error" ? "auth-form auth-form-error" : "auth-form"}>
                    <label className="field-label" htmlFor={`${tab}-username`}>Юзернейм</label>
                    <div className="auth-input-wrap"><AtSign className="size-4 text-white/35" /><Input id={`${tab}-username`} value={username} onChange={(event) => { setUsername(event.target.value.replace(/\s/g, "")); resetStatus() }} autoComplete="username" spellCheck={false} placeholder="yourname" className="h-auto border-0 bg-transparent p-0 text-base shadow-none placeholder:text-white/22 focus-visible:ring-0" /></div>
                    <div className="mt-5 flex items-center justify-between"><label className="field-label" htmlFor={`${tab}-password`}>Пароль</label><span className="text-xs text-white/30">Минимум 5 символов</span></div>
                    <div className="auth-input-wrap mt-2"><LockKeyhole className="size-4 text-white/35" /><Input id={`${tab}-password`} value={password} onChange={(event) => { setPassword(event.target.value); resetStatus() }} type={showPassword ? "text" : "password"} autoComplete={tab === "signup" ? "new-password" : "current-password"} placeholder="•••••" className="h-auto border-0 bg-transparent p-0 text-base shadow-none placeholder:text-white/22 focus-visible:ring-0" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="grid size-9 shrink-0 place-items-center rounded-full text-white/42 transition hover:bg-white/7 hover:text-white" aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>{showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}</button></div>
                    <PasswordDeck strength={strength} status={status} reducedMotion={reducedMotion} />
                    <div aria-live="polite" className="min-h-7 pt-1 text-sm">{error ? <p className="text-rose-300">{error}</p> : <p className="text-white/32">Можно использовать парольную фразу.</p>}</div>
                    <Button disabled={status === "checking" || status === "success"} className="mt-3 h-12 w-full rounded-[14px] bg-white text-base text-black hover:bg-white/88">
                      {status === "checking" ? "Проверяем…" : status === "success" ? "Готово" : tab === "signup" ? "Создать аккаунт" : "Войти"}{status === "success" ? <Check className="ml-2 size-4" /> : <ArrowRight className="ml-2 size-4" />}
                    </Button>
                    {tab === "login" && <button type="button" onClick={() => setResetOpen(true)} className="mt-4 w-full text-center text-sm text-white/42 transition hover:text-white/72">Восстановить доступ по коду</button>}
                  </form>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>
      </div>
      <RecoveryDialog open={showRecovery} codes={recoveryCodes} onContinue={() => { setShowRecovery(false); onComplete(username) }} />
      <ResetPasswordDialog open={resetOpen} onOpenChange={setResetOpen} initialUsername={username} onComplete={(restoredUsername) => { setResetOpen(false); onComplete(restoredUsername) }} />
    </motion.main>
  )
}

function PasswordDeck({ strength, status, reducedMotion }: { strength: number; status: string; reducedMotion: boolean }) {
  const isDeck = status === "checking" || status === "success"
  return (
    <div className="relative mt-5 h-[72px] overflow-hidden rounded-[16px] border border-white/8 bg-black/30" aria-hidden="true">
      <AnimatePresence mode="wait">
        {!isDeck ? (
          <motion.div key="strength" exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center gap-2.5">
            {[0, 1, 2, 3].map((item) => (
              <motion.span key={item} animate={{ y: status === "error" ? [0, -1, 1, -1, 0] : 0, borderColor: item < strength ? "rgba(139,118,255,.9)" : "rgba(255,255,255,.1)", backgroundColor: item < strength ? "rgba(124,92,252,.14)" : "rgba(255,255,255,.025)", boxShadow: item < strength ? "0 0 18px rgba(115,92,255,.18)" : "none" }} transition={{ duration: reducedMotion ? 0 : 0.28, delay: reducedMotion ? 0 : item * 0.035 }} className="grid size-10 place-items-center rounded-[11px] border text-white/46">
                {item < strength ? <Circle className="size-2 fill-current" /> : <span className="size-1 rounded-full bg-white/20" />}
              </motion.span>
            ))}
          </motion.div>
        ) : (
          <motion.div key="deck" className="absolute inset-0 grid place-items-center">
            {[0, 1, 2, 3].map((item) => (
              <motion.span key={item} initial={{ x: (item - 1.5) * 50, rotate: 0, opacity: 0.8 }} animate={{ x: status === "success" ? 0 : (item - 1.5) * 12, y: status === "success" ? 0 : Math.abs(item - 1.5) * 3, rotate: status === "success" ? 0 : [-14, -5, 5, 14][item], opacity: status === "success" ? (item === 3 ? 1 : 0) : 1, scale: status === "success" && item === 3 ? 1.06 : 1 }} transition={{ duration: reducedMotion ? 0 : 0.34, ease, delay: reducedMotion ? 0 : item * 0.025 }} className={status === "success" ? "password-card password-card-success" : "password-card"}>
                {status === "success" && item === 3 ? <Check className="size-5" /> : <span>••</span>}
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function RecoveryDialog({ open, codes, onContinue }: { open: boolean; codes: string[]; onContinue: () => void }) {
  const shownCodes = codes
  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} className="max-w-[520px] rounded-[24px] border-white/10 bg-[#0d0d0f] p-7 text-white shadow-2xl">
        <DialogHeader><div className="mb-3 grid size-11 place-items-center rounded-[14px] border border-white/10 bg-white/5"><ShieldCheck className="size-5" /></div><DialogTitle className="text-2xl tracking-[-0.035em]">Сохраните коды восстановления</DialogTitle><DialogDescription className="leading-6 text-white/45">Без почты и номера телефона это единственный способ вернуть доступ, если вы потеряете пароль и активные устройства.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-2 rounded-[18px] border border-white/8 bg-black/35 p-4 font-mono text-sm text-white/72">{shownCodes.map((code) => <span key={code} className="rounded-lg bg-white/[0.035] px-3 py-2">{code}</span>)}</div>
        <DialogFooter><Button variant="outline" className="border-white/10 bg-white/4 text-white hover:bg-white/8 hover:text-white" onClick={() => { navigator.clipboard?.writeText(shownCodes.join("\n")); toast.success("Коды скопированы") }}>Скопировать</Button><Button className="bg-white text-black hover:bg-white/88" onClick={onContinue}>Я сохранил коды</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({ open, onOpenChange, initialUsername, onComplete }: { open: boolean; onOpenChange: (open: boolean) => void; initialUsername: string; onComplete: (username: string) => void }) {
  const [username, setUsername] = useState(initialUsername)
  const [recoveryCode, setRecoveryCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const recover = async (event: FormEvent) => {
    event.preventDefault()
    if (newPassword.length < 5) { toast.error("Новый пароль — минимум 5 символов"); return }
    setBusy(true)
    const result = await backendRequest<{ user?: ServerUser; error?: string }>("/api/auth/recover", { method: "POST", body: JSON.stringify({ username, recoveryCode, newPassword }) })
    setBusy(false)
    if (!result.available) { toast.error("Сервис временно недоступен. Попробуйте снова позже."); return }
    if (!result.ok || !result.data?.user) { toast.error(result.data?.error || "Не удалось восстановить доступ"); return }
    window.localStorage.setItem(BACKEND_KEY, "1")
    toast.success("Пароль изменён")
    onComplete(result.data.user.username)
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-[440px] rounded-[24px] border-white/10 bg-[#0d0d0f] p-6 text-white"><DialogHeader><DialogTitle>Восстановление доступа</DialogTitle><DialogDescription className="text-white/42">Введите один из сохранённых кодов. После использования он станет недействительным.</DialogDescription></DialogHeader><form onSubmit={recover} className="space-y-4"><label className="block"><span className="field-label">Юзернейм</span><div className="auth-input-wrap"><AtSign className="size-4 text-white/35" /><Input value={username} onChange={(event) => setUsername(event.target.value.replace(/\s/g, ""))} className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" /></div></label><label className="block"><span className="field-label">Код восстановления</span><div className="auth-input-wrap"><ShieldCheck className="size-4 text-white/35" /><Input value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())} placeholder="ABCDE-12345" className="h-auto border-0 bg-transparent p-0 font-mono shadow-none focus-visible:ring-0" /></div></label><label className="block"><span className="field-label">Новый пароль</span><div className="auth-input-wrap"><LockKeyhole className="size-4 text-white/35" /><Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={5} className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" /></div></label><Button disabled={busy} className="h-12 w-full bg-white text-black hover:bg-white/88">{busy ? "Проверяем…" : "Сменить пароль и войти"}</Button></form></DialogContent></Dialog>
}

function Messenger({ username, onHome, onSignOut }: { username: string; onHome: () => void; onSignOut: () => void }) {
  const [chats, setChats] = useState<Chat[]>([])
  const [activeId, setActiveId] = useState("")
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [query, setQuery] = useState("")
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [videoOpen, setVideoOpen] = useState(false)
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(null)
  const [groupOpen, setGroupOpen] = useState(false)
  const [callTarget, setCallTarget] = useState<{ chat: Chat; mode: "audio" | "video"; call?: CallSignal } | null>(null)
  const [pendingDeleteChat, setPendingDeleteChat] = useState<Chat | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set())
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE)
  const [notifications, setNotifications] = useState<NotificationSettings>(DEFAULT_NOTIFICATIONS)
  const [jumpTarget, setJumpTarget] = useState<{ id: string; token: number } | null>(null)
  const [pinnedCursor, setPinnedCursor] = useState(0)
  const backendEnabled = true
  const [backendLoading, setBackendLoading] = useState(false)
  const [remotePeople, setRemotePeople] = useState<DirectoryPerson[]>([])
  const [typingChats, setTypingChats] = useState<Set<string>>(new Set())
  const [listMode, setListMode] = useState<"all" | "unread" | "archived">("all")
  const [messageResults, setMessageResults] = useState<SearchResult[]>([])
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [profile, setProfile] = useState<Profile>({ username, name: username.replace(/^@/, "") || "Мой профиль", bio: "В сети", initials: "FG", imageUrl: "" })
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const longPressRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)
  const recordSecondsRef = useRef(0)
  const shouldSendVoiceRef = useRef(true)
  const attachmentRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const activeIdRef = useRef(activeId)
  const typingTimersRef = useRef<Map<string, number>>(new Map())

  const enableNotifications = useCallback(async () => {
    if (!("Notification" in window)) { toast.error("Этот браузер не поддерживает уведомления"); return }
    const permission = await Notification.requestPermission()
    if (permission === "granted") toast.success("Уведомления включены")
    else toast.error("Браузер не разрешил уведомления")
  }, [])

  const activeChat = chats.find((chat) => chat.id === activeId) ?? chats[0]
  const theme = appearance.accent
  const draft = drafts[activeId] || ""
  const setDraft = useCallback((value: string) => setDrafts((current) => ({ ...current, [activeId]: value })), [activeId])
  const filteredChats = chats.filter((chat) => (listMode === "archived" ? chat.archived : !chat.archived) && (listMode !== "unread" || chat.unread > 0) && `${chat.name} ${chat.username} ${chat.messages.map((message) => `${message.body || ""} ${message.fileName || ""}`).join(" ")}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
  const localPeople = remotePeople
  const filteredPeople = query.length >= 2 ? localPeople.filter((person) => `${person.name} ${person.username}`.toLowerCase().includes(query.toLowerCase())).filter((person, index, all) => all.findIndex((item) => item.username === person.username) === index) : []
  const archivedChats = chats.filter((chat) => chat.archived)
  const selectedChats = chats.filter((chat) => selectedChatIds.has(chat.id))
  const pinnedMessages = activeChat ? (activeChat.pinnedMessageIds || []).map((id) => activeChat.messages.find((message) => message.id === id)).filter((message): message is Message => Boolean(message)) : []
  const pinnedMessage = pinnedMessages[pinnedCursor % Math.max(1, pinnedMessages.length)]

  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => {
    const root = document.documentElement
    root.dataset.accent = appearance.accent
    root.dataset.bubbleShape = appearance.bubbleShape
    root.dataset.bubbleOutline = appearance.bubbleOutline
    root.dataset.density = appearance.compact ? "compact" : "comfortable"
    root.dataset.chatBackdrop = appearance.backdrop
    root.dataset.motion = appearance.motion
    if (appearance.accent === "custom") {
      const hex = appearance.customAccent.replace("#", "")
      const normalized = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex
      const parsed = Number.parseInt(normalized, 16)
      if (normalized.length === 6 && Number.isFinite(parsed)) {
        const red = (parsed >> 16) & 255
        const green = (parsed >> 8) & 255
        const blue = parsed & 255
        root.style.setProperty("--ui-accent", `#${normalized}`)
        root.style.setProperty("--ui-accent-rgb", `${red},${green},${blue}`)
      }
    } else {
      root.style.removeProperty("--ui-accent")
      root.style.removeProperty("--ui-accent-rgb")
    }
  }, [appearance])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedProfile = window.localStorage.getItem(storageKey(PROFILE_KEY, username)) || window.localStorage.getItem(PROFILE_KEY)
        const savedTheme = window.localStorage.getItem(THEME_KEY) as AccentTheme | null
        const savedAppearance = window.localStorage.getItem(storageKey(APPEARANCE_KEY, username))
        const savedNotifications = window.localStorage.getItem(storageKey(NOTIFICATION_KEY, username))
        setBackendLoading(true)
        setChats([])
        setActiveId("")
        window.localStorage.removeItem(storageKey(CHATS_KEY, username))
        window.localStorage.removeItem(CHATS_KEY)
        if (savedProfile) setProfile({ ...JSON.parse(savedProfile) as Profile, username })
        if (savedAppearance) setAppearance({ ...DEFAULT_APPEARANCE, ...JSON.parse(savedAppearance) as AppearanceSettings })
        else if (["sand", "violet", "ocean", "rose", "lime"].includes(savedTheme || "")) setAppearance((current) => ({ ...current, accent: savedTheme as AccentTheme }))
        if (savedNotifications) setNotifications({ ...DEFAULT_NOTIFICATIONS, ...JSON.parse(savedNotifications) as NotificationSettings })
      } catch {
        toast.error("Не удалось прочитать локальные данные")
      } finally {
        setHydrated(true)
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [username])

  useEffect(() => {
    if (!hydrated || !backendEnabled) return
    void (async () => {
      const me = await backendRequest<{ user?: ServerUser }>("/api/me")
      if (!me.ok || !me.data?.user) {
        setBackendLoading(false)
        if (me.status === 401) onSignOut()
        return
      }
      const serverProfile = me.data.user
      setProfile((current) => ({ ...current, username: serverProfile.username, name: serverProfile.name, bio: serverProfile.bio, imageUrl: serverProfile.avatarUrl || current.imageUrl, initials: getInitials(serverProfile.name) }))
      const [result, preferences] = await Promise.all([
        backendRequest<{ chats?: ServerChat[] }>("/api/chats"),
        backendRequest<{ appearance?: AppearanceSettings; notifications?: NotificationSettings }>("/api/me/preferences"),
      ])
      if (!result.ok) { setBackendLoading(false); toast.error("Не удалось загрузить чаты"); return }
      if (preferences.ok && preferences.data?.appearance) setAppearance({ ...DEFAULT_APPEARANCE, ...preferences.data.appearance })
      if (preferences.ok && preferences.data?.notifications) setNotifications({ ...DEFAULT_NOTIFICATIONS, ...preferences.data.notifications })
      const serverChats = (result.data?.chats || []).map((chat) => mapServerChat(chat, serverProfile.username))
      setChats(serverChats)
      setActiveId((current) => serverChats.some((chat) => chat.id === current) ? current : serverChats[0]?.id || "")
      setBackendLoading(false)
    })()
  }, [backendEnabled, hydrated, onSignOut])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!backendEnabled || query.trim().length < 2) { setMessageResults([]); return }
      void Promise.all([
        backendRequest<{ users?: ServerUser[] }>(`/api/users?query=${encodeURIComponent(query)}`),
        backendRequest<{ results?: SearchResult[] }>(`/api/messages/search?query=${encodeURIComponent(query)}`),
      ]).then(([users, messages]) => {
        if (users.ok) setRemotePeople((users.data?.users || []).map((person) => ({ ...person, imageUrl: person.avatarUrl, initials: getInitials(person.name), hue: "from-stone-400 to-amber-800" })))
        if (messages.ok) setMessageResults(messages.data?.results || [])
      })
    }, 220)
    return () => window.clearTimeout(timer)
  }, [backendEnabled, query])

  useEffect(() => {
    if (!backendEnabled || !activeChat?.serverId) return
    const serverId = activeChat.serverId
    if (!draft.trim()) {
      void backendRequest(`/api/chats/${serverId}/typing`, { method: "POST", body: JSON.stringify({ typing: false }) })
      return
    }
    const start = window.setTimeout(() => void backendRequest(`/api/chats/${serverId}/typing`, { method: "POST", body: JSON.stringify({ typing: true }) }), 180)
    const stop = window.setTimeout(() => void backendRequest(`/api/chats/${serverId}/typing`, { method: "POST", body: JSON.stringify({ typing: false }) }), 2500)
    return () => { window.clearTimeout(start); window.clearTimeout(stop) }
  }, [activeChat?.serverId, backendEnabled, draft])

  useEffect(() => {
    if (!backendEnabled || !activeChat?.serverId) return
    const serverId = activeChat.serverId
    return () => { void backendRequest(`/api/chats/${serverId}/typing`, { method: "POST", body: JSON.stringify({ typing: false }) }) }
  }, [activeChat?.serverId, backendEnabled])

  useEffect(() => {
    if (!backendEnabled || callTarget) return
    let disposed = false
    const checkCalls = async () => {
      const result = await backendRequest<{ calls?: CallSignal[] }>("/api/calls")
      const incoming = result.data?.calls?.find((call) => call.role === "callee" && call.status === "ringing")
      if (!disposed && incoming) {
        const chat = chats.find((item) => item.serverId === incoming.conversationId)
        if (chat) setCallTarget({ chat, mode: incoming.mode, call: incoming })
      }
    }
    void checkCalls()
    const timer = window.setInterval(checkCalls, 2500)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [backendEnabled, callTarget, chats])

  useEffect(() => {
    if (!backendEnabled) return
    const events = new EventSource("/api/events", { withCredentials: true })
    const typingTimers = typingTimersRef.current
    let disposed = false
    const refreshFromServer = async () => {
      const result = await backendRequest<{ chats?: ServerChat[] }>("/api/chats")
      if (disposed || !result.ok) return
      const incoming = (result.data?.chats || []).map((chat) => mapServerChat(chat, profile.username))
      setChats((current) => incoming.map((chat) => {
        const existing = current.find((item) => item.serverId === chat.serverId)
        if (!existing) return chat
        const serverClientIds = new Set(chat.messages.map((message) => message.clientId).filter(Boolean))
        const pending = existing.messages.filter((message) => (message.status === "sending" || message.status === "error") && !serverClientIds.has(message.clientId))
        return { ...chat, messages: [...chat.messages, ...pending].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)) }
      }))
      setActiveId((current) => incoming.some((chat) => chat.id === current) ? current : incoming[0]?.id || "")
    }
    const onServerMessage = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as { conversationId: string; message: ServerMessage; chat: ServerChat }
      setChats((current) => {
        const existing = current.find((chat) => chat.serverId === payload.conversationId)
        const mapped = mapServerChat(payload.chat, profile.username)
        if (mapped.id === activeIdRef.current) mapped.unread = 0
        if (existing) {
          const serverClientIds = new Set(mapped.messages.map((message) => message.clientId).filter(Boolean))
          const pending = existing.messages.filter((message) => (message.status === "sending" || message.status === "error") && !serverClientIds.has(message.clientId))
          mapped.messages = [...mapped.messages, ...pending].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        }
        return [mapped, ...current.filter((chat) => chat.serverId !== payload.conversationId)]
      })
      if (event.type === "message.created" && payload.message.sender.username !== profile.username && document.visibilityState !== "visible" && "Notification" in window && Notification.permission === "granted") {
        void navigator.serviceWorker?.ready.then((registration) => registration.showNotification(payload.chat.person.name, {
          body: payload.message.kind === "text" ? payload.message.body || "Новое сообщение" : messagePreview(payload.message),
          icon: "/favourite-gram-icon.png",
          badge: "/favourite-gram-icon.png",
          tag: `chat-${payload.conversationId}`,
        }))
      }
      if (`server-${payload.conversationId}` === activeIdRef.current) void backendRequest(`/api/chats/${payload.conversationId}/read`, { method: "POST" })
    }
    const onProfile = (event: MessageEvent<string>) => {
      const { user } = JSON.parse(event.data) as { user: { username: string; name: string; bio: string; avatarUrl: string } }
      if (user.username === profile.username) setProfile((current) => ({ ...current, name: user.name, bio: user.bio, imageUrl: user.avatarUrl, initials: getInitials(user.name) }))
      setChats((current) => current.map((chat) => chat.username === user.username ? { ...chat, name: user.name, initials: getInitials(user.name), imageUrl: user.avatarUrl, bio: user.bio } : chat))
    }
    const onRead = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as { conversationId: string }
      setChats((current) => current.map((chat) => chat.serverId === payload.conversationId ? { ...chat, messages: chat.messages.map((message) => message.sender === "me" && message.status !== "error" ? { ...message, status: "read" } : message) } : chat))
    }
    const onPresence = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as { username: string; online: boolean }
      setChats((current) => current.map((chat) => chat.username === payload.username ? { ...chat, online: payload.online } : chat))
    }
    const onTyping = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as { conversationId: string; typing: boolean }
      const oldTimer = typingTimers.get(payload.conversationId)
      if (oldTimer) window.clearTimeout(oldTimer)
      setTypingChats((current) => { const next = new Set(current); if (payload.typing) next.add(payload.conversationId); else next.delete(payload.conversationId); return next })
      if (payload.typing) typingTimers.set(payload.conversationId, window.setTimeout(() => setTypingChats((current) => { const next = new Set(current); next.delete(payload.conversationId); return next }), 3500))
    }
    events.addEventListener("message.created", onServerMessage as EventListener)
    events.addEventListener("message.updated", onServerMessage as EventListener)
    events.addEventListener("profile.updated", onProfile as EventListener)
    events.addEventListener("presence.updated", onPresence as EventListener)
    events.addEventListener("typing.updated", onTyping as EventListener)
    events.addEventListener("chat.read", onRead as EventListener)
    events.addEventListener("refresh", refreshFromServer as EventListener)
    return () => { disposed = true; events.close(); for (const timer of typingTimers.values()) window.clearTimeout(timer); typingTimers.clear() }
  }, [backendEnabled, profile.username])

  useEffect(() => {
    if (!hydrated) return
    window.localStorage.setItem(storageKey(PROFILE_KEY, username), JSON.stringify(profile))
    window.localStorage.setItem(THEME_KEY, theme)
    window.localStorage.setItem(storageKey(APPEARANCE_KEY, username), JSON.stringify(appearance))
    window.localStorage.setItem(storageKey(NOTIFICATION_KEY, username), JSON.stringify(notifications))
    const serializableChats = chats.map((chat) => ({
      ...chat,
      messages: chat.messages.map((message) => message.mediaUrl?.startsWith("blob:") ? { ...message, mediaUrl: undefined } : message),
    }))
    if (!backendEnabled) window.localStorage.setItem(storageKey(CHATS_KEY, username), JSON.stringify(serializableChats))
  }, [appearance, backendEnabled, chats, hydrated, notifications, profile, theme, username])

  const sendToBackend = useCallback(async (chat: Chat, message: Omit<Message, "id" | "time">) => {
    if (!backendEnabled) return
    const markFailed = () => setChats((current) => current.map((item) => item.id === chat.id ? { ...item, messages: item.messages.map((candidate) => candidate.clientId === message.clientId ? { ...candidate, status: "error" } : candidate) } : item))
    let serverId = chat.serverId
    if (!serverId) {
      const created = await backendRequest<{ chat?: { id: string } }>("/api/chats", { method: "POST", body: JSON.stringify({ username: chat.username }) })
      serverId = created.data?.chat?.id
      if (!created.ok || !serverId) { markFailed(); toast.error("Не удалось создать диалог"); return }
      setChats((current) => current.map((item) => item.id === chat.id ? { ...item, serverId } : item))
    }
    let mediaUrl = message.mediaUrl
    if (mediaUrl?.startsWith("blob:")) {
      try {
        const blob = await fetch(mediaUrl).then((response) => response.blob())
        const updateProgress = (uploadProgress: number) => setChats((current) => current.map((item) => item.id === chat.id ? { ...item, messages: item.messages.map((candidate) => candidate.clientId === message.clientId ? { ...candidate, uploadProgress } : candidate) } : item))
        const dataUrl = await fileToDataUrl(blob, updateProgress)
        updateProgress(55)
        const uploaded = await backendRequest<{ url?: string }>("/api/uploads", { method: "POST", body: JSON.stringify({ name: message.fileName || `${message.kind}.webm`, dataUrl }) })
        if (!uploaded.ok || !uploaded.data?.url) { markFailed(); toast.error("Не удалось загрузить вложение"); return }
        updateProgress(100)
        mediaUrl = uploaded.data.url
      } catch { markFailed(); toast.error("Не удалось загрузить вложение"); return }
    }
    const sent = await backendRequest<{ message?: ServerMessage; error?: string }>(`/api/chats/${serverId}/messages`, { method: "POST", body: JSON.stringify({ ...message, mediaUrl }) })
    if (!sent.ok) {
      markFailed()
      toast.error(sent.data?.error || "Сообщение не доставлено")
    } else if (sent.data?.message) {
      const delivered = mapServerMessage(sent.data.message, profile.username)
      setChats((current) => current.map((item) => item.id === chat.id ? { ...item, messages: item.messages.map((candidate) => candidate.clientId === message.clientId ? delivered : candidate) } : item))
    }
  }, [backendEnabled, profile.username])

  const pushMessage = useCallback((message: Omit<Message, "id" | "time">) => {
    const chat = chats.find((item) => item.id === activeId)
    const clientId = message.clientId || crypto.randomUUID()
    const createdAt = Date.now()
    const localMessage = { ...message, clientId, id: clientId, status: backendEnabled ? "sending" as const : "delivered" as const, createdAt, time: new Date(createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) }
    setChats((current) => {
      const target = current.find((item) => item.id === activeId)
      return target ? [{ ...target, unread: 0, messages: [...target.messages, localMessage] }, ...current.filter((item) => item.id !== activeId)] : current
    })
    if (chat) void sendToBackend(chat, { ...message, clientId })
  }, [activeId, backendEnabled, chats, sendToBackend])

  const openChat = (id: string) => {
    const chat = chats.find((item) => item.id === id)
    setActiveId(id)
    setPinnedCursor(0)
    setJumpTarget(null)
    setChats((current) => current.map((chat) => chat.id === id ? { ...chat, unread: 0 } : chat))
    setMobileChatOpen(true)
    setReplyingTo(null)
    setEditingMessage(null)
    if (backendEnabled && chat?.serverId) void backendRequest(`/api/chats/${chat.serverId}/read`, { method: "POST" })
  }

  const sendText = async (event: FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body) return
    if (editingMessage && activeChat) {
      const previousBody = editingMessage.body
      setChats((current) => current.map((chat) => chat.id === activeChat.id ? { ...chat, messages: chat.messages.map((message) => message.id === editingMessage.id ? { ...message, body, editedAt: Date.now() } : message) } : chat))
      if (backendEnabled && activeChat.serverId) {
        const saved = await backendRequest<{ error?: string }>(`/api/chats/${activeChat.serverId}/messages/${editingMessage.id}`, { method: "PATCH", body: JSON.stringify({ body }) })
        if (!saved.ok) {
          setChats((current) => current.map((chat) => chat.id === activeChat.id ? { ...chat, messages: chat.messages.map((message) => message.id === editingMessage.id ? { ...message, body: previousBody } : message) } : chat))
          toast.error(saved.data?.error || "Не удалось изменить сообщение")
          return
        }
      }
      setEditingMessage(null)
    } else {
      pushMessage({ sender: "me", kind: "text", body, replyToId: replyingTo?.id || null })
      setReplyingTo(null)
    }
    setDraft("")
    if (composerRef.current) composerRef.current.style.height = "auto"
  }

  const beginReply = (message: Message) => {
    setEditingMessage(null)
    setReplyingTo(message)
    window.setTimeout(() => composerRef.current?.focus(), 0)
  }

  const beginEdit = (message: Message) => {
    if (message.sender !== "me" || message.kind !== "text" || message.deletedAt) return
    setReplyingTo(null)
    setEditingMessage(message)
    setDraft(message.body || "")
    window.setTimeout(() => {
      composerRef.current?.focus()
      if (composerRef.current) composerRef.current.style.height = `${Math.min(composerRef.current.scrollHeight, 132)}px`
    }, 0)
  }

  const deleteMessage = async (message: Message) => {
    if (!activeChat || message.sender !== "me") return
    const previous = message
    setChats((current) => current.map((chat) => chat.id === activeChat.id ? { ...chat, messages: chat.messages.map((item) => item.id === message.id ? { ...item, body: "", mediaUrl: undefined, fileName: undefined, deletedAt: Date.now() } : item) } : chat))
    if (backendEnabled && activeChat.serverId) {
      const removed = await backendRequest<{ error?: string }>(`/api/chats/${activeChat.serverId}/messages/${message.id}`, { method: "DELETE" })
      if (!removed.ok) {
        setChats((current) => current.map((chat) => chat.id === activeChat.id ? { ...chat, messages: chat.messages.map((item) => item.id === message.id ? previous : item) } : chat))
        toast.error(removed.data?.error || "Не удалось удалить сообщение")
      }
    }
  }

  const toggleReaction = async (message: Message, emoji: string) => {
    if (!activeChat || message.deletedAt) return
    const update = (item: Message) => {
      if (item.id !== message.id) return item
      const reactions = [...(item.reactions || [])]
      const index = reactions.findIndex((reaction) => reaction.emoji === emoji)
      if (index < 0) reactions.push({ emoji, count: 1, reactedByMe: true })
      else if (reactions[index].reactedByMe) {
        const count = reactions[index].count - 1
        if (count <= 0) reactions.splice(index, 1)
        else reactions[index] = { ...reactions[index], count, reactedByMe: false }
      } else reactions[index] = { ...reactions[index], count: reactions[index].count + 1, reactedByMe: true }
      return { ...item, reactions }
    }
    setChats((current) => current.map((chat) => chat.id === activeChat.id ? { ...chat, messages: chat.messages.map(update) } : chat))
    if (backendEnabled && activeChat.serverId) {
      const saved = await backendRequest<{ error?: string }>(`/api/chats/${activeChat.serverId}/messages/${message.id}/reactions`, { method: "POST", body: JSON.stringify({ emoji }) })
      if (!saved.ok) {
        setChats((current) => current.map((chat) => chat.id === activeChat.id ? { ...chat, messages: chat.messages.map(update) } : chat))
        toast.error(saved.data?.error || "Не удалось поставить реакцию")
      }
    }
  }

  const retryMessage = (message: Message) => {
    if (!activeChat || message.status !== "error") return
    setChats((current) => current.map((chat) => chat.id === activeChat.id ? { ...chat, messages: chat.messages.map((item) => item.id === message.id ? { ...item, status: "sending" } : item) } : chat))
    void sendToBackend(activeChat, { ...message, status: "sending" })
  }

  const loadOlderMessages = async () => {
    if (!activeChat?.serverId || !activeChat.hasMore || !activeChat.oldestMessageAt) return
    const result = await backendRequest<{ messages?: ServerMessage[]; hasMore?: boolean; nextBefore?: number | null }>(`/api/chats/${activeChat.serverId}/messages?before=${activeChat.oldestMessageAt}&limit=50`)
    if (!result.ok) { toast.error("Не удалось загрузить историю"); return }
    const older = (result.data?.messages || []).map((message) => mapServerMessage(message, profile.username))
    setChats((current) => current.map((chat) => chat.id === activeChat.id ? { ...chat, messages: [...older, ...chat.messages.filter((message) => !older.some((old) => old.id === message.id))], hasMore: Boolean(result.data?.hasMore), oldestMessageAt: result.data?.nextBefore || chat.oldestMessageAt } : chat))
  }

  const attachFile = (file?: File) => {
    if (!file) return
    if (file.size > 25 * 1024 * 1024) { toast.error("Файл слишком большой", { description: "Для прототипа доступно до 25 МБ." }); return }
    pushMessage({ sender: "me", kind: "file", mediaUrl: URL.createObjectURL(file), fileName: file.name, fileSize: file.size, fileType: file.type })
    toast.success("Файл добавлен в чат")
  }

  const startVoice = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { toast.error("Этот браузер не поддерживает запись голосовых"); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
        if (shouldSendVoiceRef.current && blob.size > 0) pushMessage({ sender: "me", kind: "voice", mediaUrl: URL.createObjectURL(blob), duration: Math.max(1, recordSecondsRef.current) })
      }
      recorder.start(200); recorderRef.current = recorder; recordSecondsRef.current = 0; shouldSendVoiceRef.current = true; setRecordSeconds(0); setRecording(true)
      timerRef.current = window.setInterval(() => setRecordSeconds((value) => { const next = value + 1; recordSecondsRef.current = next; return next }), 1000)
    } catch { toast.error("Микрофон недоступен", { description: "Разрешите доступ в настройках браузера." }) }
  }

  const stopVoice = (send = true) => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
    shouldSendVoiceRef.current = send
    const recorder = recorderRef.current
    if (recorder && recorder.state !== "inactive") { if (!send) recorder.ondataavailable = null; recorder.stop(); if (!send) recorder.stream.getTracks().forEach((track) => track.stop()) }
    recorderRef.current = null; setRecording(false); if (!send) toast.info("Запись отменена")
  }

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    if (longPressRef.current) window.clearTimeout(longPressRef.current)
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop())
  }, [])

  const startChat = (person: DirectoryPerson) => {
    const id = person.username.slice(1)
    if (!chats.find((chat) => chat.id === id)) setChats((current) => [{ ...person, id, online: false, unread: 0, messages: [] }, ...current])
    openChat(id)
    setQuery("")
  }

  const createGroup = async (name: string, usernames: string[]) => {
    const result = await backendRequest<{ chat?: ServerChat; error?: string }>("/api/groups", { method: "POST", body: JSON.stringify({ name, usernames }) })
    if (!result.ok || !result.data?.chat) { toast.error(result.data?.error || "Не удалось создать группу"); return false }
    const chat = mapServerChat(result.data.chat, profile.username)
    setChats((current) => [chat, ...current])
    setActiveId(chat.id)
    setMobileChatOpen(true)
    setGroupOpen(false)
    toast.success("Группа создана")
    return true
  }

  const beginLongPress = (chat: Chat) => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current)
    longPressRef.current = window.setTimeout(() => {
      suppressClickRef.current = true
      setSelectedChatIds((current) => new Set(current).add(chat.id))
      navigator.vibrate?.(20)
    }, 520)
  }

  const cancelLongPress = () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current)
    longPressRef.current = null
  }

  const toggleChatSelection = (chatId: string) => {
    setSelectedChatIds((current) => {
      const next = new Set(current)
      if (next.has(chatId)) next.delete(chatId)
      else next.add(chatId)
      return next
    })
  }

  const clearChatSelection = () => setSelectedChatIds(new Set())

  const applyBulkPreference = async (field: "archived" | "muted" | "pinned") => {
    if (!selectedChats.length) return
    const value = !selectedChats.every((chat) => Boolean(chat[field]))
    const ids = new Set(selectedChats.map((chat) => chat.id))
    const snapshot = new Map(selectedChats.map((chat) => [chat.id, Boolean(chat[field])]))
    setChats((current) => current.map((chat) => ids.has(chat.id) ? { ...chat, [field]: value } : chat))
    const results = await Promise.all(selectedChats.map(async (chat) => {
      if (!chat.serverId) return { id: chat.id, ok: true }
      const result = await backendRequest<{ error?: string }>(`/api/chats/${chat.serverId}/preferences`, { method: "PATCH", body: JSON.stringify({ [field]: value }) })
      return { id: chat.id, ok: result.ok }
    }))
    const failed = new Set(results.filter((result) => !result.ok).map((result) => result.id))
    if (failed.size) {
      setChats((current) => current.map((chat) => failed.has(chat.id) ? { ...chat, [field]: snapshot.get(chat.id) } : chat))
      toast.error(`Не удалось обновить ${failed.size} ${failed.size === 1 ? "чат" : "чата"}`)
      setSelectedChatIds(failed)
      return
    }
    if (field === "archived" && value && ids.has(activeId)) {
      setMobileChatOpen(false)
      setActiveId(chats.find((chat) => !ids.has(chat.id) && !chat.archived)?.id || "")
    }
    clearChatSelection()
    toast.success(field === "archived" ? (value ? "Чаты перемещены в архив" : "Чаты возвращены") : field === "muted" ? (value ? "Уведомления выключены" : "Уведомления включены") : (value ? "Чаты закреплены" : "Чаты откреплены"))
  }

  const deleteSelectedChats = async () => {
    const targets = selectedChats
    if (!targets.length) return
    const deletedIds = new Set<string>()
    const results = await Promise.all(targets.map(async (chat) => {
      if (!chat.serverId) return { chat, ok: true }
      const result = await backendRequest(`/api/chats/${chat.serverId}`, { method: "DELETE" })
      return { chat, ok: result.ok }
    }))
    results.forEach(({ chat, ok }) => { if (ok) deletedIds.add(chat.id) })
    setChats((current) => current.filter((chat) => !deletedIds.has(chat.id)))
    if (deletedIds.has(activeId)) { setActiveId(""); setMobileChatOpen(false) }
    setBulkDeleteOpen(false)
    setSelectedChatIds(new Set(results.filter((result) => !result.ok).map((result) => result.chat.id)))
    if (results.some((result) => !result.ok)) toast.error("Часть чатов удалить не удалось")
    else toast.success(targets.length === 1 ? "Чат удалён" : `Удалено чатов: ${targets.length}`)
  }

  const deleteChat = () => {
    if (!pendingDeleteChat) return
    if (backendEnabled && pendingDeleteChat.serverId) void backendRequest(`/api/chats/${pendingDeleteChat.serverId}`, { method: "DELETE" })
    const nextChats = chats.filter((chat) => chat.id !== pendingDeleteChat.id)
    setChats(nextChats)
    if (activeId === pendingDeleteChat.id) setActiveId(nextChats[0]?.id || "")
    setMobileChatOpen(false)
    setPendingDeleteChat(null)
    toast.success("Чат удалён")
  }

  const saveProfile = (nextProfile: Profile) => {
    setProfile(nextProfile)
    if (!backendEnabled) return
    void (async () => {
      let avatarUrl = nextProfile.imageUrl
      if (avatarUrl.startsWith("data:")) {
        const uploaded = await backendRequest<{ url?: string }>("/api/uploads", { method: "POST", body: JSON.stringify({ name: "avatar.webp", dataUrl: avatarUrl }) })
        if (uploaded.ok && uploaded.data?.url) avatarUrl = uploaded.data.url
      }
      const saved = await backendRequest<{ user?: { username: string; name: string; bio: string; avatarUrl: string }; error?: string }>("/api/me", { method: "PATCH", body: JSON.stringify({ name: nextProfile.name, bio: nextProfile.bio, avatarUrl }) })
      if (!saved.ok || !saved.data?.user) { toast.error(saved.data?.error || "Профиль сохранён только на этом устройстве"); return }
      setProfile((current) => ({ ...current, imageUrl: saved.data?.user?.avatarUrl || current.imageUrl }))
    })()
  }

  const saveAppearance = (next: AppearanceSettings) => {
    setAppearance(next)
    void backendRequest("/api/me/preferences", { method: "PATCH", body: JSON.stringify({ appearance: next }) }).then((result) => { if (!result.ok) toast.error("Не удалось синхронизировать оформление") })
  }

  const saveNotifications = (next: NotificationSettings) => {
    setNotifications(next)
    void backendRequest("/api/me/preferences", { method: "PATCH", body: JSON.stringify({ notifications: next }) }).then((result) => { if (!result.ok) toast.error("Не удалось синхронизировать уведомления") })
  }

  const blockActiveContact = async () => {
    if (!activeChat) return
    const result = await backendRequest<{ error?: string }>(`/api/users/${encodeURIComponent(activeChat.username)}/block`, { method: "POST", body: "{}" })
    if (!result.ok) { toast.error(result.data?.error || "Не удалось заблокировать пользователя"); return }
    setChats((current) => current.filter((chat) => chat.id !== activeChat.id))
    setActiveId((current) => current === activeChat.id ? "" : current)
    setWorkspaceView(null)
    setMobileChatOpen(false)
    toast.success(`${activeChat.name} заблокирован`)
  }

  const updateChatPreference = async (field: "archived" | "muted" | "pinned", value: boolean) => {
    if (!activeChat) return
    const previous = activeChat[field]
    setChats((current) => current.map((chat) => chat.id === activeChat.id ? { ...chat, [field]: value } : chat))
    if (backendEnabled && activeChat.serverId) {
      const saved = await backendRequest<{ error?: string }>(`/api/chats/${activeChat.serverId}/preferences`, { method: "PATCH", body: JSON.stringify({ [field]: value }) })
      if (!saved.ok) {
        setChats((current) => current.map((chat) => chat.id === activeChat.id ? { ...chat, [field]: previous } : chat))
        toast.error(saved.data?.error || "Не удалось сохранить настройку чата")
        return
      }
    }
    if (field === "archived" && value) { setMobileChatOpen(false); setActiveId(chats.find((chat) => chat.id !== activeChat.id && !chat.archived)?.id || "") }
  }

  const togglePinnedMessage = async (message: Message) => {
    if (!activeChat || message.deletedAt) return
    const pinned = activeChat.pinnedMessageIds?.includes(message.id) || false
    setChats((current) => current.map((chat) => chat.id === activeChat.id ? { ...chat, pinnedMessageIds: pinned ? (chat.pinnedMessageIds || []).filter((id) => id !== message.id) : [...(chat.pinnedMessageIds || []), message.id] } : chat))
    if (backendEnabled && activeChat.serverId) {
      const saved = await backendRequest<{ error?: string }>(`/api/chats/${activeChat.serverId}/messages/${message.id}/pin`, { method: pinned ? "DELETE" : "POST" })
      if (!saved.ok) { toast.error(saved.data?.error || "Не удалось закрепить сообщение"); setChats((current) => current.map((chat) => chat.id === activeChat.id ? { ...chat, pinnedMessageIds: activeChat.pinnedMessageIds || [] } : chat)) }
    }
  }

  const forwardMessage = async (target: Chat) => {
    if (!activeChat || !forwardingMessage) return
    if (backendEnabled && activeChat.serverId && target.serverId) {
      const forwarded = await backendRequest<{ error?: string }>(`/api/chats/${activeChat.serverId}/messages/${forwardingMessage.id}/forward`, { method: "POST", body: JSON.stringify({ conversationId: target.serverId, clientId: crypto.randomUUID() }) })
      if (!forwarded.ok) { toast.error(forwarded.data?.error || "Не удалось переслать сообщение"); return }
    } else {
      const createdAt = forwardingMessage.createdAt || 0
      setChats((current) => current.map((chat) => chat.id === target.id ? { ...chat, messages: [...chat.messages, { ...forwardingMessage, id: crypto.randomUUID(), clientId: crypto.randomUUID(), sender: "me", createdAt, time: new Date(createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }), reactions: [], replyTo: null, replyToId: null }] } : chat))
    }
    setForwardingMessage(null)
    toast.success(`Сообщение переслано в чат «${target.name}»`)
  }

  const reportActiveContact = async () => {
    if (!activeChat || !backendEnabled) return
    const reason = window.prompt("Кратко опишите причину жалобы")?.trim()
    if (!reason) return
    const reported = await backendRequest<{ error?: string }>("/api/reports", { method: "POST", body: JSON.stringify({ username: activeChat.username, reason }) })
    if (!reported.ok) { toast.error(reported.data?.error || "Не удалось отправить жалобу"); return }
    toast.success("Жалоба отправлена")
  }

  useEffect(() => {
    const context = (document as Document & { modelContext?: WebMCPContext }).modelContext
    if (!context?.registerTool) return
    const lifecycle = new AbortController()
    const register = async () => {
      await context.registerTool({
        name: "list_favourite_gram_chats",
        title: "Список чатов",
        description: "Показать доступные чаты Favourite Gram и непрочитанные сообщения.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: () => chats.map((chat) => ({ username: chat.username, name: chat.name, unread: chat.unread })),
      }, { signal: lifecycle.signal })
      await context.registerTool({
        name: "send_favourite_gram_message",
        title: "Отправить сообщение",
        description: "Отправить текст в открытый чат Favourite Gram и обновить видимый разговор.",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string", minLength: 1, maxLength: 4000 } },
          required: ["text"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: (input) => {
          const text = typeof input === "object" && input !== null && "text" in input ? String((input as { text: unknown }).text).trim() : ""
          if (!text || text.length > 4000) throw new Error("Сообщение должно содержать от 1 до 4000 символов.")
          if (!activeChat) throw new Error("Сначала откройте чат.")
          pushMessage({ sender: "me", kind: "text", body: text })
          return { status: "sent", chat: activeChat.username, text }
        },
      }, { signal: lifecycle.signal })
    }
    void register().catch(() => undefined)
    return () => lifecycle.abort()
  }, [activeChat, chats, pushMessage])

  return (
    <motion.main data-accent={theme} data-bubble-shape={appearance.bubbleShape} data-bubble-outline={appearance.bubbleOutline} data-density={appearance.compact ? "compact" : "comfortable"} data-chat-backdrop={appearance.backdrop} data-motion={appearance.motion} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="messenger-shell h-svh overflow-hidden bg-[#060607]">
      <TooltipProvider delayDuration={120}>
        <nav className="nav-rail">
          <button onClick={onHome} aria-label="На главную"><Brand compact /></button>
          <div className="mt-7 flex flex-1 flex-col items-center gap-2"><RailButton label="Чаты" active={listMode === "all"} icon={MessageCircle} onClick={() => setListMode("all")} /><RailButton label="Найти человека" icon={UsersRound} onClick={() => { setListMode("all"); searchRef.current?.focus() }} /><RailButton label="Непрочитанные" active={listMode === "unread"} icon={Bell} onClick={() => setListMode(listMode === "unread" ? "all" : "unread")} /><RailButton label="Архив" active={listMode === "archived"} icon={Archive} onClick={() => setListMode(listMode === "archived" ? "all" : "archived")} /></div>
          <RailButton label="На главную" icon={Home} onClick={onHome} />
          <RailButton label="Настройки" icon={Settings} onClick={() => setWorkspaceView("settings")} />
          <RailButton label="Выйти" icon={LogOut} onClick={onSignOut} />
        </nav>
        <aside className={mobileChatOpen ? "chat-list mobile-hidden" : "chat-list"}>
          <AnimatePresence mode="wait" initial={false}>{selectedChatIds.size > 0 ? <motion.div key="selection" initial={{ opacity: 0, y: -7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -7 }} className="selection-toolbar"><Button size="icon" variant="ghost" onClick={clearChatSelection} aria-label="Снять выделение"><X /></Button><strong className="min-w-0 flex-1">Выбрано: {selectedChatIds.size}</strong><Button size="icon" variant="ghost" onClick={() => void applyBulkPreference("pinned")} aria-label="Закрепить выбранные"><Pin /></Button><Button size="icon" variant="ghost" onClick={() => void applyBulkPreference("muted")} aria-label="Настроить уведомления"><BellOff /></Button><Button size="icon" variant="ghost" onClick={() => void applyBulkPreference("archived")} aria-label={listMode === "archived" ? "Вернуть из архива" : "В архив"}><Archive /></Button><Button size="icon" variant="ghost" className="text-rose-300" onClick={() => setBulkDeleteOpen(true)} aria-label="Удалить выбранные"><Trash2 /></Button></motion.div> : <motion.div key="default" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 7 }} className="flex items-center justify-between gap-3 px-5 pb-4 pt-5"><div><p className="eyebrow">Favourite Gram</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">{listMode === "archived" ? "Архив" : listMode === "unread" ? "Непрочитанные" : "Сообщения"}</h1></div><div className="flex items-center gap-2">{listMode === "archived" && <Button size="icon" variant="ghost" onClick={() => setListMode("all")} className="rounded-full text-white/48 hover:bg-white/8 hover:text-white" aria-label="Выйти из архива"><ArrowLeft /></Button>}<Button size="icon" variant="ghost" onClick={() => setGroupOpen(true)} className="rounded-full text-white/48 hover:bg-white/8 hover:text-white" aria-label="Создать группу"><UsersRound /></Button><Button size="icon" variant="ghost" onClick={onHome} className="rounded-full text-white/48 hover:bg-white/8 hover:text-white" aria-label="На главную"><Home /></Button><button onClick={() => setWorkspaceView("settings")} className="rounded-full" aria-label="Открыть настройки"><Avatar initials={profile.initials} hue="from-stone-500 to-zinc-800" imageUrl={profile.imageUrl} small /></button></div></motion.div>}</AnimatePresence>
          <div className="px-4 pb-3"><div className="search-field"><Search className="size-4 text-white/30" /><Input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Люди, чаты и сообщения" className="search-input h-auto border-0 bg-transparent p-0 text-sm shadow-none placeholder:text-white/27 focus-visible:ring-0" />{query && <button onClick={() => setQuery("")} aria-label="Очистить поиск"><X className="size-4 text-white/35" /></button>}</div></div>
          <div className="scrollbar-none flex-1 overflow-y-auto px-2 pb-4">
            <AnimatePresence initial={false}>{filteredPeople.map((person) => (
              <motion.button key={person.username} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} whileTap={{ scale: 0.985 }} onClick={() => startChat(person)} className="person-result"><Avatar initials={person.initials} hue={person.hue} imageUrl={"imageUrl" in person && typeof person.imageUrl === "string" ? person.imageUrl : ""} /><span className="min-w-0 flex-1 text-left"><strong className="block truncate text-sm font-medium">{person.name}</strong><span className="mt-1 block text-xs text-white/35">{person.username}</span></span><span className="rounded-full border border-white/9 px-3 py-1.5 text-xs text-white/56">Написать</span></motion.button>
            ))}</AnimatePresence>
            {messageResults.length > 0 && <div className="px-3 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/28">Сообщения</div>}
            {messageResults.slice(0, 8).map((result) => <button key={result.message.id} className="person-result" onClick={() => { const id = `server-${result.conversationId}`; if (!chats.some((chat) => chat.id === id)) setChats((current) => [mapServerChat(result.chat, profile.username), ...current]); openChat(id); setQuery("") }}><Search className="size-4 shrink-0 text-white/38" /><span className="min-w-0 flex-1 text-left"><strong className="block truncate text-sm font-medium">{result.chat.person.name}</strong><span className="mt-1 block truncate text-xs text-white/35">{messagePreview(result.message)}</span></span></button>)}
            {archivedChats.length > 0 && listMode !== "archived" && !query && <motion.button layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} onClick={() => { setListMode("archived"); clearChatSelection() }} className="archive-folder"><span className="archive-folder-icon"><Archive /></span><span className="min-w-0 flex-1 text-left"><strong>Архив</strong><small>{archivedChats.length} {archivedChats.length === 1 ? "диалог" : "диалога"} · {archivedChats[0]?.name}</small></span><span className="archive-folder-count">{archivedChats.length}</span><ChevronRight /></motion.button>}
            <AnimatePresence initial={false}>{filteredChats.map((chat) => {
              const last = chat.messages.at(-1)
              const selected = selectedChatIds.has(chat.id)
              return <motion.button layout="position" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} key={chat.id} whileTap={{ scale: 0.985 }} onPointerDown={() => beginLongPress(chat)} onPointerUp={cancelLongPress} onPointerCancel={cancelLongPress} onPointerLeave={cancelLongPress} onContextMenu={(event) => { event.preventDefault(); cancelLongPress(); setSelectedChatIds((current) => new Set(current).add(chat.id)) }} onClick={() => { if (suppressClickRef.current) { suppressClickRef.current = false; return } if (selectedChatIds.size) toggleChatSelection(chat.id); else openChat(chat.id) }} className={`${chat.id === activeId ? "chat-row chat-row-active" : "chat-row"}${selected ? " chat-row-selected" : ""}`}><div className="relative"><Avatar initials={chat.initials} hue={chat.hue} imageUrl={chat.imageUrl} />{selected ? <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="chat-selection-check"><Check /></motion.span> : <span className={chat.online ? "presence presence-online" : "presence"} />}</div><span className="min-w-0 flex-1 text-left"><span className="flex items-center justify-between gap-2"><strong className="flex min-w-0 items-center gap-1.5 truncate text-[15px] font-medium">{chat.pinned && <Pin className="size-3 shrink-0 fill-current text-white/38" />}{chat.name}</strong><small className="text-[11px] text-white/25">{last?.time}</small></span><span className="mt-1 flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-white/38">{chat.muted && <VolumeX className="size-3 shrink-0" />}{last?.kind === "voice" ? "Голосовое сообщение" : last?.kind === "video" ? "Кружочек" : last?.kind === "file" ? `Файл: ${last.fileName ?? "вложение"}` : last?.body || "Сообщений пока нет"}</span>{chat.unread > 0 && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white text-[10px] font-semibold text-black">{chat.unread}</span>}</span></span></motion.button>
            })}</AnimatePresence>
            {filteredPeople.length === 0 && filteredChats.length === 0 && messageResults.length === 0 && <div className="px-5 py-12 text-center"><p className="text-sm text-white/42">{backendLoading ? "Загружаем диалоги…" : listMode === "unread" ? "Непрочитанных сообщений нет" : listMode === "archived" ? "Архив пуст" : query ? "Ничего не нашли" : "Пока нет диалогов"}</p>{!backendLoading && !query && listMode === "all" && <p className="mt-2 text-xs leading-5 text-white/25">Введите юзернейм в поиске, чтобы начать разговор.</p>}</div>}
          </div>
        </aside>
        <section className={mobileChatOpen ? "conversation conversation-open" : "conversation"}>
          {activeChat ? <><header className="conversation-header"><Button variant="ghost" size="icon" onClick={() => setMobileChatOpen(false)} className="mobile-back rounded-full text-white hover:bg-white/7 hover:text-white" aria-label="Назад к чатам"><ArrowLeft /></Button><button onClick={() => setWorkspaceView("contact")} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left" aria-label="Открыть профиль собеседника"><Avatar initials={activeChat.initials} hue={activeChat.hue} imageUrl={activeChat.imageUrl} small /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{activeChat.name}</span><span className="mt-0.5 block text-xs text-white/35">{activeChat.serverId && typingChats.has(activeChat.serverId) ? "печатает…" : activeChat.online ? "в сети" : activeChat.username}</span></span></button>{backendEnabled && activeChat.serverId && !activeChat.group && <><Button variant="ghost" size="icon" onClick={() => setCallTarget({ chat: activeChat, mode: "audio" })} className="rounded-full text-white/55 hover:bg-white/8 hover:text-white" aria-label="Аудиозвонок"><Phone /></Button><Button variant="ghost" size="icon" onClick={() => setCallTarget({ chat: activeChat, mode: "video" })} className="rounded-full text-white/55 hover:bg-white/8 hover:text-white" aria-label="Видеозвонок"><Video /></Button></>}<DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="rounded-full text-white/55 hover:bg-white/8 hover:text-white" aria-label="Настройки чата"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="message-menu"><DropdownMenuItem onClick={() => updateChatPreference("pinned", !activeChat.pinned)}><Pin />{activeChat.pinned ? "Открепить чат" : "Закрепить чат"}</DropdownMenuItem><DropdownMenuItem onClick={() => updateChatPreference("muted", !activeChat.muted)}>{activeChat.muted ? <Volume2 /> : <BellOff />}{activeChat.muted ? "Включить уведомления" : "Выключить уведомления"}</DropdownMenuItem><DropdownMenuItem onClick={() => updateChatPreference("archived", !activeChat.archived)}><Archive />{activeChat.archived ? "Вернуть из архива" : "В архив"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></header>
          <AnimatePresence initial={false}>{pinnedMessage && <motion.div initial={{ opacity: 0, height: 0, y: -5 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0, y: -5 }} className="pinned-strip"><button className="pinned-strip-main" onClick={() => setJumpTarget({ id: pinnedMessage.id, token: Date.now() })}><span className="pinned-accent" /><Pin /><span className="min-w-0 flex-1 text-left"><strong>{pinnedMessage.sender === "me" ? "Вы" : activeChat.name}</strong><small>{messagePreview(pinnedMessage)}</small></span><span>{pinnedCursor % pinnedMessages.length + 1} из {pinnedMessages.length}</span></button>{pinnedMessages.length > 1 && <button className="pinned-next" onClick={() => setPinnedCursor((value) => (value + 1) % pinnedMessages.length)} aria-label="Следующее закреплённое"><ChevronRight /></button>}</motion.div>}</AnimatePresence>
          <MessageArea chat={activeChat} jumpTarget={jumpTarget} onReply={beginReply} onEdit={beginEdit} onDelete={deleteMessage} onReact={toggleReaction} onRetry={retryMessage} onForward={setForwardingMessage} onPin={togglePinnedMessage} onLoadOlder={loadOlderMessages} />
          <div className="composer-wrap"><AnimatePresence>{recording && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="recording-bar"><span className="recording-dot" /><strong>{formatDuration(recordSeconds)}</strong><span className="text-white/38">Идёт запись</span><button onClick={() => stopVoice(false)} className="ml-auto rounded-full px-3 py-1.5 text-sm text-white/46 hover:bg-white/7 hover:text-white">Отменить</button><Button size="icon" onClick={() => stopVoice(true)} className="rounded-full bg-white text-black hover:bg-white/88"><Send /></Button></motion.div>}</AnimatePresence>
            {!recording && <><input ref={attachmentRef} type="file" className="hidden" onChange={(event) => { attachFile(event.target.files?.[0]); event.currentTarget.value = "" }} />{(replyingTo || editingMessage) && <div className="composer-context"><span className="composer-context-icon">{editingMessage ? <Pencil /> : <Reply />}</span><span className="min-w-0 flex-1"><strong>{editingMessage ? "Редактирование" : `Ответ ${replyingTo?.sender === "me" ? "себе" : activeChat.name}`}</strong><small>{messagePreview(editingMessage || replyingTo)}</small></span><button type="button" onClick={() => { setReplyingTo(null); setEditingMessage(null); if (editingMessage) setDraft("") }} aria-label="Отменить"><X /></button></div>}<form onSubmit={sendText} className="composer"><Button type="button" variant="ghost" size="icon" className="composer-action rounded-full text-white/44 hover:bg-white/7 hover:text-white" aria-label="Прикрепить файл" onClick={() => attachmentRef.current?.click()}><Paperclip /></Button><Textarea ref={composerRef} rows={1} value={draft} maxLength={4000} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape" && (replyingTo || editingMessage)) { event.preventDefault(); setReplyingTo(null); setEditingMessage(null); if (editingMessage) setDraft("") } if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} onInput={(event) => { const field = event.currentTarget; field.style.height = "auto"; field.style.height = `${Math.min(field.scrollHeight, 132)}px` }} placeholder={editingMessage ? "Изменить сообщение" : "Сообщение"} className="message-composer min-h-0 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-base shadow-none placeholder:text-white/25 focus-visible:ring-0" /><Button type="button" variant="ghost" size="icon" className="composer-action rounded-full text-white/44 hover:bg-white/7 hover:text-white" aria-label="Записать кружочек" onClick={() => setVideoOpen(true)}><Camera /></Button>{draft.trim() ? <Button type="submit" size="icon" className="composer-action rounded-full bg-white text-black hover:bg-white/88" aria-label={editingMessage ? "Сохранить" : "Отправить"}>{editingMessage ? <Check /> : <Send />}</Button> : <Button type="button" size="icon" className="composer-action rounded-full bg-white text-black hover:bg-white/88" aria-label="Записать голосовое" onClick={startVoice}><Mic /></Button>}</form></>}
          </div></> : <EmptyConversation loading={backendLoading} onSearch={() => { setMobileChatOpen(false); window.setTimeout(() => searchRef.current?.focus(), 80) }} />}
        </section>
        <VideoRecorderDialog open={videoOpen} onOpenChange={setVideoOpen} onSend={(url, duration) => pushMessage({ sender: "me", kind: "video", mediaUrl: url, duration })} />
        <ProfileDialog open={workspaceView === "profile"} onOpenChange={(open) => setWorkspaceView(open ? "profile" : "settings")} profile={profile} onSave={saveProfile} />
        <SettingsDialog open={workspaceView === "settings"} onOpenChange={(open) => setWorkspaceView(open ? "settings" : null)} profile={profile} onEditProfile={() => setWorkspaceView("profile")} onAppearance={() => setWorkspaceView("appearance")} onSecurity={() => setWorkspaceView("security")} onPrivacy={() => setWorkspaceView("privacy")} onNotifications={() => setWorkspaceView("notifications")} onHome={() => { setWorkspaceView(null); onHome() }} onSignOut={onSignOut} />
        <AppearancePage open={workspaceView === "appearance"} onBack={() => setWorkspaceView("settings")} value={appearance} onChange={saveAppearance} />
        <NotificationsPage open={workspaceView === "notifications"} onBack={() => setWorkspaceView("settings")} value={notifications} onChange={saveNotifications} onRequestPermission={enableNotifications} />
        <SecurityDialog open={workspaceView === "security"} onOpenChange={(open) => setWorkspaceView(open ? "security" : "settings")} backendEnabled={backendEnabled} onAccountDeleted={onSignOut} />
        <PrivacyDialog open={workspaceView === "privacy"} onOpenChange={(open) => setWorkspaceView(open ? "privacy" : "settings")} backendEnabled={backendEnabled} />
        <GroupDialog open={groupOpen} onOpenChange={setGroupOpen} backendEnabled={backendEnabled} onCreate={createGroup} />
        <CallDialog target={callTarget} onClose={() => setCallTarget(null)} />
        {activeChat && <ChatInfoDialog open={workspaceView === "contact"} onOpenChange={(open) => setWorkspaceView(open ? "contact" : null)} chat={activeChat} onBlock={blockActiveContact} onReport={reportActiveContact} backendEnabled={backendEnabled} />}
        <Dialog open={Boolean(forwardingMessage)} onOpenChange={(open) => { if (!open) setForwardingMessage(null) }}><DialogContent className="max-h-[78svh] max-w-[440px] overflow-y-auto rounded-[26px] border-white/10 bg-[#0d0d0f] p-6 text-white"><DialogHeader><DialogTitle>Переслать сообщение</DialogTitle><DialogDescription className="text-white/42">Выберите диалог, в который отправить копию.</DialogDescription></DialogHeader><div className="grid gap-2">{chats.filter((chat) => chat.id !== activeChat?.id).map((chat) => <button key={chat.id} onClick={() => void forwardMessage(chat)} className="settings-row"><Avatar initials={chat.initials} hue={chat.hue} imageUrl={chat.imageUrl} small /><span className="min-w-0 flex-1 text-left"><strong className="block truncate">{chat.name}</strong><small className="text-white/38">{chat.username}</small></span><Forward className="size-4 text-white/35" /></button>)}{chats.length <= 1 && <p className="rounded-2xl border border-white/8 p-4 text-sm text-white/42">Нужен ещё один диалог.</p>}</div></DialogContent></Dialog>
        <Dialog open={Boolean(pendingDeleteChat)} onOpenChange={(open) => { if (!open) setPendingDeleteChat(null) }}><DialogContent className="max-w-[390px] rounded-[24px] border-white/10 bg-[#0d0d0f] p-6 text-white"><DialogHeader><DialogTitle>Удалить чат?</DialogTitle><DialogDescription className="text-white/42">Диалог с {pendingDeleteChat?.name} исчезнет из вашего списка. У собеседника история останется.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/8 hover:text-white" onClick={() => setPendingDeleteChat(null)}>Отмена</Button><Button variant="destructive" onClick={deleteChat}><Trash2 className="mr-2 size-4" />Удалить</Button></DialogFooter></DialogContent></Dialog>
        <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}><DialogContent className="max-w-[410px] rounded-[24px] border-white/10 bg-[#0d0d0f] p-6 text-white"><DialogHeader><DialogTitle>Удалить {selectedChatIds.size === 1 ? "чат" : `${selectedChatIds.size} чата`}?</DialogTitle><DialogDescription className="text-white/42">Выбранные диалоги исчезнут из вашего списка. У собеседников история останется.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/8 hover:text-white" onClick={() => setBulkDeleteOpen(false)}>Отмена</Button><Button variant="destructive" onClick={() => void deleteSelectedChats()}><Trash2 className="mr-2 size-4" />Удалить</Button></DialogFooter></DialogContent></Dialog>
      </TooltipProvider>
    </motion.main>
  )
}

function EmptyConversation({ loading, onSearch }: { loading: boolean; onSearch: () => void }) {
  return <div className="m-auto flex max-w-sm flex-col items-center px-6 text-center"><div className="grid size-16 place-items-center rounded-[22px] border border-white/9 bg-white/[0.035]">{loading ? <span className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" /> : <UsersRound className="size-6 text-white/55" />}</div><h2 className="mt-5 text-xl font-medium">{loading ? "Подключаемся…" : "Начните новый разговор"}</h2><p className="mt-2 text-sm leading-6 text-white/38">{loading ? "Загружаем профиль и историю сообщений." : "Найдите человека по юзернейму — чат появится после первого сообщения."}</p>{!loading && <Button onClick={onSearch} className="mt-6 rounded-full bg-white px-5 text-black hover:bg-white/88"><Search className="mr-2 size-4" />Найти человека</Button>}</div>
}

function RailButton({ label, icon: Icon, active = false, onClick }: { label: string; icon: typeof Menu; active?: boolean; onClick?: () => void }) {
  return <Tooltip><TooltipTrigger asChild><button onClick={onClick} className={active ? "rail-button rail-button-active" : "rail-button"} aria-label={label}><Icon className="size-[19px]" /></button></TooltipTrigger><TooltipContent side="right" sideOffset={8}>{label}</TooltipContent></Tooltip>
}

function Avatar({ initials, hue, small = false, imageUrl = "" }: { initials: string; hue: string; small?: boolean; imageUrl?: string }) {
  return <span className={`${small ? "size-10" : "size-12"} grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br ${hue} text-xs font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.2)]`}>{imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : initials}</span>
}

type MessageActions = {
  onReply: (message: Message) => void
  onEdit: (message: Message) => void
  onDelete: (message: Message) => void
  onReact: (message: Message, emoji: string) => void
  onRetry: (message: Message) => void
  onForward: (message: Message) => void
  onPin: (message: Message) => void
  onLoadOlder: () => void
}

function MessageArea({ chat, jumpTarget, onReply, onEdit, onDelete, onReact, onRetry, onForward, onPin, onLoadOlder }: { chat: Chat; jumpTarget: { id: string; token: number } | null } & MessageActions) {
  const endRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const previousLengthRef = useRef(chat.messages.length)
  const [showBottom, setShowBottom] = useState(false)
  const [highlightedId, setHighlightedId] = useState("")
  const reducedMotion = useReducedMotion()
  const scrollToBottom = useCallback(() => { endRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" }); nearBottomRef.current = true; setShowBottom(false) }, [reducedMotion])
  useEffect(() => { window.requestAnimationFrame(() => { endRef.current?.scrollIntoView({ behavior: "auto" }); nearBottomRef.current = true; setShowBottom(false) }) }, [chat.id])
  useEffect(() => {
    const grew = chat.messages.length > previousLengthRef.current
    previousLengthRef.current = chat.messages.length
    if (grew && nearBottomRef.current) scrollToBottom()
    else if (grew) setShowBottom(true)
  }, [chat.messages.length, scrollToBottom])
  useEffect(() => {
    if (!jumpTarget) return
    const node = areaRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(jumpTarget.id)}"]`)
    if (!node) { toast.info("Сообщение находится глубже в истории", { description: "Загрузите предыдущие сообщения и повторите переход." }); return }
    node.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" })
    setHighlightedId(jumpTarget.id)
    setShowBottom(true)
    const timer = window.setTimeout(() => setHighlightedId(""), 1500)
    return () => window.clearTimeout(timer)
  }, [jumpTarget, reducedMotion])
  const updateScrollState = () => {
    const area = areaRef.current
    if (!area) return
    const nearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 140
    nearBottomRef.current = nearBottom
    if (nearBottom) setShowBottom(false)
  }
  return <div ref={areaRef} onScroll={updateScrollState} className="message-area scrollbar-thin" role="log" aria-live="polite" aria-label={`Переписка с ${chat.name}`}><div className="mx-auto flex min-h-full w-full max-w-[820px] flex-col justify-end px-4 py-7 sm:px-7">{chat.messages.length === 0 ? <div className="m-auto flex max-w-sm flex-col items-center py-20 text-center"><div className="grid size-16 place-items-center rounded-[22px] border border-white/9 bg-white/[0.035]"><MessageCircle className="size-6 text-white/55" /></div><h3 className="mt-5 text-xl font-medium">Сообщений пока нет</h3><p className="mt-2 text-sm leading-6 text-white/38">Напишите первым — здесь появится история разговора.</p></div> : <><div className="flex justify-center">{chat.hasMore && <button className="load-older" onClick={onLoadOlder}>Показать предыдущие сообщения</button>}</div><AnimatePresence initial={false}>{chat.messages.map((message) => {
    const day = message.createdAt ? new Date(message.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: new Date(message.createdAt).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : ""
    const index = chat.messages.indexOf(message)
    const previousCreatedAt = index > 0 ? chat.messages[index - 1].createdAt : null
    const previousDay = previousCreatedAt ? new Date(previousCreatedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: new Date(previousCreatedAt).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : ""
    const showDay = Boolean(day && day !== previousDay)
    return <motion.div layout key={message.id} data-message-id={message.id} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5, scale: .985 }} className={highlightedId === message.id ? "message-anchor message-anchor-highlight" : "message-anchor"}>{showDay && <div className="date-separator"><span>{day}</span></div>}<MessageBubble message={message} avatar={chat} pinned={chat.pinnedMessageIds?.includes(message.id) || false} onReply={onReply} onEdit={onEdit} onDelete={onDelete} onReact={onReact} onRetry={onRetry} onForward={onForward} onPin={onPin} /></motion.div>
  })}</AnimatePresence></>}<div ref={endRef} /></div><AnimatePresence>{showBottom && <motion.button initial={{ opacity: 0, scale: .86, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .9, y: 5 }} onClick={scrollToBottom} className="jump-bottom" aria-label="К последнему сообщению"><ArrowRight className="rotate-90" /></motion.button>}</AnimatePresence></div>
}

function MessageBubble({ message, avatar, pinned, onReply, onEdit, onDelete, onReact, onRetry, onForward, onPin }: { message: Message; avatar: Chat; pinned: boolean } & Omit<MessageActions, "onLoadOlder">) {
  const mine = message.sender === "me"
  const bubbleClass = `${mine ? "bubble bubble-me" : "bubble"}${message.kind === "text" ? " bubble-text" : ""}`
  const actions = <MessageMenu message={message} pinned={pinned} onReply={onReply} onEdit={onEdit} onDelete={onDelete} onReact={onReact} onRetry={onRetry} onForward={onForward} onPin={onPin} />
  if (message.kind === "video" && !message.deletedAt) return <motion.div initial={{ opacity: 0, x: mine ? 14 : -14, y: 5 }} animate={{ opacity: 1, x: 0, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.26, ease }} className={mine ? "message-row message-row-me" : "message-row"}>{!mine && <Avatar initials={avatar.initials} hue={avatar.hue} imageUrl={avatar.imageUrl} small />}{mine && actions}<div className="video-message"><VideoCircle mediaUrl={message.mediaUrl} duration={message.duration ?? 0} /><span className="video-message-time">{message.time}{mine && <DeliveryMark status={message.status} />}</span><ReactionRow message={message} onReact={onReact} /></div>{!mine && actions}</motion.div>
  return <motion.div initial={{ opacity: 0, x: mine ? 14 : -14, y: 5 }} animate={{ opacity: 1, x: 0, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.26, ease }} className={mine ? "message-row message-row-me" : "message-row"}>{!mine && <Avatar initials={avatar.initials} hue={avatar.hue} imageUrl={avatar.imageUrl} small />}{mine && actions}<div className={bubbleClass}>{message.replyTo && !message.deletedAt && <div className={mine ? "reply-preview reply-preview-me" : "reply-preview"}><strong>{message.replyTo.senderName}</strong><span>{message.replyTo.body || messagePreview({ kind: message.replyTo.kind } as Message)}</span></div>}{message.deletedAt ? <p className="deleted-message">Сообщение удалено</p> : <>{message.kind === "text" && <p>{message.body}</p>}{message.kind === "voice" && <VoiceBubble duration={message.duration ?? 1} mediaUrl={message.mediaUrl} mine={mine} />}{message.kind === "file" && <FileBubble message={message} mine={mine} />}</>}<span className={mine ? "message-time text-black/42" : "message-time text-white/30"}>{message.editedAt && !message.deletedAt && <em>изм.</em>}{message.time}{mine && <DeliveryMark status={message.status} />}</span><ReactionRow message={message} onReact={onReact} /></div>{!mine && actions}</motion.div>
}

function MessageMenu({ message, pinned, onReply, onEdit, onDelete, onReact, onRetry, onForward, onPin }: { message: Message; pinned: boolean } & Omit<MessageActions, "onLoadOlder">) {
  return <DropdownMenu><DropdownMenuTrigger asChild><button className="message-menu-trigger" aria-label="Действия с сообщением"><MoreHorizontal /></button></DropdownMenuTrigger><DropdownMenuContent align={message.sender === "me" ? "end" : "start"} className="message-menu"><DropdownMenuItem onClick={() => onReply(message)} disabled={Boolean(message.deletedAt)}><Reply />Ответить</DropdownMenuItem><DropdownMenuItem onClick={() => onForward(message)} disabled={Boolean(message.deletedAt)}><Forward />Переслать</DropdownMenuItem><DropdownMenuItem onClick={() => onPin(message)} disabled={Boolean(message.deletedAt)}><Pin />{pinned ? "Открепить" : "Закрепить"}</DropdownMenuItem>{message.sender === "me" && message.kind === "text" && !message.deletedAt && <DropdownMenuItem onClick={() => onEdit(message)}><Pencil />Изменить</DropdownMenuItem>}{message.status === "error" && <DropdownMenuItem onClick={() => onRetry(message)}><RotateCcw />Повторить отправку</DropdownMenuItem>}{!message.deletedAt && <EmojiReactionPicker message={message} onReact={onReact} />}{message.sender === "me" && <DropdownMenuItem className="text-rose-300 focus:text-rose-200" onClick={() => onDelete(message)}><Trash2 />Удалить</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>
}

function EmojiReactionPicker({ message, onReact }: { message: Message; onReact: (message: Message, emoji: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [customEmoji, setCustomEmoji] = useState("")
  const [recent, setRecent] = useState<string[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const saved = JSON.parse(window.localStorage.getItem(RECENT_REACTIONS_KEY) || "[]") as string[]
      return saved.filter(isSingleEmoji).slice(0, 8)
    } catch { return [] }
  })

  const selectEmoji = (emoji: string) => {
    if (!isSingleEmoji(emoji)) { toast.error("Выберите один эмодзи"); return }
    const normalized = emoji.trim()
    const next = [normalized, ...recent.filter((item) => item !== normalized)].slice(0, 8)
    setRecent(next)
    window.localStorage.setItem(RECENT_REACTIONS_KEY, JSON.stringify(next))
    onReact(message, normalized)
  }
  const quick = [...new Set([...recent, ...REACTION_EMOJIS])].slice(0, 7)

  return <div className="reaction-picker" aria-label="Поставить реакцию" onKeyDown={(event) => event.stopPropagation()}>
    <div className="reaction-picker-head"><span>Реакция</span><small>{expanded ? "Выберите или вставьте свою" : "Недавние и популярные"}</small></div>
    <div className="reaction-quick">{quick.map((emoji) => <button type="button" key={emoji} onClick={() => selectEmoji(emoji)} className={message.reactions?.some((reaction) => reaction.emoji === emoji && reaction.reactedByMe) ? "reaction-option reaction-option-active" : "reaction-option"} aria-label={`Поставить реакцию ${emoji}`}>{emoji}</button>)}<button type="button" className={expanded ? "reaction-option reaction-option-more reaction-option-active" : "reaction-option reaction-option-more"} onClick={() => setExpanded((value) => !value)} aria-label="Открыть все эмодзи"><SmilePlus /></button></div>
    <AnimatePresence>{expanded && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="emoji-panel"><div className="emoji-grid">{REACTION_EMOJIS.map((emoji) => <button type="button" key={emoji} onClick={() => selectEmoji(emoji)} className="emoji-grid-option" aria-label={`Поставить реакцию ${emoji}`}>{emoji}</button>)}</div><form className="emoji-custom" onSubmit={(event) => { event.preventDefault(); if (isSingleEmoji(customEmoji)) { selectEmoji(customEmoji); setCustomEmoji("") } else toast.error("Вставьте один эмодзи") }}><Input value={customEmoji} onChange={(event) => setCustomEmoji(event.target.value)} maxLength={24} placeholder="Любой эмодзи" aria-label="Своя реакция" /><Button type="submit" size="sm" disabled={!customEmoji.trim()}>Добавить</Button></form></motion.div>}</AnimatePresence>
  </div>
}

function ReactionRow({ message, onReact }: { message: Message; onReact: (message: Message, emoji: string) => void }) {
  if (!message.reactions?.length || message.deletedAt) return null
  return <div className={message.sender === "me" ? "reaction-row reaction-row-me" : "reaction-row"}>{message.reactions.map((reaction) => <button key={reaction.emoji} onClick={() => onReact(message, reaction.emoji)} className={reaction.reactedByMe ? "reaction-chip reaction-chip-active" : "reaction-chip"} aria-label={`${reaction.emoji}: ${reaction.count}`}>{reaction.emoji}<span>{reaction.count}</span></button>)}</div>
}

function DeliveryMark({ status }: { status?: Message["status"] }) {
  if (status === "sending") return <span className="delivery-mark" title="Отправляется">…</span>
  if (status === "error") return <span className="delivery-mark delivery-error" title="Не отправлено">!</span>
  if (status === "read") return <span className="delivery-mark delivery-read" title="Прочитано"><Check /><Check /></span>
  return <span className="delivery-mark" title="Доставлено"><Check /></span>
}

function FileBubble({ message, mine }: { message: Message; mine: boolean }) {
  const size = formatFileSize(message.fileSize ?? 0)
  const uploading = message.status === "sending" && typeof message.uploadProgress === "number" && message.uploadProgress < 100
  return <a href={uploading ? undefined : message.mediaUrl} download={message.fileName} className="file-bubble" aria-label={uploading ? `Загрузка ${message.fileName ?? "файла"}` : `Скачать ${message.fileName ?? "файл"}`}><span className="file-bubble-icon"><FileText className="size-5" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{message.fileName ?? "Файл"}</strong><small className={mine ? "mt-1 block text-black/45" : "mt-1 block text-white/38"}>{uploading ? `Загрузка ${message.uploadProgress}%` : size}</small>{uploading && <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-black/15"><span className="block h-full rounded-full bg-black/55 transition-all" style={{ width: `${message.uploadProgress}%` }} /></span>}</span>{uploading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-55" /> : <Download className="size-4 shrink-0 opacity-55" />}</a>
}

function VoiceBubble({ duration, mediaUrl, mine }: { duration: number; mediaUrl?: string; mine: boolean }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(1)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const bars = useMemo(() => Array.from({ length: 34 }, (_, index) => 7 + ((index * 17 + duration * 3) % 22)), [duration])
  const toggle = () => {
    if (!mediaUrl) { toast.error("Аудиофайл недоступен", { description: "Сообщение не содержит записи. Попробуйте обновить чат." }); return }
    if (!audioRef.current) { const audio = new Audio(mediaUrl); audio.playbackRate = speed; audioRef.current = audio; audio.ontimeupdate = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0); audio.onended = () => { setPlaying(false); setProgress(0) } }
    if (playing) audioRef.current.pause(); else void audioRef.current.play(); setPlaying(!playing)
  }
  const seek = (value: number) => { setProgress(value); if (audioRef.current?.duration) audioRef.current.currentTime = audioRef.current.duration * value }
  const cycleSpeed = () => { const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1; setSpeed(next); if (audioRef.current) audioRef.current.playbackRate = next }
  return <div className="voice-content min-w-[236px] sm:min-w-[310px]"><div className="flex items-center gap-3"><button onClick={toggle} className={`${mine ? "voice-play voice-play-light" : "voice-play"}${mediaUrl ? "" : " voice-play-demo"}`} aria-label={mediaUrl ? (playing ? "Пауза" : "Воспроизвести") : "Аудиофайл недоступен"}>{playing ? <Pause /> : <Play className="translate-x-px" />}</button><label className="relative flex h-8 flex-1 cursor-pointer items-center gap-[3px] overflow-hidden" aria-label="Перемотать голосовое"><input type="range" min="0" max="1" step="0.01" value={progress} onChange={(event) => seek(Number(event.target.value))} className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" />{bars.map((height, index) => <motion.span key={index} animate={playing ? { scaleY: [0.65, 1, 0.72] } : { scaleY: 1 }} transition={{ duration: 0.75, repeat: playing ? Infinity : 0, delay: index * 0.018 }} className={mine ? "w-[2px] rounded-full bg-black/75" : "w-[2px] rounded-full bg-white/78"} style={{ height, opacity: index / bars.length <= progress ? 1 : 0.42 }} />)}</label><button type="button" onClick={cycleSpeed} className={mine ? "rounded-full px-1.5 py-1 text-xs font-semibold text-black/65 hover:bg-black/8" : "rounded-full px-1.5 py-1 text-xs font-semibold text-white/55 hover:bg-white/8"} aria-label="Изменить скорость воспроизведения">{speed}×</button><span className={mine ? "text-sm tabular-nums text-black/72" : "text-sm tabular-nums text-white/58"}>{formatDuration(duration)}</span></div></div>
}

function VideoCircle({ mediaUrl, duration }: { mediaUrl?: string; duration: number }) {
  const [playing, setPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const toggle = () => { if (videoRef.current && mediaUrl) { if (playing) videoRef.current.pause(); else void videoRef.current.play() } setPlaying((value) => !value) }
  return <button onClick={toggle} className="video-circle group" aria-label={playing ? "Поставить кружочек на паузу" : "Воспроизвести кружочек"}>{mediaUrl ? <video ref={videoRef} src={mediaUrl} playsInline loop className="h-full w-full object-cover" /> : <div className="h-full w-full bg-[radial-gradient(circle_at_30%_20%,#737388,#202026_48%,#080809)]" />}<span className="absolute inset-0 grid place-items-center bg-black/20 transition group-hover:bg-black/12">{playing ? <Pause className="size-7" /> : <Play className="size-7 translate-x-0.5" />}</span><span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2 py-1 text-xs text-white">{formatDuration(duration)}</span></button>
}

function VideoRecorderDialog({ open, onOpenChange, onSend }: { open: boolean; onOpenChange: (open: boolean) => void; onSend: (url: string, duration: number) => void }) {
  const previewRef = useRef<HTMLVideoElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [resultUrl, setResultUrl] = useState("")
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: true }).then((stream) => { if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return } streamRef.current = stream; if (previewRef.current) previewRef.current.srcObject = stream }).catch(() => toast.error("Камера недоступна", { description: "Разрешите доступ в настройках браузера." }))
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null }
  }, [open])
  useEffect(() => { if (!recording) return; const timer = window.setInterval(() => setSeconds((value) => { if (value >= 59) { recorderRef.current?.stop(); setRecording(false); return 60 } return value + 1 }), 1000); return () => window.clearInterval(timer) }, [recording])
  const record = () => {
    const stream = streamRef.current
    if (!stream || typeof MediaRecorder === "undefined") { toast.error("Запись видео не поддерживается"); return }
    chunksRef.current = []
    const recorder = new MediaRecorder(stream); recorderRef.current = recorder
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }
    recorder.onstop = () => { const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" }); const url = URL.createObjectURL(blob); setResultUrl(url); if (previewRef.current) { previewRef.current.srcObject = null; previewRef.current.src = url; previewRef.current.loop = true; void previewRef.current.play() } }
    setSeconds(0); setResultUrl(""); recorder.start(200); setRecording(true)
  }
  const stop = () => { recorderRef.current?.stop(); setRecording(false) }
  const close = () => { streamRef.current?.getTracks().forEach((track) => track.stop()); onOpenChange(false); setResultUrl(""); setSeconds(0); setRecording(false) }
  return <Dialog open={open} onOpenChange={(value) => { if (!value) close(); else onOpenChange(true) }}><DialogContent className="max-w-[520px] rounded-[26px] border-white/10 bg-[#0d0d0f] p-6 text-white"><DialogHeader><DialogTitle className="text-2xl tracking-[-0.04em]">Кружочек</DialogTitle><DialogDescription className="text-white/42">До 60 секунд. Можно переснять перед отправкой.</DialogDescription></DialogHeader><div className="relative mx-auto aspect-square w-[min(76vw,340px)] overflow-hidden rounded-full border border-white/14 bg-black shadow-[0_0_0_8px_rgba(255,255,255,.025)]"><video ref={previewRef} autoPlay muted playsInline className="h-full w-full object-cover" /><div className="pointer-events-none absolute inset-0 rounded-full border border-white/18" />{(recording || resultUrl) && <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1.5 text-sm tabular-nums">{formatDuration(seconds)}</span>}</div><DialogFooter className="items-center justify-center sm:justify-center">{resultUrl ? <><Button variant="outline" className="border-white/10 bg-white/4 text-white hover:bg-white/8 hover:text-white" onClick={() => { setResultUrl(""); setSeconds(0); if (previewRef.current) { previewRef.current.src = ""; previewRef.current.srcObject = streamRef.current } }}>Переснять</Button><Button className="bg-white text-black hover:bg-white/88" onClick={() => { onSend(resultUrl, seconds); close() }}><Send className="mr-2 size-4" />Отправить</Button></> : recording ? <Button className="size-14 rounded-full bg-white text-black hover:bg-white/88" onClick={stop} aria-label="Остановить запись"><Square className="size-5 fill-current" /></Button> : <Button className="size-14 rounded-full bg-white text-black hover:bg-white/88" onClick={record} aria-label="Начать запись"><Circle className="size-6 fill-current" /></Button>}</DialogFooter></DialogContent></Dialog>
}

function WorkspacePage({ open, title, description, onBack, children, wide = false }: { open: boolean; title: string; description: string; onBack: () => void; children: React.ReactNode; wide?: boolean }) {
  return <AnimatePresence>{open && <motion.section initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: .24, ease }} className="workspace-page"><header className="workspace-header"><Button variant="ghost" size="icon" onClick={onBack} className="rounded-full text-white hover:bg-white/8 hover:text-white" aria-label="Назад"><ArrowLeft /></Button><span className="min-w-0"><strong>{title}</strong><small>{description}</small></span></header><div className="workspace-scroll"><div className={wide ? "workspace-content workspace-content-wide" : "workspace-content"}>{children}</div></div></motion.section>}</AnimatePresence>
}

function ToggleSetting({ value, onChange, label, description }: { value: boolean; onChange: (value: boolean) => void; label: string; description: string }) {
  return <button type="button" onClick={() => onChange(!value)} className="settings-row"><span className="min-w-0 flex-1 text-left"><strong className="block text-sm">{label}</strong><small className="mt-1 block leading-5 text-white/38">{description}</small></span><span className={value ? "setting-toggle setting-toggle-on" : "setting-toggle"}><motion.span layout transition={{ type: "spring", stiffness: 450, damping: 30 }} /></span></button>
}

function ProfileDialog({ open, onOpenChange, profile, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; profile: Profile; onSave: (profile: Profile) => void }) {
  const [imageUrl, setImageUrl] = useState(profile.imageUrl)
  const [name, setName] = useState(profile.name)
  const [bio, setBio] = useState(profile.bio)
  const fileRef = useRef<HTMLInputElement>(null)
  const choose = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith("image/")) { toast.error("Выберите изображение"); return }
    if (file.size > 4 * 1024 * 1024) { toast.error("Аватар слишком большой", { description: "Выберите изображение до 4 МБ." }); return }
    const reader = new FileReader()
    reader.onload = () => setImageUrl(typeof reader.result === "string" ? reader.result : "")
    reader.readAsDataURL(file)
  }
  const save = () => {
    const cleanName = name.trim() || "Мой профиль"
    const initials = cleanName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FG"
    onSave({ ...profile, name: cleanName, bio: bio.trim(), initials, imageUrl })
    onOpenChange(false)
    toast.success("Профиль сохранён")
  }
  return <WorkspacePage open={open} onBack={() => onOpenChange(false)} title="Мой профиль" description="Как вас видят другие"><div className="profile-cover"><div className="profile-cover-glow" /><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => choose(event.target.files?.[0])} /><button type="button" onClick={() => fileRef.current?.click()} className="profile-avatar-editor" aria-label="Выбрать фото профиля">{imageUrl ? <img src={imageUrl} alt="Предпросмотр аватара" /> : <ImagePlus />}</button><h2>{name || profile.name}</h2><p>{profile.username}</p></div><div className="settings-section space-y-4"><label className="block"><span className="field-label">Отображаемое имя</span><div className="auth-input-wrap"><Input value={name} maxLength={48} onChange={(event) => setName(event.target.value)} className="h-auto border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0" /></div></label><label className="block"><span className="field-label">О себе</span><div className="auth-input-wrap"><Input value={bio} maxLength={96} onChange={(event) => setBio(event.target.value)} placeholder="Пара слов о себе" className="h-auto border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0" /></div></label><p className="text-xs leading-5 text-white/34">Юзернейм остаётся постоянным адресом вашего профиля. Имя и описание можно менять в любой момент.</p></div><Button className="h-12 w-full bg-[var(--ui-accent)] text-black hover:brightness-110" onClick={save}>Сохранить изменения</Button></WorkspacePage>
}

function SettingsDialog({ open, onOpenChange, profile, onEditProfile, onAppearance, onSecurity, onPrivacy, onNotifications, onHome, onSignOut }: { open: boolean; onOpenChange: (open: boolean) => void; profile: Profile; onEditProfile: () => void; onAppearance: () => void; onSecurity: () => void; onPrivacy: () => void; onNotifications: () => void; onHome: () => void; onSignOut: () => void }) {
  const row = (Icon: typeof Settings, title: string, copy: string, action: () => void, tone = "") => <button onClick={action} className={`settings-nav-row ${tone}`}><span className="settings-nav-icon"><Icon /></span><span className="min-w-0 flex-1 text-left"><strong>{title}</strong><small>{copy}</small></span><ChevronRight /></button>
  return <WorkspacePage open={open} onBack={() => onOpenChange(false)} title="Настройки" description="Всё под вашим контролем"><button onClick={onEditProfile} className="settings-profile-card"><span className="settings-profile-glow" /><Avatar initials={profile.initials} hue="from-stone-500 to-zinc-800" imageUrl={profile.imageUrl} /><span className="min-w-0 flex-1 text-left"><strong>{profile.name}</strong><small>{profile.username}</small><em>Открыть и изменить профиль</em></span><ChevronRight /></button><section><p className="settings-group-title">Интерфейс</p><div className="settings-nav-group">{row(Paintbrush, "Оформление", "Акцент, фон, сообщения и анимации", onAppearance)}{row(Bell, "Уведомления", "Разрешения, звук и тихие часы", onNotifications)}</div></section><section><p className="settings-group-title">Аккаунт</p><div className="settings-nav-group">{row(Eye, "Приватность", "Поиск, статус и блокировки", onPrivacy)}{row(ShieldCheck, "Безопасность и устройства", "Пароль, коды и активные сессии", onSecurity)}</div></section><section><p className="settings-group-title">Навигация</p><div className="settings-nav-group">{row(Home, "На главную", "Вернуться к описанию FavouriteGram", onHome)}{row(LogOut, "Выйти из аккаунта", "Завершить текущую сессию", onSignOut, "settings-nav-danger")}</div></section></WorkspacePage>
}

function AppearancePage({ open, onBack, value, onChange }: { open: boolean; onBack: () => void; value: AppearanceSettings; onChange: (value: AppearanceSettings) => void }) {
  const accents: Array<{ id: AccentTheme; name: string; color: string }> = [
    { id: "violet", name: "Фиолет", color: "#8b76ff" }, { id: "sand", name: "Песок", color: "#c7a878" }, { id: "ocean", name: "Океан", color: "#40b9ee" }, { id: "rose", name: "Роза", color: "#ff6f91" }, { id: "lime", name: "Лайм", color: "#9ed66d" },
  ]
  const update = <K extends keyof AppearanceSettings>(key: K, next: AppearanceSettings[K]) => onChange({ ...value, [key]: next })
  return <WorkspacePage open={open} onBack={onBack} title="Оформление" description="Сделайте интерфейс своим" wide><div className="appearance-layout"><div className="appearance-controls"><section className="customize-card"><div className="customize-heading"><Palette /><span><strong>Акцент</strong><small>Цвет действий, обводок и ваших сообщений</small></span></div><div className="accent-grid">{accents.map((accent) => <button key={accent.id} onClick={() => update("accent", accent.id)} className={value.accent === accent.id ? "accent-choice accent-choice-active" : "accent-choice"}><span style={{ background: accent.color }} /><small>{accent.name}</small>{value.accent === accent.id && <motion.i layoutId="active-accent"><Check /></motion.i>}</button>)}<label className={value.accent === "custom" ? "accent-choice accent-choice-active" : "accent-choice"}><input type="color" value={value.customAccent} onChange={(event) => onChange({ ...value, accent: "custom", customAccent: event.target.value })} /><small>Свой</small>{value.accent === "custom" && <motion.i layoutId="active-accent"><Check /></motion.i>}</label></div></section><section className="customize-card"><div className="customize-heading"><MessageCircle /><span><strong>Форма сообщений</strong><small>Геометрия и характер переписки</small></span></div><div className="segmented-control">{([['soft','Мягкая'],['round','Круглая'],['compact','Строгая']] as Array<[BubbleShape,string]>).map(([id, label]) => <button key={id} onClick={() => update("bubbleShape", id)} className={value.bubbleShape === id ? "active" : ""}>{label}</button>)}</div><div className="mt-3 segmented-control">{([['none','Без обводки'],['subtle','Тонкая'],['accent','Акцентная']] as Array<[BubbleOutline,string]>).map(([id, label]) => <button key={id} onClick={() => update("bubbleOutline", id)} className={value.bubbleOutline === id ? "active" : ""}>{label}</button>)}</div></section><section className="customize-card"><div className="customize-heading"><Sparkles /><span><strong>Фон и движение</strong><small>Атмосфера чата без лишнего шума</small></span></div><label className="select-row"><span>Фон переписки</span><select value={value.backdrop} onChange={(event) => update("backdrop", event.target.value as ChatBackdrop)}><option value="quiet">Мягкое сияние</option><option value="aurora">Аврора</option><option value="grain">Текстура</option><option value="none">Однотонный</option></select></label><label className="select-row"><span>Анимации</span><select value={value.motion} onChange={(event) => update("motion", event.target.value as MotionLevel)}><option value="full">Выразительные</option><option value="calm">Спокойные</option><option value="off">Выключены</option></select></label><ToggleSetting value={value.compact} onChange={(next) => update("compact", next)} label="Компактный режим" description="Больше сообщений и чатов помещается на экране." /></section></div><div className="appearance-preview"><p className="eyebrow">Предпросмотр</p><h3>Ваш разговор</h3><div className="preview-chat"><div className="preview-bubble">Увидимся вечером? <small>19:42</small></div><div className="preview-bubble preview-bubble-me">Да, всё в силе ✨ <small>19:43 ✓✓</small></div><div className="preview-reaction">💜 <span>2</span></div></div><p>Все изменения применяются сразу и сохраняются для этого аккаунта.</p></div></div></WorkspacePage>
}

function NotificationsPage({ open, onBack, value, onChange, onRequestPermission }: { open: boolean; onBack: () => void; value: NotificationSettings; onChange: (value: NotificationSettings) => void; onRequestPermission: () => Promise<void> }) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported")
  const update = (key: keyof NotificationSettings, next: boolean) => onChange({ ...value, [key]: next })
  const request = async () => { await onRequestPermission(); setPermission("Notification" in window ? Notification.permission : "unsupported") }
  return <WorkspacePage open={open} onBack={onBack} title="Уведомления" description="Отдельные правила для каждого события"><div className={`permission-card permission-${permission}`}><span className="permission-icon">{permission === "granted" ? <Check /> : permission === "denied" ? <BellOff /> : <Bell />}</span><span className="min-w-0 flex-1"><strong>{permission === "granted" ? "Уведомления браузера включены" : permission === "denied" ? "Уведомления заблокированы" : permission === "unsupported" ? "Браузер не поддерживает уведомления" : "Разрешите уведомления"}</strong><small>{permission === "granted" ? "FavouriteGram может сообщать о новых событиях, пока приложение доступно браузеру." : permission === "denied" ? "Измените разрешение для сайта в настройках браузера." : "Браузер покажет системный запрос только после нажатия."}</small></span>{permission === "default" && <Button onClick={() => void request()} className="bg-[var(--ui-accent)] text-black">Разрешить</Button>}</div><ToggleSetting value={value.enabled} onChange={(next) => update("enabled", next)} label="Все уведомления" description="Главный переключатель уведомлений FavouriteGram." /><section className={value.enabled ? "settings-nav-group" : "settings-nav-group settings-disabled"}><ToggleSetting value={value.directMessages} onChange={(next) => update("directMessages", next)} label="Личные сообщения" description="Новые сообщения в диалогах один на один." /><ToggleSetting value={value.groupMessages} onChange={(next) => update("groupMessages", next)} label="Группы" description="Сообщения и упоминания в групповых чатах." /><ToggleSetting value={value.calls} onChange={(next) => update("calls", next)} label="Звонки" description="Входящие аудио- и видеозвонки." /><ToggleSetting value={value.reactions} onChange={(next) => update("reactions", next)} label="Реакции" description="Когда кто-то реагирует на ваше сообщение." /></section><section className="settings-nav-group"><ToggleSetting value={value.previews} onChange={(next) => update("previews", next)} label="Показывать текст" description="Добавлять имя и фрагмент сообщения в уведомление." /><ToggleSetting value={value.sound} onChange={(next) => update("sound", next)} label="Звук" description="Воспроизводить звук для новых событий." /><ToggleSetting value={value.vibration} onChange={(next) => update("vibration", next)} label="Вибрация" description="Короткий отклик на поддерживаемых устройствах." /><ToggleSetting value={value.quietHours} onChange={(next) => update("quietHours", next)} label="Тихие часы · 23:00–08:00" description="Не беспокоить ночью; события останутся в чатах." /></section></WorkspacePage>
}

function CallDialog({ target, onClose }: { target: { chat: Chat; mode: "audio" | "video"; call?: CallSignal } | null; onClose: () => void }) {
  const [call, setCall] = useState<CallSignal | null>(null)
  const [phase, setPhase] = useState<"incoming" | "connecting" | "active" | "ended">("connecting")
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const callRef = useRef<CallSignal | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const selfIdRef = useRef("")
  const processedCandidatesRef = useRef(new Set<string>())
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])

  const cleanup = useCallback(() => {
    peerRef.current?.close()
    peerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    processedCandidatesRef.current.clear()
    pendingCandidatesRef.current = []
  }, [])

  const publishCandidate = useCallback(async (callId: string, candidate: RTCIceCandidateInit) => {
    await backendRequest(`/api/calls/${callId}`, { method: "PATCH", body: JSON.stringify({ candidate }) })
  }, [])

  const connect = useCallback(async (existing?: CallSignal) => {
    if (!target?.chat.serverId) return
    setPhase("connecting")
    try {
      const me = await backendRequest<{ user?: ServerUser }>("/api/me")
      selfIdRef.current = me.data?.user?.id || ""
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: target.mode === "video" })
      streamRef.current = stream
      if (localVideoRef.current) localVideoRef.current.srcObject = stream
      const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] })
      peerRef.current = peer
      stream.getTracks().forEach((track) => peer.addTrack(track, stream))
      peer.ontrack = (event) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0]; if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0] }
      peer.onconnectionstatechange = () => {
        if (["connected", "completed"].includes(peer.connectionState)) setPhase("active")
        if (["failed", "closed", "disconnected"].includes(peer.connectionState)) setPhase("ended")
      }
      peer.onicecandidate = (event) => {
        if (!event.candidate) return
        const candidate = event.candidate.toJSON()
        const id = existing?.id || callRef.current?.id
        if (id) void publishCandidate(id, candidate)
        else pendingCandidatesRef.current.push(candidate)
      }
      if (existing) {
        if (!existing.offer) throw new Error("Нет предложения звонка")
        await peer.setRemoteDescription(existing.offer)
        const answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)
        const accepted = await backendRequest<{ call?: CallSignal; error?: string }>(`/api/calls/${existing.id}`, { method: "PATCH", body: JSON.stringify({ answer, status: "active" }) })
        if (!accepted.ok || !accepted.data?.call) throw new Error(accepted.data?.error || "Не удалось принять звонок")
        callRef.current = accepted.data.call
        setCall(accepted.data.call)
        setPhase("active")
      } else {
        const offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        const created = await backendRequest<{ call?: CallSignal; error?: string }>("/api/calls", { method: "POST", body: JSON.stringify({ conversationId: target.chat.serverId, mode: target.mode, offer }) })
        if (!created.ok || !created.data?.call) throw new Error(created.data?.error || "Не удалось начать звонок")
        callRef.current = created.data.call
        setCall(created.data.call)
        for (const candidate of pendingCandidatesRef.current.splice(0)) void publishCandidate(created.data.call.id, candidate)
      }
    } catch (error) {
      cleanup()
      setPhase("ended")
      toast.error(error instanceof Error ? error.message : "Камера или микрофон недоступны")
    }
  }, [cleanup, publishCandidate, target])

  useEffect(() => {
    if (!target) return
    let disposed = false
    queueMicrotask(() => {
      if (disposed) return
      callRef.current = target.call || null
      setCall(target.call || null)
      setPhase(target.call ? "incoming" : "connecting")
      if (!target.call) void connect()
    })
    return () => { disposed = true; cleanup() }
  }, [cleanup, connect, target])

  useEffect(() => {
    if (!call?.id || phase === "incoming" || phase === "ended") return
    let disposed = false
    const poll = async () => {
      const result = await backendRequest<{ call?: CallSignal }>(`/api/calls/${call.id}`)
      const next = result.data?.call
      if (disposed || !next) return
      callRef.current = next
      setCall(next)
      if (["declined", "ended"].includes(next.status)) { cleanup(); setPhase("ended"); return }
      const peer = peerRef.current
      if (peer && next.answer && !peer.remoteDescription && next.role === "caller") {
        await peer.setRemoteDescription(next.answer).catch(() => undefined)
        setPhase("active")
      }
      if (peer) {
        const remote = Object.entries(next.candidates || {}).filter(([id]) => id !== selfIdRef.current).flatMap(([, values]) => values)
        for (const candidate of remote) {
          const key = JSON.stringify(candidate)
          if (processedCandidatesRef.current.has(key)) continue
          processedCandidatesRef.current.add(key)
          await peer.addIceCandidate(candidate).catch(() => undefined)
        }
      }
    }
    void poll()
    const timer = window.setInterval(poll, 1000)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [call?.id, cleanup, phase])

  const finish = async (status: "declined" | "ended" = "ended") => {
    if (callRef.current?.id) await backendRequest(`/api/calls/${callRef.current.id}`, { method: "PATCH", body: JSON.stringify({ status }) })
    cleanup(); setPhase("ended"); window.setTimeout(onClose, 300)
  }
  const toggleMute = () => { const next = !muted; streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next }); setMuted(next) }
  const toggleCamera = () => { const next = !cameraOff; streamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !next }); setCameraOff(next) }

  return <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) void finish(phase === "incoming" ? "declined" : "ended") }}><DialogContent className="max-w-[620px] overflow-hidden rounded-[28px] border-white/10 bg-[#09090b] p-0 text-white"><div className="relative min-h-[420px] bg-[radial-gradient(circle_at_top,#2b2925,#09090b_62%)] p-7"><div className="text-center"><Avatar initials={target?.chat.initials || "FG"} hue={target?.chat.hue || "from-stone-500 to-zinc-800"} imageUrl={target?.chat.imageUrl} /><h2 className="mt-4 text-2xl font-semibold">{target?.chat.name}</h2><p className="mt-1 text-sm text-white/45">{phase === "incoming" ? `Входящий ${target?.mode === "video" ? "видеозвонок" : "аудиозвонок"}` : phase === "connecting" ? "Соединяем…" : phase === "active" ? "Звонок идёт" : "Звонок завершён"}</p></div>{target?.mode === "video" && phase !== "incoming" && <div className="mt-6 grid grid-cols-2 gap-3"><video ref={remoteVideoRef} autoPlay playsInline className="aspect-video w-full rounded-2xl bg-black object-cover" /><video ref={localVideoRef} autoPlay muted playsInline className="aspect-video w-full rounded-2xl bg-black object-cover" /></div>}{target?.mode === "audio" && <audio ref={remoteAudioRef} autoPlay />}<div className="absolute inset-x-0 bottom-7 flex justify-center gap-3">{phase === "incoming" ? <><Button size="icon" className="size-14 rounded-full bg-rose-500 text-white hover:bg-rose-400" onClick={() => void finish("declined")}><PhoneOff /></Button><Button size="icon" className="size-14 rounded-full bg-emerald-500 text-white hover:bg-emerald-400" onClick={() => void connect(call || undefined)}><Phone /></Button></> : <><Button size="icon" variant="outline" className={muted ? "size-12 rounded-full border-white/20 bg-white text-black" : "size-12 rounded-full border-white/20 bg-black/25 text-white"} onClick={toggleMute}>{muted ? <VolumeX /> : <Mic />}</Button>{target?.mode === "video" && <Button size="icon" variant="outline" className={cameraOff ? "size-12 rounded-full border-white/20 bg-white text-black" : "size-12 rounded-full border-white/20 bg-black/25 text-white"} onClick={toggleCamera}><Video /></Button>}<Button size="icon" className="size-14 rounded-full bg-rose-500 text-white hover:bg-rose-400" onClick={() => void finish()}><PhoneOff /></Button></>}</div></div></DialogContent></Dialog>
}

function GroupDialog({ open, onOpenChange, backendEnabled, onCreate }: { open: boolean; onOpenChange: (open: boolean) => void; backendEnabled: boolean; onCreate: (name: string, usernames: string[]) => Promise<boolean> }) {
  const [name, setName] = useState("")
  const [members, setMembers] = useState("")
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const usernames = members.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean)
    if (name.trim().length < 2) { toast.error("Введите название группы"); return }
    if (usernames.length < 2) { toast.error("Добавьте минимум двух участников"); return }
    setBusy(true)
    const created = await onCreate(name.trim(), usernames)
    setBusy(false)
    if (created) { setName(""); setMembers("") }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-[480px] rounded-[26px] border-white/10 bg-[#0d0d0f] p-6 text-white"><DialogHeader><DialogTitle className="text-2xl tracking-[-0.04em]">Новая группа</DialogTitle><DialogDescription className="text-white/42">До 100 участников. Введите точные юзернеймы через запятую или пробел.</DialogDescription></DialogHeader><form onSubmit={submit} className="grid gap-4"><label><span className="field-label">Название</span><div className="auth-input-wrap mt-2"><UsersRound className="size-4 text-white/35" /><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={64} placeholder="Команда" className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" /></div></label><label><span className="field-label">Участники</span><Textarea value={members} onChange={(event) => setMembers(event.target.value)} placeholder="@anna, @mark, @lera" className="mt-2 min-h-24 border-white/10 bg-white/[0.025]" /></label><Button disabled={busy} className="h-11 bg-white text-black hover:bg-white/88">{busy ? "Создаём…" : "Создать группу"}</Button></form></DialogContent></Dialog>
}

type PrivacySettings = { discoverable: boolean; messagesFrom: "everyone" | "contacts" | "nobody"; showOnline: boolean }

function PrivacyDialog({ open, onOpenChange, backendEnabled }: { open: boolean; onOpenChange: (open: boolean) => void; backendEnabled: boolean }) {
  const [privacy, setPrivacy] = useState<PrivacySettings>({ discoverable: true, messagesFrom: "everyone", showOnline: true })
  const [blocked, setBlocked] = useState<ServerUser[]>([])
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    if (!open || !backendEnabled) return
    void Promise.all([backendRequest<{ privacy?: PrivacySettings }>("/api/me/privacy"), backendRequest<{ users?: ServerUser[] }>("/api/blocked")]).then(([settings, users]) => {
      if (settings.ok && settings.data?.privacy) setPrivacy(settings.data.privacy)
      if (users.ok) setBlocked(users.data?.users || [])
    })
  }, [backendEnabled, open])
  useEffect(load, [load])
  const save = async () => {
    setBusy(true)
    const result = await backendRequest<{ privacy?: PrivacySettings; error?: string }>("/api/me/privacy", { method: "PATCH", body: JSON.stringify(privacy) })
    setBusy(false)
    if (!result.ok) { toast.error(result.data?.error || "Не удалось сохранить приватность"); return }
    toast.success("Настройки приватности сохранены")
  }
  const unblock = async (user: ServerUser) => {
    const result = await backendRequest<{ error?: string }>(`/api/users/${encodeURIComponent(user.username)}/block`, { method: "DELETE" })
    if (!result.ok) { toast.error(result.data?.error || "Не удалось разблокировать пользователя"); return }
    setBlocked((current) => current.filter((item) => item.username !== user.username))
    toast.success(`${user.name} разблокирован`)
  }
  const toggle = (field: "discoverable" | "showOnline", label: string, description: string) => <button type="button" onClick={() => setPrivacy((current) => ({ ...current, [field]: !current[field] }))} className="settings-row"><span className="min-w-0 flex-1 text-left"><strong className="block text-sm">{label}</strong><small className="mt-1 block leading-5 text-white/38">{description}</small></span><span className={privacy[field] ? "h-6 w-11 rounded-full bg-white p-1" : "h-6 w-11 rounded-full bg-white/12 p-1"}><span className={privacy[field] ? "block size-4 translate-x-5 rounded-full bg-black transition" : "block size-4 rounded-full bg-white/55 transition"} /></span></button>
  return <WorkspacePage open={open} onBack={() => onOpenChange(false)} title="Приватность" description="Кто может найти вас и связаться"><Tabs defaultValue="privacy"><TabsList className="grid w-full grid-cols-2 bg-white/5"><TabsTrigger value="privacy">Настройки</TabsTrigger><TabsTrigger value="blocked">Блокировки</TabsTrigger></TabsList><TabsContent value="privacy"><div className="grid gap-3 pt-4">{toggle("discoverable", "Показывать в поиске", "Другие пользователи смогут найти вас по юзернейму.")}{toggle("showOnline", "Показывать статус в сети", "Собеседники увидят, когда вы открыли FavouriteGram.")}<label className="settings-section"><span className="field-label">Кто может начать новый диалог</span><select value={privacy.messagesFrom} onChange={(event) => setPrivacy((current) => ({ ...current, messagesFrom: event.target.value as PrivacySettings["messagesFrom"] }))} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white"><option value="everyone">Все пользователи</option><option value="contacts">Только существующие контакты</option><option value="nobody">Никто</option></select></label><Button onClick={save} disabled={busy} className="h-11 bg-[var(--ui-accent)] text-black hover:brightness-110">Сохранить</Button></div></TabsContent><TabsContent value="blocked"><div className="grid gap-2 pt-4">{blocked.map((user) => <div key={user.username} className="settings-row"><Avatar initials={getInitials(user.name)} hue="from-stone-500 to-zinc-800" imageUrl={user.avatarUrl} small /><span className="min-w-0 flex-1"><strong className="block truncate">{user.name}</strong><small className="text-white/38">{user.username}</small></span><Button size="sm" variant="outline" onClick={() => void unblock(user)}>Разблокировать</Button></div>)}{blocked.length === 0 && <p className="rounded-2xl border border-white/8 p-5 text-center text-sm text-white/42">Заблокированных пользователей нет.</p>}</div></TabsContent></Tabs></WorkspacePage>
}

type AccountSession = { id: string; current: boolean; userAgent: string; ip: string; createdAt: number; lastSeenAt: number }

function SecurityDialog({ open, onOpenChange, backendEnabled, onAccountDeleted }: { open: boolean; onOpenChange: (open: boolean) => void; backendEnabled: boolean; onAccountDeleted: () => void }) {
  const [sessions, setSessions] = useState<AccountSession[]>([])
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [codePassword, setCodePassword] = useState("")
  const [newCodes, setNewCodes] = useState<string[]>([])
  const [deletePassword, setDeletePassword] = useState("")
  const [busy, setBusy] = useState(false)
  const loadSessions = useCallback(() => {
    if (!open || !backendEnabled) return
    void backendRequest<{ sessions?: AccountSession[] }>("/api/sessions").then((result) => { if (result.ok) setSessions(result.data?.sessions || []) })
  }, [backendEnabled, open])
  useEffect(loadSessions, [loadSessions])
  const changePassword = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const result = await backendRequest<{ error?: string }>("/api/me/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) })
    setBusy(false)
    if (!result.ok) { toast.error(result.data?.error || "Не удалось сменить пароль"); return }
    setCurrentPassword(""); setNewPassword(""); toast.success("Пароль изменён, остальные сессии завершены"); loadSessions()
  }
  const regenerateCodes = async () => {
    setBusy(true)
    const result = await backendRequest<{ recoveryCodes?: string[]; error?: string }>("/api/me/recovery-codes", { method: "POST", body: JSON.stringify({ password: codePassword }) })
    setBusy(false)
    if (!result.ok) { toast.error(result.data?.error || "Не удалось создать коды"); return }
    setNewCodes(result.data?.recoveryCodes || []); setCodePassword("")
  }
  const closeSession = async (session: AccountSession) => {
    const result = await backendRequest<{ current?: boolean }>(`/api/sessions/${session.id}`, { method: "DELETE" })
    if (!result.ok) { toast.error("Не удалось завершить сессию"); return }
    if (result.data?.current) onAccountDeleted(); else loadSessions()
  }
  const deleteAccount = async () => {
    if (!window.confirm("Удалить аккаунт, все диалоги и загруженные файлы без возможности восстановления?")) return
    setBusy(true)
    const result = await backendRequest<{ error?: string }>("/api/me", { method: "DELETE", body: JSON.stringify({ password: deletePassword }) })
    setBusy(false)
    if (!result.ok) { toast.error(result.data?.error || "Не удалось удалить аккаунт"); return }
    onAccountDeleted()
  }
  return <WorkspacePage open={open} onBack={() => onOpenChange(false)} title="Безопасность" description="Пароль, восстановление и устройства" wide><Tabs defaultValue="password"><TabsList className="grid w-full grid-cols-3 bg-white/5"><TabsTrigger value="password">Пароль</TabsTrigger><TabsTrigger value="codes">Коды</TabsTrigger><TabsTrigger value="sessions">Устройства</TabsTrigger></TabsList><TabsContent value="password"><form onSubmit={changePassword} className="security-panel"><div className="settings-section"><strong className="text-white">Смена пароля</strong><p className="mb-3 mt-1">После изменения все остальные активные сессии будут завершены.</p><div className="grid gap-3"><Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Текущий пароль" required /><Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Новый пароль" minLength={5} required /><Button disabled={busy} className="bg-[var(--ui-accent)] text-black hover:brightness-110">Сменить пароль</Button></div></div><div className="danger-zone"><strong>Удаление аккаунта</strong><p>Все диалоги, сессии и загруженные файлы будут удалены без возможности восстановления.</p><Input type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} placeholder="Пароль для подтверждения" /><Button type="button" variant="destructive" disabled={busy || !deletePassword} onClick={deleteAccount}>Удалить аккаунт</Button></div></form></TabsContent><TabsContent value="codes"><div className="security-panel settings-section"><strong className="text-white">Коды восстановления</strong><p>Новые коды заменят все старые. Сохраните их вне этого устройства.</p><Input type="password" value={codePassword} onChange={(event) => setCodePassword(event.target.value)} placeholder="Текущий пароль" />{newCodes.length > 0 && <div className="recovery-code-grid">{newCodes.map((code) => <code key={code}>{code}</code>)}</div>}<div className="flex flex-wrap gap-2"><Button disabled={busy || !codePassword} onClick={regenerateCodes} className="bg-[var(--ui-accent)] text-black hover:brightness-110">Создать новые коды</Button>{newCodes.length > 0 && <Button variant="outline" onClick={() => { void navigator.clipboard?.writeText(newCodes.join("\n")); toast.success("Коды скопированы") }}>Скопировать</Button>}</div></div></TabsContent><TabsContent value="sessions"><div className="security-panel"><p>Здесь показаны браузеры и устройства, где открыт ваш аккаунт.</p>{sessions.map((session) => <div key={session.id} className="session-row"><span className="min-w-0 flex-1"><strong>{session.current ? "Это устройство" : session.userAgent}</strong><small>{session.ip || "IP не определён"} · активность {new Date(session.lastSeenAt || session.createdAt).toLocaleString("ru-RU")}</small></span><Button size="sm" variant="outline" onClick={() => closeSession(session)}>{session.current ? "Выйти" : "Завершить"}</Button></div>)}{sessions.length === 0 && <p className="rounded-2xl border border-white/8 p-5 text-center">Активные устройства загружаются…</p>}</div></TabsContent></Tabs></WorkspacePage>
}

function ChatInfoDialog({ open, onOpenChange, chat, onBlock, onReport, backendEnabled }: { open: boolean; onOpenChange: (open: boolean) => void; chat: Chat; onBlock: () => void; onReport: () => void; backendEnabled: boolean }) {
  const mediaCount = chat.messages.filter((message) => message.kind === "video" || (message.kind === "file" && message.fileType?.startsWith("image/"))).length
  const fileCount = chat.messages.filter((message) => message.kind === "file").length
  const media = chat.messages.filter((message) => !message.deletedAt && (message.kind === "video" || (message.kind === "file" && message.fileType?.startsWith("image/"))))
  const files = chat.messages.filter((message) => !message.deletedAt && message.kind === "file")
  return <WorkspacePage open={open} onBack={() => onOpenChange(false)} title="Профиль" description="Информация и материалы чата" wide><div className="contact-hero"><span className="contact-hero-glow" /><Avatar initials={chat.initials} hue={chat.hue} imageUrl={chat.imageUrl} /><h2>{chat.name}</h2><p>{chat.username} · {chat.online ? "сейчас в сети" : "был(а) недавно"}</p><div className="contact-actions"><button onClick={() => onOpenChange(false)}><MessageCircle /><span>Сообщение</span></button><button><Phone /><span>Аудио</span></button><button><Video /><span>Видео</span></button><button><BellOff /><span>Тише</span></button></div></div><p className="contact-bio">{chat.bio || "Пользователь пока ничего о себе не рассказал."}</p><div className="grid grid-cols-3 gap-2"><div className="profile-stat"><strong>{chat.messages.length}</strong><span>сообщений</span></div><div className="profile-stat"><strong>{mediaCount}</strong><span>медиа</span></div><div className="profile-stat"><strong>{fileCount}</strong><span>файлов</span></div></div><Tabs defaultValue="media"><TabsList className="grid w-full grid-cols-2 bg-white/5"><TabsTrigger value="media">Медиа</TabsTrigger><TabsTrigger value="files">Файлы</TabsTrigger></TabsList><TabsContent value="media"><div className="grid grid-cols-3 gap-2 pt-3">{media.map((message) => <a key={message.id} href={message.mediaUrl} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-xl border border-white/8 bg-white/[0.03]">{message.kind === "video" ? <video src={message.mediaUrl} className="h-full w-full object-cover" /> : <img src={message.mediaUrl} alt="Вложение" className="h-full w-full object-cover" />}</a>)}</div>{media.length === 0 && <p className="p-6 text-center text-sm text-white/38">Общих медиа пока нет</p>}</TabsContent><TabsContent value="files"><div className="grid gap-2 pt-3">{files.map((message) => <a key={message.id} href={message.mediaUrl} download={message.fileName} className="settings-action"><FileText className="size-4" /><span className="truncate">{message.fileName || "Файл"}</span></a>)}</div>{files.length === 0 && <p className="p-6 text-center text-sm text-white/38">Общих файлов пока нет</p>}</TabsContent></Tabs><div className="settings-nav-group"><button className="settings-nav-row text-amber-200" onClick={onReport}><Flag /><span className="flex-1 text-left">Пожаловаться</span><ChevronRight /></button><button className="settings-nav-row text-rose-300" onClick={() => { if (window.confirm(`Заблокировать ${chat.name}? Пользователь не сможет найти вас и написать.`)) onBlock() }}><ShieldCheck /><span className="flex-1 text-left">Заблокировать пользователя</span><ChevronRight /></button></div></WorkspacePage>
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${minutes}:${String(rest).padStart(2, "0")}`
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

function messagePreview(message?: Pick<Message, "kind" | "body" | "fileName"> | null) {
  if (!message) return "Сообщение"
  if (message.kind === "voice") return "Голосовое сообщение"
  if (message.kind === "video") return "Кружочек"
  if (message.kind === "file") return message.fileName ? `Файл: ${message.fileName}` : "Файл"
  return message.body || "Сообщение"
}

function getInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FG"
}

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
  AtSign,
  Bell,
  Camera,
  Check,
  Circle,
  Download,
  Eye,
  EyeOff,
  FileText,
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
  Play,
  Palette,
  Search,
  Send,
  Reply,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  UserRound,
  UsersRound,
  Video,
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
}

type Profile = {
  username: string
  name: string
  bio: string
  initials: string
  imageUrl: string
}

type AccentTheme = "sand" | "violet"

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

const chatsSeed: Chat[] = [
  {
    id: "lera",
    name: "Лера Соколова",
    username: "@lera",
    initials: "ЛС",
    hue: "from-fuchsia-400 to-violet-600",
    online: true,
    bio: "Люблю ночные прогулки, плёнку и сообщения без лишнего шума.",
    unread: 2,
    messages: [
      { id: "l1", sender: "them", kind: "text", body: "Ты уже посмотрел новый макет?", time: "13:42" },
      { id: "l2", sender: "me", kind: "text", body: "Да. Нравится, что в нём осталось много воздуха.", time: "13:44" },
      { id: "l3", sender: "them", kind: "voice", duration: 15, time: "13:45" },
      { id: "l4", sender: "me", kind: "text", body: "Слушаю — и через минуту отвечу.", time: "13:46" },
    ],
  },
  {
    id: "artem",
    name: "Артём Ветров",
    username: "@artem",
    initials: "АВ",
    hue: "from-cyan-400 to-blue-600",
    online: false,
    bio: "Дизайн, музыка и слишком много открытых вкладок.",
    unread: 0,
    messages: [
      { id: "a1", sender: "them", kind: "text", body: "Закинул всё в один файл. Проверь, когда будет время.", time: "вчера" },
    ],
  },
  {
    id: "maya",
    name: "Майя",
    username: "@maya",
    initials: "М",
    hue: "from-amber-300 to-rose-500",
    online: true,
    bio: "Отвечаю не сразу, но всегда по делу.",
    unread: 0,
    messages: [{ id: "m1", sender: "me", kind: "text", body: "Напишу вечером.", time: "пн" }],
  },
]

const people = [
  { name: "Кирилл Морозов", username: "@kirill", initials: "КМ", hue: "from-stone-400 to-amber-800", bio: "Музыка, код и редкие длинные разговоры." },
  { name: "Аня Орлова", username: "@anya", initials: "АО", hue: "from-rose-300 to-stone-700", bio: "Снимаю людей и города." },
  { name: "Марк", username: "@mark", initials: "М", hue: "from-indigo-300 to-stone-700", bio: "Здесь обычно после полуночи." },
]

const ease = [0.2, 0.8, 0.2, 1] as const
const SESSION_KEY = "favourite-gram.session"
const PROFILE_KEY = "favourite-gram.profile"
const CHATS_KEY = "favourite-gram.chats"
const THEME_KEY = "favourite-gram.theme"
const BACKEND_KEY = "favourite-gram.backend"

type ServerUser = { username: string; name: string; bio: string; avatarUrl: string; online?: boolean }
type ServerMessage = { id: string; clientId?: string; sender: ServerUser; kind: MessageKind; body?: string; duration?: number; mediaUrl?: string; fileName?: string; fileSize?: number; fileType?: string; createdAt: number; editedAt?: number | null; deletedAt?: number | null; delivery?: "delivered" | "read"; replyToId?: string | null; replyTo?: { id: string; kind: MessageKind; body?: string; senderName: string } | null; reactions?: Array<{ emoji: string; count: number; reactedByMe: boolean }> }
type ServerChat = { id: string; person: ServerUser; messages: ServerMessage[]; unread: number; updatedAt: number; hasMore?: boolean; oldestMessageAt?: number | null }

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

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.onerror = () => reject(reader.error)
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
  }
}

export function FavouriteGram() {
  const [screen, setScreen] = useState<Screen>("landing")
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup")
  const [sessionUsername, setSessionUsername] = useState("")
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const savedSession = window.localStorage.getItem(SESSION_KEY) || ""
      if (savedSession && !cancelled) setSessionUsername(savedSession)
      const me = await backendRequest<{ user?: ServerUser }>("/api/me")
      if (cancelled || !me.available) return
      if (me.ok && me.data?.user) {
        window.localStorage.setItem(BACKEND_KEY, "1")
        window.localStorage.setItem(SESSION_KEY, me.data.user.username)
        setSessionUsername(me.data.user.username)
      } else if (me.status === 401 && window.localStorage.getItem(BACKEND_KEY) === "1") {
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
          <Sparkles className="size-4" />Текст · голос · кружочки
        </motion.div>
        <motion.h1
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: reducedMotion ? 0 : 0.11 } } }}
          className="landing-title"
        >
          <motion.span className="landing-title-main" variants={{ hidden: { opacity: 0, y: reducedMotion ? 0 : 28, filter: reducedMotion ? "none" : "blur(8px)" }, visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.58, ease } } }}><span>Свои</span> <em>люди</em></motion.span>
          <motion.span className="landing-title-accent" variants={{ hidden: { opacity: 0, y: reducedMotion ? 0 : 28, filter: reducedMotion ? "none" : "blur(8px)" }, visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.58, ease } } }}><span className="landing-title-dash">—</span>ближе.</motion.span>
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reducedMotion ? 0 : 0.75, duration: 0.5, ease }} className="mt-7 max-w-[620px] text-balance text-base leading-7 text-white/60 sm:text-lg">
          Веб-мессенджер без привязки к номеру телефона. Для старта нужны только юзернейм и пароль.
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
    if (backend.available) {
      if (!backend.ok) { setError(backend.data?.error || "Не удалось войти."); setStatus("error"); return }
      window.localStorage.setItem(BACKEND_KEY, "1")
      if (backend.data?.recoveryCodes) setRecoveryCodes(backend.data.recoveryCodes)
      setStatus("success")
      window.setTimeout(() => { if (mode === "signup") setShowRecovery(true); else onComplete(username) }, reducedMotion ? 80 : 420)
      return
    }
    window.setTimeout(() => {
      setStatus("success")
      window.setTimeout(() => { if (mode === "signup") setShowRecovery(true); else onComplete(username) }, reducedMotion ? 80 : 720)
    }, reducedMotion ? 120 : 1150)
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
  const shownCodes = codes.length ? codes : ["LOCAL-7K4Q", "LOCAL-9T2M", "LOCAL-6D8P", "LOCAL-3X7R", "LOCAL-5C2V", "LOCAL-8N4W"]
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
    if (!result.available) { toast.error("Восстановление доступно после запуска сервера"); return }
    if (!result.ok || !result.data?.user) { toast.error(result.data?.error || "Не удалось восстановить доступ"); return }
    window.localStorage.setItem(BACKEND_KEY, "1")
    toast.success("Пароль изменён")
    onComplete(result.data.user.username)
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-[440px] rounded-[24px] border-white/10 bg-[#0d0d0f] p-6 text-white"><DialogHeader><DialogTitle>Восстановление доступа</DialogTitle><DialogDescription className="text-white/42">Введите один из сохранённых кодов. После использования он станет недействительным.</DialogDescription></DialogHeader><form onSubmit={recover} className="space-y-4"><label className="block"><span className="field-label">Юзернейм</span><div className="auth-input-wrap"><AtSign className="size-4 text-white/35" /><Input value={username} onChange={(event) => setUsername(event.target.value.replace(/\s/g, ""))} className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" /></div></label><label className="block"><span className="field-label">Код восстановления</span><div className="auth-input-wrap"><ShieldCheck className="size-4 text-white/35" /><Input value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())} placeholder="ABCDE-12345" className="h-auto border-0 bg-transparent p-0 font-mono shadow-none focus-visible:ring-0" /></div></label><label className="block"><span className="field-label">Новый пароль</span><div className="auth-input-wrap"><LockKeyhole className="size-4 text-white/35" /><Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={5} className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" /></div></label><Button disabled={busy} className="h-12 w-full bg-white text-black hover:bg-white/88">{busy ? "Проверяем…" : "Сменить пароль и войти"}</Button></form></DialogContent></Dialog>
}

function Messenger({ username, onHome, onSignOut }: { username: string; onHome: () => void; onSignOut: () => void }) {
  const [chats, setChats] = useState(chatsSeed)
  const [activeId, setActiveId] = useState(chatsSeed[0].id)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [query, setQuery] = useState("")
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [videoOpen, setVideoOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [securityOpen, setSecurityOpen] = useState(false)
  const [chatInfoOpen, setChatInfoOpen] = useState(false)
  const [pendingDeleteChat, setPendingDeleteChat] = useState<Chat | null>(null)
  const [theme, setTheme] = useState<AccentTheme>("sand")
  const [backendEnabled, setBackendEnabled] = useState(false)
  const [backendLoading, setBackendLoading] = useState(false)
  const [remotePeople, setRemotePeople] = useState<typeof people>([])
  const [typingChats, setTypingChats] = useState<Set<string>>(new Set())
  const [unreadOnly, setUnreadOnly] = useState(false)
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

  const activeChat = chats.find((chat) => chat.id === activeId) ?? chats[0]
  const draft = drafts[activeId] || ""
  const setDraft = useCallback((value: string) => setDrafts((current) => ({ ...current, [activeId]: value })), [activeId])
  const filteredChats = chats.filter((chat) => (!unreadOnly || chat.unread > 0) && `${chat.name} ${chat.username}`.toLowerCase().includes(query.toLowerCase()))
  const localPeople = backendEnabled ? remotePeople : [...remotePeople, ...people]
  const filteredPeople = query.length >= 2 ? localPeople.filter((person) => `${person.name} ${person.username}`.toLowerCase().includes(query.toLowerCase())).filter((person, index, all) => all.findIndex((item) => item.username === person.username) === index) : []

  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedProfile = window.localStorage.getItem(storageKey(PROFILE_KEY, username)) || window.localStorage.getItem(PROFILE_KEY)
        const savedChats = window.localStorage.getItem(storageKey(CHATS_KEY, username)) || window.localStorage.getItem(CHATS_KEY)
        const savedTheme = window.localStorage.getItem(THEME_KEY) as AccentTheme | null
        const hasBackend = window.localStorage.getItem(BACKEND_KEY) === "1"
        setBackendEnabled(hasBackend)
        if (hasBackend) { setBackendLoading(true); setChats([]); setActiveId("") }
        if (savedProfile) setProfile({ ...JSON.parse(savedProfile) as Profile, username })
        if (savedChats && !hasBackend) {
          const parsed = JSON.parse(savedChats) as Chat[]
          if (parsed.length) setChats(parsed.map((chat) => ({ ...chat, bio: chat.bio || "Описание пока не добавлено." })))
        }
        if (savedTheme === "sand" || savedTheme === "violet") setTheme(savedTheme)
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
      const result = await backendRequest<{ chats?: ServerChat[] }>("/api/chats")
      if (!result.ok) { setBackendLoading(false); toast.error("Не удалось загрузить чаты"); return }
      const serverChats = (result.data?.chats || []).map((chat) => mapServerChat(chat, serverProfile.username))
      setChats(serverChats)
      setActiveId((current) => serverChats.some((chat) => chat.id === current) ? current : serverChats[0]?.id || "")
      setBackendLoading(false)
    })()
  }, [backendEnabled, hydrated, onSignOut])

  useEffect(() => {
    if (!backendEnabled || query.trim().length < 2) return
    const timer = window.setTimeout(() => {
      void backendRequest<{ users?: ServerUser[] }>(`/api/users?query=${encodeURIComponent(query)}`).then((result) => {
        if (!result.ok) return
        setRemotePeople((result.data?.users || []).map((person) => ({ ...person, imageUrl: person.avatarUrl, initials: getInitials(person.name), hue: "from-stone-400 to-amber-800" })))
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
    const serializableChats = chats.map((chat) => ({
      ...chat,
      messages: chat.messages.map((message) => message.mediaUrl?.startsWith("blob:") ? { ...message, mediaUrl: undefined } : message),
    }))
    if (!backendEnabled) window.localStorage.setItem(storageKey(CHATS_KEY, username), JSON.stringify(serializableChats))
  }, [backendEnabled, chats, hydrated, profile, theme, username])

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
        const uploaded = await backendRequest<{ url?: string }>("/api/uploads", { method: "POST", body: JSON.stringify({ name: message.fileName || `${message.kind}.webm`, dataUrl: await fileToDataUrl(blob) }) })
        if (!uploaded.ok || !uploaded.data?.url) { markFailed(); toast.error("Не удалось загрузить вложение"); return }
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

  const startChat = (person: (typeof people)[number]) => {
    const id = person.username.slice(1)
    if (!chats.find((chat) => chat.id === id)) setChats((current) => [{ ...person, id, online: false, unread: 0, messages: [] }, ...current])
    openChat(id)
    setQuery("")
  }

  const beginLongPress = (chat: Chat) => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current)
    longPressRef.current = window.setTimeout(() => {
      suppressClickRef.current = true
      setPendingDeleteChat(chat)
      navigator.vibrate?.(20)
    }, 520)
  }

  const cancelLongPress = () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current)
    longPressRef.current = null
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

  const blockActiveContact = async () => {
    if (!activeChat || !backendEnabled) { toast.info("Блокировка доступна в серверном режиме"); return }
    const result = await backendRequest<{ error?: string }>(`/api/users/${encodeURIComponent(activeChat.username)}/block`, { method: "POST", body: "{}" })
    if (!result.ok) { toast.error(result.data?.error || "Не удалось заблокировать пользователя"); return }
    setChats((current) => current.filter((chat) => chat.id !== activeChat.id))
    setActiveId((current) => current === activeChat.id ? "" : current)
    setChatInfoOpen(false)
    setMobileChatOpen(false)
    toast.success(`${activeChat.name} заблокирован`)
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
    <motion.main data-accent={theme} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="messenger-shell h-svh overflow-hidden bg-[#060607]">
      <TooltipProvider delayDuration={120}>
        <nav className="nav-rail">
          <button onClick={onHome} aria-label="На главную"><Brand compact /></button>
          <div className="mt-7 flex flex-1 flex-col items-center gap-2"><RailButton label="Чаты" active={!unreadOnly} icon={MessageCircle} onClick={() => setUnreadOnly(false)} /><RailButton label="Найти человека" icon={UsersRound} onClick={() => { setUnreadOnly(false); searchRef.current?.focus() }} /><RailButton label="Непрочитанные" active={unreadOnly} icon={Bell} onClick={() => setUnreadOnly((value) => !value)} /></div>
          <RailButton label="На главную" icon={Home} onClick={onHome} />
          <RailButton label="Настройки" icon={Settings} onClick={() => setSettingsOpen(true)} />
          <RailButton label="Выйти" icon={LogOut} onClick={onSignOut} />
        </nav>
        <aside className={mobileChatOpen ? "chat-list mobile-hidden" : "chat-list"}>
          <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-5"><div><p className="eyebrow">Favourite Gram</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">Сообщения</h1></div><div className="flex items-center gap-2"><Button size="icon" variant="ghost" onClick={onHome} className="rounded-full text-white/48 hover:bg-white/8 hover:text-white" aria-label="На главную"><Home /></Button><button onClick={() => setSettingsOpen(true)} className="rounded-full" aria-label="Открыть настройки"><Avatar initials={profile.initials} hue="from-stone-500 to-zinc-800" imageUrl={profile.imageUrl} small /></button></div></div>
          <div className="px-4 pb-3"><div className="search-field"><Search className="size-4 text-white/30" /><Input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти по юзернейму" className="search-input h-auto border-0 bg-transparent p-0 text-sm shadow-none placeholder:text-white/27 focus-visible:ring-0" />{query && <button onClick={() => setQuery("")} aria-label="Очистить поиск"><X className="size-4 text-white/35" /></button>}</div></div>
          <div className="scrollbar-none flex-1 overflow-y-auto px-2 pb-4">
            <AnimatePresence initial={false}>{filteredPeople.map((person) => (
              <motion.button key={person.username} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} whileTap={{ scale: 0.985 }} onClick={() => startChat(person)} className="person-result"><Avatar initials={person.initials} hue={person.hue} imageUrl={"imageUrl" in person && typeof person.imageUrl === "string" ? person.imageUrl : ""} /><span className="min-w-0 flex-1 text-left"><strong className="block truncate text-sm font-medium">{person.name}</strong><span className="mt-1 block text-xs text-white/35">{person.username}</span></span><span className="rounded-full border border-white/9 px-3 py-1.5 text-xs text-white/56">Написать</span></motion.button>
            ))}</AnimatePresence>
            {filteredChats.map((chat) => {
              const last = chat.messages.at(-1)
              return <motion.button key={chat.id} whileTap={{ scale: 0.985 }} onPointerDown={() => beginLongPress(chat)} onPointerUp={cancelLongPress} onPointerCancel={cancelLongPress} onPointerLeave={cancelLongPress} onContextMenu={(event) => { event.preventDefault(); cancelLongPress(); setPendingDeleteChat(chat) }} onClick={() => { if (suppressClickRef.current) { suppressClickRef.current = false; return } openChat(chat.id) }} className={chat.id === activeId ? "chat-row chat-row-active" : "chat-row"}><div className="relative"><Avatar initials={chat.initials} hue={chat.hue} imageUrl={chat.imageUrl} /><span className={chat.online ? "presence presence-online" : "presence"} /></div><span className="min-w-0 flex-1 text-left"><span className="flex items-center justify-between gap-2"><strong className="truncate text-[15px] font-medium">{chat.name}</strong><small className="text-[11px] text-white/25">{last?.time}</small></span><span className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-sm text-white/38">{last?.kind === "voice" ? "Голосовое сообщение" : last?.kind === "video" ? "Кружочек" : last?.kind === "file" ? `Файл: ${last.fileName ?? "вложение"}` : last?.body || "Сообщений пока нет"}</span>{chat.unread > 0 && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white text-[10px] font-semibold text-black">{chat.unread}</span>}</span></span></motion.button>
            })}
            {filteredPeople.length === 0 && filteredChats.length === 0 && <div className="px-5 py-12 text-center"><p className="text-sm text-white/42">{backendLoading ? "Загружаем диалоги…" : unreadOnly ? "Непрочитанных сообщений нет" : query ? "Никого не нашли" : "Пока нет диалогов"}</p>{!backendLoading && !query && !unreadOnly && <p className="mt-2 text-xs leading-5 text-white/25">Введите юзернейм в поиске, чтобы начать разговор.</p>}</div>}
          </div>
        </aside>
        <section className={mobileChatOpen ? "conversation conversation-open" : "conversation"}>
          {activeChat ? <><header className="conversation-header"><Button variant="ghost" size="icon" onClick={() => setMobileChatOpen(false)} className="mobile-back rounded-full text-white hover:bg-white/7 hover:text-white" aria-label="Назад к чатам"><ArrowLeft /></Button><button onClick={() => setChatInfoOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left" aria-label="Открыть профиль собеседника"><Avatar initials={activeChat.initials} hue={activeChat.hue} imageUrl={activeChat.imageUrl} small /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{activeChat.name}</span><span className="mt-0.5 block text-xs text-white/35">{activeChat.serverId && typingChats.has(activeChat.serverId) ? "печатает…" : activeChat.online ? "в сети" : activeChat.username}</span></span></button></header>
          <MessageArea chat={activeChat} onReply={beginReply} onEdit={beginEdit} onDelete={deleteMessage} onReact={toggleReaction} onRetry={retryMessage} onLoadOlder={loadOlderMessages} />
          <div className="composer-wrap"><AnimatePresence>{recording && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="recording-bar"><span className="recording-dot" /><strong>{formatDuration(recordSeconds)}</strong><span className="text-white/38">Идёт запись</span><button onClick={() => stopVoice(false)} className="ml-auto rounded-full px-3 py-1.5 text-sm text-white/46 hover:bg-white/7 hover:text-white">Отменить</button><Button size="icon" onClick={() => stopVoice(true)} className="rounded-full bg-white text-black hover:bg-white/88"><Send /></Button></motion.div>}</AnimatePresence>
            {!recording && <><input ref={attachmentRef} type="file" className="hidden" onChange={(event) => { attachFile(event.target.files?.[0]); event.currentTarget.value = "" }} />{(replyingTo || editingMessage) && <div className="composer-context"><span className="composer-context-icon">{editingMessage ? <Pencil /> : <Reply />}</span><span className="min-w-0 flex-1"><strong>{editingMessage ? "Редактирование" : `Ответ ${replyingTo?.sender === "me" ? "себе" : activeChat.name}`}</strong><small>{messagePreview(editingMessage || replyingTo)}</small></span><button type="button" onClick={() => { setReplyingTo(null); setEditingMessage(null); if (editingMessage) setDraft("") }} aria-label="Отменить"><X /></button></div>}<form onSubmit={sendText} className="composer"><Button type="button" variant="ghost" size="icon" className="composer-action rounded-full text-white/44 hover:bg-white/7 hover:text-white" aria-label="Прикрепить файл" onClick={() => attachmentRef.current?.click()}><Paperclip /></Button><Textarea ref={composerRef} rows={1} value={draft} maxLength={4000} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape" && (replyingTo || editingMessage)) { event.preventDefault(); setReplyingTo(null); setEditingMessage(null); if (editingMessage) setDraft("") } if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} onInput={(event) => { const field = event.currentTarget; field.style.height = "auto"; field.style.height = `${Math.min(field.scrollHeight, 132)}px` }} placeholder={editingMessage ? "Изменить сообщение" : "Сообщение"} className="message-composer min-h-0 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-base shadow-none placeholder:text-white/25 focus-visible:ring-0" /><Button type="button" variant="ghost" size="icon" className="composer-action rounded-full text-white/44 hover:bg-white/7 hover:text-white" aria-label="Записать кружочек" onClick={() => setVideoOpen(true)}><Camera /></Button>{draft.trim() ? <Button type="submit" size="icon" className="composer-action rounded-full bg-white text-black hover:bg-white/88" aria-label={editingMessage ? "Сохранить" : "Отправить"}>{editingMessage ? <Check /> : <Send />}</Button> : <Button type="button" size="icon" className="composer-action rounded-full bg-white text-black hover:bg-white/88" aria-label="Записать голосовое" onClick={startVoice}><Mic /></Button>}</form></>}
          </div></> : <EmptyConversation loading={backendLoading} onSearch={() => { setMobileChatOpen(false); window.setTimeout(() => searchRef.current?.focus(), 80) }} />}
        </section>
        <VideoRecorderDialog open={videoOpen} onOpenChange={setVideoOpen} onSend={(url, duration) => pushMessage({ sender: "me", kind: "video", mediaUrl: url, duration })} />
        {profileOpen && <ProfileDialog open onOpenChange={setProfileOpen} profile={profile} onSave={saveProfile} />}
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} profile={profile} theme={theme} onThemeChange={setTheme} onEditProfile={() => { setSettingsOpen(false); setProfileOpen(true) }} onSecurity={() => { setSettingsOpen(false); setSecurityOpen(true) }} onHome={() => { setSettingsOpen(false); onHome() }} onSignOut={onSignOut} />
        <SecurityDialog open={securityOpen} onOpenChange={setSecurityOpen} backendEnabled={backendEnabled} onAccountDeleted={onSignOut} />
        {activeChat && <ChatInfoDialog open={chatInfoOpen} onOpenChange={setChatInfoOpen} chat={activeChat} onBlock={blockActiveContact} backendEnabled={backendEnabled} />}
        <Dialog open={Boolean(pendingDeleteChat)} onOpenChange={(open) => { if (!open) setPendingDeleteChat(null) }}><DialogContent className="max-w-[390px] rounded-[24px] border-white/10 bg-[#0d0d0f] p-6 text-white"><DialogHeader><DialogTitle>Удалить чат?</DialogTitle><DialogDescription className="text-white/42">Диалог с {pendingDeleteChat?.name} исчезнет из вашего списка. У собеседника история останется.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/8 hover:text-white" onClick={() => setPendingDeleteChat(null)}>Отмена</Button><Button variant="destructive" onClick={deleteChat}><Trash2 className="mr-2 size-4" />Удалить</Button></DialogFooter></DialogContent></Dialog>
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
  onLoadOlder: () => void
}

function MessageArea({ chat, onReply, onEdit, onDelete, onReact, onRetry, onLoadOlder }: { chat: Chat } & MessageActions) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [chat.messages.length, chat.id])
  return <div className="message-area scrollbar-thin" role="log" aria-live="polite" aria-label={`Переписка с ${chat.name}`}><div className="mx-auto flex min-h-full w-full max-w-[820px] flex-col justify-end px-4 py-7 sm:px-7">{chat.messages.length === 0 ? <div className="m-auto flex max-w-sm flex-col items-center py-20 text-center"><div className="grid size-16 place-items-center rounded-[22px] border border-white/9 bg-white/[0.035]"><MessageCircle className="size-6 text-white/55" /></div><h3 className="mt-5 text-xl font-medium">Сообщений пока нет</h3><p className="mt-2 text-sm leading-6 text-white/38">Напишите первым — здесь появится история разговора.</p></div> : <><div className="flex justify-center">{chat.hasMore && <button className="load-older" onClick={onLoadOlder}>Показать предыдущие сообщения</button>}</div><AnimatePresence initial={false}>{chat.messages.map((message) => {
    const day = message.createdAt ? new Date(message.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: new Date(message.createdAt).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : ""
    const index = chat.messages.indexOf(message)
    const previousCreatedAt = index > 0 ? chat.messages[index - 1].createdAt : null
    const previousDay = previousCreatedAt ? new Date(previousCreatedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: new Date(previousCreatedAt).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : ""
    const showDay = Boolean(day && day !== previousDay)
    return <div key={message.id}>{showDay && <div className="date-separator"><span>{day}</span></div>}<MessageBubble message={message} avatar={chat} onReply={onReply} onEdit={onEdit} onDelete={onDelete} onReact={onReact} onRetry={onRetry} /></div>
  })}</AnimatePresence></>}<div ref={endRef} /></div></div>
}

function MessageBubble({ message, avatar, onReply, onEdit, onDelete, onReact, onRetry }: { message: Message; avatar: Chat } & Omit<MessageActions, "onLoadOlder">) {
  const mine = message.sender === "me"
  const bubbleClass = `${mine ? "bubble bubble-me" : "bubble"}${message.kind === "text" ? " bubble-text" : ""}`
  const actions = <MessageMenu message={message} onReply={onReply} onEdit={onEdit} onDelete={onDelete} onReact={onReact} onRetry={onRetry} />
  if (message.kind === "video" && !message.deletedAt) return <motion.div initial={{ opacity: 0, x: mine ? 14 : -14, y: 5 }} animate={{ opacity: 1, x: 0, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.26, ease }} className={mine ? "message-row message-row-me" : "message-row"}>{!mine && <Avatar initials={avatar.initials} hue={avatar.hue} imageUrl={avatar.imageUrl} small />}{mine && actions}<div className="video-message"><VideoCircle mediaUrl={message.mediaUrl} duration={message.duration ?? 0} /><span className="video-message-time">{message.time}{mine && <DeliveryMark status={message.status} />}</span><ReactionRow message={message} onReact={onReact} /></div>{!mine && actions}</motion.div>
  return <motion.div initial={{ opacity: 0, x: mine ? 14 : -14, y: 5 }} animate={{ opacity: 1, x: 0, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.26, ease }} className={mine ? "message-row message-row-me" : "message-row"}>{!mine && <Avatar initials={avatar.initials} hue={avatar.hue} imageUrl={avatar.imageUrl} small />}{mine && actions}<div className={bubbleClass}>{message.replyTo && !message.deletedAt && <div className={mine ? "reply-preview reply-preview-me" : "reply-preview"}><strong>{message.replyTo.senderName}</strong><span>{message.replyTo.body || messagePreview({ kind: message.replyTo.kind } as Message)}</span></div>}{message.deletedAt ? <p className="deleted-message">Сообщение удалено</p> : <>{message.kind === "text" && <p>{message.body}</p>}{message.kind === "voice" && <VoiceBubble duration={message.duration ?? 1} mediaUrl={message.mediaUrl} mine={mine} />}{message.kind === "file" && <FileBubble message={message} mine={mine} />}</>}<span className={mine ? "message-time text-black/42" : "message-time text-white/30"}>{message.editedAt && !message.deletedAt && <em>изм.</em>}{message.time}{mine && <DeliveryMark status={message.status} />}</span><ReactionRow message={message} onReact={onReact} /></div>{!mine && actions}</motion.div>
}

function MessageMenu({ message, onReply, onEdit, onDelete, onReact, onRetry }: { message: Message } & Omit<MessageActions, "onLoadOlder">) {
  return <DropdownMenu><DropdownMenuTrigger asChild><button className="message-menu-trigger" aria-label="Действия с сообщением"><MoreHorizontal /></button></DropdownMenuTrigger><DropdownMenuContent align={message.sender === "me" ? "end" : "start"} className="message-menu"><DropdownMenuItem onClick={() => onReply(message)} disabled={Boolean(message.deletedAt)}><Reply />Ответить</DropdownMenuItem>{message.sender === "me" && message.kind === "text" && !message.deletedAt && <DropdownMenuItem onClick={() => onEdit(message)}><Pencil />Изменить</DropdownMenuItem>}{message.status === "error" && <DropdownMenuItem onClick={() => onRetry(message)}><RotateCcw />Повторить отправку</DropdownMenuItem>}{!message.deletedAt && <div className="reaction-picker" aria-label="Поставить реакцию">{["👍", "❤️", "😂", "🔥", "👏", "😮"].map((emoji) => <button key={emoji} onClick={() => onReact(message, emoji)}>{emoji}</button>)}</div>}{message.sender === "me" && <DropdownMenuItem className="text-rose-300 focus:text-rose-200" onClick={() => onDelete(message)}><Trash2 />Удалить</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>
}

function ReactionRow({ message, onReact }: { message: Message; onReact: (message: Message, emoji: string) => void }) {
  if (!message.reactions?.length || message.deletedAt) return null
  return <div className={message.sender === "me" ? "reaction-row reaction-row-me" : "reaction-row"}>{message.reactions.map((reaction) => <button key={reaction.emoji} onClick={() => onReact(message, reaction.emoji)} className={reaction.reactedByMe ? "reaction-chip reaction-chip-active" : "reaction-chip"}>{reaction.emoji}<span>{reaction.count}</span></button>)}</div>
}

function DeliveryMark({ status }: { status?: Message["status"] }) {
  if (status === "sending") return <span className="delivery-mark" title="Отправляется">…</span>
  if (status === "error") return <span className="delivery-mark delivery-error" title="Не отправлено">!</span>
  if (status === "read") return <span className="delivery-mark delivery-read" title="Прочитано"><Check /><Check /></span>
  return <span className="delivery-mark" title="Доставлено"><Check /></span>
}

function FileBubble({ message, mine }: { message: Message; mine: boolean }) {
  const size = formatFileSize(message.fileSize ?? 0)
  return <a href={message.mediaUrl} download={message.fileName} className="file-bubble" aria-label={`Скачать ${message.fileName ?? "файл"}`}><span className="file-bubble-icon"><FileText className="size-5" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{message.fileName ?? "Файл"}</strong><small className={mine ? "mt-1 block text-black/45" : "mt-1 block text-white/38"}>{size}</small></span><Download className="size-4 shrink-0 opacity-55" /></a>
}

function VoiceBubble({ duration, mediaUrl, mine }: { duration: number; mediaUrl?: string; mine: boolean }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const bars = useMemo(() => Array.from({ length: 34 }, (_, index) => 7 + ((index * 17 + duration * 3) % 22)), [duration])
  const toggle = () => {
    if (!mediaUrl) { toast.info("Это демонстрационное голосовое", { description: "В исходных данных нет аудиофайла для воспроизведения." }); return }
    if (!audioRef.current) { const audio = new Audio(mediaUrl); audioRef.current = audio; audio.ontimeupdate = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0); audio.onended = () => { setPlaying(false); setProgress(0) } }
    if (playing) audioRef.current.pause(); else void audioRef.current.play(); setPlaying(!playing)
  }
  return <div className="voice-content flex min-w-[236px] items-center gap-3 sm:min-w-[310px]"><button onClick={toggle} className={`${mine ? "voice-play voice-play-light" : "voice-play"}${mediaUrl ? "" : " voice-play-demo"}`} aria-label={mediaUrl ? (playing ? "Пауза" : "Воспроизвести") : "Демонстрационное голосовое без аудиофайла"}>{playing ? <Pause /> : <Play className="translate-x-px" />}</button><div className="flex h-8 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden="true">{bars.map((height, index) => <motion.span key={index} animate={playing ? { scaleY: [0.65, 1, 0.72] } : { scaleY: 1 }} transition={{ duration: 0.75, repeat: playing ? Infinity : 0, delay: index * 0.018 }} className={mine ? "w-[2px] rounded-full bg-black/75" : "w-[2px] rounded-full bg-white/78"} style={{ height, opacity: index / bars.length <= progress ? 1 : 0.62 }} />)}</div><span className={mine ? "text-sm tabular-nums text-black/72" : "text-sm tabular-nums text-white/58"}>{formatDuration(duration)}</span></div>
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
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-[520px] rounded-[26px] border-white/10 bg-[#0d0d0f] p-6 text-white"><DialogHeader><DialogTitle className="text-2xl tracking-[-0.04em]">Мой профиль</DialogTitle><DialogDescription className="text-white/42">Аватар, отображаемое имя и короткое описание.</DialogDescription></DialogHeader><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => choose(event.target.files?.[0])} /><button type="button" onClick={() => fileRef.current?.click()} className="mx-auto grid size-28 place-items-center overflow-hidden rounded-full border border-dashed border-white/20 bg-white/[0.035]" aria-label="Выбрать фото профиля">{imageUrl ? <img src={imageUrl} alt="Предпросмотр аватара" className="h-full w-full object-cover" /> : <ImagePlus className="size-7 text-white/55" />}</button><div className="space-y-4"><label className="block"><span className="field-label">Имя</span><div className="auth-input-wrap"><Input value={name} maxLength={48} onChange={(event) => setName(event.target.value)} className="h-auto border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0" /></div></label><label className="block"><span className="field-label">О себе</span><div className="auth-input-wrap"><Input value={bio} maxLength={96} onChange={(event) => setBio(event.target.value)} placeholder="Пара слов о себе" className="h-auto border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0" /></div></label></div><DialogFooter><Button variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/8 hover:text-white" onClick={() => onOpenChange(false)}>Отмена</Button><Button className="bg-white text-black hover:bg-white/88" onClick={save}>Сохранить</Button></DialogFooter></DialogContent></Dialog>
}

function SettingsDialog({ open, onOpenChange, profile, theme, onThemeChange, onEditProfile, onSecurity, onHome, onSignOut }: { open: boolean; onOpenChange: (open: boolean) => void; profile: Profile; theme: AccentTheme; onThemeChange: (theme: AccentTheme) => void; onEditProfile: () => void; onSecurity: () => void; onHome: () => void; onSignOut: () => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-[480px] rounded-[26px] border-white/10 bg-[#0d0d0f] p-6 text-white"><DialogHeader><DialogTitle className="text-2xl tracking-[-0.04em]">Настройки</DialogTitle><DialogDescription className="text-white/42">Профиль, оформление и безопасность аккаунта.</DialogDescription></DialogHeader><button onClick={onEditProfile} className="settings-row"><Avatar initials={profile.initials} hue="from-stone-500 to-zinc-800" imageUrl={profile.imageUrl} /><span className="min-w-0 flex-1 text-left"><strong className="block truncate">{profile.name}</strong><small className="mt-1 block text-white/38">{profile.username} · Мой профиль</small></span><UserRound className="size-5 text-white/34" /></button><div className="settings-section"><div className="flex items-center gap-2 text-sm font-medium"><Palette className="size-4 text-white/50" />Акцент интерфейса</div><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => onThemeChange("sand")} className={theme === "sand" ? "theme-choice theme-choice-active" : "theme-choice"}><span className="theme-dot bg-[#b9a78d]" />Песочный</button><button onClick={() => onThemeChange("violet")} className={theme === "violet" ? "theme-choice theme-choice-active" : "theme-choice"}><span className="theme-dot bg-[#8b76ff]" />Фиолетовый</button></div></div><div className="grid gap-2"><button onClick={onSecurity} className="settings-action"><ShieldCheck className="size-4" />Безопасность и устройства</button><button onClick={onHome} className="settings-action"><Home className="size-4" />На главную</button><button onClick={onSignOut} className="settings-action text-rose-300"><LogOut className="size-4" />Выйти из аккаунта</button></div></DialogContent></Dialog>
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
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[88svh] max-w-[620px] overflow-y-auto rounded-[26px] border-white/10 bg-[#0d0d0f] p-6 text-white"><DialogHeader><DialogTitle className="text-2xl tracking-[-0.04em]">Безопасность</DialogTitle><DialogDescription className="text-white/42">Пароль, коды восстановления и активные устройства.</DialogDescription></DialogHeader>{!backendEnabled ? <p className="rounded-2xl border border-white/8 bg-white/[0.025] p-4 text-sm text-white/48">Эти настройки доступны после подключения серверного режима.</p> : <Tabs defaultValue="password"><TabsList className="grid w-full grid-cols-3 bg-white/5"><TabsTrigger value="password">Пароль</TabsTrigger><TabsTrigger value="codes">Коды</TabsTrigger><TabsTrigger value="sessions">Устройства</TabsTrigger></TabsList><TabsContent value="password"><form onSubmit={changePassword} className="security-panel"><Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Текущий пароль" required /><Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Новый пароль" minLength={5} required /><Button disabled={busy} className="bg-white text-black hover:bg-white/88">Сменить пароль</Button><div className="danger-zone"><strong>Удаление аккаунта</strong><p>Все диалоги, сессии и загруженные файлы будут удалены с этого устройства.</p><Input type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} placeholder="Пароль для подтверждения" /><Button type="button" variant="destructive" disabled={busy || !deletePassword} onClick={deleteAccount}>Удалить аккаунт</Button></div></form></TabsContent><TabsContent value="codes"><div className="security-panel"><p>Новые коды заменят все старые. Сохраните их вне этого устройства.</p><Input type="password" value={codePassword} onChange={(event) => setCodePassword(event.target.value)} placeholder="Текущий пароль" />{newCodes.length > 0 && <div className="recovery-code-grid">{newCodes.map((code) => <code key={code}>{code}</code>)}</div>}<div className="flex gap-2"><Button disabled={busy || !codePassword} onClick={regenerateCodes} className="bg-white text-black hover:bg-white/88">Создать новые коды</Button>{newCodes.length > 0 && <Button variant="outline" onClick={() => { void navigator.clipboard?.writeText(newCodes.join("\n")); toast.success("Коды скопированы") }}>Скопировать</Button>}</div></div></TabsContent><TabsContent value="sessions"><div className="security-panel">{sessions.map((session) => <div key={session.id} className="session-row"><span className="min-w-0 flex-1"><strong>{session.current ? "Это устройство" : session.userAgent}</strong><small>{session.ip || "IP не определён"} · {new Date(session.createdAt).toLocaleDateString("ru-RU")}</small></span><Button size="sm" variant="outline" onClick={() => closeSession(session)}>{session.current ? "Выйти" : "Завершить"}</Button></div>)}</div></TabsContent></Tabs>}</DialogContent></Dialog>
}

function ChatInfoDialog({ open, onOpenChange, chat, onBlock, backendEnabled }: { open: boolean; onOpenChange: (open: boolean) => void; chat: Chat; onBlock: () => void; backendEnabled: boolean }) {
  const mediaCount = chat.messages.filter((message) => message.kind === "video" || (message.kind === "file" && message.fileType?.startsWith("image/"))).length
  const fileCount = chat.messages.filter((message) => message.kind === "file").length
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-[440px] rounded-[26px] border-white/10 bg-[#0d0d0f] p-6 text-white"><div className="mx-auto"><Avatar initials={chat.initials} hue={chat.hue} imageUrl={chat.imageUrl} /></div><DialogHeader><DialogTitle className="text-center text-2xl tracking-[-0.04em]">{chat.name}</DialogTitle><DialogDescription className="text-center text-white/42">{chat.username} · {chat.online ? "сейчас в сети" : "не в сети"}</DialogDescription></DialogHeader><p className="rounded-[18px] border border-white/8 bg-white/[0.025] p-4 text-sm leading-6 text-white/62">{chat.bio}</p><div className="grid grid-cols-3 gap-2"><div className="profile-stat"><strong>{chat.messages.length}</strong><span>сообщений</span></div><div className="profile-stat"><strong>{mediaCount}</strong><span>медиа</span></div><div className="profile-stat"><strong>{fileCount}</strong><span>файлов</span></div></div><div className="grid gap-2"><Button variant="outline" className="w-full border-white/10 bg-transparent text-white hover:bg-white/8 hover:text-white" onClick={() => onOpenChange(false)}>Вернуться в чат</Button>{backendEnabled && <Button variant="ghost" className="text-rose-300 hover:bg-rose-500/8 hover:text-rose-200" onClick={() => { if (window.confirm(`Заблокировать ${chat.name}? Пользователь не сможет найти вас и написать.`)) onBlock() }}>Заблокировать пользователя</Button>}</div></DialogContent></Dialog>
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

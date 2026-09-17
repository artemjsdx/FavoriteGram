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
  ImagePlus,
  Info,
  LockKeyhole,
  Menu,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Paperclip,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Toaster } from "@/components/ui/sonner"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type Screen = "landing" | "auth" | "messenger"
type MessageKind = "text" | "voice" | "video"

type Message = {
  id: string
  sender: "me" | "them"
  kind: MessageKind
  body?: string
  duration?: number
  mediaUrl?: string
  time: string
}

type Chat = {
  id: string
  name: string
  username: string
  initials: string
  hue: string
  online: boolean
  unread: number
  messages: Message[]
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

const chatsSeed: Chat[] = [
  {
    id: "lera",
    name: "Лера Соколова",
    username: "@lera",
    initials: "ЛС",
    hue: "from-fuchsia-400 to-violet-600",
    online: true,
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
    unread: 0,
    messages: [{ id: "m1", sender: "me", kind: "text", body: "Напишу вечером.", time: "пн" }],
  },
]

const people = [
  { name: "Кирилл Морозов", username: "@kirill", initials: "КМ", hue: "from-lime-300 to-emerald-600" },
  { name: "Аня Орлова", username: "@anya", initials: "АО", hue: "from-pink-300 to-fuchsia-600" },
  { name: "Марк", username: "@mark", initials: "М", hue: "from-sky-300 to-indigo-600" },
]

const ease = [0.2, 0.8, 0.2, 1] as const

export function FavouriteGram() {
  const [screen, setScreen] = useState<Screen>("landing")
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup")
  const reducedMotion = useReducedMotion()

  const openAuth = (mode: "signup" | "login") => {
    setAuthMode(mode)
    setScreen("auth")
  }

  return (
    <div className="min-h-svh bg-background text-foreground selection:bg-white selection:text-black">
      <AnimatePresence mode="wait">
        {screen === "landing" && <Landing key="landing" onOpenAuth={openAuth} reducedMotion={Boolean(reducedMotion)} />}
        {screen === "auth" && (
          <AuthScreen
            key="auth"
            initialMode={authMode}
            onBack={() => setScreen("landing")}
            onComplete={() => setScreen("messenger")}
            reducedMotion={Boolean(reducedMotion)}
          />
        )}
        {screen === "messenger" && <Messenger key="messenger" onSignOut={() => setScreen("landing")} />}
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

function Landing({ onOpenAuth, reducedMotion }: { onOpenAuth: (mode: "signup" | "login") => void; reducedMotion: boolean }) {
  const title = "Свои люди — ближе."
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: reducedMotion ? 0.01 : 0.35 }}
      className="relative min-h-svh overflow-hidden bg-[#050506]"
    >
      <div className="absolute inset-0 opacity-90" aria-hidden="true">
        <MeshGradient className="h-full w-full" colors={["#030303", "#151515", "#29292d", "#f1f1f1"]} speed={reducedMotion ? 0 : 0.18} />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,transparent_0,rgba(5,5,6,.08)_42%,rgba(5,5,6,.86)_100%)]" />
      <div className="noise-layer absolute inset-0 opacity-[0.11]" aria-hidden="true" />

      <header className="relative z-20 mx-auto flex w-full max-w-[1240px] items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <Brand />
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="rounded-full px-4 text-white/72 hover:bg-white/8 hover:text-white" onClick={() => onOpenAuth("login")}>Войти</Button>
          <Button className="rounded-full bg-white px-5 text-black hover:bg-white/88" onClick={() => onOpenAuth("signup")}>Создать аккаунт</Button>
        </div>
      </header>

      <section className="relative z-10 mx-auto flex min-h-[calc(100svh-84px)] w-full max-w-[1240px] flex-col items-center justify-center px-5 pb-24 pt-14 text-center sm:px-8">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reducedMotion ? 0 : 0.15, duration: 0.45, ease }} className="glass-chip mb-7 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-white/78">
          <Sparkles className="size-4" />Текст · голос · кружочки
        </motion.div>
        <motion.h1
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: reducedMotion ? 0 : 0.035 } } }}
          className="flex max-w-[940px] flex-wrap justify-center text-balance text-[clamp(3.35rem,9vw,7.4rem)] font-semibold leading-[0.88] tracking-[-0.075em] text-white"
        >
          {title.split("").map((char, index) => (
            <motion.span
              key={`${char}-${index}`}
              variants={{
                hidden: { opacity: 0, y: reducedMotion ? 0 : 28, filter: reducedMotion ? "none" : "blur(8px)" },
                visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease } },
              }}
              className={char === " " ? "w-[0.22em]" : ""}
            >{char}</motion.span>
          ))}
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reducedMotion ? 0 : 0.75, duration: 0.5, ease }} className="mt-7 max-w-[620px] text-balance text-base leading-7 text-white/60 sm:text-lg">
          Веб-мессенджер без привязки к номеру телефона. Для старта нужны только юзернейм и пароль.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reducedMotion ? 0 : 0.9, duration: 0.5, ease }} className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <button className="neon-button group" onClick={() => onOpenAuth("signup")}><span>Создать аккаунт</span><ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></button>
          <Button variant="outline" className="h-12 rounded-full border-white/14 bg-black/20 px-6 text-white backdrop-blur-xl hover:bg-white/8 hover:text-white" onClick={() => onOpenAuth("login")}>У меня уже есть аккаунт</Button>
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

function AuthScreen({ initialMode, onBack, onComplete, reducedMotion }: { initialMode: "signup" | "login"; onBack: () => void; onComplete: () => void; reducedMotion: boolean }) {
  const [mode, setMode] = useState(initialMode)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<"idle" | "checking" | "success" | "error">("idle")
  const [error, setError] = useState("")
  const [showRecovery, setShowRecovery] = useState(false)

  const strength = useMemo(() => {
    let score = 0
    if (password.length >= 8) score++
    if (password.length >= 12) score++
    if (/[A-Za-zА-Яа-я]/.test(password) && /\d/.test(password)) score++
    if (/[^A-Za-zА-Яа-я0-9]/.test(password) || password.length >= 18) score++
    return score
  }, [password])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError("")
    if (!/^[a-z0-9_]{3,32}$/i.test(username)) { setError("Юзернейм: 3–32 символа, латиница, цифры и подчёркивание."); setStatus("error"); return }
    if (password.length < 12) { setError("Используйте не меньше 12 символов."); setStatus("error"); return }
    setStatus("checking")
    window.setTimeout(() => {
      setStatus("success")
      window.setTimeout(() => { if (mode === "signup") setShowRecovery(true); else onComplete() }, reducedMotion ? 80 : 720)
    }, reducedMotion ? 120 : 1150)
  }
  const resetStatus = () => { if (status === "error") setStatus("idle") }

  return (
    <motion.main initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: reducedMotion ? 0.01 : 0.32, ease }} className="relative grid min-h-svh place-items-center overflow-hidden bg-[#050506] px-5 py-16">
      <div className="absolute inset-0 opacity-55" aria-hidden="true"><MeshGradient className="h-full w-full" colors={["#050506", "#121217", "#35353d", "#d9d9df"]} speed={reducedMotion ? 0 : 0.12} /></div>
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
      <Button variant="ghost" size="icon" aria-label="Вернуться на главную" onClick={onBack} className="absolute left-5 top-5 z-20 rounded-full border border-white/10 bg-black/20 text-white hover:bg-white/8 hover:text-white sm:left-8 sm:top-8"><ArrowLeft /></Button>
      <div className="relative z-10 w-full max-w-[460px]">
        <div className="mb-7 flex justify-center"><Brand /></div>
        <div className="neon-frame rounded-[28px] bg-[#0b0b0d]/94 p-1 shadow-[0_30px_100px_rgba(0,0,0,.6)] backdrop-blur-2xl">
          <div className="rounded-[25px] border border-white/8 bg-[#0b0b0d] p-6 sm:p-8">
            <Tabs value={mode} onValueChange={(value) => { setMode(value as "signup" | "login"); setStatus("idle"); setError("") }}>
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-[14px] border border-white/8 bg-white/[0.035] p-1">
                <TabsTrigger value="signup" className="rounded-[10px] data-[state=active]:bg-white data-[state=active]:text-black">Создать аккаунт</TabsTrigger>
                <TabsTrigger value="login" className="rounded-[10px] data-[state=active]:bg-white data-[state=active]:text-black">Войти</TabsTrigger>
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
                    <div className="mt-5 flex items-center justify-between"><label className="field-label" htmlFor={`${tab}-password`}>Пароль</label><span className="text-xs text-white/30">Минимум 12 символов</span></div>
                    <div className="auth-input-wrap mt-2"><LockKeyhole className="size-4 text-white/35" /><Input id={`${tab}-password`} value={password} onChange={(event) => { setPassword(event.target.value); resetStatus() }} type={showPassword ? "text" : "password"} autoComplete={tab === "signup" ? "new-password" : "current-password"} placeholder="••••••••••••" className="h-auto border-0 bg-transparent p-0 text-base shadow-none placeholder:text-white/22 focus-visible:ring-0" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="rounded-md px-2 py-1 text-xs text-white/42 transition hover:bg-white/7 hover:text-white">{showPassword ? "Скрыть" : "Показать"}</button></div>
                    <PasswordDeck strength={strength} status={status} reducedMotion={reducedMotion} />
                    <div aria-live="polite" className="min-h-7 pt-1 text-sm">{error ? <p className="text-rose-300">{error}</p> : <p className="text-white/32">Можно использовать парольную фразу.</p>}</div>
                    <Button disabled={status === "checking" || status === "success"} className="mt-3 h-12 w-full rounded-[14px] bg-white text-base text-black hover:bg-white/88">
                      {status === "checking" ? "Проверяем…" : status === "success" ? "Готово" : tab === "signup" ? "Создать аккаунт" : "Войти"}{status === "success" ? <Check className="ml-2 size-4" /> : <ArrowRight className="ml-2 size-4" />}
                    </Button>
                  </form>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>
      </div>
      <RecoveryDialog open={showRecovery} onContinue={() => { setShowRecovery(false); onComplete() }} />
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

function RecoveryDialog({ open, onContinue }: { open: boolean; onContinue: () => void }) {
  const codes = ["EMBER-7K4Q", "LUMEN-9T2M", "NORTH-6D8P", "FIELD-3X7R", "ORBIT-5C2V", "STILL-8N4W"]
  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} className="max-w-[520px] rounded-[24px] border-white/10 bg-[#0d0d0f] p-7 text-white shadow-2xl">
        <DialogHeader><div className="mb-3 grid size-11 place-items-center rounded-[14px] border border-white/10 bg-white/5"><ShieldCheck className="size-5" /></div><DialogTitle className="text-2xl tracking-[-0.035em]">Сохраните коды восстановления</DialogTitle><DialogDescription className="leading-6 text-white/45">Без почты и номера телефона это единственный способ вернуть доступ, если вы потеряете пароль и активные устройства.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-2 rounded-[18px] border border-white/8 bg-black/35 p-4 font-mono text-sm text-white/72">{codes.map((code) => <span key={code} className="rounded-lg bg-white/[0.035] px-3 py-2">{code}</span>)}</div>
        <DialogFooter><Button variant="outline" className="border-white/10 bg-white/4 text-white hover:bg-white/8 hover:text-white" onClick={() => { navigator.clipboard?.writeText(codes.join("\n")); toast.success("Коды скопированы") }}>Скопировать</Button><Button className="bg-white text-black hover:bg-white/88" onClick={onContinue}>Я сохранил коды</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Messenger({ onSignOut }: { onSignOut: () => void }) {
  const [chats, setChats] = useState(chatsSeed)
  const [activeId, setActiveId] = useState(chatsSeed[0].id)
  const [draft, setDraft] = useState("")
  const [query, setQuery] = useState("")
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [videoOpen, setVideoOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const recordSecondsRef = useRef(0)
  const shouldSendVoiceRef = useRef(true)

  const activeChat = chats.find((chat) => chat.id === activeId) ?? chats[0]
  const filteredChats = chats.filter((chat) => `${chat.name} ${chat.username}`.toLowerCase().includes(query.toLowerCase()))
  const filteredPeople = query.length >= 2 ? people.filter((person) => `${person.name} ${person.username}`.toLowerCase().includes(query.toLowerCase())) : []

  const pushMessage = useCallback((message: Omit<Message, "id" | "time">) => {
    setChats((current) => current.map((chat) => chat.id === activeId ? { ...chat, messages: [...chat.messages, { ...message, id: crypto.randomUUID(), time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) }] } : chat))
  }, [activeId])

  const sendText = (event: FormEvent) => { event.preventDefault(); const body = draft.trim(); if (!body) return; pushMessage({ sender: "me", kind: "text", body }); setDraft("") }

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

  useEffect(() => () => { if (timerRef.current) window.clearInterval(timerRef.current); recorderRef.current?.stream.getTracks().forEach((track) => track.stop()) }, [])

  const startChat = (person: (typeof people)[number]) => {
    const id = person.username.slice(1)
    if (!chats.find((chat) => chat.id === id)) setChats((current) => [{ ...person, id, online: false, unread: 0, messages: [] }, ...current])
    setActiveId(id); setQuery(""); setMobileChatOpen(true)
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
          pushMessage({ sender: "me", kind: "text", body: text })
          return { status: "sent", chat: activeChat.username, text }
        },
      }, { signal: lifecycle.signal })
    }
    void register().catch(() => undefined)
    return () => lifecycle.abort()
  }, [activeChat.username, chats, pushMessage])

  return (
    <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="messenger-shell h-svh overflow-hidden bg-[#060607]">
      <TooltipProvider delayDuration={120}>
        <nav className="nav-rail">
          <Brand compact />
          <div className="mt-7 flex flex-1 flex-col items-center gap-2"><RailButton label="Чаты" active icon={MessageCircle} /><RailButton label="Люди" icon={UsersRound} /><RailButton label="Уведомления" icon={Bell} /></div>
          <RailButton label="Настройки" icon={Settings} onClick={() => setAvatarOpen(true)} /><button onClick={onSignOut} className="avatar-mini mt-3" aria-label="Выйти из аккаунта">FG</button>
        </nav>
        <aside className={mobileChatOpen ? "chat-list mobile-hidden" : "chat-list"}>
          <div className="flex items-center justify-between px-5 pb-4 pt-5"><div><p className="eyebrow">Favourite Gram</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">Сообщения</h1></div><Button size="icon" variant="outline" className="rounded-full border-white/9 bg-white/[0.025] text-white hover:bg-white/8 hover:text-white" aria-label="Новый чат"><Plus /></Button></div>
          <div className="px-4 pb-3"><div className="search-field"><Search className="size-4 text-white/30" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти по юзернейму" className="h-auto border-0 bg-transparent p-0 text-sm shadow-none placeholder:text-white/27 focus-visible:ring-0" />{query && <button onClick={() => setQuery("")} aria-label="Очистить поиск"><X className="size-4 text-white/35" /></button>}</div></div>
          <div className="scrollbar-none flex-1 overflow-y-auto px-2 pb-4">
            <AnimatePresence initial={false}>{filteredPeople.map((person) => (
              <motion.button key={person.username} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} onClick={() => startChat(person)} className="person-result"><Avatar initials={person.initials} hue={person.hue} /><span className="min-w-0 flex-1 text-left"><strong className="block truncate text-sm font-medium">{person.name}</strong><span className="mt-1 block text-xs text-white/35">{person.username}</span></span><span className="rounded-full border border-white/9 px-3 py-1.5 text-xs text-white/56">Написать</span></motion.button>
            ))}</AnimatePresence>
            {filteredChats.map((chat) => {
              const last = chat.messages.at(-1)
              return <motion.button layout key={chat.id} onClick={() => { setActiveId(chat.id); setMobileChatOpen(true) }} className={chat.id === activeId ? "chat-row chat-row-active" : "chat-row"}><div className="relative"><Avatar initials={chat.initials} hue={chat.hue} /><span className={chat.online ? "presence presence-online" : "presence"} /></div><span className="min-w-0 flex-1 text-left"><span className="flex items-center justify-between gap-2"><strong className="truncate text-[15px] font-medium">{chat.name}</strong><small className="text-[11px] text-white/25">{last?.time}</small></span><span className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-sm text-white/38">{last?.kind === "voice" ? "Голосовое сообщение" : last?.kind === "video" ? "Кружочек" : last?.body || "Сообщений пока нет"}</span>{chat.unread > 0 && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white text-[10px] font-semibold text-black">{chat.unread}</span>}</span></span></motion.button>
            })}
          </div>
        </aside>
        <section className={mobileChatOpen ? "conversation conversation-open" : "conversation"}>
          <header className="conversation-header"><Button variant="ghost" size="icon" onClick={() => setMobileChatOpen(false)} className="mobile-back rounded-full text-white hover:bg-white/7 hover:text-white" aria-label="Назад к чатам"><ArrowLeft /></Button><Avatar initials={activeChat.initials} hue={activeChat.hue} small /><div className="min-w-0 flex-1"><h2 className="truncate font-medium">{activeChat.name}</h2><p className="mt-0.5 text-xs text-white/35">{activeChat.online ? "в сети" : activeChat.username}</p></div><Button variant="ghost" size="icon" className="rounded-full text-white/60 hover:bg-white/7 hover:text-white" aria-label="Информация о чате"><Info /></Button><Button variant="ghost" size="icon" className="rounded-full text-white/60 hover:bg-white/7 hover:text-white" aria-label="Действия"><MoreHorizontal /></Button></header>
          <MessageArea chat={activeChat} />
          <div className="composer-wrap"><AnimatePresence>{recording && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="recording-bar"><span className="recording-dot" /><strong>{formatDuration(recordSeconds)}</strong><span className="text-white/38">Идёт запись</span><button onClick={() => stopVoice(false)} className="ml-auto rounded-full px-3 py-1.5 text-sm text-white/46 hover:bg-white/7 hover:text-white">Отменить</button><Button size="icon" onClick={() => stopVoice(true)} className="rounded-full bg-white text-black hover:bg-white/88"><Send /></Button></motion.div>}</AnimatePresence>
            {!recording && <form onSubmit={sendText} className="composer"><Button type="button" variant="ghost" size="icon" className="rounded-full text-white/44 hover:bg-white/7 hover:text-white" aria-label="Прикрепить файл" onClick={() => setAvatarOpen(true)}><Paperclip /></Button><Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Сообщение" className="h-auto flex-1 border-0 bg-transparent px-1 text-base shadow-none placeholder:text-white/25 focus-visible:ring-0" /><Button type="button" variant="ghost" size="icon" className="rounded-full text-white/44 hover:bg-white/7 hover:text-white" aria-label="Записать кружочек" onClick={() => setVideoOpen(true)}><Camera /></Button>{draft.trim() ? <Button size="icon" className="rounded-full bg-white text-black hover:bg-white/88" aria-label="Отправить"><Send /></Button> : <Button type="button" size="icon" className="rounded-full bg-white text-black hover:bg-white/88" aria-label="Записать голосовое" onClick={startVoice}><Mic /></Button>}</form>}
          </div>
        </section>
        <VideoRecorderDialog open={videoOpen} onOpenChange={setVideoOpen} onSend={(url, duration) => pushMessage({ sender: "me", kind: "video", mediaUrl: url, duration })} />
        <AvatarUploadDialog open={avatarOpen} onOpenChange={setAvatarOpen} />
      </TooltipProvider>
    </motion.main>
  )
}

function RailButton({ label, icon: Icon, active = false, onClick }: { label: string; icon: typeof Menu; active?: boolean; onClick?: () => void }) {
  return <Tooltip><TooltipTrigger asChild><button onClick={onClick} className={active ? "rail-button rail-button-active" : "rail-button"} aria-label={label}><Icon className="size-[19px]" /></button></TooltipTrigger><TooltipContent side="right" sideOffset={8}>{label}</TooltipContent></Tooltip>
}

function Avatar({ initials, hue, small = false }: { initials: string; hue: string; small?: boolean }) {
  return <span className={`${small ? "size-10" : "size-12"} grid shrink-0 place-items-center rounded-full bg-gradient-to-br ${hue} text-xs font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.2)]`}>{initials}</span>
}

function MessageArea({ chat }: { chat: Chat }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [chat.messages.length, chat.id])
  return <div className="message-area scrollbar-thin"><div className="mx-auto flex min-h-full w-full max-w-[820px] flex-col justify-end px-4 py-7 sm:px-7">{chat.messages.length === 0 ? <div className="m-auto flex max-w-sm flex-col items-center py-20 text-center"><div className="grid size-16 place-items-center rounded-[22px] border border-white/9 bg-white/[0.035]"><MessageCircle className="size-6 text-white/55" /></div><h3 className="mt-5 text-xl font-medium">Сообщений пока нет</h3><p className="mt-2 text-sm leading-6 text-white/38">Напишите первым — здесь появится история разговора.</p></div> : <AnimatePresence initial={false}>{chat.messages.map((message) => <MessageBubble key={message.id} message={message} avatar={chat} />)}</AnimatePresence>}<div ref={endRef} /></div></div>
}

function MessageBubble({ message, avatar }: { message: Message; avatar: Chat }) {
  const mine = message.sender === "me"
  return <motion.div initial={{ opacity: 0, x: mine ? 14 : -14, y: 5 }} animate={{ opacity: 1, x: 0, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.26, ease }} className={mine ? "message-row message-row-me" : "message-row"}>{!mine && <Avatar initials={avatar.initials} hue={avatar.hue} small />}<div className={mine ? "bubble bubble-me" : "bubble"}>{message.kind === "text" && <p>{message.body}</p>}{message.kind === "voice" && <VoiceBubble duration={message.duration ?? 1} mediaUrl={message.mediaUrl} mine={mine} />}{message.kind === "video" && <VideoCircle mediaUrl={message.mediaUrl} duration={message.duration ?? 0} />}<span className={mine ? "message-time text-black/42" : "message-time text-white/30"}>{message.time}{mine && <Check className="size-3" />}</span></div></motion.div>
}

function VoiceBubble({ duration, mediaUrl, mine }: { duration: number; mediaUrl?: string; mine: boolean }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const bars = useMemo(() => Array.from({ length: 34 }, (_, index) => 7 + ((index * 17 + duration * 3) % 22)), [duration])
  const toggle = () => {
    if (!mediaUrl) { setPlaying((value) => !value); return }
    if (!audioRef.current) { const audio = new Audio(mediaUrl); audioRef.current = audio; audio.ontimeupdate = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0); audio.onended = () => { setPlaying(false); setProgress(0) } }
    if (playing) audioRef.current.pause(); else void audioRef.current.play(); setPlaying(!playing)
  }
  return <div className="flex min-w-[236px] items-center gap-3 sm:min-w-[310px]"><button onClick={toggle} className={mine ? "voice-play voice-play-light" : "voice-play"} aria-label={playing ? "Пауза" : "Воспроизвести"}>{playing ? <Pause /> : <Play className="translate-x-px" />}</button><div className="flex h-8 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden="true">{bars.map((height, index) => <motion.span key={index} animate={playing ? { scaleY: [0.65, 1, 0.72] } : { scaleY: 1 }} transition={{ duration: 0.75, repeat: playing ? Infinity : 0, delay: index * 0.018 }} className={mine ? "w-[2px] rounded-full bg-black/75" : "w-[2px] rounded-full bg-white/78"} style={{ height, opacity: index / bars.length <= progress ? 1 : 0.62 }} />)}</div><span className={mine ? "text-sm tabular-nums text-black/72" : "text-sm tabular-nums text-white/58"}>{formatDuration(duration)}</span></div>
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

function AvatarUploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [imageUrl, setImageUrl] = useState("")
  const [scale, setScale] = useState(1)
  const fileRef = useRef<HTMLInputElement>(null)
  const choose = (file?: File) => { if (!file) return; if (!file.type.startsWith("image/")) { toast.error("Выберите изображение"); return } setImageUrl(URL.createObjectURL(file)) }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-[560px] rounded-[26px] border-white/10 bg-[#0d0d0f] p-6 text-white"><DialogHeader><DialogTitle className="text-2xl tracking-[-0.04em]">Фото профиля</DialogTitle><DialogDescription className="text-white/42">Выберите квадратную область. Фото можно заменить позже.</DialogDescription></DialogHeader><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => choose(event.target.files?.[0])} /><div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files?.[0]) }} className="upload-panel"><div className="upload-circle">{imageUrl ? <img src={imageUrl} alt="Предпросмотр" className="h-full w-full object-cover" style={{ transform: `scale(${scale})` }} /> : <div className="flex h-full flex-col items-center justify-center gap-3 text-center"><span className="grid size-12 place-items-center rounded-full border border-dashed border-white/20"><ImagePlus className="size-5 text-white/55" /></span><p className="text-sm text-white/52">Перетащите изображение</p></div>}</div><p className="mt-5 text-center text-sm text-white/36">PNG, JPG или WebP</p><Button variant="outline" className="mt-4 rounded-xl border-white/10 bg-black/25 text-white hover:bg-white/8 hover:text-white" onClick={() => fileRef.current?.click()}>Выбрать файл</Button></div>{imageUrl && <label className="flex items-center gap-4 text-sm text-white/45"><span>Масштаб</span><input type="range" min="1" max="2" step="0.01" value={scale} onChange={(event) => setScale(Number(event.target.value))} className="accent-white flex-1" /></label>}<DialogFooter><Button variant="outline" className="border-white/10 bg-white/4 text-white hover:bg-white/8 hover:text-white" onClick={() => onOpenChange(false)}>Отмена</Button><Button className="bg-white text-black hover:bg-white/88" onClick={() => { onOpenChange(false); toast.success("Фото сохранено") }} disabled={!imageUrl}>Сохранить</Button></DialogFooter></DialogContent></Dialog>
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${minutes}:${String(rest).padStart(2, "0")}`
}

import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { chromium } from "playwright"

const port = 36000 + (process.pid % 1000)
const baseURL = `http://127.0.0.1:${port}`
let dataDir
let server
let browser

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`${baseURL}/api/health`)).ok) return } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error("E2E server did not start")
}

async function register(page, username, password) {
  await page.goto(baseURL)
  await page.getByRole("button", { name: "Создать аккаунт", exact: true }).first().click()
  await page.getByLabel("Юзернейм", { exact: true }).fill(username)
  await page.getByLabel("Пароль", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Создать аккаунт", exact: true }).click()
  await page.getByRole("button", { name: "Я сохранил коды" }).click()
  await page.getByRole("heading", { name: "Сообщения" }).waitFor()
}

async function login(page, username, password) {
  await page.goto(baseURL)
  await page.getByRole("button", { name: "Войти", exact: true }).click()
  await page.getByLabel("Юзернейм", { exact: true }).fill(username)
  await page.getByLabel("Пароль", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Войти", exact: true }).click()
  await page.getByRole("heading", { name: "Сообщения" }).waitFor()
}

test.before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "favourite-gram-e2e-"))
  server = spawn(process.execPath, ["server/index.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATA_DIR: dataDir, PUBLIC_DIR: "out", NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  await waitForServer()
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined })
})

test.after(async () => {
  await browser?.close()
  if (server?.exitCode === null) {
    await new Promise((resolve) => { server.once("exit", resolve); server.kill("SIGTERM") })
  }
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
})

test("desktop messaging actions, realtime sync, settings and mobile navigation", async () => {
  const aliceContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const bobContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const alice = await aliceContext.newPage()
  const bob = await bobContext.newPage()
  const pageErrors = []
  alice.on("pageerror", (error) => pageErrors.push(error.message))
  bob.on("pageerror", (error) => pageErrors.push(error.message))

  await register(alice, "e2e_alice", "alice-pass")
  await register(bob, "e2e_bob", "bob-pass")

  await alice.getByPlaceholder("Найти по юзернейму").fill("e2e_bob")
  await alice.getByText("@e2e_bob", { exact: true }).waitFor()
  await alice.getByRole("button", { name: /e2e_bob/ }).click()
  await alice.getByPlaceholder("Сообщение").fill("Привет из E2E")
  await alice.getByPlaceholder("Сообщение").press("Enter")
  await bob.getByText("Привет из E2E", { exact: true }).waitFor()

  const incoming = bob.locator(".message-row").filter({ hasText: "Привет из E2E" })
  await incoming.getByRole("button", { name: "Действия с сообщением" }).click()
  await bob.getByRole("menuitem", { name: "Ответить" }).click()
  await bob.getByPlaceholder("Сообщение").fill("Ответ получен")
  await bob.getByPlaceholder("Сообщение").press("Enter")
  await alice.getByText("Ответ получен", { exact: true }).waitFor()
  assert.match(await alice.locator(".reply-preview").last().innerText(), /e2e_alice/i)

  const reply = bob.locator(".message-row").filter({ hasText: "Ответ получен" })
  await reply.getByRole("button", { name: "Действия с сообщением" }).click()
  await bob.getByRole("menuitem", { name: "Изменить" }).click()
  await bob.getByPlaceholder("Изменить сообщение").fill("Ответ отредактирован")
  await bob.getByPlaceholder("Изменить сообщение").press("Enter")
  await alice.getByText("Ответ отредактирован", { exact: true }).waitFor()

  await incoming.getByRole("button", { name: "Действия с сообщением" }).click()
  await bob.getByRole("button", { name: "🔥" }).click()
  await alice.locator(".reaction-chip").filter({ hasText: "🔥" }).waitFor()

  const editedReply = bob.locator(".message-row").filter({ hasText: "Ответ отредактирован" })
  await editedReply.getByRole("button", { name: "Действия с сообщением" }).click()
  await bob.getByRole("menuitem", { name: "Удалить" }).click()
  await alice.getByText("Сообщение удалено", { exact: true }).waitFor()

  await alice.getByRole("button", { name: "Настройки" }).click()
  await alice.getByRole("button", { name: "Безопасность и устройства" }).click()
  await alice.getByRole("tab", { name: "Устройства" }).click()
  await alice.getByText("Это устройство", { exact: true }).waitFor()

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mobile = await mobileContext.newPage()
  await login(mobile, "e2e_alice", "alice-pass")
  assert.equal(await mobile.locator(".nav-rail").evaluate((element) => getComputedStyle(element).display), "none")
  await mobile.getByRole("button", { name: /e2e_bob/ }).click()
  assert.equal(await mobile.locator(".conversation").evaluate((element) => getComputedStyle(element).display), "flex")
  await mobile.getByRole("button", { name: "Назад к чатам" }).click()
  assert.equal(await mobile.locator(".chat-list").evaluate((element) => getComputedStyle(element).display), "flex")

  assert.deepEqual(pageErrors, [])
  await mobileContext.close()
  await aliceContext.close()
  await bobContext.close()
})

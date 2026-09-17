import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Favourite Gram — свои люди ближе",
  description: "Личные чаты, голосовые сообщения и кружочки прямо в браузере.",
  icons: {
    icon: "/favourite-gram-icon.png",
    shortcut: "/favourite-gram-icon.png",
    apple: "/favourite-gram-icon.png",
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  )
}

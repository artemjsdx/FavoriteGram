import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Favourite Gram — свои люди ближе",
  description: "Личные чаты, голосовые сообщения и кружочки прямо в браузере.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "FavouriteGram" },
  icons: {
    icon: "/favourite-gram-icon.png",
    shortcut: "/favourite-gram-icon.png",
    apple: "/favourite-gram-icon.png",
  },
}

export const viewport: Viewport = {
  themeColor: "#050506",
  colorScheme: "dark",
  viewportFit: "cover",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  )
}

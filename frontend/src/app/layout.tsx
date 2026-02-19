import type { Metadata } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import "./globals.css"
import { Navbar } from "@/components/layout/navbar"
import { Footer } from "@/components/layout/footer"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
})

export const metadata: Metadata = {
  metadataBase: new URL("https://scribely.app"),
  title: {
    default: "Scribely Your Invisible AI Meeting Assistant",
    template: "%s | Scribely",
  },
  description:
    "Live transcription, AI-powered Q&A, and real-time insights — all running locally on your Mac. Invisible to screen sharing.",
  openGraph: {
    title: "Scribely Your Invisible AI Meeting Assistant",
    description:
      "Live transcription, AI-powered Q&A, and real-time insights — all running locally on your Mac.",
    siteName: "Scribely",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Scribely Your Invisible AI Meeting Assistant",
    description:
      "Live transcription, AI-powered Q&A, and real-time insights — all running locally on your Mac.",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} font-sans bg-background text-foreground`}
      >
        <Navbar />
        <main className="min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  )
}

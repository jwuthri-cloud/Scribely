import type { Metadata } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import "./globals.css"
import { MarketingShell } from "@/components/layout/marketing-shell"

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
    "Live transcription, AI-powered Q&A, and real-time insights — use OpenAI and Deepgram out of the box, or run fully local. Invisible to screen sharing.",
  openGraph: {
    title: "Scribely Your Invisible AI Meeting Assistant",
    description:
      "Live transcription, AI-powered Q&A, and real-time insights — cloud or fully local. Invisible to screen sharing.",
    siteName: "Scribely",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Scribely Your Invisible AI Meeting Assistant",
    description:
      "Live transcription, AI-powered Q&A, and real-time insights — cloud or fully local. Invisible to screen sharing.",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "hsl(263 70% 58%)",
          colorBackground: "hsl(240 10% 6%)",
          colorInputBackground: "hsl(240 5% 15%)",
          colorInputText: "hsl(0 0% 98%)",
        },
      }}
    >
      <html lang="en" className="dark">
        <body
          className={`${inter.variable} ${spaceGrotesk.variable} font-sans bg-background text-foreground`}
        >
          <MarketingShell>{children}</MarketingShell>
        </body>
      </html>
    </ClerkProvider>
  )
}

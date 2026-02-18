import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "About",
  description:
    "Scribely is an invisible AI meeting assistant for macOS. Learn about our vision, how it works, and who it's built for.",
}

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}

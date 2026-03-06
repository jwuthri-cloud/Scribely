import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Insights, updates, and tips from the Scribely team. Learn about AI meeting assistants, privacy, and productivity.",
}

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}

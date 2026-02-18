import type { Metadata } from "next"
import { DownloadCards, QuickStart } from "@/components/download/download-cards"

export const metadata: Metadata = {
  title: "Download",
  description:
    "Download Scribely for macOS and the Chrome extension. Free live transcription and AI meeting assistance.",
}

export default function DownloadPage() {
  return (
    <div className="pt-32 pb-16">
      {/* Header */}
      <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center mb-16">
        <h1 className="text-4xl sm:text-5xl font-display font-bold text-white mb-4">
          Download Scribely
        </h1>
        <p className="text-lg text-white/40 max-w-xl mx-auto">
          Get started in under a minute. Free forever for core features.
        </p>
      </div>

      {/* Download cards */}
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <DownloadCards />
        <QuickStart />
      </div>
    </div>
  )
}

import type { Metadata } from "next"
import { SetupGuide } from "@/components/setup/setup-guide"

export const metadata: Metadata = {
  title: "Setup Guide",
  description:
    "Set up a local AI provider for Scribely. Install Ollama or LM Studio and download a small language model in minutes.",
}

export default function SetupPage() {
  return (
    <div className="pt-32 pb-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center mb-16">
        <h1 className="text-4xl sm:text-5xl font-display font-bold text-white mb-4">
          Set Up Your Local AI
        </h1>
        <p className="text-lg text-white/40 max-w-2xl mx-auto">
          Scribely works with a local language model for private, free AI
          assistance. Pick a provider, download a model, and you&apos;re ready
          to go.
        </p>
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SetupGuide />
      </div>
    </div>
  )
}

import type { Metadata } from "next"
import { PricingCards } from "@/components/pricing/pricing-cards"
import { FeatureTable } from "@/components/pricing/feature-table"
import { FAQ } from "@/components/landing/faq"

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Scribely is free to use. Get live transcription, AI chat, and real-time insights at no cost. Upgrade to Pro for post-meeting optimization.",
}

export default function PricingPage() {
  return (
    <div className="pt-32 pb-16">
      {/* Header */}
      <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center mb-16">
        <h1 className="text-4xl sm:text-5xl font-display font-bold text-white mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-white/40 max-w-xl mx-auto">
          Start free with full meeting assistance. Upgrade when you need
          post-meeting superpowers.
        </p>
      </div>

      {/* Pricing cards */}
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <PricingCards />
        <FeatureTable />
      </div>

      {/* FAQ */}
      <FAQ />
    </div>
  )
}

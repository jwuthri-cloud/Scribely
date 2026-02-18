"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Check, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Everything you need for live meeting assistance.",
    features: [
      "macOS desktop app",
      "Chrome extension",
      "Live transcription (Whisper)",
      "AI chat during meetings",
      "Real-time insight detection",
      "Screen-share invisibility",
      "100% local audio processing",
      "Unlimited meetings",
    ],
    cta: "Download Free",
    ctaHref: "/download",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$12",
    period: "/month",
    description: "Post-meeting optimization for power users.",
    badge: "Coming Soon",
    features: [
      "Everything in Free",
      "Post-meeting summaries",
      "Action item extraction",
      "Meeting analytics",
      "Enhanced transcript editing",
      "Export to Notion, Docs, Slack",
      "Meeting search & history",
      "Priority support",
    ],
    cta: "Join Waitlist",
    ctaHref: "#",
    highlighted: true,
  },
]

export function PricingCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
      {tiers.map((tier, i) => (
        <motion.div
          key={tier.name}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: i * 0.1 }}
          className={`relative rounded-xl p-8 ${
            tier.highlighted
              ? "glass border-purple-500/20 glow-sm"
              : "glass"
          }`}
        >
          {tier.highlighted && (
            <div className="absolute -inset-px rounded-xl bg-gradient-to-b from-purple-500/20 to-transparent -z-10" />
          )}

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">{tier.name}</h3>
            {tier.badge && <Badge>{tier.badge}</Badge>}
          </div>

          <div className="mb-2">
            <span className="text-4xl font-display font-bold text-white">
              {tier.price}
            </span>
            <span className="text-white/40 ml-1">{tier.period}</span>
          </div>

          <p className="text-sm text-white/40 mb-8">{tier.description}</p>

          <Button
            className="w-full mb-8"
            variant={tier.highlighted ? "default" : "secondary"}
            size="lg"
            asChild
          >
            <Link href={tier.ctaHref}>
              {tier.highlighted && <Sparkles className="mr-2 h-4 w-4" />}
              {tier.cta}
            </Link>
          </Button>

          <ul className="space-y-3">
            {tier.features.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <Check className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
                <span className="text-sm text-white/60">{feature}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      ))}
    </div>
  )
}

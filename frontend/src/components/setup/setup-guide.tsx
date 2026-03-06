"use client"

import { motion } from "framer-motion"
import {
  Terminal,
  Download,
  Cpu,
  Zap,
  ArrowRight,
  ExternalLink,
  Check,
  Sparkles,
  HardDrive,
  MonitorSmartphone,
} from "lucide-react"
import { Button } from "@/components/ui/button"

const recommendedModels = [
  {
    name: "Qwen 3 1.7B",
    size: "~1.1 GB",
    ollamaCmd: "ollama pull qwen3:1.7b",
    lmStudioSearch: "Qwen3-1.7B-Instruct",
    badge: "Recommended",
    description:
      "Best balance of speed and quality at this size. Excellent for meeting Q&A and summarization.",
  },
  {
    name: "Gemma 3 1B",
    size: "~0.8 GB",
    ollamaCmd: "ollama pull gemma3:1b",
    lmStudioSearch: "gemma-3-1b-it",
    badge: "Lightweight",
    description:
      "Google's compact model. Fastest option, great if you want minimal resource usage.",
  },
  {
    name: "Llama 3.2 3B",
    size: "~2.0 GB",
    ollamaCmd: "ollama pull llama3.2:3b",
    lmStudioSearch: "Llama-3.2-3B-Instruct",
    badge: "Higher quality",
    description:
      "Slightly larger but noticeably smarter. Good if your Mac has 16 GB+ RAM.",
  },
]

function ProviderCard({
  title,
  icon: Icon,
  iconColor,
  gradientFrom,
  gradientTo,
  borderColor,
  description,
  href,
  buttonLabel,
  steps,
  delay,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  gradientFrom: string
  gradientTo: string
  borderColor: string
  description: string
  href: string
  buttonLabel: string
  steps: { title: string; detail: string }[]
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className="relative rounded-xl glass p-8"
    >
      <div
        className={`absolute -inset-px rounded-xl bg-gradient-to-b ${gradientFrom} to-transparent -z-10`}
      />

      <div
        className={`mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${gradientFrom} ${gradientTo} border ${borderColor}`}
      >
        <Icon className={`h-7 w-7 ${iconColor}`} />
      </div>

      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-white/40 mb-6">{description}</p>

      <Button className="w-full mb-8" size="lg" asChild>
        <a href={href} target="_blank" rel="noopener noreferrer">
          <Download className="mr-2 h-4 w-4" />
          {buttonLabel}
          <ExternalLink className="ml-2 h-4 w-4" />
        </a>
      </Button>

      <div className="space-y-4">
        <h4 className="text-xs font-medium text-white/30 uppercase tracking-wider">
          How to get started
        </h4>
        {steps.map((step, i) => (
          <div key={i} className="flex gap-3">
            <div className="shrink-0 mt-0.5 h-6 w-6 rounded-full bg-purple-500/20 border border-purple-500/20 flex items-center justify-center">
              <span className="text-xs font-bold text-purple-400">{i + 1}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-white">{step.title}</p>
              <p className="text-sm text-white/40">{step.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

function ModelCard({
  model,
  index,
}: {
  model: (typeof recommendedModels)[number]
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="relative rounded-xl glass p-6 glass-hover"
    >
      {model.badge && (
        <span className="absolute top-4 right-4 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/20">
          {model.badge}
        </span>
      )}

      <h4 className="text-lg font-semibold text-white mb-1">{model.name}</h4>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs text-white/30 flex items-center gap-1">
          <HardDrive className="h-3 w-3" />
          {model.size}
        </span>
      </div>
      <p className="text-sm text-white/40 mb-5">{model.description}</p>

      <div className="space-y-3">
        <div>
          <p className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-1.5">
            Ollama
          </p>
          <code className="block text-xs bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-purple-300 font-mono">
            {model.ollamaCmd}
          </code>
        </div>
        <div>
          <p className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-1.5">
            LM Studio
          </p>
          <p className="text-xs text-white/40">
            Search for{" "}
            <span className="text-purple-300 font-mono">
              {model.lmStudioSearch}
            </span>{" "}
            in the Discover tab
          </p>
        </div>
      </div>
    </motion.div>
  )
}

export function SetupGuide() {
  return (
    <div className="space-y-24">
      {/* Step 1 — Pick a provider */}
      <section>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="flex items-center gap-3 mb-8"
        >
          <div className="h-10 w-10 rounded-full bg-purple-500/20 border border-purple-500/20 flex items-center justify-center">
            <span className="text-sm font-bold text-purple-400">1</span>
          </div>
          <h2 className="text-2xl font-display font-bold text-white">
            Pick a local AI provider
          </h2>
        </motion.div>

        <p className="text-sm text-white/40 max-w-2xl mb-8">
          Both options are free and run entirely on your Mac. Your data never
          leaves your machine. Pick whichever you prefer — they both work great
          with Scribely.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
          <ProviderCard
            title="Ollama"
            icon={Terminal}
            iconColor="text-green-400"
            gradientFrom="from-green-500/10"
            gradientTo="to-emerald-500/20"
            borderColor="border-green-500/10"
            description="Command-line tool that makes running local models dead simple. Download, run one command, done."
            href="https://ollama.com/download/mac"
            buttonLabel="Download Ollama"
            delay={0}
            steps={[
              {
                title: "Install the app",
                detail:
                  "Download from ollama.com, open the .dmg, and drag Ollama to Applications. Launch it once — it runs in the menu bar.",
              },
              {
                title: "Pull a model",
                detail:
                  "Open Terminal and run: ollama pull qwen3:1.7b — the model downloads automatically (~1 GB).",
              },
              {
                title: "That's it",
                detail:
                  "Ollama runs a local server on port 11434. Scribely detects it automatically — no configuration needed.",
              },
            ]}
          />

          <ProviderCard
            title="LM Studio"
            icon={MonitorSmartphone}
            iconColor="text-blue-400"
            gradientFrom="from-blue-500/10"
            gradientTo="to-cyan-500/20"
            borderColor="border-blue-500/10"
            description="Beautiful desktop app with a visual interface for browsing, downloading, and running local models."
            href="https://lmstudio.ai/"
            buttonLabel="Download LM Studio"
            delay={0.1}
            steps={[
              {
                title: "Install the app",
                detail:
                  "Download from lmstudio.ai, open the .dmg, and drag LM Studio to Applications.",
              },
              {
                title: "Download a model",
                detail:
                  'Open LM Studio, go to the Discover tab (magnifying glass icon), search for "Qwen3 1.7B Instruct", and click Download.',
              },
              {
                title: "Start the server",
                detail:
                  'Go to the Developer tab (</> icon), and click "Start Server". Scribely connects automatically.',
              },
            ]}
          />
        </div>
      </section>

      {/* Step 2 — Choose a model */}
      <section>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="flex items-center gap-3 mb-8"
        >
          <div className="h-10 w-10 rounded-full bg-purple-500/20 border border-purple-500/20 flex items-center justify-center">
            <span className="text-sm font-bold text-purple-400">2</span>
          </div>
          <h2 className="text-2xl font-display font-bold text-white">
            Choose a model
          </h2>
        </motion.div>

        <p className="text-sm text-white/40 max-w-2xl mb-4">
          For real-time meeting assistance, you want a small, fast model.
          Anything under 3B parameters runs smoothly alongside your meeting
          without hogging resources. We recommend 1.5B-class models for the best
          speed-to-quality ratio.
        </p>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="flex items-start gap-3 rounded-xl bg-purple-500/[0.06] border border-purple-500/10 p-4 max-w-2xl mb-8"
        >
          <Sparkles className="h-5 w-5 text-purple-400 shrink-0 mt-0.5" />
          <div className="text-sm text-white/50">
            <span className="text-white font-medium">Why small models?</span>{" "}
            Scribely runs the model continuously during meetings. A 1.5B model
            responds in under a second on Apple Silicon while using minimal RAM.
            Larger models (7B+) are smarter but can cause lag and drain your
            battery.
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl">
          {recommendedModels.map((model, i) => (
            <ModelCard key={model.name} model={model} index={i} />
          ))}
        </div>
      </section>

      {/* Step 3 — Connect to Scribely */}
      <section>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="flex items-center gap-3 mb-8"
        >
          <div className="h-10 w-10 rounded-full bg-purple-500/20 border border-purple-500/20 flex items-center justify-center">
            <span className="text-sm font-bold text-purple-400">3</span>
          </div>
          <h2 className="text-2xl font-display font-bold text-white">
            Connect to Scribely
          </h2>
        </motion.div>

        <div className="max-w-2xl space-y-4">
          {[
            {
              icon: Zap,
              title: "Open Scribely and go to Settings → LLM",
              detail:
                'Select "Ollama" or "LM Studio" as your provider. Scribely auto-detects the local server.',
            },
            {
              icon: Cpu,
              title: "Pick your downloaded model",
              detail:
                "The model you pulled or downloaded will appear in the model dropdown. Select it.",
            },
            {
              icon: Check,
              title: "You're all set",
              detail:
                "Start a meeting and ask questions — everything runs locally, privately, and for free.",
            },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="flex gap-4 rounded-xl glass p-5"
            >
              <div className="shrink-0 h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/10 flex items-center justify-center">
                <item.icon className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white mb-1">
                  {item.title}
                </h4>
                <p className="text-sm text-white/40">{item.detail}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
      >
        <p className="text-sm text-white/30 mb-4">
          Don&apos;t have Scribely yet?
        </p>
        <Button size="lg" asChild>
          <a href="/download">
            Download Scribely
            <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </motion.div>
    </div>
  )
}

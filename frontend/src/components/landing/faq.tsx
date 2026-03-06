"use client"

import { motion } from "framer-motion"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const faqs = [
  {
    question: "Do I need to install anything to get started?",
    answer:
      "No. Download Scribely, add your OpenAI API key (and optionally Deepgram for transcription), and you're ready. Cloud providers work immediately — no Ollama, LM Studio, or model downloads required. Use local options only if you prefer fully offline, private AI.",
  },
  {
    question: "Is Scribely really invisible to screen sharing?",
    answer:
      "Yes. Scribely uses native macOS APIs to hide itself from all screen capture and recording tools. When you share your screen on Zoom, Meet, or Teams, Scribely is completely invisible to other participants.",
  },
  {
    question: "Does my audio data leave my computer?",
    answer:
      "It depends on your setup. With cloud providers (Deepgram, Rev.ai for transcription; OpenAI for chat), audio/transcript is sent to their APIs. With local options (Whisper for transcription; Ollama or LM Studio for chat), nothing leaves your Mac. You choose — cloud for zero setup, or fully local for maximum privacy.",
  },
  {
    question: "Which meeting platforms are supported?",
    answer:
      "Scribely works with any meeting platform — Google Meet, Zoom, Microsoft Teams, Webex, and more. The Chrome extension captures audio from browser-based meetings, while the desktop app can also capture system audio directly.",
  },
  {
    question: "Do I need the Chrome extension?",
    answer:
      "The Chrome extension is optional but recommended for browser-based meetings. It provides the highest quality audio capture. Without it, Scribely can still capture system audio using native macOS audio capture.",
  },
  {
    question: "What Mac do I need?",
    answer:
      "Scribely requires macOS 13 (Ventura) or later. It runs on both Intel and Apple Silicon Macs, though Apple Silicon (M1/M2/M3/M4) provides significantly faster transcription performance.",
  },
  {
    question: "Is Scribely free?",
    answer:
      "Yes. The app is free to download. Use OpenAI and Deepgram with your own API keys (pay-as-you-go) — no installation, works immediately. Or use Ollama or LM Studio for fully local, free AI — no API keys needed. We offer a paid tier for post-meeting optimization features like enhanced summaries and action item extraction.",
  },
  {
    question: "How do I set up Ollama or LM Studio for local AI?",
    answer:
      "For Ollama: Install from ollama.com, then in Terminal run 'ollama pull qwen3:1.7b'. For LM Studio: Install from lmstudio.ai, search for 'Qwen3 1.7B' in Discover, download and load it, then start the local server. In Scribely, go to Settings → LLM tab, select Ollama or LM Studio, and click Refresh to see your models. We recommend Qwen3 1.7B (best under 2B params); alternatives: qwen3:0.6b (lightweight) or qwen3:4b (higher quality).",
  },
  {
    question: "How accurate is the transcription?",
    answer:
      "Choose local Whisper (Fast, Balanced, or Accurate) or cloud providers like Deepgram and Rev.ai. Local Whisper offers three quality levels; cloud providers typically offer higher accuracy with lower latency. Pick what fits your needs.",
  },
  {
    question: "Can I use Scribely for in-person meetings?",
    answer:
      "Yes! You can use your Mac's microphone to capture in-person meeting audio. Scribely will transcribe everything it hears through the microphone.",
  },
]

export function FAQ() {
  return (
    <section id="faq" className="relative py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-white mb-4">
            Frequently asked questions
          </h2>
          <p className="text-lg text-white/40">
            Everything you need to know about Scribely.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger>{faq.question}</AccordionTrigger>
                <AccordionContent>{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  )
}

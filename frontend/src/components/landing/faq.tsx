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
    question: "Is Scribely really invisible to screen sharing?",
    answer:
      "Yes. Scribely uses native macOS APIs to hide itself from all screen capture and recording tools. When you share your screen on Zoom, Meet, or Teams, Scribely is completely invisible to other participants.",
  },
  {
    question: "Does my audio data leave my computer?",
    answer:
      "No. All audio processing and transcription happens locally on your Mac using on-device AI models (Whisper). No audio data is ever sent to external servers. For AI chat, you can use Ollama or LM Studio for fully local, free AI — nothing leaves your Mac. Or optionally use OpenAI for cloud-powered chat (sends text only, not audio).",
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
      "Yes. With Ollama or LM Studio, the core features — live transcription, AI chat, and real-time insights — are completely free and fully local. No API keys required. You can also use OpenAI for AI chat if you prefer. We offer a paid tier for post-meeting optimization features like enhanced summaries and action item extraction.",
  },
  {
    question: "How do I set up Ollama or LM Studio for local AI?",
    answer:
      "For Ollama: Install from ollama.com, then in Terminal run 'ollama pull qwen3:1.7b'. For LM Studio: Install from lmstudio.ai, search for 'Qwen3 1.7B' in Discover, download and load it, then start the local server. In Scribely, go to Settings → LLM tab, select Ollama or LM Studio, and click Refresh to see your models. We recommend Qwen3 1.7B (best under 2B params); alternatives: qwen3:0.6b (lightweight) or qwen3:4b (higher quality).",
  },
  {
    question: "How accurate is the transcription?",
    answer:
      "Scribely uses OpenAI's Whisper models running locally. You can choose between three quality levels: Fast (small model), Balanced (medium model), and Accurate (large model). The large model provides near-human accuracy for English.",
  },
  {
    question: "Can I use Scribely for in-person meetings?",
    answer:
      "Yes! You can use your Mac's microphone to capture in-person meeting audio. Scribely will transcribe everything it hears through the microphone.",
  },
]

export function FAQ() {
  return (
    <section id="faq" className="relative py-32">
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

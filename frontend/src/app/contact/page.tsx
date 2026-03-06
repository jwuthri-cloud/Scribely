"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Mail, MessageSquare, Send, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function ContactPage() {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [formData, setFormData] = useState({ name: "", email: "", subject: "", message: "" })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus("submitting")

    try {
      // Placeholder: replace with your API route or Formspree/Resend integration
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        setStatus("success")
        setFormData({ name: "", email: "", subject: "", message: "" })
      } else {
        setStatus("error")
      }
    } catch {
      setStatus("error")
    }
  }

  const inputClass =
    "w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-white placeholder:text-white/30 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition-colors"

  return (
    <div className="pt-32 pb-16">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl sm:text-5xl font-display font-bold text-white mb-4">
            Get in touch
          </h1>
          <p className="text-lg text-white/40 max-w-xl mx-auto">
            Have a question, feedback, or partnership idea? We&apos;d love to hear from you.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="rounded-2xl glass p-8 sm:p-10"
        >
          {status === "success" ? (
            <div className="text-center py-12">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 mb-6">
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
              <h2 className="text-2xl font-display font-bold text-white mb-2">
                Message sent!
              </h2>
              <p className="text-white/50 mb-8">
                Thanks for reaching out. We&apos;ll get back to you shortly.
              </p>
              <Button variant="secondary" onClick={() => setStatus("idle")}>
                Send another message
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-white/60 mb-2">
                    Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    className={inputClass}
                    placeholder="Your name"
                    value={formData.name}
                    onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-white/60 mb-2">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    className={inputClass}
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData((d) => ({ ...d, email: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-white/60 mb-2">
                  Subject
                </label>
                <input
                  id="subject"
                  type="text"
                  required
                  className={inputClass}
                  placeholder="What's this about?"
                  value={formData.subject}
                  onChange={(e) => setFormData((d) => ({ ...d, subject: e.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium text-white/60 mb-2">
                  Message
                </label>
                <textarea
                  id="message"
                  required
                  rows={5}
                  className={`${inputClass} resize-none`}
                  placeholder="Tell us what's on your mind..."
                  value={formData.message}
                  onChange={(e) => setFormData((d) => ({ ...d, message: e.target.value }))}
                />
              </div>

              {status === "error" && (
                <p className="text-sm text-red-400">
                  Something went wrong. Please try again or{" "}
                  <a
                    href={`mailto:hello@scribely.xyz?subject=${encodeURIComponent(formData.subject)}&body=${encodeURIComponent(
                      `From: ${formData.name} <${formData.email}>\n\n${formData.message}`
                    )}`}
                    className="underline hover:text-red-300"
                  >
                    email us directly
                  </a>
                  .
                </p>
              )}

              <Button
                type="submit"
                size="lg"
                className="w-full sm:w-auto"
                disabled={status === "submitting"}
              >
                {status === "submitting" ? (
                  "Sending..."
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send message
                  </>
                )}
              </Button>
            </form>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-6 text-white/40"
        >
          <a
            href="mailto:hello@scribely.xyz"
            className="flex items-center gap-2 hover:text-white transition-colors"
          >
            <Mail className="h-4 w-4" />
            hello@scribely.xyz
          </a>
          <span className="hidden sm:inline text-white/20">|</span>
          <Link href="/" className="flex items-center gap-2 hover:text-white transition-colors">
            <MessageSquare className="h-4 w-4" />
            Back to home
          </Link>
        </motion.div>
      </div>
    </div>
  )
}

"use client"

import { motion } from "framer-motion"
import { Quote } from "lucide-react"

const testimonials = [
  {
    quote:
      "Scribely changed how I handle meetings. I no longer scramble to take notes — I just focus on the conversation and let the AI handle the rest.",
    name: "Sarah Chen",
    role: "Product Manager",
    company: "TechCorp",
  },
  {
    quote:
      "The fact that it's invisible to screen sharing is a game-changer. I can get AI assistance during client calls without anyone knowing.",
    name: "Marcus Johnson",
    role: "Sales Director",
    company: "GrowthCo",
  },
  {
    quote:
      "Privacy was my biggest concern with meeting AI tools. I didn't want our conversations going to the cloud. Scribely runs 100% locally. Love it.",
    name: "Emily Park",
    role: "Engineering Lead",
    company: "SecureStack",
  },
]

export function Testimonials() {
  return (
    <section className="relative py-16 sm:py-20">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[300px] bg-indigo-600/[0.05] rounded-full blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-white mb-4">
            Loved by professionals
          </h2>
          <p className="text-lg text-white/40 max-w-xl mx-auto">
            Teams across industries trust Scribely to make their meetings more
            productive.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, i) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative rounded-xl glass p-6"
            >
              <Quote className="h-8 w-8 text-purple-500/20 mb-4" />
              <p className="text-sm text-white/60 leading-relaxed mb-6">
                &ldquo;{testimonial.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500/30 to-indigo-500/30 border border-white/[0.06] flex items-center justify-center">
                  <span className="text-xs font-semibold text-white/70">
                    {testimonial.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-white/80">
                    {testimonial.name}
                  </p>
                  <p className="text-xs text-white/40">
                    {testimonial.role}, {testimonial.company}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

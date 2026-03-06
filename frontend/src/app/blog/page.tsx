"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Chrome,
  GitCompareArrows,
  Shield,
  Sparkles,
} from "lucide-react"
import { blogPosts } from "@/lib/blog-posts"
import { Badge } from "@/components/ui/badge"

const categoryConfig = {
  Comparison: {
    icon: GitCompareArrows,
    accent: "from-purple-500/20 via-indigo-500/10 to-cyan-400/10",
    iconClassName: "text-purple-300",
  },
  Guide: {
    icon: BookOpen,
    accent: "from-cyan-500/20 via-blue-500/10 to-transparent",
    iconClassName: "text-cyan-300",
  },
  Privacy: {
    icon: Shield,
    accent: "from-emerald-500/20 via-teal-500/10 to-transparent",
    iconClassName: "text-emerald-300",
  },
  Product: {
    icon: Sparkles,
    accent: "from-fuchsia-500/20 via-purple-500/10 to-transparent",
    iconClassName: "text-fuchsia-300",
  },
} as const

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

export default function BlogPage() {
  const featuredPost = blogPosts.find((post) => post.featured) ?? blogPosts[0]
  const otherPosts = blogPosts.filter((post) => post.slug !== featuredPost.slug)
  const featuredCategory = categoryConfig[featuredPost.category]
  const FeaturedIcon = featuredCategory.icon

  return (
    <div className="relative overflow-hidden pt-32 pb-20">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-purple-600/10 blur-[150px]" />
        <div className="absolute left-[12%] top-72 h-[260px] w-[280px] rounded-full bg-indigo-500/10 blur-[120px] animate-glow-pulse" />
        <div className="absolute right-[8%] top-[28rem] h-[320px] w-[340px] rounded-full bg-cyan-500/10 blur-[130px] animate-glow-pulse [animation-delay:1.4s]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="mb-14"
        >
          <Badge className="mb-5">Fresh from Scribely</Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-white mb-5">
            Better meetings start{" "}
            <span className="text-gradient">before the recap</span>
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-white/50">
            Guides, comparisons, and product thinking for people who want faster
            answers, cleaner follow-up, and more private AI workflows during
            real conversations.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-2xl font-display font-bold text-white">
                {blogPosts.length}
              </div>
              <p className="mt-1 text-sm text-white/45">New guides and product deep-dives</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 text-white">
                <Chrome className="h-4 w-4 text-cyan-300" />
                Browser + desktop
              </div>
              <p className="mt-1 text-sm text-white/45">
                Practical setup help for real meeting workflows
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 text-white">
                <Shield className="h-4 w-4 text-emerald-300" />
                Cloud or local
              </div>
              <p className="mt-1 text-sm text-white/45">
                Advice that accounts for privacy, cost, and speed
              </p>
            </div>
          </div>
        </motion.div>

        <motion.article
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.08 }}
          className="mb-8"
        >
          <Link
            href={`/blog/${featuredPost.slug}`}
            className="group block overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-1 shadow-[0_0_80px_-45px_rgba(168,85,247,0.8)]"
          >
            <div className="relative overflow-hidden rounded-[calc(2rem-1px)] bg-background/90 p-8 sm:p-10">
              <div
                className={`absolute inset-0 bg-gradient-to-br ${featuredCategory.accent} opacity-70 transition-opacity duration-500 group-hover:opacity-100`}
              />
              <div className="relative grid gap-8 lg:grid-cols-[1.35fr_0.9fr]">
                <div>
                  <div className="mb-5 flex flex-wrap items-center gap-3">
                    <Badge className="bg-white/[0.08] text-white/90">
                      Featured
                    </Badge>
                    <Badge variant="secondary">{featuredPost.category}</Badge>
                  </div>

                  <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-white/40">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(featuredPost.date)}
                    </span>
                    <span>•</span>
                    <span>{featuredPost.readTime}</span>
                  </div>

                  <h2 className="max-w-3xl text-3xl font-display font-bold leading-tight text-white sm:text-4xl">
                    {featuredPost.title}
                  </h2>
                  <p className="mt-5 max-w-2xl text-lg leading-8 text-white/60">
                    {featuredPost.excerpt}
                  </p>

                  <span className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-purple-300">
                    Read featured story
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>

                <div className="rounded-[1.6rem] border border-white/10 bg-black/20 p-6 backdrop-blur-sm">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]">
                    <FeaturedIcon className={`h-5 w-5 ${featuredCategory.iconClassName}`} />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                    In this post
                  </p>
                  <div className="mt-4 space-y-3">
                    {(featuredPost.highlights ?? []).map((highlight) => (
                      <div
                        key={highlight}
                        className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white/70"
                      >
                        {highlight}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </motion.article>

        <div className="grid gap-6 lg:grid-cols-2">
          {otherPosts.map((post, i) => {
            const config = categoryConfig[post.category]
            const Icon = config.icon

            return (
              <motion.article
                key={post.slug}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.12 + i * 0.05 }}
              >
                <Link
                  href={`/blog/${post.slug}`}
                  className="group relative block h-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-white/15 hover:bg-white/[0.045]"
                >
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${config.accent} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
                  />
                  <div className="relative flex h-full flex-col">
                    <div className="mb-5 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.05]">
                          <Icon className={`h-5 w-5 ${config.iconClassName}`} />
                        </div>
                        <div>
                          <Badge variant="secondary">{post.category}</Badge>
                        </div>
                      </div>
                      <span className="text-xs text-white/30">{post.readTime}</span>
                    </div>

                    <div className="mb-3 text-xs text-white/30 flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(post.date)}
                    </div>

                    <h2 className="text-2xl font-display font-bold text-white transition-colors group-hover:text-purple-200">
                      {post.title}
                    </h2>
                    <p className="mt-3 flex-1 text-white/50 leading-7">{post.excerpt}</p>

                    <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-white/70 transition-colors group-hover:text-white">
                      Read article
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              </motion.article>
            )
          })}
        </div>
      </div>
    </div>
  )
}

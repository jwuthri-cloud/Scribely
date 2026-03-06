"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, Calendar } from "lucide-react"
import { blogPosts } from "@/lib/blog-posts"

export default function BlogPage() {
  return (
    <div className="pt-32 pb-16">
      <div className="mx-auto max-w-4xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-16"
        >
          <h1 className="text-4xl sm:text-5xl font-display font-bold text-white mb-4">
            Blog
          </h1>
          <p className="text-lg text-white/40 max-w-xl">
            Insights, updates, and tips for getting the most out of your meetings.
          </p>
        </motion.div>

        <div className="space-y-6">
          {blogPosts.map((post, i) => (
            <motion.article
              key={post.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.05 }}
            >
              <Link
                href={`/blog/${post.slug}`}
                className="block rounded-xl glass glass-hover p-6 sm:p-8 group"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <span className="text-xs text-white/30 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(post.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                  <span className="text-xs text-white/30">{post.readTime}</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-display font-bold text-white mb-2 group-hover:text-purple-300 transition-colors">
                  {post.title}
                </h2>
                <p className="text-white/50 mb-4">{post.excerpt}</p>
                <span className="inline-flex items-center gap-1 text-sm text-purple-400 font-medium">
                  Read more
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </span>
              </Link>
            </motion.article>
          ))}
        </div>
      </div>
    </div>
  )
}

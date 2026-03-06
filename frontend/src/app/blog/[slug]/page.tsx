import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Calendar, ChevronRight } from "lucide-react"
import { BlogArticleContent } from "@/components/blog/blog-article-content"
import { blogPosts } from "@/lib/blog-posts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface PageProps {
  params: { slug: string }
}

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const post = blogPosts.find((p) => p.slug === params.slug)
  if (!post) return { title: "Post not found" }
  return {
    title: post.title,
    description: post.excerpt,
  }
}

export default function BlogPostPage({ params }: PageProps) {
  const post = blogPosts.find((p) => p.slug === params.slug)

  if (!post) notFound()

  return (
    <div className="relative overflow-hidden pt-32 pb-20">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-12 h-[360px] w-[680px] -translate-x-1/2 rounded-full bg-purple-600/10 blur-[140px]" />
        <div className="absolute right-0 top-72 h-[260px] w-[360px] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute left-0 top-[32rem] h-[300px] w-[320px] rounded-full bg-cyan-500/10 blur-[120px]" />
      </div>

      <article className="relative mx-auto max-w-4xl px-6 lg:px-8">
        <Link
          href="/blog"
          className="mb-8 inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to blog
        </Link>

        <header className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 shadow-[0_0_80px_-50px_rgba(168,85,247,0.7)] sm:p-10">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Badge className="border border-white/10 bg-white/[0.06] text-white/90">
              {post.category}
            </Badge>
            <span className="inline-flex items-center gap-1 text-xs text-white/40">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(post.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
            <span className="text-xs text-white/20">•</span>
            <span className="text-xs text-white/40">{post.readTime}</span>
          </div>

          <h1 className="max-w-3xl text-4xl font-display font-bold leading-tight text-white sm:text-5xl">
            {post.title}
          </h1>

          <p className="mt-5 max-w-2xl text-lg leading-8 text-white/55">
            {post.excerpt}
          </p>

          <div className="mt-8 flex items-center gap-4 border-t border-white/[0.08] pt-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-gradient-to-br from-purple-500/25 to-indigo-500/20 text-sm font-semibold text-white">
              ST
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">{post.author}</p>
              <p className="text-sm text-white/40">Notes, product updates, and practical guides</p>
            </div>
          </div>
        </header>

        <div className="mt-6 flex items-center gap-2 text-sm text-white/40">
          <Link href="/blog" className="transition-colors hover:text-white/70">
            Blog
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span>{post.category}</span>
        </div>

        <div
          className="mt-12 max-w-none
            [&_a]:transition-colors
            [&_blockquote]:border-l-2 [&_blockquote]:border-purple-400/50 [&_blockquote]:pl-5 [&_blockquote]:text-white/65
            [&_li]:text-white/72
            [&_ol]:space-y-3 [&_ol]:pl-5 [&_ol]:text-white/72
            [&_p]:text-lg [&_p]:leading-8 [&_p]:text-white/72
            [&_strong]:font-semibold [&_strong]:text-white
            [&_ul]:space-y-3 [&_ul]:pl-5"
        >
          <BlogArticleContent slug={post.slug} />
        </div>

        <div className="mt-16 border-t border-white/[0.06] pt-8">
          <Button variant="secondary" asChild>
            <Link href="/blog">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to blog
            </Link>
          </Button>
        </div>
      </article>
    </div>
  )
}

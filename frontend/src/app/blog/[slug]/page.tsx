import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Calendar } from "lucide-react"
import { blogPosts } from "@/lib/blog-posts"
import { Button } from "@/components/ui/button"

interface PageProps {
  params: { slug: string }
}

// Placeholder content for each post — replace with MDX or CMS content later
const postContent: Record<string, string> = {
  "introducing-scribely": `
    <p>We built Scribely because we were tired of choosing between paying attention in meetings and capturing what mattered.</p>
    <p>Every meeting tool before Scribely forced a tradeoff: take notes and miss the conversation, or focus on the conversation and lose the details. We wanted both.</p>
    <p>Scribely is an AI meeting assistant that floats above your screen — completely invisible to everyone else when you share. It transcribes in real time, answers your questions about the conversation, and surfaces insights as they happen.</p>
    <p>You can use it with cloud providers (OpenAI, Deepgram) for zero setup, or run everything locally with Whisper and Ollama. Your choice.</p>
    <p>We're just getting started. Download Scribely and let us know what you think.</p>
  `,
  "cloud-or-local-your-choice": `
    <p>Scribely gives you two paths: cloud or fully local. Both work great — it depends on your priorities.</p>
    <p><strong>Cloud (zero setup):</strong> Add your OpenAI API key and optionally Deepgram for transcription. No installation, no model downloads. Works immediately.</p>
    <p><strong>Fully local:</strong> Use Whisper for transcription and Ollama or LM Studio for AI chat. Nothing leaves your Mac. Free, private, and works offline.</p>
    <p>Many users start with cloud to try Scribely quickly, then switch to local for sensitive meetings. You can mix and match — local transcription with cloud LLM, or vice versa.</p>
    <p>Head to Settings → LLM and Transcription tabs to configure your setup.</p>
  `,
  "invisible-to-screen-sharing": `
    <p>When you share your screen on Zoom, Google Meet, or Teams, most apps show up. That's a problem if you're using an AI assistant during a client call.</p>
    <p>Scribely uses native macOS APIs to hide itself from all screen capture and recording tools. When you share your screen, Scribely is completely invisible to other participants.</p>
    <p>That means you can ask questions, get real-time insights, and capture action items — without anyone knowing you have help. Your AI assistant stays private.</p>
    <p>This isn't a hack or workaround. It's built into how Scribely works from day one.</p>
  `,
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
  const content = post ? postContent[post.slug] : null

  if (!post || !content) notFound()

  return (
    <div className="pt-32 pb-16">
      <article className="mx-auto max-w-3xl px-6 lg:px-8">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to blog
        </Link>

        <header className="mb-12">
          <span className="text-xs text-white/30 flex items-center gap-1 mb-4">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(post.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            <span className="mx-2">·</span>
            {post.readTime}
          </span>
          <h1 className="text-4xl sm:text-5xl font-display font-bold text-white mb-4 leading-tight">
            {post.title}
          </h1>
          <p className="text-lg text-white/50">{post.author}</p>
        </header>

        <div
          className="prose prose-invert prose-lg max-w-none
            prose-p:text-white/70 prose-p:leading-relaxed prose-p:mb-6
            prose-strong:text-white
            prose-a:text-purple-400 prose-a:no-underline hover:prose-a:underline"
          dangerouslySetInnerHTML={{ __html: content }}
        />

        <div className="mt-16 pt-8 border-t border-white/[0.06]">
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

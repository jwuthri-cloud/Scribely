export interface BlogPost {
  slug: string
  title: string
  excerpt: string
  date: string
  author: string
  readTime: string
}

export const blogPosts: BlogPost[] = [
  {
    slug: "introducing-scribely",
    title: "Introducing Scribely: Your Invisible AI Meeting Assistant",
    excerpt:
      "We built Scribely because we were tired of choosing between paying attention in meetings and capturing what mattered. Now you can do both — with an AI assistant that's completely invisible to everyone else.",
    date: "2026-03-01",
    author: "Scribely Team",
    readTime: "4 min read",
  },
  {
    slug: "cloud-or-local-your-choice",
    title: "Cloud or Local: Your Choice, Zero Compromise",
    excerpt:
      "Scribely works out of the box with OpenAI and Deepgram — no installation required. Or go fully local with Whisper and Ollama. Here's how to choose what's right for you.",
    date: "2026-02-28",
    author: "Scribely Team",
    readTime: "5 min read",
  },
  {
    slug: "invisible-to-screen-sharing",
    title: "Why Screen-Share Invisibility Matters",
    excerpt:
      "When you share your screen on Zoom or Meet, you shouldn't have to hide your tools. Scribely uses native macOS APIs to stay invisible — so you can get AI assistance during client calls without anyone knowing.",
    date: "2026-02-25",
    author: "Scribely Team",
    readTime: "3 min read",
  },
]

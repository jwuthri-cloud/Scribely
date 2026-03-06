export type BlogCategory = "Comparison" | "Guide" | "Privacy" | "Product"

export interface BlogPost {
  slug: string
  title: string
  excerpt: string
  date: string
  author: string
  readTime: string
  category: BlogCategory
  featured?: boolean
  highlights?: string[]
}

export const blogPosts: BlogPost[] = [
  {
    slug: "scribely-vs-competitors",
    title: "Scribely vs Otter, Fireflies, Fathom, Grain, and Cluely",
    excerpt:
      "A practical comparison of the leading AI meeting tools across privacy, pricing, live help, offline support, and screen-share invisibility.",
    date: "2026-03-07",
    author: "Scribely Team",
    readTime: "8 min read",
    category: "Comparison",
    featured: true,
    highlights: [
      "A side-by-side table across the biggest AI meeting tools",
      "What changes when you need private, on-device help during live calls",
      "Which products are built for note-taking versus real-time assistance",
    ],
  },
  {
    slug: "cloud-or-local-your-choice",
    title: "When to Use Cloud APIs vs Local AI for Meetings",
    excerpt:
      "Cloud is fastest to start. Local is best for privacy and control. This guide helps you choose the right setup for each kind of meeting.",
    date: "2026-03-06",
    author: "Scribely Team",
    readTime: "7 min read",
    category: "Guide",
    highlights: [
      "A simple decision framework for cloud, local, and hybrid setups",
      "Trade-offs across setup time, latency, privacy, and cost",
      "Examples for recruiting, sales, support, and confidential internal calls",
    ],
  },
  {
    slug: "chrome-extension-setup",
    title: "How to Use Scribely with Google Meet, Zoom, and Teams",
    excerpt:
      "A step-by-step guide to getting the desktop app and Chrome extension working together for browser-based meetings in minutes.",
    date: "2026-03-05",
    author: "Scribely Team",
    readTime: "6 min read",
    category: "Guide",
    highlights: [
      "The cleanest setup for Google Meet, browser Zoom, and Teams",
      "What to click before the meeting starts",
      "How to avoid audio-routing headaches and get better transcripts",
    ],
  },
  {
    slug: "privacy-in-meetings",
    title: "Why Meeting Privacy Matters More Than Ever",
    excerpt:
      "Most meeting assistants send your conversation to a third-party service. Scribely lets you decide when that is acceptable and when it is not.",
    date: "2026-03-04",
    author: "Scribely Team",
    readTime: "5 min read",
    category: "Privacy",
    highlights: [
      "Why cloud-only meeting bots are not the right fit for every call",
      "How local transcription and local models change the risk profile",
      "When a hybrid setup is the best balance between speed and control",
    ],
  },
  {
    slug: "live-insights-explained",
    title: "How Live Insights Catch Questions, Decisions, and Action Items",
    excerpt:
      "Scribely does more than transcribe. It watches the meeting in real time and surfaces the moments that matter while the conversation is still happening.",
    date: "2026-03-03",
    author: "Scribely Team",
    readTime: "5 min read",
    category: "Product",
    highlights: [
      "What Live Insights look for during the meeting",
      "Why real-time prompts are more useful than post-meeting recaps",
      "How to turn important moments into follow-up without replaying the call",
    ],
  },
  {
    slug: "introducing-scribely",
    title: "Introducing Scribely: Your Invisible AI Meeting Assistant",
    excerpt:
      "We built Scribely because we were tired of choosing between paying attention and taking notes. Now you can keep both.",
    date: "2026-03-01",
    author: "Scribely Team",
    readTime: "4 min read",
    category: "Product",
  },
  {
    slug: "invisible-to-screen-sharing",
    title: "Why Screen-Share Invisibility Matters",
    excerpt:
      "If your assistant appears on a client call, you lose trust instantly. Here is why invisibility is a core product requirement, not a nice-to-have.",
    date: "2026-02-25",
    author: "Scribely Team",
    readTime: "4 min read",
    category: "Privacy",
  },
]

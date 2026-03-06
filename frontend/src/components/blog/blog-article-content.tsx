import type { ReactNode } from "react"
import Link from "next/link"
import {
  type ComparisonColumn,
  type ComparisonRow,
  BlogComparisonTable,
} from "@/components/blog/blog-comparison-table"
import { BlogDecisionTable } from "@/components/blog/blog-decision-table"

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-2xl font-display font-bold text-white sm:text-3xl">
        {title}
      </h2>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function Callout({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="my-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_0_50px_-30px_rgba(168,85,247,0.55)]">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-purple-300/80">
        {title}
      </p>
      <div className="mt-3 space-y-3 text-white/72">{children}</div>
    </div>
  )
}

const competitorColumns: ComparisonColumn[] = [
  {
    id: "scribely",
    label: "Scribely",
    subtitle: "Private overlay + real-time copilot",
    highlight: true,
  },
  {
    id: "otter",
    label: "Otter",
    subtitle: "Transcription-first",
  },
  {
    id: "fireflies",
    label: "Fireflies",
    subtitle: "Bot + notes workflow",
  },
  {
    id: "cluely",
    label: "Cluely",
    subtitle: "Live interview copilot",
  },
  {
    id: "grain",
    label: "Grain",
    subtitle: "Post-meeting sharing",
  },
  {
    id: "fathom",
    label: "Fathom",
    subtitle: "Free recorder + summaries",
  },
]

const competitorRows: ComparisonRow[] = [
  {
    feature: "Entry pricing",
    description: "Publicly listed self-serve pricing at time of writing.",
    cells: [
      { value: "Free", detail: "Core product available without a paid plan", tone: "positive" },
      { value: "$8.33-$30", detail: "Per user, depending on plan and billing", tone: "neutral" },
      { value: "$10-$29", detail: "Per user, depending on plan and billing", tone: "neutral" },
      { value: "$20-$75", detail: "Undetectability sits on the highest plan", tone: "negative" },
      { value: "Free + paid", detail: "Paid plans for team workflows and AI features", tone: "neutral" },
      { value: "Free + paid", detail: "Paid plans for premium AI and team features", tone: "neutral" },
    ],
  },
  {
    feature: "Screen-share invisibility",
    description: "Can you keep the assistant hidden during live calls?",
    cells: [
      { value: "Yes", detail: "Built into the macOS overlay experience", tone: "positive" },
      { value: "No", detail: "Not a core product behavior", tone: "negative" },
      { value: "No", detail: "Focuses on recording and note capture", tone: "negative" },
      { value: "Yes", detail: "Locked behind the $75 undetectability tier", tone: "neutral" },
      { value: "No", detail: "Built more for recording and sharing", tone: "negative" },
      { value: "No", detail: "Recorder-first workflow, not an invisible overlay", tone: "negative" },
    ],
  },
  {
    feature: "Local or hybrid deployment",
    description: "Can you keep transcription and/or chat on your own machine?",
    cells: [
      { value: "Yes", detail: "Cloud, local, or hybrid based on the meeting", tone: "positive" },
      { value: "No", detail: "Cloud-first SaaS workflow", tone: "negative" },
      { value: "No", detail: "Cloud-first SaaS workflow", tone: "negative" },
      { value: "No", detail: "Cloud-first experience", tone: "negative" },
      { value: "No", detail: "Cloud collaboration product", tone: "negative" },
      { value: "No", detail: "Cloud collaboration product", tone: "negative" },
    ],
  },
  {
    feature: "Offline use",
    description: "Useful when you have no network or do not want to rely on one.",
    cells: [
      { value: "Yes", detail: "Local models keep working without internet", tone: "positive" },
      { value: "No", detail: "Needs cloud connectivity", tone: "negative" },
      { value: "No", detail: "Needs cloud connectivity", tone: "negative" },
      { value: "No", detail: "Needs cloud connectivity", tone: "negative" },
      { value: "No", detail: "Needs cloud connectivity", tone: "negative" },
      { value: "No", detail: "Needs cloud connectivity", tone: "negative" },
    ],
  },
  {
    feature: "Real-time help during the call",
    description: "How much useful help do you get before the meeting ends?",
    cells: [
      { value: "Full live copilot", detail: "Transcription, AI chat, and live insights while you talk", tone: "positive" },
      { value: "Limited", detail: "Strong transcript, less focused on invisible live assistance", tone: "neutral" },
      { value: "Mostly post-call", detail: "Great summaries, less about an in-call overlay", tone: "negative" },
      { value: "Live assistant", detail: "Strong live help if you accept the cloud-first model", tone: "neutral" },
      { value: "Mostly post-call", detail: "Best after the meeting for clips and collaboration", tone: "negative" },
      { value: "Mostly post-call", detail: "Strong summaries and follow-up automation", tone: "negative" },
    ],
  },
  {
    feature: "Privacy posture",
    description: "How much control do you have over where data goes?",
    cells: [
      { value: "You choose", detail: "Use hosted APIs or keep sensitive work local", tone: "positive" },
      { value: "Cloud-first", detail: "Great convenience, less control", tone: "negative" },
      { value: "Cloud-first", detail: "Great convenience, less control", tone: "negative" },
      { value: "Cloud-first", detail: "Real-time value, but not local-first", tone: "negative" },
      { value: "Cloud-first", detail: "Collaboration over local control", tone: "negative" },
      { value: "Cloud-first", detail: "Collaboration over local control", tone: "negative" },
    ],
  },
  {
    feature: "Best fit",
    description: "Who typically gets the most value?",
    cells: [
      { value: "Private live workflows", detail: "Sales, recruiting, interviews, customer calls, sensitive internal syncs", tone: "positive" },
      { value: "Transcript archive", detail: "Individuals and teams who want searchable notes", tone: "neutral" },
      { value: "Meeting recap automation", detail: "Teams that value summaries and integrations", tone: "neutral" },
      { value: "Aggressive live coaching", detail: "Interview and sales-heavy workflows", tone: "neutral" },
      { value: "Sharing clips", detail: "Customer-facing teams that review calls later", tone: "neutral" },
      { value: "Fast notes", detail: "Teams that want free recording and simple summaries", tone: "neutral" },
    ],
  },
]

const decisionRows = [
  {
    label: "Setup time",
    cloud: "Best for getting started today. Add an API key and you are ready.",
    local: "Takes longer upfront because you need local models and a local provider.",
  },
  {
    label: "Privacy",
    cloud: "Meeting data goes to the hosted provider you choose.",
    local: "Best for sensitive calls because transcription and chat can stay on your Mac.",
  },
  {
    label: "Offline support",
    cloud: "Requires internet and provider uptime.",
    local: "Best for offline or unreliable-network environments.",
  },
  {
    label: "Cost profile",
    cloud: "Usage-based. Great for occasional meetings or quick trials.",
    local: "Fixed setup cost in time and hardware, then minimal marginal cost.",
  },
  {
    label: "Latency and feel",
    cloud: "Usually fast enough, but still dependent on round-trips to the API.",
    local: "Can feel more immediate once models are running well on your machine.",
  },
  {
    label: "Model control",
    cloud: "Pick from hosted providers and their supported models.",
    local: "Best for teams that want control over models, updates, and data flow.",
  },
]

export function BlogArticleContent({ slug }: { slug: string }) {
  switch (slug) {
    case "scribely-vs-competitors":
      return (
        <>
          <p>
            Most AI meeting tools solve one of two problems: they either record
            everything and summarize it later, or they try to help in real time
            but keep the whole workflow in the cloud. Scribely is different
            because it combines a live meeting copilot with local-first options
            and an invisible overlay.
          </p>
          <p>
            That matters if you care about speed, privacy, or simply not having
            your assistant show up during a screen share. If you only want
            searchable transcripts, almost any note-taking bot will do. If you
            want live help without giving up control, the trade-offs become much
            more obvious.
          </p>

          <Callout title="Quick take">
            <p>
              Otter, Fireflies, Grain, and Fathom are excellent if your main
              workflow is record first, review later.
            </p>
            <p>
              Scribely is strongest when the meeting itself is the moment that
              matters and you want help while the conversation is still live.
            </p>
          </Callout>

          <Section title="The Comparison Table">
            <p>
              The table below focuses on the buying questions most teams
              actually care about: what it costs, whether it works live, and how
              much control you have over privacy.
            </p>
            <BlogComparisonTable
              columns={competitorColumns}
              rows={competitorRows}
              note="Public pricing and positioning change often. Use this as a practical snapshot, then confirm current details on each vendor's official pricing and product pages."
            />
          </Section>

          <Section title="Why This Market Feels Crowded">
            <p>
              A lot of products look similar at first glance because they all
              promise transcripts, summaries, and action items. The real
              difference is where the product sits in the meeting workflow.
            </p>
            <ul>
              <li>Some tools are best thought of as searchable meeting archives.</li>
              <li>Some are great at post-call summaries and CRM follow-up.</li>
              <li>
                A much smaller group tries to act like a live assistant while
                the conversation is still happening.
              </li>
            </ul>
            <p>
              Scribely was built for the third category. It is designed for
              moments when you need recall, prompts, and confidence before the
              call ends.
            </p>
          </Section>

          <Section title="Where Scribely Wins">
            <ul>
              <li>
                <strong>Live assistance:</strong> You can ask questions and
                surface decisions while the meeting is still moving.
              </li>
              <li>
                <strong>Privacy flexibility:</strong> Use cloud APIs for speed,
                local models for sensitive calls, or mix both depending on the
                meeting.
              </li>
              <li>
                <strong>Screen-share invisibility:</strong> The product is built
                around not exposing your assistant during the call.
              </li>
              <li>
                <strong>Offline resilience:</strong> If your environment demands
                it, a local setup keeps working without a hosted service in the
                loop.
              </li>
            </ul>
          </Section>

          <Section title="Who Should Choose Which Tool">
            <p>
              Choose <strong>Scribely</strong> if your calls are high leverage
              and private: interviews, recruiting screens, customer calls,
              internal planning, fundraising, or sales.
            </p>
            <p>
              Choose <strong>Otter</strong> or <strong>Fathom</strong> if you
              mainly want a simple searchable transcript and clean recap flow.
            </p>
            <p>
              Choose <strong>Fireflies</strong> or <strong>Grain</strong> if
              your strongest need is post-meeting collaboration, sharing, and
              workflow automation.
            </p>
            <p>
              Choose <strong>Cluely</strong> if you care most about aggressive
              live assistance and are comfortable with its cloud-first model and
              pricing trade-offs.
            </p>
          </Section>

          <Section title="Bottom Line">
            <p>
              The market does not really need another meeting note-taker. It
              needs better tools for people who are in the conversation and
              cannot wait until the recap arrives. That is the gap Scribely is
              built to fill.
            </p>
          </Section>
        </>
      )

    case "cloud-or-local-your-choice":
      return (
        <>
          <p>
            There is no single best AI setup for every meeting. The right choice
            depends on what you optimize for: speed of setup, privacy,
            reliability, operating cost, or the ability to work offline.
          </p>
          <p>
            Scribely is valuable because it does not force one answer. You can
            use hosted APIs when convenience matters most, switch to local
            models for sensitive conversations, or combine the two in a hybrid
            workflow.
          </p>

          <Callout title="Simple rule">
            <p>
              Use <strong>cloud APIs</strong> when you want the fastest path to
              value.
            </p>
            <p>
              Use <strong>local AI</strong> when the meeting content is
              sensitive, the network is unreliable, or you need tighter control
              over where data goes.
            </p>
          </Callout>

          <Section title="Cloud vs Local at a Glance">
            <BlogDecisionTable rows={decisionRows} />
          </Section>

          <Section title="Choose Cloud APIs If">
            <ul>
              <li>You want to get started in the next five minutes.</li>
              <li>
                You are evaluating Scribely for the first time and do not want
                to install local models yet.
              </li>
              <li>
                Your meetings are not especially sensitive and hosted providers
                are acceptable for your workflow.
              </li>
              <li>
                You prefer usage-based pricing over managing local model
                downloads.
              </li>
            </ul>
            <p>
              For most people, cloud is the easiest on-ramp: add your OpenAI API
              key, optionally use hosted transcription, and start using the
              product immediately.
            </p>
          </Section>

          <Section title="Choose Local AI If">
            <ul>
              <li>You handle confidential customer, legal, product, or hiring calls.</li>
              <li>You want transcripts and prompts to stay on-device.</li>
              <li>You need your setup to work without a reliable internet connection.</li>
              <li>
                You want predictable marginal cost once your local environment is
                configured.
              </li>
            </ul>
            <p>
              Local mode typically means using Whisper for transcription and a
              local chat provider such as Ollama or LM Studio. It takes more
              setup up front, but it gives you much tighter control afterward.
            </p>
          </Section>

          <Section title="Hybrid Is Often the Best Default">
            <p>
              Many teams do not need to choose one side forever. A hybrid setup
              is often the most practical operating model.
            </p>
            <ul>
              <li>
                Use local transcription when raw audio sensitivity is the
                highest concern.
              </li>
              <li>
                Use a hosted LLM when you want a broader model ecosystem or
                faster experimentation.
              </li>
              <li>
                Keep a local-only preset for private calls and a cloud preset
                for everyday meetings.
              </li>
            </ul>
          </Section>

          <Section title="A Good Decision Framework">
            <ol>
              <li>Ask whether the meeting content is sensitive enough to avoid sending it out.</li>
              <li>Ask whether you need the fastest setup or the most control.</li>
              <li>Ask whether the team can tolerate internet dependency.</li>
              <li>Pick the lightest setup that still matches the risk of the call.</li>
            </ol>
          </Section>

          <Section title="How to Set It Up in Scribely">
            <p>
              If you want the easiest path, start with the cloud route from{" "}
              <Link href="/download" className="text-purple-300 hover:text-white">
                Download
              </Link>
              .
            </p>
            <p>
              If you want a local stack, the{" "}
              <Link href="/setup" className="text-purple-300 hover:text-white">
                setup guide
              </Link>{" "}
              walks through Ollama and LM Studio in a few minutes.
            </p>
          </Section>
        </>
      )

    case "chrome-extension-setup":
      return (
        <>
          <p>
            The fastest way to get clean audio from browser-based meetings is to
            use the Scribely desktop app together with the Chrome extension. The
            extension captures the meeting tab while the desktop app handles the
            live transcript, AI chat, and insights.
          </p>

          <Section title="What You Need">
            <ul>
              <li>The Scribely macOS desktop app installed</li>
              <li>The Scribely Chrome extension installed</li>
              <li>A browser-based meeting in Google Meet, Zoom, or Teams</li>
            </ul>
          </Section>

          <Section title="The 5-Minute Setup">
            <ol>
              <li>Launch Scribely before the meeting starts.</li>
              <li>Open your meeting in Chrome.</li>
              <li>Click the Scribely extension and start sharing the meeting tab.</li>
              <li>Allow the extension to capture the tab audio when Chrome prompts you.</li>
              <li>Confirm the Scribely overlay shows live transcript activity.</li>
            </ol>
          </Section>

          <Callout title="Why this setup works well">
            <p>
              Browser meeting platforms handle tab audio differently from system
              audio. The extension gives Scribely a cleaner path to the source,
              which usually means better transcription and fewer routing issues.
            </p>
          </Callout>

          <Section title="Platform Notes">
            <p>
              <strong>Google Meet:</strong> Usually the smoothest workflow,
              since everything stays inside the browser tab.
            </p>
            <p>
              <strong>Zoom in Chrome:</strong> Works best when you join from the
              browser rather than jumping into a native app.
            </p>
            <p>
              <strong>Teams in Chrome:</strong> Similar to Meet. Start the
              extension before the conversation gets busy so the transcript has a
              clean beginning.
            </p>
          </Section>

          <Section title="Common Mistakes to Avoid">
            <ul>
              <li>Starting the meeting before the extension is connected</li>
              <li>Choosing the wrong tab when Chrome asks what to share</li>
              <li>Expecting browser capture to work if the meeting has switched to a native app</li>
            </ul>
          </Section>

          <Section title="If You Want Fully Local AI">
            <p>
              The extension handles browser audio capture, and you can still
              keep the AI side local. Pair it with the{" "}
              <Link href="/setup" className="text-purple-300 hover:text-white">
                local setup guide
              </Link>{" "}
              to run transcription and chat on your own machine.
            </p>
          </Section>
        </>
      )

    case "privacy-in-meetings":
      return (
        <>
          <p>
            AI meeting tools are often sold on convenience, but convenience has
            a hidden cost: many products assume your call can be sent to a
            third-party service without much thought. That may be fine for some
            meetings, but it is the wrong default for others.
          </p>

          <Section title="Why Privacy Is Not Just a Compliance Box">
            <p>
              Privacy is not only about regulation. It is also about trust. If
              your customer, candidate, or teammate believes the room is small
              and controlled, that expectation matters.
            </p>
            <p>
              The more sensitive the conversation, the more valuable local
              control becomes. Product strategy, hiring decisions, pricing,
              legal topics, performance discussions, and customer escalations all
              sit in that category.
            </p>
          </Section>

          <Section title="What Changes With Local Processing">
            <ul>
              <li>Raw audio does not need to leave your machine.</li>
              <li>Transcript generation can stay on-device.</li>
              <li>You can reserve cloud usage for the meetings that justify it.</li>
              <li>You reduce dependence on a third-party service staying reachable.</li>
            </ul>
          </Section>

          <Callout title="A practical middle ground">
            <p>
              Not every meeting needs the same privacy posture. The best setup is
              often hybrid: keep sensitive pieces local and use cloud tools when
              convenience matters more than strict control.
            </p>
          </Callout>

          <Section title="The Problem With Cloud-Only Defaults">
            <p>
              Cloud-first products are easy to adopt because they move the
              complexity away from the user. That convenience is real, but it can
              quietly push teams into using the same workflow for every meeting.
            </p>
            <p>
              Scribely gives you a different option: start with cloud if you
              want, then move high-sensitivity meetings to a local or hybrid
              mode without changing products.
            </p>
          </Section>

          <Section title="Privacy Is a Product Choice">
            <p>
              The real question is not whether cloud tools are good or bad. It
              is whether your product lets you choose the right setup for each
              meeting. That flexibility is what turns privacy from marketing copy
              into an actual workflow.
            </p>
          </Section>
        </>
      )

    case "live-insights-explained":
      return (
        <>
          <p>
            A transcript tells you what happened. Live Insights help you notice
            what matters while it is still useful to act on it.
          </p>
          <p>
            In practice, that means Scribely watches the conversation for moments
            like open questions, clear decisions, action items, and topic shifts,
            then surfaces them while the meeting is still in progress.
          </p>

          <Section title="What Live Insights Look For">
            <ul>
              <li>Questions that deserve a follow-up before the call ends</li>
              <li>Action items someone just committed to</li>
              <li>Decisions that can easily get lost in a fast-moving discussion</li>
              <li>Key mentions such as dates, links, and named entities</li>
            </ul>
          </Section>

          <Section title="Why Real-Time Matters">
            <p>
              A great post-meeting summary is helpful, but it cannot change the
              meeting you just had. Real-time prompts can.
            </p>
            <ul>
              <li>You can clarify an ambiguous action item on the spot.</li>
              <li>You can answer a missed question before the room moves on.</li>
              <li>You can capture a decision while everyone still agrees on it.</li>
            </ul>
          </Section>

          <Callout title="The point is not more notifications">
            <p>
              Live Insights should reduce cognitive load, not add noise. The goal
              is to surface the moments that change outcomes, not everything that
              was said.
            </p>
          </Callout>

          <Section title="A Better Follow-Up Loop">
            <p>
              When the meeting ends, the work should already be mostly organized.
              Live Insights shorten the distance between hearing something
              important and turning it into follow-up.
            </p>
            <p>
              Instead of rewatching or rereading the whole call, you can jump
              straight to the decisions, promises, and unresolved questions.
            </p>
          </Section>
        </>
      )

    case "introducing-scribely":
      return (
        <>
          <p>
            Scribely started with a simple frustration: during important
            meetings, you usually have to choose between paying attention and
            capturing details. Neither option feels good.
          </p>
          <p>
            We wanted an assistant that could sit beside the conversation,
            remember what matters, and help in real time without becoming the
            center of attention.
          </p>

          <Section title="What Scribely Is Built For">
            <ul>
              <li>Live transcription that keeps up with the conversation</li>
              <li>AI chat that answers questions about the meeting while it is happening</li>
              <li>Live insights that surface action items, decisions, and questions</li>
              <li>An overlay that stays invisible during screen sharing</li>
            </ul>
          </Section>

          <Section title="Why We Think This Matters">
            <p>
              The highest-value part of a meeting is often the live moment
              itself. If a tool only helps after the call, it misses the moment
              when confidence, memory, and context matter most.
            </p>
            <p>
              Scribely is built to make you sharper inside the conversation, not
              just more organized afterward.
            </p>
          </Section>

          <Section title="Cloud, Local, or Hybrid">
            <p>
              Some people want zero setup. Others want maximum privacy. Scribely
              supports both. Use cloud APIs when you want convenience, local
              models when you want control, or mix them based on the meeting.
            </p>
          </Section>
        </>
      )

    case "invisible-to-screen-sharing":
      return (
        <>
          <p>
            If you use an AI assistant during a live call, one question matters
            immediately: can anyone else see it?
          </p>
          <p>
            For many products, the answer is messy. You end up minimizing
            windows, dragging panels around, or hoping the wrong thing does not
            appear when you share your screen.
          </p>

          <Section title="Why Invisibility Is a Core Requirement">
            <p>
              On a customer call or interview, trust can disappear instantly if
              your hidden tooling becomes visible. That is not a cosmetic issue.
              It changes how the whole product should be designed.
            </p>
          </Section>

          <Section title="What This Changes in Practice">
            <ul>
              <li>You can keep prompts and answers visible to yourself only.</li>
              <li>You can ask for help mid-call without breaking the flow.</li>
              <li>You do not need a second device just to keep the assistant private.</li>
            </ul>
          </Section>

          <Callout title="Not a nice-to-have">
            <p>
              Screen-share invisibility is one of the biggest differences between
              a general note-taking product and a true live meeting copilot.
            </p>
          </Callout>

          <Section title="Why Scribely Was Built This Way">
            <p>
              The assistant should help you without becoming part of the stage.
              That principle shapes everything else about the experience, from
              layout to privacy choices to how confidently you can use it on a
              real client call.
            </p>
          </Section>
        </>
      )

    default:
      return notFoundContent
  }
}

const notFoundContent = (
  <>
    <p>This post could not be loaded.</p>
  </>
)

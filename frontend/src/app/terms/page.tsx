import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Scribely terms of service. Read our terms for using the desktop app and Chrome extension.",
}

export default function TermsPage() {
  return (
    <div className="pt-32 pb-16">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <h1 className="text-4xl font-display font-bold text-white mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-white/30 mb-12">
          Last updated: February 2026
        </p>

        <div className="prose-sm space-y-8">
          <Section title="Acceptance of Terms">
            <p>
              By downloading, installing, or using Scribely (&ldquo;the
              Software&rdquo;), you agree to be bound by these Terms of Service.
              If you do not agree to these terms, do not use the Software.
            </p>
          </Section>

          <Section title="Description of Service">
            <p>
              Scribely is a macOS desktop application and Chrome extension that
              provides real-time meeting transcription, AI-powered chat, and
              live insight detection. The core functionality runs locally on your
              device.
            </p>
          </Section>

          <Section title="License">
            <p>
              Scribely grants you a limited, non-exclusive, non-transferable
              license to use the Software for personal and commercial purposes.
              You may not reverse engineer, decompile, or disassemble the
              Software.
            </p>
          </Section>

          <Section title="Free and Paid Features">
            <p>
              The core features of Scribely (live transcription, AI chat,
              real-time insights) are provided free of charge. Premium features
              (post-meeting optimization) may require a paid subscription. Pricing
              and feature availability are subject to change.
            </p>
          </Section>

          <Section title="Third-Party Services">
            <p>
              The AI chat feature uses OpenAI&apos;s API. Your use of this feature
              is also subject to OpenAI&apos;s terms of service and usage policies.
              You are responsible for providing your own API key and any
              associated costs.
            </p>
          </Section>

          <Section title="User Responsibilities">
            <p>You agree to:</p>
            <ul>
              <li>Use Scribely in compliance with all applicable laws</li>
              <li>Obtain necessary consent before recording meetings where required by law</li>
              <li>Not use the Software for any unlawful or unauthorized purpose</li>
              <li>Keep your API keys secure and not share them</li>
            </ul>
          </Section>

          <Section title="Disclaimer of Warranties">
            <p>
              The Software is provided &ldquo;as is&rdquo; without warranty of
              any kind, express or implied. We do not guarantee the accuracy of
              transcriptions or AI-generated content. You are responsible for
              verifying any information produced by the Software.
            </p>
          </Section>

          <Section title="Limitation of Liability">
            <p>
              In no event shall Scribely be liable for any indirect, incidental,
              special, consequential, or punitive damages arising out of or
              related to your use of the Software.
            </p>
          </Section>

          <Section title="Changes to Terms">
            <p>
              We reserve the right to modify these terms at any time. Continued
              use of the Software after changes constitutes acceptance of the
              new terms.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              For questions about these terms, please reach out via our GitHub
              repository.
            </p>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-3">{title}</h2>
      <div className="text-sm text-white/50 leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        {children}
      </div>
    </div>
  )
}

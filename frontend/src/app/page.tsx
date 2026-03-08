import { Hero } from "@/components/landing/hero"
import { Features } from "@/components/landing/features"
import { Comparison } from "@/components/landing/comparison"
import { HowItWorks } from "@/components/landing/how-it-works"
import { Screenshots } from "@/components/landing/screenshots"
import { Testimonials } from "@/components/landing/testimonials"
import { FAQ } from "@/components/landing/faq"
import { CTABanner } from "@/components/landing/cta-banner"
import ShaderBackground from "@/components/ui/shader-background"

export default function HomePage() {
  return (
    <>
      <ShaderBackground />
      <Hero />
      <Features />
      <Comparison />
      <HowItWorks />
      <Screenshots />
      <Testimonials />
      <FAQ />
      <CTABanner />
    </>
  )
}

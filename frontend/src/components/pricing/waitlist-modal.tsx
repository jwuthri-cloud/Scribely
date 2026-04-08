"use client"

import { useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { Sparkles, X, Mail, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface WaitlistModalProps {
  children: React.ReactNode
}

export function WaitlistModal({ children }: WaitlistModalProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("loading")
    setErrorMsg("")

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Something went wrong")
      }

      setStatus("success")
    } catch (err) {
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong")
    }
  }

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) {
      setTimeout(() => {
        setEmail("")
        setStatus("idle")
        setErrorMsg("")
      }, 300)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/[0.08] bg-[#0e0e1a] p-8 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          {/* Glow */}
          <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-40 bg-purple-600/20 rounded-full blur-[60px]" />

          <Dialog.Close className="absolute right-4 top-4 rounded-lg p-1.5 text-white/30 hover:text-white/70 transition-colors">
            <X className="h-4 w-4" />
          </Dialog.Close>

          {status === "success" ? (
            <div className="relative flex flex-col items-center text-center py-4">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-purple-500/15 border border-purple-500/20">
                <CheckCircle2 className="h-7 w-7 text-purple-400" />
              </div>
              <Dialog.Title className="text-xl font-semibold text-white mb-2">
                You&apos;re on the list!
              </Dialog.Title>
              <Dialog.Description className="text-sm text-white/40 mb-6">
                We&apos;ll email you as soon as Scribely Pro launches.
              </Dialog.Description>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          ) : (
            <div className="relative">
              <div className="mb-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-white/[0.06]">
                  <Sparkles className="h-5 w-5 text-purple-400" />
                </div>
                <Dialog.Title className="text-xl font-semibold text-white mb-1">
                  Join the Pro waitlist
                </Dialog.Title>
                <Dialog.Description className="text-sm text-white/40">
                  Be first to know when Scribely Pro launches. No spam, ever.
                </Dialog.Description>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25" />
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={cn(
                      "w-full rounded-lg border bg-white/[0.04] pl-10 pr-4 py-3 text-sm text-white placeholder-white/25 outline-none transition-colors",
                      "border-white/[0.08] focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30",
                      status === "error" && "border-red-500/40"
                    )}
                  />
                </div>

                {status === "error" && (
                  <p className="text-xs text-red-400">{errorMsg}</p>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={status === "loading"}
                >
                  {status === "loading" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Joining…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Join Waitlist
                    </>
                  )}
                </Button>
              </form>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

"use client"

import Image from "next/image"
import { useUser } from "@clerk/nextjs"
import { Mail, Shield, SlidersHorizontal, User } from "lucide-react"
import { LoadingDots } from "@/components/app/workspace/LoadingDots"
import { PageHeader } from "@/components/app/workspace/PageHeader"
import { WorkspaceSurface } from "@/components/app/workspace/WorkspaceSurface"

export default function SettingsPage() {
  const { user, isLoaded } = useUser()

  if (!isLoaded) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="workspace-card h-36 animate-pulse" />
        <div className="workspace-card flex h-64 items-center justify-center">
          <LoadingDots />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Account details"
        description="This page still reads directly from Clerk. The redesign just gives the information a calmer, more usable layout."
        actions={
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-white/72">
            <SlidersHorizontal className="h-4 w-4 text-cyan-100" />
            Profile overview
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <WorkspaceSurface className="p-6 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            {user?.imageUrl ? (
              <Image
                src={user.imageUrl}
                alt="Avatar"
                width={80}
                height={80}
                className="h-20 w-20 rounded-[26px] border border-white/10 object-cover shadow-[0_18px_40px_-28px_rgba(34,211,238,0.85)]"
              />
            ) : null}
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40">
                Signed in as
              </p>
              <p className="font-display text-3xl font-semibold tracking-[-0.04em] text-white">
                {user?.fullName || "—"}
              </p>
              <p className="text-sm text-white/54">{user?.primaryEmailAddress?.emailAddress || "—"}</p>
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <div className="workspace-panel flex items-center gap-4 px-4 py-4">
              <User className="h-4 w-4 text-violet-200" />
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/38">Full name</p>
                <p className="mt-1 text-sm text-white/88">{user?.fullName || "Not set"}</p>
              </div>
            </div>
            <div className="workspace-panel flex items-center gap-4 px-4 py-4">
              <Mail className="h-4 w-4 text-cyan-200" />
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/38">Email</p>
                <p className="mt-1 text-sm text-white/88">
                  {user?.primaryEmailAddress?.emailAddress || "Not set"}
                </p>
              </div>
            </div>
            <div className="workspace-panel flex items-center gap-4 px-4 py-4">
              <Shield className="h-4 w-4 text-fuchsia-200" />
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/38">Account ID</p>
                <p className="mt-1 break-all font-mono text-sm text-white/66">{user?.id}</p>
              </div>
            </div>
          </div>
        </WorkspaceSurface>

        <WorkspaceSurface className="p-6" variant="panel">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-200/70">
            Notes
          </p>
          <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] text-white">
            Profile data only
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/58">
            The current settings route still only exposes Clerk account information. No product
            toggles or model configuration were added here so behavior stays unchanged.
          </p>
        </WorkspaceSurface>
      </div>
    </div>
  )
}

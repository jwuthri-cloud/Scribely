"use client"

import { useState } from "react"
import Image from "next/image"
import { useUser, useClerk } from "@clerk/nextjs"
import {
  Calendar,
  ChevronRight,
  Copy,
  Check,
  ExternalLink,
  KeyRound,
  LogOut,
  Mail,
  Shield,
  User,
} from "lucide-react"
import { CoreSpinLoader } from "@/components/ui/core-spin-loader"

function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
  copyable,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  mono?: boolean
  copyable?: boolean
}) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="group flex items-center gap-4 rounded-xl px-4 py-3.5 transition-colors hover:bg-white/[0.03]">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
        <Icon className="h-4 w-4 text-white/50" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-white/40">{label}</p>
        <p
          className={`mt-0.5 truncate text-sm text-white/90 ${mono ? "font-mono text-xs text-white/60" : ""}`}
        >
          {value}
        </p>
      </div>
      {copyable && (
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-lg p-2 text-white/30 opacity-0 transition-all hover:bg-white/[0.06] hover:text-white/60 group-hover:opacity-100"
          aria-label="Copy to clipboard"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { user, isLoaded } = useUser()
  const { signOut, openUserProfile } = useClerk()

  if (!isLoaded) {
    return (
      <div className="mx-auto flex max-w-2xl items-center justify-center py-32">
        <CoreSpinLoader showText={false} className="min-h-[180px]" />
      </div>
    )
  }

  const joinedDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unknown"

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      {/* Profile card */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <div className="flex items-center gap-5">
          {user?.imageUrl ? (
            <Image
              src={user.imageUrl}
              alt="Avatar"
              width={72}
              height={72}
              className="h-[72px] w-[72px] rounded-2xl border border-white/[0.08] object-cover"
            />
          ) : (
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
              <User className="h-7 w-7 text-white/30" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight text-white">
              {user?.fullName || "Unknown User"}
            </h1>
            <p className="mt-0.5 truncate text-sm text-white/50">
              {user?.primaryEmailAddress?.emailAddress || "No email"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openUserProfile()}
            className="hidden shrink-0 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white sm:inline-flex"
          >
            Edit profile
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Account details */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02]">
        <div className="border-b border-white/[0.06] px-6 py-4">
          <h2 className="text-sm font-semibold text-white">Account</h2>
        </div>
        <div className="p-2">
          <InfoRow
            icon={User}
            label="Full name"
            value={user?.fullName || "Not set"}
          />
          <InfoRow
            icon={Mail}
            label="Email"
            value={user?.primaryEmailAddress?.emailAddress || "Not set"}
            copyable
          />
          <InfoRow
            icon={Calendar}
            label="Joined"
            value={joinedDate}
          />
          <InfoRow
            icon={Shield}
            label="Account ID"
            value={user?.id || "—"}
            mono
            copyable
          />
        </div>
      </div>

      {/* Security */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02]">
        <div className="border-b border-white/[0.06] px-6 py-4">
          <h2 className="text-sm font-semibold text-white">Security</h2>
        </div>
        <div className="p-2">
          <button
            type="button"
            onClick={() => openUserProfile()}
            className="flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
              <KeyRound className="h-4 w-4 text-white/50" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white/90">Password & authentication</p>
              <p className="mt-0.5 text-xs text-white/40">
                Manage your password, two-factor authentication, and connected accounts
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
          </button>
        </div>
      </div>

      {/* Sign out */}
      <div className="rounded-2xl border border-red-500/10 bg-red-500/[0.02]">
        <div className="p-2">
          <button
            type="button"
            onClick={() => signOut({ redirectUrl: "/" })}
            className="flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left transition-colors hover:bg-red-500/[0.06]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
              <LogOut className="h-4 w-4 text-red-400/70" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-400/90">Sign out</p>
              <p className="mt-0.5 text-xs text-white/35">
                End your session and return to the landing page
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-white/20" />
          </button>
        </div>
      </div>
    </div>
  )
}

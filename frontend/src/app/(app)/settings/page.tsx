"use client"

import { useUser } from "@clerk/nextjs"
import { User, Mail, Shield } from "lucide-react"

export default function SettingsPage() {
  const { user, isLoaded } = useUser()

  if (!isLoaded) {
    return (
      <div className="mx-auto max-w-3xl animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-white/[0.06]" />
        <div className="h-40 rounded-xl bg-white/[0.06]" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-display font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-white/50">
          Manage your account and preferences.
        </p>
      </div>

      {/* Profile */}
      <div className="rounded-xl border border-white/[0.06] bg-card p-6">
        <h2 className="text-base font-semibold text-white">Profile</h2>
        <div className="mt-4 flex items-center gap-4">
          {user?.imageUrl && (
            <img
              src={user.imageUrl}
              alt="Avatar"
              className="h-14 w-14 rounded-full border border-white/[0.1]"
            />
          )}
          <div className="space-y-1">
            <p className="font-medium text-white">
              {user?.fullName || "—"}
            </p>
            <p className="text-sm text-white/50">
              {user?.primaryEmailAddress?.emailAddress || "—"}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <User className="h-4 w-4 text-white/40" />
            <div>
              <p className="text-xs text-white/40">Full Name</p>
              <p className="text-sm text-white/80">
                {user?.fullName || "Not set"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <Mail className="h-4 w-4 text-white/40" />
            <div>
              <p className="text-xs text-white/40">Email</p>
              <p className="text-sm text-white/80">
                {user?.primaryEmailAddress?.emailAddress || "Not set"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <Shield className="h-4 w-4 text-white/40" />
            <div>
              <p className="text-xs text-white/40">Account ID</p>
              <p className="text-sm font-mono text-white/60">{user?.id}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

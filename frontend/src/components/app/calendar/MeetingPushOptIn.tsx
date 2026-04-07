"use client"

import { useCallback, useEffect, useState } from "react"
import { Bell, BellOff, Loader2 } from "lucide-react"
import { useApi } from "@/hooks/useApi"
import { fetchVapidPublicKey } from "@/lib/api"
import { registerPushServiceWorker, urlBase64ToUint8Array } from "@/lib/push-client"

export function MeetingPushOptIn() {
  const api = useApi()
  const [supported, setSupported] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [serverReady, setServerReady] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const s = await api.getPushStatus()
      setSubscribed(s.subscribed)
      setServerReady(s.vapid_public_key_configured)
    } catch {
      setSubscribed(false)
      setServerReady(false)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    setSupported(ok)
    if (ok) void refresh()
    else setLoading(false)
  }, [refresh])

  const enable = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const reg = await registerPushServiceWorker()
      if (!reg) {
        setMessage("Could not register the notification worker.")
        return
      }
      const perm = await Notification.requestPermission()
      if (perm !== "granted") {
        setMessage("Notifications were blocked. Enable them in the browser site settings.")
        return
      }
      const vapid = await fetchVapidPublicKey()
      if (!vapid) {
        setMessage("Meeting reminders are not configured on the server (VAPID keys).")
        return
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      })
      const json = sub.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setMessage("Invalid push subscription from the browser.")
        return
      }
      await api.subscribePush({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      })
      setSubscribed(true)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not enable reminders.")
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      const endpoint = sub?.endpoint
      if (sub) {
        await sub.unsubscribe()
      }
      if (endpoint) {
        await api.unsubscribePush(endpoint)
      }
      setSubscribed(false)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not disable reminders.")
    } finally {
      setBusy(false)
    }
  }

  if (!supported) {
    return (
      <p className="text-xs text-white/35">
        Browser reminders require a secure context (HTTPS or localhost) and a browser that supports
        Web Push.
      </p>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-white/40">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading reminder settings…
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
            <Bell className="h-4 w-4 text-white/60" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Meeting reminders</p>
            <p className="mt-0.5 text-xs text-white/40">
              Get an OS notification about{" "}
              {serverReady ? "~13 minutes before" : "meetings once the server is configured for push"}
              — works even when this site is closed.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {subscribed ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void disable()}
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/80 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellOff className="h-3.5 w-3.5" />}
              Turn off
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !serverReady}
              onClick={() => void enable()}
              className="inline-flex items-center gap-2 rounded-lg bg-white/[0.1] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/[0.14] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
              Enable reminders
            </button>
          )}
        </div>
      </div>
      {message && <p className="mt-2 text-xs text-amber-300/90">{message}</p>}
      {!serverReady && (
        <p className="mt-2 text-xs text-white/35">
          The API must expose VAPID keys (<code className="text-white/50">VAPID_PUBLIC_KEY</code>).
        </p>
      )}
    </div>
  )
}

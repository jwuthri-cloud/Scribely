/* global self, clients */

function absUrl(path) {
  return new URL(path, self.location.origin).href
}

function buildBody(payload) {
  if (payload.platformLabel && payload.startTimeIso && payload.leadMinutes != null) {
    const when = new Date(payload.startTimeIso)
    const timeLine = when.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    const minutes = payload.leadMinutes
    const lead =
      minutes <= 0
        ? "Starting now"
        : minutes === 1
          ? "Starts in 1 minute"
          : `Starts in ${minutes} minutes`
    return `${payload.platformLabel}\n${timeLine}\n${lead}`
  }

  return payload.body || "Tap to open your meeting or calendar."
}

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener("push", (event) => {
  let payload = {
    title: "Meeting reminder",
    body: "",
    meetingUrl: "",
    detailUrl: "/",
    scribelyUrl: "",
    calendarEventId: "",
    leadMinutes: null,
    startTimeIso: "",
    platformLabel: "",
    tag: "",
  }

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() }
    } catch {
      payload = { ...payload, body: event.data.text() || payload.body }
    }
  }

  const meetingTitle = (payload.title || "Meeting").trim() || "Meeting"
  const title =
    meetingTitle.length > 52
      ? `Scribely · ${meetingTitle.slice(0, 50)}...`
      : `Scribely · ${meetingTitle}`

  const options = {
    body: buildBody(payload),
    icon: absUrl("/scribely-icon.png"),
    badge: absUrl("/scribely-icon.png"),
    tag: payload.tag || (payload.calendarEventId ? `scribely-cal-${payload.calendarEventId}` : "scribely-calendar-reminder"),
    renotify: false,
    timestamp: Date.now(),
    requireInteraction: false,
    silent: false,
    data: {
      meetingUrl: payload.meetingUrl || "",
      detailUrl: payload.detailUrl || "/",
      scribelyUrl: payload.scribelyUrl || "",
      calendarEventId: payload.calendarEventId || "",
    },
  }

  if (payload.scribelyUrl && payload.meetingUrl) {
    options.actions = [
      { action: "browser", title: "Join in browser" },
      { action: "scribely", title: "Open in Scribely" },
    ]
  } else if (payload.meetingUrl) {
    options.actions = [{ action: "browser", title: "Join meeting" }]
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const data = event.notification.data || {}
  const action = event.action
  let url = data.meetingUrl || data.detailUrl || "/"

  if (action === "scribely" && data.scribelyUrl) {
    url = data.scribelyUrl
  } else if (action === "browser" && data.meetingUrl) {
    url = data.meetingUrl
  }

  const fullUrl =
    url.startsWith("http://") || url.startsWith("https://") || url.startsWith("scribely:")
      ? url
      : `${self.location.origin}${url.startsWith("/") ? url : `/${url}`}`

  event.waitUntil(clients.openWindow ? clients.openWindow(fullUrl) : Promise.resolve())
})

self.addEventListener("pushsubscriptionchange", () => {
  console.warn("Push subscription changed; a fresh subscription is required.")
})

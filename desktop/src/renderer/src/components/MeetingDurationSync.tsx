import { useEffect, useRef } from 'react'
import { formatMeetingDurationSeconds, useOverlayUiStore } from '../stores/overlay-ui-store'

/**
 * Keeps {@link useOverlayUiStore}'s `meetingDurationFormatted` in sync with wall clock while a meeting is active.
 * Renders nothing; mount once under the overlay shell so leaf components can subscribe to duration only.
 */
export function MeetingDurationSync({ active }: { active: boolean }) {
  const meetingStartRef = useRef(0)
  const meetingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const setFormatted = useOverlayUiStore((s) => s.setMeetingDurationFormatted)

  useEffect(() => {
    if (active) {
      meetingStartRef.current = Date.now()
      setFormatted(formatMeetingDurationSeconds(0))
      meetingTimerRef.current = setInterval(() => {
        const sec = Math.floor((Date.now() - meetingStartRef.current) / 1000)
        setFormatted(formatMeetingDurationSeconds(sec))
      }, 1000)
    } else {
      if (meetingTimerRef.current) {
        clearInterval(meetingTimerRef.current)
        meetingTimerRef.current = null
      }
      setFormatted(formatMeetingDurationSeconds(0))
    }
    return () => {
      if (meetingTimerRef.current) {
        clearInterval(meetingTimerRef.current)
        meetingTimerRef.current = null
      }
    }
  }, [active, setFormatted])

  return null
}

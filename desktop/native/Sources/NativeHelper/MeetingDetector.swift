import Foundation

/// Stub meeting detector for v1.
/// Full implementation (NSWorkspace notifications, AXUIElement, process scanning)
/// is deferred to a later phase.
final class MeetingDetector {
    /// Called when a meeting is detected or ends
    var onMeetingEvent: ((Assistme_MeetingEvent) -> Void)?

    /// Emit a synthetic meeting-detected event (placeholder for v1).
    /// In v2 this will use NSWorkspace + accessibility APIs to detect
    /// Zoom/Teams/Meet windows and active mic usage.
    func emitMeetingDetected(sourceApp: String = "manual") {
        var event = Assistme_MeetingEvent()
        event.eventType = "MEETING_DETECTED"
        event.confidence = 1.0
        event.sourceApp = sourceApp
        onMeetingEvent?(event)
    }

    func emitMeetingEnded(sourceApp: String = "manual") {
        var event = Assistme_MeetingEvent()
        event.eventType = "MEETING_ENDED"
        event.confidence = 1.0
        event.sourceApp = sourceApp
        onMeetingEvent?(event)
    }
}

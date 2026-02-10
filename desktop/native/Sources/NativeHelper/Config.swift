import Foundation

/// Central configuration for the NativeHelper daemon.
enum Config {
    /// UDS socket path — lives in Application Support
    static var socketPath: String {
        let appSupport = FileManager.default.urls(
            for: .applicationSupportDirectory, in: .userDomainMask
        ).first!.appendingPathComponent("AssistMe")

        // Ensure directory exists
        try? FileManager.default.createDirectory(
            at: appSupport, withIntermediateDirectories: true
        )

        return appSupport.appendingPathComponent("assistme.sock").path
    }

    /// Mic capture sample rate (16 kHz mono for speech)
    static let micSampleRate: Double = 16_000

    /// System audio sample rate (48 kHz stereo)
    static let systemSampleRate: Double = 48_000

    /// Audio chunk duration in seconds sent per protobuf message
    static let chunkDurationSeconds: Double = 3.0

    /// Max reconnect attempts before giving up
    static let maxReconnectAttempts = 5

    /// Log level (overridable via CLI --log-level)
    static var logLevel: LogLevel = .info

    enum LogLevel: String, CaseIterable {
        case debug, info, warn, error
    }
}

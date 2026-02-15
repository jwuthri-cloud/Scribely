import Foundation
import CoreAudio
import AudioToolbox
import AVFoundation
import ScreenCaptureKit

// MARK: - AudioCaptureEngine

/// Captures system audio via ScreenCaptureKit's SCStream audio tap (macOS 14+).
///
/// Mic capture is intentionally NOT done here — it's handled by the Electron
/// renderer via browser getUserMedia. This avoids two macOS issues:
///   1. CLI processes (no app bundle) can't reliably access the mic
///   2. Opening a mic on Bluetooth devices (AirPods) forces HFP mode,
///      degrading audio output quality. Browser getUserMedia handles this properly.
///
/// Emits `Scribely_AudioFrame` protobuf messages via the `onAudioFrame` callback,
/// chunked at `Config.chunkDurationSeconds` intervals.
final class AudioCaptureEngine {

    // ── State ───────────────────────────────────────────────

    enum State: String {
        case idle, capturing, paused, error
    }

    private(set) var currentState: State = .idle
    private(set) var isMicActive = false
    private(set) var isSystemAudioActive = false

    // ── Callbacks ───────────────────────────────────────────

    /// Called when an audio frame chunk is ready to send over IPC
    var onAudioFrame: ((Scribely_AudioFrame) -> Void)?

    /// Called on capture errors
    var onError: ((_ code: String, _ message: String) -> Void)?

    // ── System audio capture (SCStream) ─────────────────────

    private var scStream: SCStream?
    private var streamOutput: SystemAudioStreamOutput?
    private var systemBuffer: [Float] = []
    private let systemLock = NSLock()
    private let systemChunkSamples: Int

    // ── Init ────────────────────────────────────────────────

    init() {
        systemChunkSamples = Int(Config.systemSampleRate * Config.chunkDurationSeconds)
    }

    // MARK: - Public API

    func start(captureMic: Bool, captureSystem: Bool) {
        stop() // clean slate

        currentState = .capturing

        // Mic capture is handled by the Electron renderer (browser getUserMedia).
        // We only log if it was requested so the caller knows.
        if captureMic {
            log(.info, "Mic capture requested but handled by Electron renderer (browser getUserMedia)")
        }

        if captureSystem {
            startSystemAudioCapture()
        }

        if !captureSystem {
            currentState = .idle
        }
    }

    func stop() {
        stopSystemAudioCapture()
        flushBuffers()
        currentState = .idle
        isMicActive = false
        isSystemAudioActive = false
    }

    func pause() {
        guard currentState == .capturing else { return }
        scStream?.stopCapture { _ in }
        currentState = .paused
    }

    func resume() {
        guard currentState == .paused else { return }
        if let stream = scStream {
            stream.startCapture { _ in }
        }
        currentState = .capturing
    }

    // MARK: - System Audio Capture (SCStream)

    private func startSystemAudioCapture() {
        // SCStream requires macOS 14+ for audio-only capture
        guard #available(macOS 14.0, *) else {
            log(.warn, "System audio capture requires macOS 14+")
            onError?("SYSTEM_AUDIO_UNSUPPORTED", "macOS 14+ required for system audio capture")
            return
        }

        Task {
            do {
                try await _startSCStreamCapture()
                isSystemAudioActive = true
                log(.info, "System audio capture started (SCStream, 48 kHz)")
            } catch {
                log(.error, "System audio capture failed: \(error)")
                onError?("SYSTEM_AUDIO_START_FAILED", error.localizedDescription)
            }
        }
    }

    @available(macOS 14.0, *)
    private func _startSCStreamCapture() async throws {
        // Get shareable content (we need at least one display for audio-only capture)
        let content = try await SCShareableContent.excludingDesktopWindows(
            false, onScreenWindowsOnly: false
        )

        guard let display = content.displays.first else {
            throw AudioCaptureError.noDisplayFound
        }

        // Configure: capture audio only
        // Exclude our own NativeHelper process so we don't create a feedback loop,
        // but do NOT exclude Electron (the parent) — that would silence tab audio
        // routed through the browser.
        var excludedApps: [SCRunningApplication] = []
        let myPID = ProcessInfo.processInfo.processIdentifier
        for app in content.applications {
            // Only exclude NativeHelper itself (by PID match)
            if app.processID == myPID {
                excludedApps.append(app)
            }
        }

        let filter = SCContentFilter(display: display, excludingApplications: excludedApps, exceptingWindows: [])

        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = false  // Don't exclude — we need all system audio
        config.sampleRate = Int(Config.systemSampleRate)
        config.channelCount = 2  // Request stereo — SCStream often ignores mono requests

        // Minimize video overhead — we only want audio
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1) // 1 fps minimum
        config.showsCursor = false

        // Create stream
        let stream = SCStream(filter: filter, configuration: config, delegate: nil)

        // Create output handler
        let output = SystemAudioStreamOutput { [weak self] samples in
            self?.handleSystemSamples(samples)
        }

        try stream.addStreamOutput(output, type: .audio, sampleHandlerQueue: .global(qos: .userInteractive))
        try await stream.startCapture()

        self.scStream = stream
        self.streamOutput = output
    }

    private func stopSystemAudioCapture() {
        guard let stream = scStream else { return }
        stream.stopCapture { [weak self] error in
            if let error = error {
                log(.warn, "SCStream stop error: \(error)")
            }
            self?.scStream = nil
            self?.streamOutput = nil
            self?.isSystemAudioActive = false
            log(.info, "System audio capture stopped")
        }
    }

    /// Accumulate system audio PCM samples and emit chunks
    private func handleSystemSamples(_ samples: [Float]) {
        systemLock.lock()
        systemBuffer.append(contentsOf: samples)

        if systemBuffer.count >= systemChunkSamples {
            let chunk = Array(systemBuffer.prefix(systemChunkSamples))
            systemBuffer.removeFirst(systemChunkSamples)
            systemLock.unlock()
            emitAudioFrame(source: "system", samples: chunk, sampleRate: UInt32(Config.systemSampleRate))
        } else {
            systemLock.unlock()
        }
    }

    // MARK: - Shared

    private func emitAudioFrame(source: String, samples: [Float], sampleRate: UInt32) {
        var frame = Scribely_AudioFrame()
        frame.source = source
        frame.sampleRate = sampleRate
        frame.timestampMs = UInt64(Date().timeIntervalSince1970 * 1000)
        frame.numSamples = UInt32(samples.count)

        // Convert Float32 array to raw bytes (zero-copy via Data)
        frame.pcmData = samples.withUnsafeBufferPointer { ptr in
            Data(buffer: ptr.baseAddress!.withMemoryRebound(to: UInt8.self, capacity: ptr.count * 4) {
                UnsafeBufferPointer(start: $0, count: ptr.count * 4)
            })
        }

        onAudioFrame?(frame)
    }

    private func flushBuffers() {
        systemLock.lock()
        if !systemBuffer.isEmpty {
            let remaining = systemBuffer
            systemBuffer.removeAll()
            systemLock.unlock()
            if remaining.count > Int(Config.systemSampleRate) / 3 {
                emitAudioFrame(source: "system", samples: remaining, sampleRate: UInt32(Config.systemSampleRate))
            }
        } else {
            systemLock.unlock()
        }
    }

    // MARK: - Errors

    enum AudioCaptureError: Error, CustomStringConvertible {
        case noDisplayFound

        var description: String {
            switch self {
            case .noDisplayFound:
                return "No display found for SCStream audio capture"
            }
        }
    }
}

// MARK: - SCStream Audio Output Handler

/// Receives audio sample buffers from SCStream and extracts Float32 PCM.
final class SystemAudioStreamOutput: NSObject, SCStreamOutput {
    private let onSamples: ([Float]) -> Void

    init(onSamples: @escaping ([Float]) -> Void) {
        self.onSamples = onSamples
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }
        guard sampleBuffer.isValid, sampleBuffer.numSamples > 0 else { return }

        // Extract audio buffer
        guard let blockBuffer = sampleBuffer.dataBuffer else { return }

        var totalLength = 0
        var dataPointer: UnsafeMutablePointer<CChar>?
        let status = CMBlockBufferGetDataPointer(
            blockBuffer, atOffset: 0, lengthAtOffsetOut: nil,
            totalLengthOut: &totalLength, dataPointerOut: &dataPointer
        )
        guard status == kCMBlockBufferNoErr, let ptr = dataPointer else { return }

        // Get audio format to determine sample count and layout
        guard let formatDesc = sampleBuffer.formatDescription,
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc) else { return }

        let bytesPerSample = Int(asbd.pointee.mBitsPerChannel / 8)
        guard bytesPerSample == 4 else { return } // Expect Float32

        let channelCount = Int(asbd.pointee.mChannelsPerFrame)
        let isInterleaved = (asbd.pointee.mFormatFlags & kAudioFormatFlagIsNonInterleaved) == 0
        let numFrames = sampleBuffer.numSamples  // number of audio frames

        // Convert to Float32 array
        let floatPtr = UnsafeRawPointer(ptr).assumingMemoryBound(to: Float.self)
        let totalFloats = totalLength / bytesPerSample

        if channelCount == 1 {
            // Mono — direct copy
            let count = min(numFrames, totalFloats)
            let samples = Array(UnsafeBufferPointer(start: floatPtr, count: count))
            onSamples(samples)
        } else if isInterleaved {
            // Interleaved multi-channel — mix down to mono by averaging
            let frameCount = min(numFrames, totalFloats / channelCount)
            var monoSamples = [Float](repeating: 0, count: frameCount)
            let scale = 1.0 / Float(channelCount)
            for i in 0..<frameCount {
                var sum: Float = 0
                for ch in 0..<channelCount {
                    sum += floatPtr[i * channelCount + ch]
                }
                monoSamples[i] = sum * scale
            }
            onSamples(monoSamples)
        } else {
            // Non-interleaved: channels are stored sequentially in separate planes
            // Layout: [ch0_frame0, ch0_frame1, ..., ch1_frame0, ch1_frame1, ...]
            let framesPerChannel = totalFloats / channelCount
            let frameCount = min(numFrames, framesPerChannel)
            var monoSamples = [Float](repeating: 0, count: frameCount)
            let scale = 1.0 / Float(channelCount)
            for ch in 0..<channelCount {
                let channelOffset = ch * framesPerChannel
                for i in 0..<frameCount {
                    monoSamples[i] += floatPtr[channelOffset + i] * scale
                }
            }
            onSamples(monoSamples)
        }
    }
}

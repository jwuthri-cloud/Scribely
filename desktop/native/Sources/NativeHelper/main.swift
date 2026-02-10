import Foundation

// ── CLI argument parsing ────────────────────────────────────

var socketPath = Config.socketPath

var args = CommandLine.arguments.dropFirst()
while let arg = args.first {
    args = args.dropFirst()
    switch arg {
    case "--socket-path":
        if let val = args.first {
            socketPath = val
            args = args.dropFirst()
        }
    case "--log-level":
        if let val = args.first,
           let level = Config.LogLevel(rawValue: val.lowercased()) {
            Config.logLevel = level
            args = args.dropFirst()
        }
    default:
        break
    }
}

// ── Initialize components ───────────────────────────────────

log(.info, "NativeHelper starting (socket: \(socketPath))")

let audioEngine = AudioCaptureEngine()
let ipcServer = IPCServer(socketPath: socketPath)
let meetingDetector = MeetingDetector()

// ── Wire audio callbacks → IPC ──────────────────────────────

audioEngine.onAudioFrame = { frame in
    var msg = Assistme_NativeMessage()
    msg.audioFrame = frame
    ipcServer.send(msg)
}

audioEngine.onError = { code, message in
    var msg = Assistme_NativeMessage()
    var err = Assistme_ErrorEvent()
    err.code = code
    err.message = message
    msg.error = err
    ipcServer.send(msg)
}

// ── Wire meeting detector → IPC ─────────────────────────────

meetingDetector.onMeetingEvent = { event in
    var msg = Assistme_NativeMessage()
    msg.meetingEvent = event
    ipcServer.send(msg)
}

// ── Handle control messages from Electron ───────────────────

ipcServer.onControlMessage = { controlMsg in
    switch controlMsg.command {
    case .startCapture(let start):
        log(.info, "StartCapture — mic: \(start.captureMic), system: \(start.captureSystem)")
        audioEngine.start(captureMic: start.captureMic, captureSystem: start.captureSystem)

        // Send status update
        var status = Assistme_StatusUpdate()
        status.state = "capturing"
        status.micActive = start.captureMic
        status.systemAudioActive = start.captureSystem
        var msg = Assistme_NativeMessage()
        msg.status = status
        ipcServer.send(msg)

        // Emit synthetic meeting event (v1 stub)
        meetingDetector.emitMeetingDetected()

    case .stopCapture:
        log(.info, "StopCapture")
        audioEngine.stop()

        var status = Assistme_StatusUpdate()
        status.state = "idle"
        status.micActive = false
        status.systemAudioActive = false
        var msg = Assistme_NativeMessage()
        msg.status = status
        ipcServer.send(msg)

        meetingDetector.emitMeetingEnded()

    case .pauseCapture:
        log(.info, "PauseCapture")
        audioEngine.pause()

        var status = Assistme_StatusUpdate()
        status.state = "paused"
        var msg = Assistme_NativeMessage()
        msg.status = status
        ipcServer.send(msg)

    case .resumeCapture:
        log(.info, "ResumeCapture")
        audioEngine.resume()

        var status = Assistme_StatusUpdate()
        status.state = "capturing"
        var msg = Assistme_NativeMessage()
        msg.status = status
        ipcServer.send(msg)

    case .getStatus:
        let engineState = audioEngine.currentState
        var status = Assistme_StatusUpdate()
        status.state = engineState.rawValue
        status.micActive = audioEngine.isMicActive
        status.systemAudioActive = audioEngine.isSystemAudioActive
        var msg = Assistme_NativeMessage()
        msg.status = status
        ipcServer.send(msg)

    case .none:
        log(.warn, "Received ControlMessage with no command")
    }
}

ipcServer.onClientConnected = {
    log(.info, "Electron client connected")
}

ipcServer.onClientDisconnected = {
    log(.info, "Electron client disconnected — stopping capture")
    audioEngine.stop()
}

// ── Signal handling ─────────────────────────────────────────

func setupSignalHandlers() {
    let signalSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
    signalSource.setEventHandler {
        log(.info, "Received SIGTERM — shutting down")
        audioEngine.stop()
        ipcServer.stop()
        exit(0)
    }
    signalSource.resume()
    signal(SIGTERM, SIG_IGN)

    let intSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
    intSource.setEventHandler {
        log(.info, "Received SIGINT — shutting down")
        audioEngine.stop()
        ipcServer.stop()
        exit(0)
    }
    intSource.resume()
    signal(SIGINT, SIG_IGN)
}

// ── Start ───────────────────────────────────────────────────

do {
    setupSignalHandlers()
    try ipcServer.start()
    log(.info, "NativeHelper ready — waiting for Electron client")
    RunLoop.main.run()
} catch {
    log(.error, "Failed to start: \(error)")
    exit(1)
}

import Foundation

/// Unix Domain Socket IPC server.
/// Listens for a single Electron client, receives ControlMessage,
/// sends NativeMessage (both length-prefixed protobuf).
final class IPCServer {
    private let socketPath: String
    private var serverSocket: Int32 = -1
    private var clientSocket: Int32 = -1
    private var isRunning = false
    private let queue = DispatchQueue(label: "com.scribely.ipc", qos: .userInteractive)
    private let readQueue = DispatchQueue(label: "com.scribely.ipc.read", qos: .userInteractive)

    /// Called when a ControlMessage is received from the client
    var onControlMessage: ((Scribely_ControlMessage) -> Void)?

    /// Called when the client connects
    var onClientConnected: (() -> Void)?

    /// Called when the client disconnects
    var onClientDisconnected: (() -> Void)?

    init(socketPath: String = Config.socketPath) {
        self.socketPath = socketPath
    }

    // MARK: - Lifecycle

    func start() throws {
        // Remove stale socket file
        unlink(socketPath)

        // Create socket
        serverSocket = socket(AF_UNIX, SOCK_STREAM, 0)
        guard serverSocket >= 0 else {
            throw IPCError.socketCreationFailed(errno: errno)
        }

        // Bind
        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        withUnsafeMutablePointer(to: &addr.sun_path) { ptr in
            socketPath.withCString { cstr in
                _ = strcpy(UnsafeMutableRawPointer(ptr).assumingMemoryBound(to: CChar.self), cstr)
            }
        }

        let bindResult = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
                bind(serverSocket, sockPtr, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard bindResult == 0 else {
            close(serverSocket)
            throw IPCError.bindFailed(errno: errno)
        }

        // Listen (single client)
        guard listen(serverSocket, 1) == 0 else {
            close(serverSocket)
            throw IPCError.listenFailed(errno: errno)
        }

        isRunning = true
        log(.info, "IPC server listening on \(socketPath)")

        // Accept connections in background
        queue.async { [weak self] in
            self?.acceptLoop()
        }
    }

    func stop() {
        isRunning = false
        if clientSocket >= 0 {
            close(clientSocket)
            clientSocket = -1
        }
        if serverSocket >= 0 {
            close(serverSocket)
            serverSocket = -1
        }
        unlink(socketPath)
        log(.info, "IPC server stopped")
    }

    // MARK: - Send

    /// Send a NativeMessage to the connected client (length-prefixed protobuf).
    func send(_ message: Scribely_NativeMessage) {
        guard clientSocket >= 0 else { return }

        do {
            let data = try message.serializedData()
            var length = UInt32(data.count).bigEndian
            let header = Data(bytes: &length, count: 4)

            // Write header + body atomically
            let combined = header + data
            combined.withUnsafeBytes { ptr in
                let baseAddr = ptr.baseAddress!
                var remaining = combined.count
                var offset = 0
                while remaining > 0 {
                    let written = Darwin.write(clientSocket, baseAddr + offset, remaining)
                    if written <= 0 {
                        log(.warn, "IPC write failed — client may have disconnected")
                        return
                    }
                    offset += written
                    remaining -= written
                }
            }
        } catch {
            log(.error, "Failed to serialize NativeMessage: \(error)")
        }
    }

    // MARK: - Private

    private func acceptLoop() {
        while isRunning {
            var clientAddr = sockaddr_un()
            var clientAddrLen = socklen_t(MemoryLayout<sockaddr_un>.size)

            let fd = withUnsafeMutablePointer(to: &clientAddr) { ptr in
                ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
                    accept(serverSocket, sockPtr, &clientAddrLen)
                }
            }

            guard fd >= 0 else {
                if isRunning { log(.warn, "Accept failed: \(errno)") }
                continue
            }

            // Close previous client if any
            if clientSocket >= 0 {
                close(clientSocket)
            }
            clientSocket = fd
            log(.info, "Client connected (fd=\(fd))")
            onClientConnected?()

            // Read loop for this client
            readLoop(fd: fd)

            // Client disconnected
            if clientSocket == fd {
                clientSocket = -1
            }
            close(fd)
            log(.info, "Client disconnected")
            onClientDisconnected?()
        }
    }

    private func readLoop(fd: Int32) {
        var headerBuf = Data(count: 4)
        while isRunning && clientSocket == fd {
            // Read 4-byte length prefix
            guard readExact(fd: fd, into: &headerBuf, count: 4) else { break }

            let length = headerBuf.withUnsafeBytes { $0.load(as: UInt32.self).bigEndian }
            guard length > 0 && length < 10_000_000 else {
                log(.warn, "Invalid frame length: \(length)")
                break
            }

            // Read protobuf body
            var bodyBuf = Data(count: Int(length))
            guard readExact(fd: fd, into: &bodyBuf, count: Int(length)) else { break }

            // Decode ControlMessage
            do {
                let msg = try Scribely_ControlMessage(serializedBytes: bodyBuf)
                onControlMessage?(msg)
            } catch {
                log(.error, "Failed to decode ControlMessage: \(error)")
            }
        }
    }

    private func readExact(fd: Int32, into buffer: inout Data, count: Int) -> Bool {
        var offset = 0
        while offset < count {
            let n = buffer.withUnsafeMutableBytes { ptr in
                read(fd, ptr.baseAddress! + offset, count - offset)
            }
            if n <= 0 { return false }
            offset += n
        }
        return true
    }

    // MARK: - Errors

    enum IPCError: Error, CustomStringConvertible {
        case socketCreationFailed(errno: Int32)
        case bindFailed(errno: Int32)
        case listenFailed(errno: Int32)

        var description: String {
            switch self {
            case .socketCreationFailed(let e): return "Socket creation failed (errno \(e))"
            case .bindFailed(let e): return "Bind failed (errno \(e))"
            case .listenFailed(let e): return "Listen failed (errno \(e))"
            }
        }
    }
}

// MARK: - Logging helper

func log(_ level: Config.LogLevel, _ message: String) {
    let levels: [Config.LogLevel] = [.debug, .info, .warn, .error]
    guard let currentIdx = levels.firstIndex(of: Config.logLevel),
          let msgIdx = levels.firstIndex(of: level),
          msgIdx >= currentIdx else { return }
    let timestamp = ISO8601DateFormatter().string(from: Date())
    print("[\(timestamp)] [\(level.rawValue.uppercased())] \(message)")
}

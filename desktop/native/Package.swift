// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "NativeHelper",
    platforms: [
        .macOS(.v14)  // Require macOS 14+ for SCStream audio tap
    ],
    products: [
        .executable(name: "NativeHelper", targets: ["NativeHelper"])
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-protobuf.git", from: "1.28.0")
    ],
    targets: [
        .executableTarget(
            name: "NativeHelper",
            dependencies: [
                .product(name: "SwiftProtobuf", package: "swift-protobuf")
            ],
            path: "Sources/NativeHelper",
            linkerSettings: [
                .linkedFramework("CoreAudio"),
                .linkedFramework("AudioToolbox"),
                .linkedFramework("ScreenCaptureKit"),
                .linkedFramework("AVFoundation")
            ]
        )
    ]
)

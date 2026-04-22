/**
 * @type {import('next').NextConfig}
 *
 * Production: set NEXT_SERVER_ACTIONS_ENCRYPTION_KEY at **build** time (openssl rand -base64 32)
 * and keep the same value across replicas / rebuilds where you need zero-downtime deploys.
 * Prevents "Failed to find Server Action" when HTML/JS skew or instances disagree on action IDs.
 * @see https://nextjs.org/docs/messages/failed-to-find-server-action
 */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["remotion", "@remotion/player"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.clerk.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.clerk.dev",
        pathname: "/**",
      },
    ],
  },
}

module.exports = nextConfig

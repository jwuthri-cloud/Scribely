// TODO: Future web app layout
// This route group will host the authenticated web app experience.
// When implementing:
// 1. Add authentication provider (e.g., Clerk, NextAuth, or custom)
// 2. Add auth middleware to protect these routes
// 3. Replace the marketing Navbar/Footer with app-specific navigation
// 4. Add sidebar, dashboard layout, etc.

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}

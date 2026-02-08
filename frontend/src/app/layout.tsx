import React from "react";
import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ToastProvider } from "@/components/providers/toast-provider";
import { Toaster } from "react-hot-toast";

const inter = Inter({ subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "{{cookiecutter.project_name}}",
  description: "{{cookiecutter.description}}",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <html lang="en" className="dark">
        <body
          className={`${inter.className} ${spaceGrotesk.variable} bg-gray-950 text-white antialiased`}
        >
          <ThemeProvider>
            <ToastProvider>
              {children}
              <Toaster position="top-right" />
            </ToastProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}

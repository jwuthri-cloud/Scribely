"use client"

import React from "react"
import { WorkspaceShell } from "@/components/app/workspace/WorkspaceShell"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>
}

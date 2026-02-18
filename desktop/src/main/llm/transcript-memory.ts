/**
 * Tracks transcript summary state for Phase 2 scaling.
 *
 * The summary is a safety net: when old conversation messages are truncated
 * due to context overflow, the summary provides big-picture context for
 * transcript content that would otherwise be lost.
 */

export interface TranscriptSummaryState {
  /** Summary text covering entries up to coverageIndex */
  summary: string | null
  /** Last transcript entry index covered by the summary (0-based, inclusive) */
  coverageIndex: number
  /** Timestamp when the summary was last updated (ms) */
  updatedAt: number
  /** Whether a summarization run is currently in progress */
  summarizationInProgress: boolean
}

const DEFAULT_STALENESS_MS = 5 * 60 * 1000 // 5 minutes

export class TranscriptMemory {
  private state: TranscriptSummaryState = {
    summary: null,
    coverageIndex: -1,
    updatedAt: 0,
    summarizationInProgress: false,
  }

  getSummary(): string | null {
    return this.state.summary
  }

  getCoverageIndex(): number {
    return this.state.coverageIndex
  }

  isStale(stalenessMs: number = DEFAULT_STALENESS_MS): boolean {
    if (!this.state.summary) return true
    return Date.now() - this.state.updatedAt > stalenessMs
  }

  isSummarizationInProgress(): boolean {
    return this.state.summarizationInProgress
  }

  setSummarizationInProgress(inProgress: boolean): void {
    this.state.summarizationInProgress = inProgress
  }

  updateSummary(summary: string, coverageIndex: number): void {
    this.state = {
      ...this.state,
      summary,
      coverageIndex,
      updatedAt: Date.now(),
      summarizationInProgress: false,
    }
  }

  /** Reset state (e.g. when conversation is reset) */
  reset(): void {
    this.state = {
      summary: null,
      coverageIndex: -1,
      updatedAt: 0,
      summarizationInProgress: false,
    }
  }

  /** Check if we should trigger summarization based on plan conditions */
  shouldTrigger(
    totalTranscriptTokens: number,
    modelBudget: number,
    options?: { stalenessMs?: number; thresholdPercent?: number },
  ): boolean {
    const stalenessMs = options?.stalenessMs ?? DEFAULT_STALENESS_MS
    const thresholdPercent = options?.thresholdPercent ?? 40
    const overThreshold =
      totalTranscriptTokens > modelBudget * (thresholdPercent / 100)
    const needsUpdate = !this.state.summary || this.isStale(stalenessMs)
    const notBusy = !this.state.summarizationInProgress

    return overThreshold && needsUpdate && notBusy
  }
}

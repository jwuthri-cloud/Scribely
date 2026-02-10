// ── Audio & Meeting Types ────────────────────────────────

export type AudioSource = 'mic' | 'system' | 'mixed'

export type MeetingMode = '1on1' | 'multiparty'

export type AudioSourceType = 'tab' | 'window' | 'system' | 'mic-only'

export interface TranscriptEntry {
  id: string
  speaker: string // "You", "Them", or custom name
  text: string
  startTime: number // ms from session start
  endTime: number
  confidence: number // speaker attribution confidence [0,1]
  source: AudioSource
  isEdited: boolean
}

export interface SpeakerProfile {
  id: string
  name: string
  color: string
  source: AudioSource
}

export interface MeetingSession {
  id: string
  startedAt: number
  mode: MeetingMode
  speakers: SpeakerProfile[]
  entries: TranscriptEntry[]
  isRecording: boolean
  audioSourceType: AudioSourceType
}

export interface AudioCaptureConfig {
  micEnabled: boolean
  tabEnabled: boolean
  mode: MeetingMode
  speakerNames: {
    local: string
    remote: string
  }
}

export interface WhisperModelStatus {
  available: boolean
  downloading: boolean
  progress: number
  path?: string
  error?: string
}

export interface VadModelStatus {
  available: boolean
  downloading: boolean
  progress: number
  ready: boolean
}

export interface ModelStatus {
  whisperModel: WhisperModelStatus
  vadModel: VadModelStatus
}

export interface MeetingStatus {
  isActive: boolean
  isTranscribing: boolean
  transcriptionMode: string // provider id or 'downloading'
  modelStatus: ModelStatus
  error?: string
}

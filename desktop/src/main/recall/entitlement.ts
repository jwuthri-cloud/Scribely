import os from 'os'
import { createLogger } from '../logger'

const log = createLogger('recall')

export type CaptureProvider = 'recall' | 'base'

export interface RecallCapability {
  capable: boolean
  reason: string
}

export interface RecallDecision {
  provider: CaptureProvider
  entitled: boolean
  capability: RecallCapability
  reason: string
}

/**
 * Can this machine run the Recall Desktop SDK at all?
 * macOS: Apple Silicon (arm64), >= 13.0 (Darwin kernel 22). Windows: 10+ x64.
 *
 * ponytail: coarse platform/arch/OS-version gate only. Permission checks
 * (mic/screen-capture/accessibility via RecallAiSdk.requestPermission) are added in
 * Phase 2 when the SDK is actually wired — upgrade this then.
 */
export function getRecallCapability(): RecallCapability {
  const { platform, arch } = process
  if (platform === 'darwin') {
    if (arch !== 'arm64') {
      return { capable: false, reason: 'macOS Intel not supported (Apple Silicon required)' }
    }
    const major = parseInt(os.release().split('.')[0] || '0', 10) // Darwin 22 == macOS 13
    if (major < 22) {
      return { capable: false, reason: `macOS < 13.0 (Darwin ${os.release()})` }
    }
    return { capable: true, reason: 'macOS Apple Silicon >= 13.0' }
  }
  if (platform === 'win32') {
    if (arch !== 'x64') return { capable: false, reason: 'Windows non-x64 not supported' }
    return { capable: true, reason: 'Windows x64' }
  }
  return { capable: false, reason: `platform ${platform} not supported` }
}

let current: RecallDecision = {
  provider: 'base',
  entitled: false,
  capability: { capable: false, reason: 'not evaluated' },
  reason: 'default (not evaluated)',
}

/**
 * Resolve which capture provider to use given the backend entitlement flag and this
 * machine's capability, log it, and cache it. Phase 2 reads getCaptureProvider().
 * Non-entitled OR incapable always falls back to the base local-Whisper SDK.
 */
export function resolveCaptureProvider(entitled: boolean): RecallDecision {
  const capability = getRecallCapability()
  let provider: CaptureProvider = 'base'
  let reason: string
  if (!entitled) {
    reason = 'not entitled — using base SDK'
  } else if (!capability.capable) {
    reason = `entitled but incapable (${capability.reason}) — falling back to base SDK`
  } else {
    provider = 'recall'
    reason = 'entitled and capable — using Recall SDK'
  }
  current = { provider, entitled, capability, reason }
  log.info(`Capture provider: ${provider} (${reason})`)
  return current
}

export function getCaptureProvider(): CaptureProvider {
  return current.provider
}

export function getRecallDecision(): RecallDecision {
  return current
}

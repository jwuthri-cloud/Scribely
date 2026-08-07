import { useEffect, useState, useCallback, useRef } from 'react'
import type { SystemPrompt } from '../types'
import {
  type ModelId,
  type LLMProvider,
  type LocalModelInfo,
  type SummarizationSettings,
  type QuickAction,
  DEFAULT_SUMMARIZATION,
  DEFAULT_SUMMARIZER_SYSTEM_PROMPT,
  DEFAULT_QUICK_ACTIONS,
  PRESET_SYSTEM_PROMPT_IDS,
  modelOptionsForProvider,
} from '../types/settings'
import { IconPicker, getQuickActionIcon } from './QuickActionIcons'
import { useOverlayUiStore } from '../stores/overlay-ui-store'

const PROVIDER_OPTIONS: { id: LLMProvider; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'ollama', label: 'Ollama' },
  { id: 'lmstudio', label: 'LM Studio' },
]

// ── Section layout helper (matches SettingsView) ─────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        {title}
      </h3>
      <div
        className="rounded-xl p-3 border"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ── LLM View ─────────────────────────────────────────────
export function LLMView() {
  const [provider, setProvider] = useState<LLMProvider>('openai')
  const [localBaseUrl, setLocalBaseUrl] = useState('')
  const [localModels, setLocalModels] = useState<LocalModelInfo[]>([])
  const [localConnectionStatus, setLocalConnectionStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false)
  const [anthropicKeyInput, setAnthropicKeyInput] = useState('')
  const [anthropicKeyStatus, setAnthropicKeyStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [temperature, setTemperature] = useState(0.3)
  const [currentModel, setCurrentModel] = useState<string>('gpt-5-mini')
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([])
  const [activePromptId, setActivePromptId] = useState<string | null>(null)
  const [editingPrompt, setEditingPrompt] = useState<SystemPrompt | null>(null)
  const [newPromptName, setNewPromptName] = useState('')
  const [newPromptContent, setNewPromptContent] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Default system prompt (editable override)
  const [defaultSystemPromptOverride, setDefaultSystemPromptOverride] = useState<string | null>(null)
  const [builtInDefaultPrompt, setBuiltInDefaultPrompt] = useState<string>('')
  const [editingDefaultPrompt, setEditingDefaultPrompt] = useState(false)
  const [defaultPromptDraft, setDefaultPromptDraft] = useState('')

  // Summarization
  const [summarization, setSummarization] = useState<SummarizationSettings>(DEFAULT_SUMMARIZATION)
  const [editingSummarizerPrompt, setEditingSummarizerPrompt] = useState(false)
  const [summarizerPromptDraft, setSummarizerPromptDraft] = useState('')

  // Quick actions (unlimited; empty = use defaults)
  const [quickActions, setQuickActions] = useState<QuickAction[]>([])
  const [editingQuickAction, setEditingQuickAction] = useState<QuickAction | null>(null)
  const [editingQuickActionIndex, setEditingQuickActionIndex] = useState(-1)
  const [newQuickActionLabel, setNewQuickActionLabel] = useState('')
  const [newQuickActionValue, setNewQuickActionValue] = useState('')
  const [newQuickActionIcon, setNewQuickActionIcon] = useState<string>('pencil')
  const [showNewQuickAction, setShowNewQuickAction] = useState(false)

  // Usage/cost tracking (Phase 3)
  const [usageStats, setUsageStats] = useState<{
    promptTokens: number
    completionTokens: number
    cachedTokens: number
    estimatedCostUsd: number
  } | null>(null)

  // ── Load initial state ──
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    api.llmGetProvider().then((p) => setProvider((p as LLMProvider) || 'openai'))
    api.llmGetLocalBaseUrl?.().then((url) => setLocalBaseUrl(url || ''))
    api.llmHasApiKey().then(setHasApiKey)
    api.llmHasAnthropicApiKey?.().then(setHasAnthropicKey)
    api.llmGetModel().then((m) => setCurrentModel(m || 'gpt-5-mini'))
    api.getSettings().then((s) => {
      if (s?.llm?.temperature !== undefined) setTemperature(s.llm.temperature)
    })
    api.llmGetSystemPrompts().then(setSystemPrompts)
    api.llmGetActiveSystemPrompt().then(setActivePromptId)
    api.getSettings().then((s) => {
      if (s?.llm?.summarization) setSummarization(s.llm.summarization)
      if (s?.llm?.quickActions) setQuickActions(s.llm.quickActions)
      if (s?.llm?.defaultSystemPromptOverride !== undefined) setDefaultSystemPromptOverride(s.llm.defaultSystemPromptOverride)
    })
    api.llmGetBuiltInDefaultSystemPrompt?.().then(setBuiltInDefaultPrompt)
    api.llmGetUsageStats?.().then(setUsageStats)
  }, [])

  // Load local models when provider is local
  useEffect(() => {
    if (provider !== 'ollama' && provider !== 'lmstudio') return
    const api = window.electronAPI
    if (!api?.llmListLocalModels) return
    setLocalConnectionStatus('checking')
    api.llmListLocalModels().then((r) => {
      setLocalModels(r.models || [])
      setLocalConnectionStatus(r.error ? 'error' : 'ok')
    })
  }, [provider])

  // Refresh usage when it updates (after each chat response)
  useEffect(() => {
    const unsub = window.electronAPI?.onLLMUsageUpdated?.(() => {
      window.electronAPI?.llmGetUsageStats?.().then(setUsageStats)
    })
    return () => unsub?.()
  }, [])

  // ── Provider selection ──
  const handleProviderSelect = useCallback(async (p: LLMProvider) => {
    const result = await window.electronAPI?.llmSetProvider?.(p)
    if (result?.success) {
      setProvider(p)
      setHasApiKey(!!(await window.electronAPI?.llmHasApiKey?.()))
      setHasAnthropicKey(!!(await window.electronAPI?.llmHasAnthropicApiKey?.()))
      if (result.model) setCurrentModel(result.model)
      if (p === 'ollama' || p === 'lmstudio') {
        const url = await window.electronAPI?.llmGetLocalBaseUrl?.()
        setLocalBaseUrl(url || '')
      }
      window.electronAPI?.updateSettings?.({ llm: { provider: p } } as any)
    }
  }, [])

  const handleLocalBaseUrlChange = useCallback((url: string) => {
    setLocalBaseUrl(url)
  }, [])

  const handleLocalBaseUrlBlur = useCallback(async () => {
    await window.electronAPI?.llmSetLocalBaseUrl?.(localBaseUrl)
  }, [localBaseUrl])

  const handleRefreshLocalModels = useCallback(async () => {
    setLocalConnectionStatus('checking')
    const r = await window.electronAPI?.llmListLocalModels?.()
    setLocalModels(r?.models || [])
    setLocalConnectionStatus(r?.error ? 'error' : 'ok')
  }, [])

  const handleTestLocalConnection = useCallback(async () => {
    setLocalConnectionStatus('checking')
    const r = await window.electronAPI?.llmTestLocalConnection?.()
    setLocalConnectionStatus(r?.ok ? 'ok' : 'error')
  }, [])

  // ── Model selection ──
  const handleModelSelect = useCallback(async (modelId: string) => {
    const result = await window.electronAPI?.llmSetModel(modelId)
    if (result?.success) {
      setCurrentModel(modelId)
      // Keep the overlay's model chip in step with the LLM tab
      useOverlayUiStore.getState().setCurrentModel(modelId)
    }
  }, [])

  // ── API Key ──
  const handleSaveApiKey = useCallback(async () => {
    if (!apiKeyInput.trim()) return
    setApiKeyStatus('saving')
    try {
      const result = await window.electronAPI?.llmSetApiKey(apiKeyInput.trim())
      if (result?.success) {
        setHasApiKey(true)
        setApiKeyStatus('saved')
        setApiKeyInput('')
        setTimeout(() => setApiKeyStatus('idle'), 2000)
      } else {
        setApiKeyStatus('error')
        setTimeout(() => setApiKeyStatus('idle'), 2000)
      }
    } catch {
      setApiKeyStatus('error')
      setTimeout(() => setApiKeyStatus('idle'), 2000)
    }
  }, [apiKeyInput])

  const handleSaveAnthropicKey = useCallback(async () => {
    if (!anthropicKeyInput.trim()) return
    setAnthropicKeyStatus('saving')
    try {
      const result = await window.electronAPI?.llmSetAnthropicApiKey?.(anthropicKeyInput.trim())
      if (result?.success) {
        setHasAnthropicKey(true)
        setAnthropicKeyStatus('saved')
        setAnthropicKeyInput('')
        setTimeout(() => setAnthropicKeyStatus('idle'), 2000)
      } else {
        setAnthropicKeyStatus('error')
        setTimeout(() => setAnthropicKeyStatus('idle'), 2000)
      }
    } catch {
      setAnthropicKeyStatus('error')
      setTimeout(() => setAnthropicKeyStatus('idle'), 2000)
    }
  }, [anthropicKeyInput])

  // ── Temperature ──
  const handleTemperatureChange = useCallback((value: number) => {
    setTemperature(value)
    window.electronAPI?.llmSetTemperature(value)
  }, [])

  // ── System Prompts ──
  const handleCreatePrompt = useCallback(async () => {
    if (!newPromptName.trim() || !newPromptContent.trim()) return
    const prompt = await window.electronAPI?.llmCreateSystemPrompt({
      name: newPromptName.trim(),
      content: newPromptContent.trim(),
    })
    if (prompt) {
      setSystemPrompts((prev) => [...prev, prompt])
      setNewPromptName('')
      setNewPromptContent('')
      setShowNewForm(false)
    }
  }, [newPromptName, newPromptContent])

  const handleUpdatePrompt = useCallback(async () => {
    if (!editingPrompt) return
    const updated = await window.electronAPI?.llmUpdateSystemPrompt({
      id: editingPrompt.id,
      name: editingPrompt.name,
      content: editingPrompt.content,
    })
    if (updated) {
      setSystemPrompts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      setEditingPrompt(null)
    }
  }, [editingPrompt])

  const handleDeletePrompt = useCallback(async (id: string) => {
    await window.electronAPI?.llmDeleteSystemPrompt(id)
    setSystemPrompts((prev) => prev.filter((p) => p.id !== id))
    if (activePromptId === id) {
      setActivePromptId(null)
    }
  }, [activePromptId])

  const handleSetActivePrompt = useCallback(async (id: string | null) => {
    await window.electronAPI?.llmSetActiveSystemPrompt(id)
    setActivePromptId(id)
  }, [])

  // ── Summarization ──
  const handleAutoSummarizeToggle = useCallback((enabled: boolean) => {
    const next = { ...summarization, autoSummarizeEnabled: enabled }
    setSummarization(next)
    window.electronAPI?.updateSettings({ llm: { summarization: next } } as any)
  }, [summarization])

  // Refresh summarization, quick actions, and default prompt override when settings change
  useEffect(() => {
    const unsub = window.electronAPI?.onSettingsChanged?.((s) => {
      if (s?.llm?.summarization) setSummarization(s.llm.summarization)
      if (s?.llm?.quickActions) setQuickActions(s.llm.quickActions)
      if (s?.llm?.defaultSystemPromptOverride !== undefined) setDefaultSystemPromptOverride(s.llm.defaultSystemPromptOverride)
    })
    return () => unsub?.()
  }, [])

  // Focus name input when form opens
  useEffect(() => {
    if (showNewForm) {
      nameInputRef.current?.focus()
    }
  }, [showNewForm])

  const isLocal = provider === 'ollama' || provider === 'lmstudio'

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
      {/* ── Provider ──────────────────────────────── */}
      <Section title="LLM Provider">
        <div className="flex gap-1.5">
          {PROVIDER_OPTIONS.map((opt) => {
            const isActive = provider === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => handleProviderSelect(opt.id)}
                className="flex-1 px-2 py-2 rounded-lg text-center transition-all duration-150 border"
                style={{
                  backgroundColor: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text)',
                  borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                }}
              >
                <span className="text-xs font-medium">{opt.label}</span>
              </button>
            )
          })}
        </div>
      </Section>

      {/* ── API Key (OpenAI only) ──────────────────────────────── */}
      {provider === 'openai' && (
      <Section title="OpenAI API Key">
        <div className="space-y-2">
          {hasApiKey ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: 'var(--success)' }}
                />
                <span className="text-xs" style={{ color: 'var(--text)' }}>
                  API key configured
                </span>
              </div>
              <button
                onClick={() => setHasApiKey(false)}
                className="text-[10px] px-2 py-0.5 rounded-md border transition-colors hover:brightness-110"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
                  placeholder="sk-..."
                  className="flex-1 bg-transparent outline-none text-xs px-2.5 py-1.5 rounded-lg border transition-colors focus:border-[var(--accent)]"
                  style={{
                    color: 'var(--text)',
                    borderColor: 'var(--input-border)',
                    backgroundColor: 'var(--input-bg)',
                  }}
                />
                <button
                  onClick={handleSaveApiKey}
                  disabled={!apiKeyInput.trim() || apiKeyStatus === 'saving'}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 disabled:opacity-40"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: '#fff',
                  }}
                >
                  {apiKeyStatus === 'saving' ? '...' : 'Save'}
                </button>
              </div>
              {apiKeyStatus === 'error' && (
                <span className="text-[10px]" style={{ color: 'var(--error)' }}>
                  Failed to save key. Check format.
                </span>
              )}
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Your key is stored locally and never sent anywhere except OpenAI.
              </p>
            </div>
          )}
        </div>
      </Section>
      )}

      {/* ── API Key (Anthropic only) ───────────────────────────── */}
      {provider === 'anthropic' && (
      <Section title="Anthropic API Key">
        <div className="space-y-2">
          {hasAnthropicKey ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: 'var(--success)' }}
                />
                <span className="text-xs" style={{ color: 'var(--text)' }}>
                  API key configured
                </span>
              </div>
              <button
                onClick={() => setHasAnthropicKey(false)}
                className="text-[10px] px-2 py-0.5 rounded-md border transition-colors hover:brightness-110"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={anthropicKeyInput}
                  onChange={(e) => setAnthropicKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveAnthropicKey()}
                  placeholder="sk-ant-..."
                  className="flex-1 bg-transparent outline-none text-xs px-2.5 py-1.5 rounded-lg border transition-colors focus:border-[var(--accent)]"
                  style={{
                    color: 'var(--text)',
                    borderColor: 'var(--input-border)',
                    backgroundColor: 'var(--input-bg)',
                  }}
                />
                <button
                  onClick={handleSaveAnthropicKey}
                  disabled={!anthropicKeyInput.trim() || anthropicKeyStatus === 'saving'}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 disabled:opacity-40"
                  style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                >
                  {anthropicKeyStatus === 'saving' ? '...' : 'Save'}
                </button>
              </div>
              {anthropicKeyStatus === 'error' && (
                <span className="text-[10px]" style={{ color: 'var(--error)' }}>
                  Failed to save key. Check format.
                </span>
              )}
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Your key is stored locally and never sent anywhere except Anthropic.
              </p>
            </div>
          )}
        </div>
      </Section>
      )}

      {/* ── Local config (Ollama / LM Studio) ──────────────────────────────── */}
      {isLocal && (
      <Section title={provider === 'ollama' ? 'Ollama' : 'LM Studio'}>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Base URL
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                localConnectionStatus === 'ok' ? 'bg-[var(--success)]' : localConnectionStatus === 'error' ? 'bg-[var(--error)]' : 'bg-[var(--text-muted)]'
              }`}
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={localBaseUrl}
              onChange={(e) => handleLocalBaseUrlChange(e.target.value)}
              onBlur={handleLocalBaseUrlBlur}
              placeholder={provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234'}
              className="flex-1 bg-transparent outline-none text-xs px-2.5 py-1.5 rounded-lg border transition-colors focus:border-[var(--accent)]"
              style={{
                color: 'var(--text)',
                borderColor: 'var(--input-border)',
                backgroundColor: 'var(--input-bg)',
              }}
            />
            <button
              onClick={handleRefreshLocalModels}
              disabled={localConnectionStatus === 'checking'}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors hover:brightness-110 disabled:opacity-50"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              {localConnectionStatus === 'checking' ? '...' : 'Refresh'}
            </button>
            <button
              onClick={handleTestLocalConnection}
              disabled={localConnectionStatus === 'checking'}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors hover:brightness-110 disabled:opacity-50"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              Test
            </button>
          </div>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {provider === 'ollama'
              ? 'Run Ollama and pull a model (e.g. ollama pull qwen3:1.7b)'
              : 'Load a model in LM Studio and start the local server'}
          </p>
          {(provider === 'ollama' || provider === 'lmstudio') && (
            <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[10px] font-medium" style={{ color: 'var(--text)' }}>
                Setup instructions
              </p>
              {provider === 'ollama' ? (
                <>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    1. Install Ollama from{' '}
                    <button type="button" onClick={() => window.electronAPI?.openExternalUrl?.('https://ollama.com')} className="underline" style={{ color: 'var(--accent)' }}>ollama.com</button>
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    2. In Terminal, run: <code className="px-1 py-0.5 rounded text-[9px] font-mono" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', border: '1px solid' }}>ollama pull qwen3:1.7b</code>
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Recommended: <strong>qwen3:1.7b</strong> (best under 2B). Alternatives: qwen3:0.6b (lightweight), qwen3:4b (higher quality).
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    1. Install LM Studio from{' '}
                    <button type="button" onClick={() => window.electronAPI?.openExternalUrl?.('https://lmstudio.ai')} className="underline" style={{ color: 'var(--accent)' }}>lmstudio.ai</button>
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    2. Search for &quot;Qwen3 1.7B&quot; in the Discover tab, download, and load it.
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    3. Start the local server (Developer → Local Server).
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Recommended: <strong>Qwen3-1.7B-Instruct</strong>. Alternatives: Qwen3-0.6B-Instruct (lightweight), Qwen3-4B-Instruct (higher quality).
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </Section>
      )}

      {/* ── Usage & Cost (Phase 3) ─────────────────── */}
      <Section title="Session Usage">
        <div className="space-y-2">
          <div className="flex justify-between text-[11px]">
            <span style={{ color: 'var(--text-muted)' }}>Prompt tokens</span>
            <span style={{ color: 'var(--text)' }}>
              {(usageStats?.promptTokens ?? 0).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span style={{ color: 'var(--text-muted)' }}>Completion tokens</span>
            <span style={{ color: 'var(--text)' }}>
              {(usageStats?.completionTokens ?? 0).toLocaleString()}
            </span>
          </div>
          {(usageStats?.cachedTokens ?? 0) > 0 && (
            <div className="flex justify-between text-[11px]">
              <span style={{ color: 'var(--text-muted)' }}>Cached (saved 50%)</span>
              <span style={{ color: 'var(--success)' }}>
                {(usageStats?.cachedTokens ?? 0).toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex justify-between text-[11px] font-medium pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Est. cost</span>
            <span style={{ color: 'var(--text)' }}>
              {isLocal ? 'Free (local)' : `$${(usageStats?.estimatedCostUsd ?? 0).toFixed(4)}`}
            </span>
          </div>
          <p className="text-[9px] pt-0.5" style={{ color: 'var(--text-muted)' }}>
            Resets when you reset the chat
          </p>
        </div>
      </Section>

      {/* ── Model Selection ────────────────────────── */}
      <Section title="Model">
        {isLocal ? (
          <div className="space-y-2">
            <select
              value={currentModel}
              onChange={(e) => handleModelSelect(e.target.value)}
              className="w-full bg-transparent outline-none text-xs px-2.5 py-1.5 rounded-lg border"
              style={{
                color: 'var(--text)',
                borderColor: 'var(--input-border)',
                backgroundColor: 'var(--input-bg)',
              }}
            >
              {localModels.length === 0 ? (
                <option value="">No models — click Refresh</option>
              ) : (
                localModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))
              )}
              {currentModel && !localModels.some((m) => m.id === currentModel) && (
                <option value={currentModel}>{currentModel}</option>
              )}
            </select>
          </div>
        ) : (
        <div className="flex gap-1.5">
          {modelOptionsForProvider(provider === 'anthropic' ? 'anthropic' : 'openai').map((opt) => {
            const isActive = currentModel === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => handleModelSelect(opt.id)}
                className="flex-1 px-2 py-2 rounded-lg text-center transition-all duration-150 border"
                style={{
                  backgroundColor: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text)',
                  borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                }}
              >
                <div className="text-xs font-medium">{opt.label}</div>
                <div
                  className="text-[9px] mt-0.5"
                  style={{
                    color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)',
                  }}
                >
                  {opt.description}
                </div>
              </button>
            )
          })}
        </div>
        )}
      </Section>

      {/* ── Temperature ─────────────────────────── */}
      <Section title="Temperature">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--text)' }}>
              Creativity
            </span>
            <span
              className="text-[11px] font-mono"
              style={{ color: 'var(--text-muted)' }}
            >
              {temperature.toFixed(1)}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="10"
            step="1"
            value={Math.round(temperature * 10)}
            onChange={(e) => handleTemperatureChange(Number(e.target.value) / 10)}
            className="w-full accent-[var(--accent)] h-1"
          />
          <div
            className="flex justify-between text-[9px]"
            style={{ color: 'var(--text-muted)' }}
          >
            <span>Precise</span>
            <span>Creative</span>
          </div>
        </div>
      </Section>

      {/* ── Summarization ───────────────────────── */}
      <Section title="Transcript Summarization">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--text)' }}>
              Auto-summarize long transcripts
            </span>
            <button
              onClick={() => handleAutoSummarizeToggle(!summarization.autoSummarizeEnabled)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                summarization.autoSummarizeEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  summarization.autoSummarizeEnabled ? 'left-4' : 'left-0.5'
                }`}
              />
            </button>
          </div>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Keeps long meetings from overflowing context. Use the Summarize now button in chat
            to summarize on demand.
          </p>

          {/* Summarizer system prompt */}
          <div className="pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium" style={{ color: 'var(--text)' }}>
                Summarizer prompt
              </span>
              {!editingSummarizerPrompt ? (
                <button
                  onClick={() => {
                    setSummarizerPromptDraft(
                      summarization.summarizerSystemPrompt ?? DEFAULT_SUMMARIZER_SYSTEM_PROMPT,
                    )
                    setEditingSummarizerPrompt(true)
                  }}
                  className="text-[10px] px-2 py-0.5 rounded-md border transition-colors hover:brightness-110"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  {summarization.summarizerSystemPrompt ? 'Edit' : 'Customize'}
                </button>
              ) : (
                <div className="flex gap-1">
                  {summarization.summarizerSystemPrompt && (
                    <button
                      onClick={() => {
                        handleAutoSummarizeToggle(summarization.autoSummarizeEnabled)
                        const next = { ...summarization, summarizerSystemPrompt: null }
                        setSummarization(next)
                        window.electronAPI?.updateSettings({ llm: { summarization: next } } as any)
                        setEditingSummarizerPrompt(false)
                      }}
                      className="text-[10px] px-2 py-0.5 rounded-md border transition-colors hover:brightness-110"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    >
                      Reset
                    </button>
                  )}
                  <button
                    onClick={() => setEditingSummarizerPrompt(false)}
                    className="text-[10px] px-2 py-0.5 rounded-md border transition-colors hover:brightness-110"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const trimmed = summarizerPromptDraft.trim()
                      const value = trimmed === DEFAULT_SUMMARIZER_SYSTEM_PROMPT ? null : trimmed || null
                      const next = { ...summarization, summarizerSystemPrompt: value }
                      setSummarization(next)
                      window.electronAPI?.updateSettings({ llm: { summarization: next } } as any)
                      setEditingSummarizerPrompt(false)
                    }}
                    className="text-[10px] px-2 py-0.5 rounded-md font-medium transition-colors"
                    style={{ backgroundColor: 'var(--accent)', color: '#fff', borderRadius: '6px' }}
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
            {editingSummarizerPrompt ? (
              <textarea
                value={summarizerPromptDraft}
                onChange={(e) => setSummarizerPromptDraft(e.target.value)}
                className="w-full bg-transparent outline-none text-[11px] resize-none rounded-lg border p-2 focus:border-[var(--accent)]"
                style={{
                  color: 'var(--text)',
                  borderColor: 'var(--input-border)',
                  backgroundColor: 'var(--input-bg)',
                  minHeight: '100px',
                }}
                placeholder="System prompt for transcript summarization..."
              />
            ) : (
              <p
                className="text-[10px] truncate"
                style={{ color: 'var(--text-muted)' }}
              >
                {summarization.summarizerSystemPrompt
                  ? summarization.summarizerSystemPrompt.slice(0, 80) + '…'
                  : 'Default — topic clusters, timestamps, summary'}
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* ── Quick Actions ───────────────────────── */}
      <Section title="Quick Actions">
        <div className="space-y-2">
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Add quick action chips. Label = button text, Value = message sent.
          </p>
          {(quickActions.length > 0 ? quickActions : DEFAULT_QUICK_ACTIONS).map((a, i) => {
            const isEditing = editingQuickActionIndex === i
            const base = quickActions.length > 0 ? quickActions : DEFAULT_QUICK_ACTIONS

            if (isEditing) {
              return (
                <div
                  key={`edit-${i}`}
                  className="rounded-lg border p-2.5 space-y-2"
                  style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--input-bg)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      Icon:
                    </span>
                    <IconPicker
                      value={editingQuickAction?.icon}
                      onChange={(iconId) =>
                        setEditingQuickAction((prev) => (prev ? { ...prev, icon: iconId } : null))
                      }
                    />
                  </div>
                  <input
                    type="text"
                    value={editingQuickAction?.label ?? ''}
                    onChange={(e) =>
                      setEditingQuickAction((prev) => (prev ? { ...prev, label: e.target.value } : null))
                    }
                    className="w-full bg-transparent outline-none text-xs"
                    style={{ color: 'var(--text)' }}
                    placeholder="Label"
                  />
                  <input
                    type="text"
                    value={editingQuickAction?.value ?? ''}
                    onChange={(e) =>
                      setEditingQuickAction((prev) => (prev ? { ...prev, value: e.target.value } : null))
                    }
                    className="w-full bg-transparent outline-none text-[11px]"
                    style={{ color: 'var(--text-muted)' }}
                    placeholder="Message sent"
                  />
                  <div className="flex gap-1.5 justify-end">
                    <button
                      onClick={() => {
                        setEditingQuickAction(null)
                        setEditingQuickActionIndex(-1)
                      }}
                      className="px-2 py-1 rounded-md text-[10px] border"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (!editingQuickAction) return
                        const updated = base.map((q, j) =>
                          j === i ? { ...editingQuickAction, icon: editingQuickAction.icon || undefined } : q,
                        )
                        setQuickActions(updated)
                        window.electronAPI?.updateSettings({ llm: { quickActions: updated } } as any)
                        setEditingQuickAction(null)
                        setEditingQuickActionIndex(-1)
                      }}
                      className="px-2 py-1 rounded-md text-[10px] font-medium"
                      style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div key={`${a.value}-${i}`} className="flex items-center gap-1.5">
                <div
                  className="flex-1 flex items-center gap-2 px-2.5 py-2 rounded-lg border min-w-0"
                  style={{
                    backgroundColor: 'var(--input-bg)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <span style={{ opacity: 0.6 }}>{getQuickActionIcon(a.icon, a.value)}</span>
                  <span className="text-xs font-medium truncate">{a.label}</span>
                  <span
                    className="text-[10px] truncate flex-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {a.value}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setEditingQuickAction({ ...a })
                    setEditingQuickActionIndex(i)
                  }}
                  className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center hover:bg-[var(--surface-hover)]"
                  style={{ color: 'var(--text-muted)' }}
                  title="Edit"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    const updated = base.filter((_, j) => j !== i)
                    setQuickActions(updated)
                    window.electronAPI?.updateSettings({ llm: { quickActions: updated } } as any)
                  }}
                  className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center hover:bg-[var(--surface-hover)]"
                  style={{ color: 'var(--text-muted)' }}
                  title="Remove"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                  </svg>
                </button>
              </div>
            )
          })}
          {showNewQuickAction ? (
            <div
              className="rounded-lg border p-2.5 space-y-2"
              style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--input-bg)' }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Icon:
                </span>
                <IconPicker value={newQuickActionIcon} onChange={setNewQuickActionIcon} />
              </div>
              <input
                type="text"
                value={newQuickActionLabel}
                onChange={(e) => setNewQuickActionLabel(e.target.value)}
                className="w-full bg-transparent outline-none text-xs"
                style={{ color: 'var(--text)' }}
                placeholder="Label (e.g. Fix code)"
              />
              <input
                type="text"
                value={newQuickActionValue}
                onChange={(e) => setNewQuickActionValue(e.target.value)}
                className="w-full bg-transparent outline-none text-[11px]"
                style={{ color: 'var(--text-muted)' }}
                placeholder="Message sent (e.g. Fix this code)"
              />
              <div className="flex gap-1.5 justify-end">
                <button
                  onClick={() => {
                    setShowNewQuickAction(false)
                    setNewQuickActionLabel('')
                    setNewQuickActionValue('')
                    setNewQuickActionIcon('pencil')
                  }}
                  className="px-2 py-1 rounded-md text-[10px] border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!newQuickActionLabel.trim() || !newQuickActionValue.trim()) return
                    const newAction: QuickAction = {
                      label: newQuickActionLabel.trim(),
                      value: newQuickActionValue.trim(),
                      icon: newQuickActionIcon,
                    }
                    const base = quickActions.length > 0 ? quickActions : DEFAULT_QUICK_ACTIONS
                    const updated = [...base, newAction]
                    setQuickActions(updated)
                    window.electronAPI?.updateSettings({ llm: { quickActions: updated } } as any)
                    setNewQuickActionLabel('')
                    setNewQuickActionValue('')
                    setNewQuickActionIcon('pencil')
                    setShowNewQuickAction(false)
                  }}
                  disabled={!newQuickActionLabel.trim() || !newQuickActionValue.trim()}
                  className="px-2 py-1 rounded-md text-[10px] font-medium disabled:opacity-40"
                  style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <button
                onClick={() => setShowNewQuickAction(true)}
                className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-[11px] border border-dashed"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add quick action
              </button>
              {quickActions.length > 0 && (
                <button
                  onClick={() => {
                    setQuickActions([])
                    window.electronAPI?.updateSettings({ llm: { quickActions: [] } } as any)
                  }}
                  className="px-2.5 py-2 rounded-lg text-[11px] border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  Reset to defaults
                </button>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* ── System Prompts ──────────────────────── */}
      <Section title="System Prompts">
        <div className="space-y-2">
          {/* Default (no system prompt selected) — editable */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleSetActivePrompt(null)}
                className="flex-1 flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all duration-150 border min-w-0"
                style={{
                  backgroundColor: activePromptId === null ? 'var(--accent)' : 'transparent',
                  color: activePromptId === null ? '#fff' : 'var(--text)',
                  borderColor: activePromptId === null ? 'var(--accent)' : 'var(--border)',
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">Default</div>
                  <div
                    className="text-[10px] mt-0.5 truncate"
                    style={{
                      color: activePromptId === null ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)',
                    }}
                  >
                    {defaultSystemPromptOverride
                      ? 'Custom prompt (edited)'
                      : 'Built-in meeting assistant prompt'}
                  </div>
                </div>
              </button>
              {!editingDefaultPrompt ? (
                <button
                  onClick={() => {
                    setDefaultPromptDraft(defaultSystemPromptOverride ?? builtInDefaultPrompt ?? '')
                    setEditingDefaultPrompt(true)
                  }}
                  className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center hover:bg-[var(--surface-hover)]"
                  style={{ color: 'var(--text-muted)' }}
                  title={defaultSystemPromptOverride ? 'Edit' : 'Customize'}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              ) : null}
            </div>
            {editingDefaultPrompt && (
              <div
                className="rounded-lg border p-2.5 space-y-2"
                style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--input-bg)' }}
              >
                <textarea
                  value={defaultPromptDraft}
                  onChange={(e) => setDefaultPromptDraft(e.target.value)}
                  className="w-full bg-transparent outline-none text-[11px] resize-none rounded-lg border p-2 focus:border-[var(--accent)]"
                  style={{
                    color: 'var(--text)',
                    borderColor: 'var(--input-border)',
                    backgroundColor: 'var(--input-bg)',
                    minHeight: '120px',
                  }}
                  placeholder="System prompt for the meeting assistant..."
                />
                <div className="flex gap-1.5 justify-end flex-wrap">
                  {defaultSystemPromptOverride && (
                    <button
                      onClick={() => {
                        setDefaultSystemPromptOverride(null)
                        setDefaultPromptDraft(builtInDefaultPrompt)
                        window.electronAPI?.updateSettings({ llm: { defaultSystemPromptOverride: null } } as any)
                        setEditingDefaultPrompt(false)
                      }}
                      className="px-2 py-1 rounded-md text-[10px] border transition-colors"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    >
                      Restore to default
                    </button>
                  )}
                  <button
                    onClick={() => setEditingDefaultPrompt(false)}
                    className="px-2 py-1 rounded-md text-[10px] border transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const trimmed = defaultPromptDraft.trim()
                      const value = trimmed === builtInDefaultPrompt ? null : trimmed || null
                      setDefaultSystemPromptOverride(value)
                      window.electronAPI?.updateSettings({ llm: { defaultSystemPromptOverride: value } } as any)
                      setEditingDefaultPrompt(false)
                    }}
                    className="px-2 py-1 rounded-md text-[10px] font-medium transition-colors"
                    style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User-created prompts */}
          {systemPrompts.map((prompt) => {
            const isActive = activePromptId === prompt.id
            const isEditing = editingPrompt?.id === prompt.id

            if (isEditing) {
              return (
                <div
                  key={prompt.id}
                  className="rounded-lg border p-2.5 space-y-2"
                  style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--input-bg)' }}
                >
                  <input
                    type="text"
                    value={editingPrompt.name}
                    onChange={(e) =>
                      setEditingPrompt({ ...editingPrompt, name: e.target.value })
                    }
                    className="w-full bg-transparent outline-none text-xs font-medium"
                    style={{ color: 'var(--text)' }}
                    placeholder="Prompt name"
                  />
                  <textarea
                    value={editingPrompt.content}
                    onChange={(e) =>
                      setEditingPrompt({ ...editingPrompt, content: e.target.value })
                    }
                    className="w-full bg-transparent outline-none text-[11px] resize-none"
                    style={{ color: 'var(--text)', minHeight: '80px' }}
                    placeholder="System prompt content..."
                  />
                  <div className="flex gap-1.5 justify-end">
                    <button
                      onClick={() => setEditingPrompt(null)}
                      className="px-2 py-1 rounded-md text-[10px] border transition-colors"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleUpdatePrompt}
                      className="px-2 py-1 rounded-md text-[10px] font-medium transition-colors"
                      style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={prompt.id}
                className="flex items-center gap-1.5"
              >
                <button
                  onClick={() => handleSetActivePrompt(prompt.id)}
                  className="flex-1 flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all duration-150 border min-w-0"
                  style={{
                    backgroundColor: isActive ? 'var(--accent)' : 'transparent',
                    color: isActive ? '#fff' : 'var(--text)',
                    borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{prompt.name}</div>
                    <div
                      className="text-[10px] mt-0.5 truncate"
                      style={{
                        color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)',
                      }}
                    >
                      {PRESET_SYSTEM_PROMPT_IDS.has(prompt.id)
                        ? 'Built-in preset'
                        : `${prompt.content.slice(0, 60)}${prompt.content.length > 60 ? '...' : ''}`}
                    </div>
                  </div>
                </button>

                {/* Edit button */}
                <button
                  onClick={() => setEditingPrompt({ ...prompt })}
                  className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)]"
                  style={{ color: 'var(--text-muted)' }}
                  title="Edit"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {/* Delete button */}
                <button
                  onClick={() => handleDeletePrompt(prompt.id)}
                  className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)]"
                  style={{ color: 'var(--text-muted)' }}
                  title="Delete"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            )
          })}

          {/* New prompt form */}
          {showNewForm ? (
            <div
              className="rounded-lg border p-2.5 space-y-2"
              style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--input-bg)' }}
            >
              <input
                ref={nameInputRef}
                type="text"
                value={newPromptName}
                onChange={(e) => setNewPromptName(e.target.value)}
                className="w-full bg-transparent outline-none text-xs font-medium"
                style={{ color: 'var(--text)' }}
                placeholder="Prompt name"
              />
              <textarea
                value={newPromptContent}
                onChange={(e) => setNewPromptContent(e.target.value)}
                className="w-full bg-transparent outline-none text-[11px] resize-none"
                style={{ color: 'var(--text)', minHeight: '80px' }}
                placeholder="System prompt content..."
              />
              <div className="flex gap-1.5 justify-end">
                <button
                  onClick={() => {
                    setShowNewForm(false)
                    setNewPromptName('')
                    setNewPromptContent('')
                  }}
                  className="px-2 py-1 rounded-md text-[10px] border transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreatePrompt}
                  disabled={!newPromptName.trim() || !newPromptContent.trim()}
                  className="px-2 py-1 rounded-md text-[10px] font-medium transition-colors disabled:opacity-40"
                  style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                >
                  Create
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewForm(true)}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-[11px] transition-all duration-150 border border-dashed"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--text-muted)',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              New prompt
            </button>
          )}
        </div>
      </Section>

      {/* Bottom spacer */}
      <div className="pb-2" />
    </div>
  )
}

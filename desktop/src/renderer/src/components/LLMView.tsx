import { useEffect, useState, useCallback, useRef } from 'react'
import type { SystemPrompt } from '../types'
import { type ModelId, MODEL_CONFIGS } from '../types/settings'

const MODEL_OPTIONS: { id: ModelId; label: string; description: string }[] = [
  { id: 'gpt5-nano', label: 'Nano', description: 'Fast, low cost' },
  { id: 'gpt5-mini', label: 'Mini', description: 'Balanced' },
  { id: 'gpt-5.2', label: '5.2', description: 'High intelligence' },
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
  const [hasApiKey, setHasApiKey] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [temperature, setTemperature] = useState(0.3)
  const [currentModel, setCurrentModel] = useState<ModelId>('gpt-5.2')
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([])
  const [activePromptId, setActivePromptId] = useState<string | null>(null)
  const [editingPrompt, setEditingPrompt] = useState<SystemPrompt | null>(null)
  const [newPromptName, setNewPromptName] = useState('')
  const [newPromptContent, setNewPromptContent] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // ── Load initial state ──
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    api.llmHasApiKey().then(setHasApiKey)
    api.llmGetModel().then((m) => setCurrentModel(m as ModelId))
    api.getSettings().then((s) => {
      if (s?.llm?.temperature !== undefined) setTemperature(s.llm.temperature)
    })
    api.llmGetSystemPrompts().then(setSystemPrompts)
    api.llmGetActiveSystemPrompt().then(setActivePromptId)
  }, [])

  // ── Model selection ──
  const handleModelSelect = useCallback(async (modelId: ModelId) => {
    const result = await window.electronAPI?.llmSetModel(modelId)
    if (result?.success) {
      setCurrentModel(modelId)
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

  // Focus name input when form opens
  useEffect(() => {
    if (showNewForm) {
      nameInputRef.current?.focus()
    }
  }, [showNewForm])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
      {/* ── API Key ──────────────────────────────── */}
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

      {/* ── Model Selection ────────────────────────── */}
      <Section title="Model">
        <div className="flex gap-1.5">
          {MODEL_OPTIONS.map((opt) => {
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

      {/* ── System Prompts ──────────────────────── */}
      <Section title="System Prompts">
        <div className="space-y-2">
          {/* Default (no system prompt selected) */}
          <button
            onClick={() => handleSetActivePrompt(null)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all duration-150 border"
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
                Built-in meeting assistant prompt
              </div>
            </div>
          </button>

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
                      {prompt.content.slice(0, 60)}
                      {prompt.content.length > 60 ? '...' : ''}
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

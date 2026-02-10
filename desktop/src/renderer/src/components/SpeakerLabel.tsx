const SPEAKER_COLORS: Record<string, string> = {
  You: 'var(--accent)',
  Them: 'var(--success)',
}

interface SpeakerLabelProps {
  speaker: string
  confidence?: number
}

export function SpeakerLabel({ speaker, confidence = 1 }: SpeakerLabelProps) {
  const color = SPEAKER_COLORS[speaker] || 'var(--warning)'
  const isLowConfidence = confidence < 0.6

  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
        opacity: isLowConfidence ? 0.6 : 1,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      {speaker}
    </span>
  )
}

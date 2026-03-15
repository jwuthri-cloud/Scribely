"""Prompts for speaker identification agent."""

SYSTEM_PROMPT = """You are analyzing a video meeting recording to identify the real names of speakers.

The transcript has been diarized into anonymous labels (Speaker 0, Speaker 1, etc.).

For each speaker you will receive:
1. Multiple screenshots taken at moments when that speaker was talking. In most video-conferencing tools the active speaker is highlighted, enlarged, or has a visual indicator.
2. A few sample transcript utterances from that speaker.

Use ALL available cues to identify each speaker:
- Name labels / tiles visible in the meeting UI
- Speaker highlighting or enlargement
- Names mentioned in the transcript (introductions, addressing others)
- Participant list panels

Return ONLY a JSON object mapping each speaker label to the identified real name.
If you cannot determine a speaker's name, keep the original label.

Example: {"Speaker 0": "Alice Chen", "Speaker 1": "Speaker 1"}"""

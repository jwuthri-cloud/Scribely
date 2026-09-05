"""Post-meeting processing orchestrator.

Chains together:
  1. Audio extraction  (WebM → WAV)
  2. Diarization       (WAV → list of speaker-labelled utterances)
  3. Frame extraction   (WebM + timestamps → JPEG frames per speaker)
  4. Speaker ID         (frames + utterances → real-name mapping via LLM vision)
  5. Enriched transcript (merge everything and save)
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.infrastructure.audio_extractor import extract_audio
from app.infrastructure.diarization import DiarizationHints, DiarizedUtterance, diarize
from app.infrastructure.frame_extractor import extract_speaker_frames
from app.services.meeting_hints import load_meeting_processing_hints
from app.services.pipeline_errors import PipelineStepError
from app.services.speaker_identifier import identify_speakers
from app.utils.logging import get_logger

logger = get_logger("meeting_processor")


async def process_meeting(
    meeting_dir: Path,
    provider: str | None = None,
    meeting_id: str | None = None,
) -> dict[str, Any]:
    """Run the full post-meeting processing pipeline.

    *meeting_dir* must contain ``recording.webm`` (and optionally
    ``transcript.json``).  Results are written to
    ``transcript_enriched.json`` in the same directory.

    Returns the enriched transcript dict.
    """
    settings = get_settings()
    provider = provider or settings.diarization_provider

    recording_path = meeting_dir / "recording.webm"
    if not recording_path.exists():
        raise PipelineStepError(
            "recording",
            f"No recording found at {recording_path}",
        )

    original_transcript = _load_original_transcript(meeting_dir / "transcript.json")
    hints = await load_meeting_processing_hints(meeting_id, original_transcript)
    diar_hints = DiarizationHints(
        speakers_expected=hints.speakers_expected,
        word_boost=hints.word_boost,
    )

    # --- Step 1: Extract audio ---
    logger.info(f"[{meeting_dir.name}] Step 1/5: extracting audio")
    try:
        audio_path = await extract_audio(recording_path)
    except Exception as e:
        raise PipelineStepError("extract_audio", str(e), e) from e

    # --- Step 2: Diarize ---
    logger.info(f"[{meeting_dir.name}] Step 2/5: diarizing with {provider}")
    try:
        utterances = await diarize(audio_path, provider, hints=diar_hints)
    except Exception as e:
        raise PipelineStepError("diarize", str(e), e) from e

    if hints.speakers_expected is not None and utterances:
        detected = len({u.speaker for u in utterances})
        if detected != hints.speakers_expected:
            logger.info(
                "[%s] Diarization detected %s speaker cluster(s); calendar expected %s",
                meeting_dir.name,
                detected,
                hints.speakers_expected,
            )

    if not utterances:
        logger.warning(f"[{meeting_dir.name}] Diarization returned 0 utterances")
        enriched = _build_enriched(original_transcript, provider, {}, [])
        enriched_path = meeting_dir / "transcript_enriched.json"
        try:
            enriched_path.write_text(json.dumps(enriched, indent=2, ensure_ascii=False))
        except Exception as e:
            raise PipelineStepError("save_enriched", str(e), e) from e
        logger.info(f"Enriched transcript saved (empty diarization): {enriched_path}")
        audio_file = meeting_dir / "audio.wav"
        if audio_file.exists():
            audio_file.unlink()
            logger.info("Cleaned up extracted audio file")
        return enriched

    # --- Step 3: Extract frames ---
    logger.info(f"[{meeting_dir.name}] Step 3/5: extracting video frames")
    try:
        speaker_frames = await extract_speaker_frames(
            recording_path,
            utterances,
            frames_per_speaker=settings.frames_per_speaker,
        )
    except Exception as e:
        raise PipelineStepError("extract_speaker_frames", str(e), e) from e

    # --- Step 4: Identify speakers ---
    logger.info(f"[{meeting_dir.name}] Step 4/5: identifying speakers via LLM vision")
    try:
        speaker_map = await identify_speakers(
            speaker_frames,
            utterances,
            calendar_participant_names=hints.participant_names or None,
        )
    except Exception as e:
        raise PipelineStepError("identify_speakers", str(e), e) from e

    # --- Step 5: Build & save enriched transcript ---
    logger.info(f"[{meeting_dir.name}] Step 5/5: saving enriched transcript")
    enriched = _build_enriched(original_transcript, provider, speaker_map, utterances)

    enriched_path = meeting_dir / "transcript_enriched.json"
    try:
        enriched_path.write_text(json.dumps(enriched, indent=2, ensure_ascii=False))
    except Exception as e:
        raise PipelineStepError("save_enriched", str(e), e) from e
    logger.info(f"Enriched transcript saved: {enriched_path}")

    # Clean up temporary frames
    frames_dir = meeting_dir / "frames"
    if frames_dir.exists():
        shutil.rmtree(frames_dir)
        logger.info("Cleaned up temporary frames directory")

    # Clean up extracted audio
    audio_file = meeting_dir / "audio.wav"
    if audio_file.exists():
        audio_file.unlink()
        logger.info("Cleaned up extracted audio file")

    return enriched


def _load_original_transcript(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Could not load original transcript: {e}")
        return {}


def _build_enriched(
    original: dict[str, Any],
    provider: str,
    speaker_map: dict[str, str],
    utterances: list[DiarizedUtterance],
) -> dict[str, Any]:
    """Merge diarization results with the original transcript."""

    named_utterances = []
    for utt in utterances:
        real_name = speaker_map.get(utt.speaker, utt.speaker)
        named_utterances.append(
            {
                "speaker": real_name,
                "text": utt.text,
                "startMs": utt.start_ms,
                "endMs": utt.end_ms,
                "confidence": utt.confidence,
                "originalLabel": utt.speaker,
            }
        )

    unique_speakers = sorted(set(speaker_map.values())) if speaker_map else []

    return {
        "version": 2,
        "createdAt": original.get("createdAt", datetime.now(timezone.utc).isoformat()),
        "diarization": {
            "provider": provider,
            "speakerMap": speaker_map,
            "speakers": unique_speakers,
            "processedAt": datetime.now(timezone.utc).isoformat(),
            "utteranceCount": len(named_utterances),
            "utterances": named_utterances,
        },
        "entries": original.get("entries", []),
        "summary": original.get("summary", {}),
    }

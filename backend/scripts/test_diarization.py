#!/usr/bin/env python3
"""Quick test script for Deepgram / AssemblyAI diarization on any audio/video file.

Usage:
    # Deepgram (default)
    python scripts/test_diarization.py /path/to/meeting.mp4

    # AssemblyAI
    python scripts/test_diarization.py /path/to/meeting.mp4 --provider assemblyai

    # Skip audio extraction (if you already have a WAV)
    python scripts/test_diarization.py /path/to/audio.wav

    # Also run the full pipeline (frames + LLM vision speaker ID)
    python scripts/test_diarization.py /path/to/meeting.mp4 --full

Reads API keys from backend/.env (DEEPGRAM_API_KEY / ASSEMBLYAI_API_KEY / OPENROUTER_API_KEY).
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

# Add backend/ to sys.path so we can import app modules
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# Load .env before importing app modules
from dotenv import load_dotenv

load_dotenv(backend_dir / ".env")


async def run_diarization_only(file_path: Path, provider: str) -> None:
    from app.infrastructure.audio_extractor import extract_audio
    from app.infrastructure.diarization import diarize

    # If the file is already a WAV, skip extraction
    if file_path.suffix.lower() == ".wav":
        audio_path = file_path
    else:
        print(f"\n--- Step 1: Extracting audio from {file_path.name} ---")
        audio_path = await extract_audio(file_path)
        print(f"    → {audio_path}  ({audio_path.stat().st_size / 1024 / 1024:.1f} MB)")

    print(f"\n--- Step 2: Diarizing with {provider} ---")
    utterances = await diarize(audio_path, provider)

    print(f"\n{'='*70}")
    print(
        f"  {len(utterances)} utterances, "
        f"{len(set(u.speaker for u in utterances))} speakers detected"
    )
    print(f"{'='*70}\n")

    for utt in utterances:
        start = _fmt_time(utt.start_ms)
        end = _fmt_time(utt.end_ms)
        print(f"  [{start} → {end}]  {utt.speaker}:  {utt.text}")

    # Save raw results alongside the file
    out_path = file_path.parent / f"diarization_{provider}.json"
    out_path.write_text(
        json.dumps([u.to_dict() for u in utterances], indent=2, ensure_ascii=False)
    )
    print(f"\n  Raw results saved to: {out_path}")


async def run_full_pipeline(file_path: Path, provider: str) -> None:
    from app.config import get_settings
    from app.infrastructure.audio_extractor import extract_audio
    from app.infrastructure.diarization import diarize
    from app.infrastructure.frame_extractor import extract_speaker_frames
    from app.services.speaker_identifier import identify_speakers

    settings = get_settings()

    if file_path.suffix.lower() == ".wav":
        audio_path = file_path
        video_path = None
    else:
        print(f"\n--- Step 1/4: Extracting audio from {file_path.name} ---")
        audio_path = await extract_audio(file_path)
        video_path = file_path
        print(f"    → {audio_path}")

    print(f"\n--- Step 2/4: Diarizing with {provider} ---")
    utterances = await diarize(audio_path, provider)
    n_speakers = len(set(u.speaker for u in utterances))
    print(f"    → {len(utterances)} utterances, {n_speakers} speakers")

    if video_path and video_path.exists():
        print(f"\n--- Step 3/4: Extracting video frames ---")
        speaker_frames = await extract_speaker_frames(
            video_path, utterances, frames_per_speaker=settings.frames_per_speaker
        )
        for spk, frames in speaker_frames.items():
            print(f"    {spk}: {len(frames)} frames")

        print(f"\n--- Step 4/4: Identifying speakers via LLM vision ---")
        speaker_map = await identify_speakers(speaker_frames, utterances)
    else:
        print("\n--- Steps 3-4: Skipped (no video file for frame extraction) ---")
        speaker_map = {u.speaker: u.speaker for u in utterances}

    print(f"\n{'='*70}")
    print("  Speaker mapping:")
    for label, name in speaker_map.items():
        print(f"    {label}  →  {name}")
    print(f"{'='*70}\n")

    for utt in utterances:
        real_name = speaker_map.get(utt.speaker, utt.speaker)
        start = _fmt_time(utt.start_ms)
        end = _fmt_time(utt.end_ms)
        print(f"  [{start} → {end}]  {real_name}:  {utt.text}")

    out_path = file_path.parent / f"diarization_full_{provider}.json"
    out_path.write_text(
        json.dumps(
            {
                "speakerMap": speaker_map,
                "utterances": [u.to_dict() for u in utterances],
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    print(f"\n  Full results saved to: {out_path}")


def _fmt_time(ms: int) -> str:
    total_sec = ms / 1000
    m, s = divmod(int(total_sec), 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Test diarization on a media file")
    parser.add_argument("file", type=Path, help="Path to MP4, WebM, or WAV file")
    parser.add_argument(
        "--provider",
        choices=["deepgram", "assemblyai"],
        default="deepgram",
        help="Diarization provider (default: deepgram)",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Run full pipeline including frame extraction + LLM speaker ID",
    )
    args = parser.parse_args()

    if not args.file.exists():
        print(f"Error: file not found: {args.file}", file=sys.stderr)
        sys.exit(1)

    if args.full:
        asyncio.run(run_full_pipeline(args.file, args.provider))
    else:
        asyncio.run(run_diarization_only(args.file, args.provider))


if __name__ == "__main__":
    main()

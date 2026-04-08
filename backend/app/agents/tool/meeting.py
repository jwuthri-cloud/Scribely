"""LangChain tools for querying meetings and transcripts from the database."""
import json
from typing import Optional

import aiofiles
from langchain_core.tools import StructuredTool
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.repositories.meeting import MeetingRepository
from app.database.repositories.user import UserRepository
from app.utils.logging import get_logger

logger = get_logger("tool.meeting")


def build_meeting_tools(db: AsyncSession, user_id: str) -> list:
    """
    Build meeting/DB tools scoped to a specific user and DB session.

    Args:
        db: Async SQLAlchemy session
        user_id: The authenticated user's ID

    Returns:
        List of LangChain tools
    """

    async def list_meetings(limit: int = 10, search: Optional[str] = None) -> str:
        """
        List the user's meetings ordered by most recent first.

        Args:
            limit: Maximum number of meetings to return (default 10, max 50)
            search: Optional keyword to filter meetings by title
        """
        limit = min(limit, 50)
        meetings, total = await MeetingRepository.list_for_user(
            db, user_id, limit=limit, search=search
        )
        if not meetings:
            return "No meetings found."

        lines = [f"Found {total} meeting(s), showing {len(meetings)}:\n"]
        for m in meetings:
            date_str = m.recorded_at.strftime("%Y-%m-%d %H:%M") if m.recorded_at else "unknown date"
            duration = f"{m.duration_seconds // 60}min" if m.duration_seconds else "unknown duration"
            title = m.title or "Untitled"
            lines.append(f"- [{m.id}] {title} | {date_str} | {duration} | status: {str(m.status)}")
        return "\n".join(lines)

    async def get_meeting_transcript(meeting_id: str) -> str:
        """
        Retrieve the full transcript of a specific meeting.

        Args:
            meeting_id: The meeting's UUID
        """
        meeting = await MeetingRepository.get_by_id(db, meeting_id, user_id=user_id)
        if not meeting:
            return f"Meeting {meeting_id} not found."

        transcript_path = meeting.storage_path
        # Transcripts are stored as .json alongside the recording
        if not transcript_path.endswith(".json"):
            transcript_path = transcript_path.rsplit(".", 1)[0] + ".json"

        try:
            async with aiofiles.open(transcript_path, "r") as f:
                raw = await f.read()
            entries = json.loads(raw)
        except FileNotFoundError:
            return f"Transcript file not found for meeting {meeting_id}."
        except Exception as e:
            logger.warning(f"Failed to read transcript {transcript_path}: {e}")
            return f"Could not load transcript for meeting {meeting_id}."

        if not entries:
            return "Transcript is empty."

        lines = []
        for entry in entries:
            ts = entry.get("timestamp", "")
            speaker = entry.get("speaker", "Unknown")
            text = entry.get("text", "")
            lines.append(f"[{ts}] {speaker}: {text}")
        return "\n".join(lines)

    async def get_meeting_summary(meeting_id: str) -> str:
        """
        Extract a structured summary from a meeting transcript including action items,
        decisions, and key topics.

        Args:
            meeting_id: The meeting's UUID
        """
        meeting = await MeetingRepository.get_by_id(db, meeting_id, user_id=user_id)
        if not meeting:
            return f"Meeting {meeting_id} not found."

        transcript_path = meeting.storage_path
        if not transcript_path.endswith(".json"):
            transcript_path = transcript_path.rsplit(".", 1)[0] + ".json"

        try:
            async with aiofiles.open(transcript_path, "r") as f:
                raw = await f.read()
            entries = json.loads(raw)
        except FileNotFoundError:
            return f"Transcript file not found for meeting {meeting_id}."
        except Exception as e:
            logger.warning(f"Failed to read transcript for summary {meeting_id}: {e}")
            return f"Could not load transcript for meeting {meeting_id}."

        if not entries:
            return "Transcript is empty — no summary available."

        # Extract insights from insight_type field if present (desktop app stores these)
        action_items = []
        decisions = []
        questions = []
        key_mentions = []

        for entry in entries:
            insight = entry.get("insight_type", "")
            text = entry.get("text", "")
            speaker = entry.get("speaker", "Unknown")
            if insight == "action_item":
                action_items.append(f"  - {speaker}: {text}")
            elif insight == "decision":
                decisions.append(f"  - {speaker}: {text}")
            elif insight == "question":
                questions.append(f"  - {speaker}: {text}")
            elif insight == "key_mention":
                key_mentions.append(f"  - {text}")

        title = meeting.title or "Untitled"
        date_str = meeting.recorded_at.strftime("%Y-%m-%d") if meeting.recorded_at else "unknown date"
        lines = [f"## Summary: {title} ({date_str})", f"Total entries: {len(entries)}\n"]

        if action_items:
            lines.append("### Action Items")
            lines.extend(action_items)
        if decisions:
            lines.append("\n### Decisions")
            lines.extend(decisions)
        if questions:
            lines.append("\n### Questions Raised")
            lines.extend(questions)
        if key_mentions:
            lines.append("\n### Key Mentions")
            lines.extend(key_mentions)

        if not any([action_items, decisions, questions, key_mentions]):
            lines.append("No structured insights extracted. Use get_meeting_transcript for the full text.")

        return "\n".join(lines)

    async def search_transcripts(query: str, limit: int = 5) -> str:
        """
        Search across all of the user's meeting transcripts by keyword.

        Args:
            query: Keyword or phrase to search for
            limit: Maximum number of matching meetings to return
        """
        limit = min(limit, 20)
        meetings, _ = await MeetingRepository.list_for_user(
            db, user_id, limit=100, search=query
        )
        if not meetings:
            return f"No meetings found matching '{query}'."

        results = []
        for meeting in meetings[:limit]:
            date_str = meeting.recorded_at.strftime("%Y-%m-%d") if meeting.recorded_at else "unknown"
            results.append(f"- [{meeting.id}] {meeting.title or 'Untitled'} ({date_str})")
        return f"Meetings matching '{query}':\n" + "\n".join(results)

    async def get_user_info() -> str:
        """Retrieve the current user's account information."""
        user = await UserRepository.get_by_id(db, user_id)
        if not user:
            return "User not found."
        meeting_count = await MeetingRepository.count_for_user(db, user_id)
        total_duration = await MeetingRepository.total_duration_for_user(db, user_id)
        hours = total_duration // 3600
        mins = (total_duration % 3600) // 60
        return (
            f"User: {user.full_name or user.username or user.email}\n"
            f"Email: {user.email}\n"
            f"Account status: {user.status if hasattr(user, 'status') else 'active'}\n"
            f"Total meetings: {meeting_count}\n"
            f"Total recorded time: {hours}h {mins}m"
        )

    return [
        StructuredTool.from_function(coroutine=list_meetings, name="list_meetings",
            description="List the user's meetings ordered by most recent. Optionally filter by keyword."),
        StructuredTool.from_function(coroutine=get_meeting_transcript, name="get_meeting_transcript",
            description="Get the full transcript of a specific meeting by its ID."),
        StructuredTool.from_function(coroutine=get_meeting_summary, name="get_meeting_summary",
            description="Get a structured summary of a meeting including action items, decisions, and questions."),
        StructuredTool.from_function(coroutine=search_transcripts, name="search_transcripts",
            description="Search across all meetings by keyword to find relevant meetings."),
        StructuredTool.from_function(coroutine=get_user_info, name="get_user_info",
            description="Get the current user's account info and meeting statistics."),
    ]

"""Web push subscriptions and reminder delivery records."""

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models.push import CalendarReminderDelivery, UserPushSubscription


class PushRepository:
    @staticmethod
    async def upsert_subscription(
        db: AsyncSession,
        user_id: str,
        *,
        endpoint: str,
        p256dh: str,
        auth: str,
        user_agent: str | None,
    ) -> UserPushSubscription:
        stmt = select(UserPushSubscription).where(UserPushSubscription.endpoint == endpoint)
        result = await db.execute(stmt)
        row = result.scalar_one_or_none()
        if row is None:
            row = UserPushSubscription(
                user_id=user_id,
                endpoint=endpoint,
                p256dh=p256dh,
                auth=auth,
                user_agent=user_agent,
            )
            db.add(row)
        else:
            row.user_id = user_id
            row.p256dh = p256dh
            row.auth = auth
            row.user_agent = user_agent
        await db.flush()
        await db.refresh(row)
        return row

    @staticmethod
    async def delete_by_endpoint(db: AsyncSession, user_id: str, endpoint: str) -> bool:
        stmt = (
            delete(UserPushSubscription)
            .where(
                UserPushSubscription.user_id == user_id,
                UserPushSubscription.endpoint == endpoint,
            )
        )
        result = await db.execute(stmt)
        return (result.rowcount or 0) > 0

    @staticmethod
    async def count_for_user(db: AsyncSession, user_id: str) -> int:
        from sqlalchemy import func

        stmt = select(func.count(UserPushSubscription.id)).where(UserPushSubscription.user_id == user_id)
        r = await db.execute(stmt)
        return int(r.scalar() or 0)

    @staticmethod
    async def list_subscriptions_for_user(db: AsyncSession, user_id: str) -> list[UserPushSubscription]:
        stmt = select(UserPushSubscription).where(UserPushSubscription.user_id == user_id)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def list_distinct_user_ids_with_subscriptions(db: AsyncSession) -> list[str]:
        stmt = select(UserPushSubscription.user_id).distinct()
        result = await db.execute(stmt)
        return [str(x) for x in result.scalars().all()]

    @staticmethod
    async def try_insert_reminder_delivery(
        db: AsyncSession,
        user_id: str,
        calendar_event_id: str,
        reminder_kind: str,
    ) -> bool:
        """Return True if a new row was inserted (caller may send push)."""
        import uuid

        row = CalendarReminderDelivery(
            id=str(uuid.uuid4()),
            user_id=user_id,
            calendar_event_id=calendar_event_id,
            reminder_kind=reminder_kind,
        )
        async with db.begin_nested():
            try:
                db.add(row)
                await db.flush()
                return True
            except IntegrityError:
                return False


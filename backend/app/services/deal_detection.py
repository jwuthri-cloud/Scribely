"""Deal detection: infer the customer domain for a meeting from participant emails."""

from __future__ import annotations

from collections import Counter
from typing import Iterable, Optional

GENERIC_EMAIL_DOMAINS: frozenset[str] = frozenset(
    {
        "gmail.com",
        "googlemail.com",
        "hotmail.com",
        "hotmail.co.uk",
        "hotmail.fr",
        "outlook.com",
        "outlook.fr",
        "live.com",
        "live.fr",
        "msn.com",
        "yahoo.com",
        "yahoo.co.uk",
        "yahoo.fr",
        "icloud.com",
        "me.com",
        "mac.com",
        "proton.me",
        "protonmail.com",
        "pm.me",
        "aol.com",
        "gmx.com",
        "gmx.de",
        "gmx.fr",
        "mail.com",
        "fastmail.com",
        "yandex.com",
        "yandex.ru",
        "zoho.com",
        "tutanota.com",
        "qq.com",
        "163.com",
        "126.com",
        "free.fr",
        "orange.fr",
        "sfr.fr",
        "laposte.net",
        "wanadoo.fr",
    }
)


def extract_domain(email: Optional[str]) -> Optional[str]:
    """Return the lowercased domain of an email, or None if invalid."""
    if not email or "@" not in email:
        return None
    domain = email.rsplit("@", 1)[-1].strip().lower()
    return domain or None


def normalize_email(email: Optional[str]) -> Optional[str]:
    """Lowercase trimmed address, or None if empty."""
    if not email or not isinstance(email, str):
        return None
    s = email.strip().lower()
    return s or None


def is_same_address_as_owner(
    owner_email: Optional[str], participant_email: str
) -> bool:
    """True when the participant is the account owner (calendar ``is_self`` can be wrong)."""
    o = normalize_email(owner_email)
    p = normalize_email(participant_email)
    return bool(o and p and o == p)


def is_generic_domain(domain: Optional[str]) -> bool:
    return bool(domain) and domain in GENERIC_EMAIL_DOMAINS


def detect_deal_domain(
    owner_email: Optional[str],
    participant_emails: Iterable[str],
) -> Optional[str]:
    """Return the majority non-owner, non-generic domain among participants.

    Returns None if no clear winner exists (including ties at the top).
    """
    owner_domain = extract_domain(owner_email)

    candidates: list[str] = []
    for email in participant_emails:
        if is_same_address_as_owner(owner_email, email):
            continue
        domain = extract_domain(email)
        if not domain:
            continue
        if domain == owner_domain:
            continue
        if is_generic_domain(domain):
            continue
        candidates.append(domain)

    if not candidates:
        return None

    counts = Counter(candidates)
    most_common = counts.most_common(2)
    top_domain, top_count = most_common[0]
    if len(most_common) > 1 and most_common[1][1] == top_count:
        return None
    return top_domain


def domain_to_deal_name(domain: str) -> str:
    """Pretty default name for a deal from its domain (e.g. acme.com -> Acme)."""
    root = domain.split(".")[0] if domain else domain
    return root.capitalize() if root else domain

"""Unit tests for ClerkUser role helpers (no I/O)."""

from app.security.clerk_auth import ClerkUser


def test_clerk_user_defaults_to_user_role() -> None:
    u = ClerkUser({"sub": "user_1", "email": "a@b.com"})
    assert u.role == "user"
    assert not u.is_admin
    assert not u.is_superadmin


def test_clerk_user_admin_role() -> None:
    u = ClerkUser({"sub": "admin_1", "public_metadata": {"role": "admin"}})
    assert u.is_admin
    assert u.has_role("user")
    assert u.has_role("admin")


def test_clerk_user_can_access_user() -> None:
    u = ClerkUser({"sub": "user_1"})
    assert u.can_access_user("user_1")
    assert not u.can_access_user("other")


def test_clerk_user_admin_can_access_others() -> None:
    u = ClerkUser({"sub": "admin_1", "public_metadata": {"role": "admin"}})
    assert u.can_access_user("any_id")


def test_clerk_user_to_dict_roundtrip_keys() -> None:
    u = ClerkUser({"sub": "x", "email": "e@e.com", "public_metadata": {"role": "user"}})
    d = u.to_dict()
    assert d["id"] == "x"
    assert d["email"] == "e@e.com"
    assert d["role"] == "user"

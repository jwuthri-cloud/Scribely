"""Unit tests for the deal_detection service."""

import pytest

from app.services.deal_detection import (
    GENERIC_EMAIL_DOMAINS,
    detect_deal_domain,
    domain_to_deal_name,
    extract_domain,
    is_generic_domain,
)


@pytest.mark.unit
class TestDealDetection:
    def test_extract_domain_basic(self):
        assert extract_domain("jade@acme.com") == "acme.com"
        assert extract_domain("JADE@Acme.COM") == "acme.com"
        assert extract_domain("invalid") is None
        assert extract_domain(None) is None
        assert extract_domain("") is None

    def test_generic_domains(self):
        assert is_generic_domain("gmail.com") is True
        assert is_generic_domain("acme.com") is False
        assert "gmail.com" in GENERIC_EMAIL_DOMAINS

    def test_majority_domain_wins(self):
        owner = "julien@scribely.com"
        participants = [
            "jade@too.com",
            "pat@lotus.com",
            "martin@too.com",
        ]
        assert detect_deal_domain(owner, participants) == "too.com"

    def test_owner_domain_excluded(self):
        owner = "julien@scribely.com"
        participants = [
            "alice@scribely.com",
            "bob@scribely.com",
            "pat@lotus.com",
        ]
        assert detect_deal_domain(owner, participants) == "lotus.com"

    def test_generic_domains_excluded(self):
        owner = "julien@scribely.com"
        participants = [
            "jade@gmail.com",
            "pat@hotmail.com",
            "martin@acme.com",
        ]
        assert detect_deal_domain(owner, participants) == "acme.com"

    def test_tie_returns_none(self):
        owner = "julien@scribely.com"
        participants = [
            "a@foo.com",
            "b@bar.com",
        ]
        assert detect_deal_domain(owner, participants) is None

    def test_no_external_returns_none(self):
        owner = "julien@scribely.com"
        participants = [
            "alice@scribely.com",
            "jade@gmail.com",
        ]
        assert detect_deal_domain(owner, participants) is None

    def test_empty_participants(self):
        assert detect_deal_domain("julien@scribely.com", []) is None

    def test_no_owner_email(self):
        participants = ["a@foo.com", "b@foo.com", "c@bar.com"]
        assert detect_deal_domain(None, participants) == "foo.com"

    def test_owner_address_skipped_when_duplicated_in_list(self):
        """Calendar can list the owner's email without ``is_self``; ignore it for domain votes."""
        owner = "julien@scribely.com"
        participants = [
            "julien@scribely.com",
            "a@acme.com",
            "b@acme.com",
        ]
        assert detect_deal_domain(owner, participants) == "acme.com"

    def test_domain_to_deal_name(self):
        assert domain_to_deal_name("acme.com") == "Acme"
        assert domain_to_deal_name("too.com") == "Too"
        assert domain_to_deal_name("") == ""

"""Tests for sendfn models."""

import pytest
from pydantic import ValidationError

from sendfn.models import (
    EmailTransaction,
    SendEmailParams,
    SuppressionList,
)


def test_send_email_params_validation():
    """Test SendEmailParams validation."""
    # Valid params
    params = SendEmailParams(
        user_id="user-123",
        to="user@example.com",
        subject="Test",
        html="<p>Test</p>",
    )
    assert params.user_id == "user-123"
    assert params.to == ["user@example.com"]  # Normalized to list

    # Multiple recipients
    params = SendEmailParams(
        user_id="user-123",
        to=["user1@example.com", "user2@example.com"],
        subject="Test",
        html="<p>Test</p>",
    )
    assert len(params.to) == 2


def test_send_email_params_template():
    """Test SendEmailParams with template."""
    params = SendEmailParams(
        user_id="user-123",
        to="user@example.com",
        template_id="welcome",
        template_data={"name": "John"},
    )
    assert params.template_id == "welcome"
    assert params.template_data == {"name": "John"}


def test_email_transaction_model():
    """Test EmailTransaction model."""
    from datetime import datetime
    from uuid import uuid4

    transaction = EmailTransaction(
        id=uuid4(),
        userId="user-123",
        to="user@example.com",
        **{"from": "noreply@example.com"},
        subject="Test",
        templateId=None,
        templateData=None,
        provider="aws-ses",
        providerMessageId="msg-123",
        status="sent",
        sentAt=datetime.utcnow(),
        deliveredAt=None,
        bouncedAt=None,
        complainedAt=None,
        metadata={},
        createdAt=datetime.utcnow(),
        updatedAt=datetime.utcnow(),
    )
    
    assert transaction.user_id == "user-123"
    assert transaction.status == "sent"


def test_suppression_list_model():
    """Test SuppressionList model."""
    from datetime import datetime
    from uuid import uuid4

    suppression = SuppressionList(
        id=uuid4(),
        email="spam@example.com",
        reason="manual",
        source="admin",
        bounceType=None,
        metadata={},
        suppressedAt=datetime.utcnow(),
        createdAt=datetime.utcnow(),
    )
    
    assert suppression.email == "spam@example.com"
    assert suppression.reason == "manual"

"""SQLAlchemy schema provisioning regressions."""

from datetime import datetime, timezone

import pytest

from sendfn.database import create_email_transaction, create_sqlalchemy_schema


@pytest.mark.asyncio
async def test_sqlalchemy_setup_provisions_tables_before_first_sendfn_operation() -> None:
    sqlalchemy = pytest.importorskip("sqlalchemy")
    superfunctions_sqlalchemy = pytest.importorskip("superfunctions_sqlalchemy")
    engine = sqlalchemy.create_engine("sqlite+pysqlite:///:memory:")
    create_sqlalchemy_schema(engine)
    adapter = superfunctions_sqlalchemy.create_adapter(engine)

    transaction = await create_email_transaction(adapter, {
        "userId": "project-1",
        "to": "recipient@example.com",
        "from": "agent@example.com",
        "subject": "Provisioned",
        "templateId": None,
        "templateData": None,
        "provider": "test",
        "providerMessageId": None,
        "status": "pending",
        "sentAt": None,
        "deliveredAt": None,
        "bouncedAt": None,
        "complainedAt": None,
        "metadata": {},
        "createdAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc),
    })

    assert transaction.subject == "Provisioned"

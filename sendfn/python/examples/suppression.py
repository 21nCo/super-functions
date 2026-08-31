"""Suppression list management example.

Run after:
    python -m pip install -e ./packages/python-core
    python -m pip install -e './sendfn/python[email]'
"""

import asyncio

from sendfn import SendfnConfig, create_sendfn
from sendfn.database import MemoryAdapter
from sendfn.errors import SuppressionError
from sendfn.models import AwsSesConfig, EmailConfig, SendEmailParams


async def main():
    """Demonstrate suppression list management."""
    # Create configuration
    config = SendfnConfig(
        database=MemoryAdapter(),
        email=EmailConfig(
            from_email="noreply@example.com",
            from_name="My App",
            aws_ses=AwsSesConfig(
                access_key_id="YOUR_ACCESS_KEY_ID",
                secret_access_key="YOUR_SECRET_ACCESS_KEY",
                region="us-east-1",
            ),
        ),
    )

    # Create client
    client = create_sendfn(config)

    # Add an email to suppression list
    print("Adding email to suppression list...")
    await client.add_to_suppression_list(
        email="bounced@example.com",
        reason="bounce",
        source="aws-ses",
        bounce_type="permanent",
        metadata={"bounce_subtype": "General"},
    )

    # Check if email is suppressed
    result = await client.check_suppression_list("bounced@example.com")
    print(f"\nIs bounced@example.com suppressed? {result['suppressed']}")
    if result["entry"]:
        print(f"Reason: {result['entry'].reason}")
        print(f"Source: {result['entry'].source}")

    # Try to send to suppressed email (will fail)
    print("\nAttempting to send to suppressed email...")
    try:
        await client.send_email(
            SendEmailParams(
                user_id="user-123",
                to="bounced@example.com",
                subject="Test",
                html="<p>This should not send</p>",
            )
        )
    except SuppressionError as e:
        print(f"Email blocked by suppression list: {e}")

    # Send to non-suppressed email (will succeed)
    print("\nSending to non-suppressed email...")
    transaction = await client.send_email(
        SendEmailParams(
            user_id="user-123",
            to="valid@example.com",
            subject="Test",
            html="<p>This will send</p>",
        )
    )
    print(f"Email sent successfully! Transaction ID: {transaction.id}")

    # Remove from suppression list
    print("\nRemoving email from suppression list...")
    await client.remove_from_suppression_list("bounced@example.com")

    # Verify removal
    result = await client.check_suppression_list("bounced@example.com")
    print(f"Is bounced@example.com still suppressed? {result['suppressed']}")


if __name__ == "__main__":
    asyncio.run(main())

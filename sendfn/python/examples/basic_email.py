"""Basic email sending example.

Run after:
    python -m pip install -e ./packages/python-core
    python -m pip install -e './sendfn/python[email]'
"""

import asyncio

from sendfn import SendfnConfig, create_sendfn
from sendfn.database import MemoryAdapter
from sendfn.models import AwsSesConfig, EmailConfig, SendEmailParams


async def main():
    """Send a basic email."""
    # Create configuration
    config = SendfnConfig(
        database=MemoryAdapter(),
        email=EmailConfig(
            from_email="noreply@example.com",
            from_name="My App",
            reply_to="support@example.com",
            aws_ses=AwsSesConfig(
                access_key_id="YOUR_ACCESS_KEY_ID",
                secret_access_key="YOUR_SECRET_ACCESS_KEY",
                region="us-east-1",
            ),
        ),
    )

    # Create client
    client = create_sendfn(config)

    # Send an email
    print("Sending email...")
    transaction = await client.send_email(
        SendEmailParams(
            user_id="user-123",
            to="recipient@example.com",
            subject="Welcome to My App!",
            html="""
            <html>
            <body>
                <h1>Welcome!</h1>
                <p>Thank you for joining My App.</p>
                <p>We're excited to have you on board!</p>
            </body>
            </html>
            """,
            text="Welcome! Thank you for joining My App. We're excited to have you on board!",
        )
    )

    print(f"Email sent successfully!")
    print(f"Transaction ID: {transaction.id}")
    print(f"Status: {transaction.status}")
    print(f"Provider Message ID: {transaction.provider_message_id}")

    # Get email events
    events = await client.get_email_events(str(transaction.id))
    print(f"\nEvents ({len(events)}):")
    for event in events:
        print(f"  - {event.event_type} at {event.event_timestamp}")


if __name__ == "__main__":
    asyncio.run(main())

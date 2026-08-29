"""Email template usage example.

Run after:
    python -m pip install -e ./packages/python-core
    python -m pip install -e './sendfn/python[email]'
"""

import asyncio

from sendfn import SendfnConfig, create_sendfn
from sendfn.database import MemoryAdapter
from sendfn.models import AwsSesConfig, EmailConfig, EmailTemplate, SendEmailParams


async def main():
    """Send emails using templates."""
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

    # Register a custom template
    custom_template = EmailTemplate(
        id="user-invitation",
        name="User Invitation",
        subject="You've been invited to {{appName}}!",
        html="""
        <html>
        <body>
            <h1>Hi {{inviteeName}}!</h1>
            <p>{{inviterName}} has invited you to join {{appName}}.</p>
            {{#if message}}
            <p><em>Personal message: {{message}}</em></p>
            {{/if}}
            <p><a href="{{inviteUrl}}">Accept Invitation</a></p>
            <p>This invitation will expire in {{expiryDays}} days.</p>
        </body>
        </html>
        """,
        text="""
        Hi {{inviteeName}}!
        
        {{inviterName}} has invited you to join {{appName}}.
        
        Accept invitation: {{inviteUrl}}
        
        This invitation will expire in {{expiryDays}} days.
        """,
        variables=["inviteeName", "inviterName", "appName", "inviteUrl", "expiryDays", "message"],
    )

    await client.register_template(custom_template)

    # Send email using custom template
    print("Sending invitation email...")
    transaction = await client.send_email(
        SendEmailParams(
            user_id="user-123",
            to="newuser@example.com",
            template_id="user-invitation",
            template_data={
                "inviteeName": "Jane",
                "inviterName": "John",
                "appName": "My App",
                "inviteUrl": "https://example.com/invite/abc123",
                "expiryDays": "7",
                "message": "I think you'll love this app!",
            },
        )
    )

    print(f"Invitation sent! Transaction ID: {transaction.id}")

    # Use built-in template (welcome-email)
    print("\nSending welcome email using built-in template...")
    welcome_transaction = await client.send_email(
        SendEmailParams(
            user_id="user-456",
            to="user@example.com",
            template_id="welcome-email",
            template_data={
                "userName": "Alice",
                "appName": "My App",
                "verificationUrl": "https://example.com/verify/xyz789",
            },
        )
    )

    print(f"Welcome email sent! Transaction ID: {welcome_transaction.id}")

    # List all templates
    templates = await client.list_templates()
    print(f"\nRegistered templates ({len(templates)}):")
    for template in templates:
        print(f"  - {template.id}: {template.name}")


if __name__ == "__main__":
    asyncio.run(main())

# SendFn Python SDK

Self-hosted communications platform SDK for email, push notifications, and SMS.

## Installation

```bash
pip install sendfn
```

For email support (AWS SES):

```bash
pip install sendfn[email]
```

For push notification support:

```bash
pip install sendfn[push]
```

For all features:

```bash
pip install sendfn[all]
```

For FastAPI integration:

```bash
pip install sendfn[fastapi]
```

## Verify From Repo Root

Use a Python 3.10+ interpreter when running the repo-local package commands.

```bash
python -m pip install -e ./packages/python-core
python -m pip install -e './sendfn/python[dev,email,push,fastapi]'
python -m pytest sendfn/python/tests
```

## Quick Start

### Email Sending

```python
from sendfn import create_sendfn, SendfnConfig
from sendfn.models import EmailConfig, AwsSesConfig, SendEmailParams
from sendfn.database import MemoryAdapter

# Create configuration
config = SendfnConfig(
    database=MemoryAdapter(),
    email=EmailConfig(
        from_email="noreply@example.com",
        from_name="My App",
        aws_ses=AwsSesConfig(
            access_key_id="YOUR_ACCESS_KEY",
            secret_access_key="YOUR_SECRET_KEY",
            region="us-east-1",
        ),
    ),
)

# Create client
sendfn = create_sendfn(config)

# Send an email
transaction = await sendfn.send_email(
    SendEmailParams(
        user_id="user-123",
        to="user@example.com",
        subject="Welcome!",
        html="<h1>Welcome to our app!</h1>",
        text="Welcome to our app!",
    )
)

print(f"Email sent! Transaction ID: {transaction.id}")
```

### Using Templates

```python
from sendfn.models import EmailTemplate

# Register a custom template
template = EmailTemplate(
    id="welcome",
    name="Welcome Email",
    subject="Welcome to {{appName}}!",
    html="<h1>Hi {{userName}}!</h1><p>Welcome to {{appName}}.</p>",
    variables=["userName", "appName"],
)

await sendfn.register_template(template)

# Send email using template
transaction = await sendfn.send_email(
    SendEmailParams(
        user_id="user-123",
        to="user@example.com",
        template_id="welcome",
        template_data={
            "userName": "John",
            "appName": "My App",
        },
    )
)
```

### Suppression List

```python
# Check if email is suppressed
result = await sendfn.check_suppression_list("user@example.com")
if result["suppressed"]:
    print(f"Email is suppressed: {result['entry'].reason}")

# Add to suppression list
await sendfn.add_to_suppression_list(
    email="spam@example.com",
    reason="manual",
    source="admin-action",
)

# Remove from suppression list
await sendfn.remove_from_suppression_list("user@example.com")
```

### Event Tracking

```python
# Get events for an email transaction
events = await sendfn.get_email_events(transaction_id="...")

for event in events:
    print(f"{event.event_type} at {event.event_timestamp}")
```

## Features

- ✅ **Email Sending** - AWS SES support with attachments
- ✅ **Template Engine** - Variable interpolation, conditionals, loops
- ✅ **Suppression Lists** - Automatic bounce and complaint handling
- ✅ **Event Tracking** - Track delivery, bounces, opens, clicks
- ✅ **Database Agnostic** - Works with any database via adapters
- ✅ **Push Notifications** - FCM and APNS support with the `push` extra
- ✅ **SMS** - Basic SMS provider abstraction and console provider support

## Configuration

### Email Configuration

```python
EmailConfig(
    from_email="noreply@example.com",  # Required
    from_name="My App",  # Optional
    reply_to="support@example.com",  # Optional
    aws_ses=AwsSesConfig(
        access_key_id="...",
        secret_access_key="...",
        region="us-east-1",
        configuration_set_name="my-config-set",  # Optional
    ),
)
```

### Options

```python
SendfnOptions(
    suppression_enabled=True,  # Enable suppression list checking
    retry_attempts=3,  # Number of retry attempts
    retry_delay=1000,  # Delay between retries (ms)
    event_tracking=True,  # Enable event tracking
)
```

## Database Adapters

### Memory Adapter (for testing)

```python
from sendfn.database import MemoryAdapter

adapter = MemoryAdapter()
```

### With Superfunctions DB

Install the SQLAlchemy integration and a driver for your database:

```bash
python -m pip install 'sendfn[database]' psycopg
```

```python
from sqlalchemy import create_engine
from superfunctions_sqlalchemy import create_adapter

engine = create_engine("postgresql+psycopg://user:password@localhost/sendfn")
adapter = create_adapter(engine)
```

## Development

```bash
python -m pip install -e ./packages/python-core
python -m pip install -e './sendfn/python[dev,email,push,fastapi]'
python -m pytest sendfn/python/tests
```

## Webhook Setup

Authorize every SNS topic that may deliver SES lifecycle events. SendFn does not expose the handler with an empty allowlist.

```python
config = SendfnConfig(
    database=adapter,
    aws_sns_topic_arns=[
        "arn:aws:sns:us-east-1:123456789012:sendfn-production",
    ],
)
sendfn = create_sendfn(config)
handler = sendfn.get_webhook_handlers()["awsSes"]
```

AWS SES webhook endpoints must receive the full SNS envelope unchanged. The handler contract expects the original SNS signature fields (`Signature`, `SigningCertURL`, `Timestamp`, and `Message`) so signature verification can run before lifecycle events are trusted. Do not strip the SNS wrapper or forward only the inner SES JSON.

## Examples

- `examples/basic_email.py`
- `examples/templates.py`
- `examples/suppression.py`

## License

MIT License - see LICENSE file for details.

## Links

- [Documentation](https://docs.superfunctions.dev/sendfn)
- [GitHub](https://github.com/21nCo/super-functions)
- [Issues](https://github.com/21nCo/super-functions/issues)

"""HTTP routes for sendfn using superfunctions.http abstractions."""

from __future__ import annotations

from typing import Any, Optional
from uuid import uuid4

from pydantic import ValidationError as PydanticValidationError
from superfunctions.http import (
    HttpMethod,
    Request,
    Response,
    Route,
    RouteContext,
)

from ..client import Sendfn
from ..errors import SendfnError


def _request_id(request: Request) -> str:
    return request.headers.get("x-request-id") or f"req_{uuid4().hex[:12]}"


def _success_response(data: Any, request_id: str, status: int = 200) -> Response:
    return Response(
        status=status,
        body={
            "ok": True,
            "data": data,
            "error": None,
            "meta": {
                "requestId": request_id,
                "version": "v0",
            },
        },
    )


def _error_response(
    *,
    request_id: str,
    status: int,
    code: str,
    message: str,
    retryable: bool = False,
    details: Optional[dict[str, Any]] = None,
) -> Response:
    return Response(
        status=status,
        body={
            "ok": False,
            "data": None,
            "error": {
                "code": code,
                "message": message,
                "retryable": retryable,
                **({"details": details} if details else {}),
            },
            "meta": {
                "requestId": request_id,
                "version": "v0",
            },
        },
    )


def create_sendfn_routes(
    sendfn_client: Sendfn,
    admin_key: Optional[str] = None,
) -> list[Route]:
    """Create framework-agnostic HTTP routes for sendfn.

    Args:
        sendfn_client: Initialized Sendfn client
        admin_key: Optional admin API key for authentication

    Returns:
        List of superfunctions.http.Route objects

    Example:
        ```python
        from superfunctions_fastapi import create_router
        from sendfn import Sendfn, SendfnConfig
        from sendfn.http import create_sendfn_routes

        client = Sendfn(SendfnConfig(database=adapter))
        routes = create_sendfn_routes(client, admin_key="secret")
        router = create_router(routes, prefix="/api")
        app.include_router(router)
        ```
    """

    def verify_admin(request: Request, context: RouteContext) -> None:
        """Verify admin API key from Authorization header."""
        if not admin_key:
            raise SendfnError("Unauthorized", code="SENDFN_UNAUTHORIZED", retryable=False)

        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            raise SendfnError("Unauthorized", code="SENDFN_UNAUTHORIZED", retryable=False)

        token = auth_header[7:]  # Remove "Bearer " prefix
        if token != admin_key:
            raise SendfnError("Unauthorized", code="SENDFN_UNAUTHORIZED", retryable=False)

    async def execute(
        request: Request,
        operation: Any,
        *,
        success_status: int = 200,
        validation_message: str = "Request body failed validation",
        request_id: Optional[str] = None,
    ) -> Response:
        resolved_request_id = request_id or _request_id(request)

        try:
            data = await operation()
            return _success_response(data, resolved_request_id, success_status)
        except PydanticValidationError as error:
            return _error_response(
                request_id=resolved_request_id,
                status=400,
                code="SENDFN_VALIDATION_ERROR",
                message=validation_message,
                retryable=False,
                details={"errors": error.errors()},
            )
        except SendfnError as error:
            status = (
                401
                if error.code == "SENDFN_UNAUTHORIZED"
                else 400
                if error.code
                in {
                    "SENDFN_VALIDATION_ERROR",
                    "SENDFN_WEBHOOK_SIGNATURE_INVALID",
                    "SENDFN_WEBHOOK_MESSAGE_INVALID",
                }
                else 500
            )
            message = (
                validation_message
                if error.code == "SENDFN_VALIDATION_ERROR"
                else error.args[0]
            )
            return _error_response(
                request_id=resolved_request_id,
                status=status,
                code=error.code,
                message=message,
                retryable=error.retryable,
                details=error.details,
            )
        except Exception:
            return _error_response(
                request_id=resolved_request_id,
                status=500,
                code="SENDFN_INTERNAL_ERROR",
                message="Internal Server Error",
                retryable=False,
            )

    # Email endpoints
    async def send_email_handler(
        request: Request, context: RouteContext
    ) -> Response:
        """Send an email."""
        async def operation() -> dict[str, Any]:
            verify_admin(request, context)
            from ..models import SendEmailParams

            body = await request.json()
            params = SendEmailParams.model_validate(body)
            transaction = await sendfn_client.send_email(params)
            return transaction.model_dump(mode="json")

        return await execute(
            request,
            operation,
            success_status=201,
        )

    async def send_bulk_email_handler(
        request: Request, context: RouteContext
    ) -> Response:
        """Send bulk emails."""
        async def operation() -> dict[str, Any]:
            verify_admin(request, context)
            from ..models import SendEmailParams

            body = await request.json()
            params = [SendEmailParams.model_validate(r) for r in body]
            transactions = await sendfn_client.send_bulk_email(params)
            return {
                "transactions": [t.model_dump(mode="json") for t in transactions],
                "count": len(transactions),
            }

        return await execute(
            request,
            operation,
            success_status=201,
        )

    # SMS endpoint
    async def send_sms_handler(request: Request, context: RouteContext) -> Response:
        """Send an SMS."""
        async def operation() -> dict[str, Any]:
            verify_admin(request, context)
            from ..models import SendSmsParams

            body = await request.json()
            params = SendSmsParams.model_validate(body)
            transaction = await sendfn_client.send_sms(params)
            return transaction.model_dump(mode="json")

        return await execute(request, operation, success_status=201)

    # Push endpoints
    async def send_push_handler(request: Request, context: RouteContext) -> Response:
        """Send a push notification."""
        async def operation() -> dict[str, Any]:
            verify_admin(request, context)
            from ..models import SendPushParams

            body = await request.json()
            params = SendPushParams.model_validate(body)
            notification = await sendfn_client.send_push(params)
            return notification.model_dump(mode="json")

        return await execute(request, operation, success_status=201)

    async def send_bulk_push_handler(
        request: Request, context: RouteContext
    ) -> Response:
        """Send bulk push notifications."""
        async def operation() -> dict[str, Any]:
            verify_admin(request, context)
            from ..models import SendPushParams

            body = await request.json()
            params = [SendPushParams.model_validate(n) for n in body]
            notifications = await sendfn_client.send_bulk_push(params)
            return {
                "notifications": [n.model_dump(mode="json") for n in notifications],
                "count": len(notifications),
            }

        return await execute(request, operation, success_status=201)

    # Device management
    async def register_device_handler(
        request: Request, context: RouteContext
    ) -> Response:
        """Register a device token."""
        async def operation() -> dict[str, Any]:
            verify_admin(request, context)
            from ..models import RegisterDeviceParams

            body = await request.json()
            params = RegisterDeviceParams.model_validate(body)
            device = await sendfn_client.register_device(params)
            return device.model_dump(mode="json")

        return await execute(request, operation, success_status=201)

    async def get_devices_handler(
        request: Request, context: RouteContext
    ) -> Response:
        """Get device tokens for a user."""
        async def operation() -> dict[str, Any]:
            verify_admin(request, context)
            user_id = context.params["user_id"]
            platform = context.query.get("platform")
            devices = await sendfn_client.get_devices(user_id, platform)  # type: ignore
            return {
                "devices": [d.model_dump(mode="json") for d in devices],
                "count": len(devices),
            }

        return await execute(request, operation)

    # Event endpoints
    async def get_email_events_handler(
        request: Request, context: RouteContext
    ) -> Response:
        """Get events for an email transaction."""
        async def operation() -> dict[str, Any]:
            verify_admin(request, context)
            transaction_id = context.params["transaction_id"]
            events = await sendfn_client.get_email_events(transaction_id)
            return {
                "events": [e.model_dump(mode="json") for e in events],
                "count": len(events),
            }

        return await execute(request, operation)

    async def get_push_events_handler(
        request: Request, context: RouteContext
    ) -> Response:
        """Get events for a push notification."""
        async def operation() -> dict[str, Any]:
            verify_admin(request, context)
            notification_id = context.params["notification_id"]
            events = await sendfn_client.get_push_events(notification_id)
            return {
                "events": [e.model_dump(mode="json") for e in events],
                "count": len(events),
            }

        return await execute(request, operation)

    async def get_sms_events_handler(
        request: Request, context: RouteContext
    ) -> Response:
        """Get events for an SMS transaction."""
        async def operation() -> dict[str, Any]:
            verify_admin(request, context)
            transaction_id = context.params["transaction_id"]
            events = await sendfn_client.get_sms_events(transaction_id)
            return {
                "events": [e.model_dump(mode="json") for e in events],
                "count": len(events),
            }

        return await execute(request, operation)

    # Suppression endpoints
    async def check_suppression_handler(
        request: Request, context: RouteContext
    ) -> Response:
        """Check if an email is suppressed."""
        async def operation() -> dict[str, Any]:
            verify_admin(request, context)
            email = context.params["email"]
            return await sendfn_client.check_suppression_list(email)

        return await execute(request, operation)

    async def add_to_suppression_handler(
        request: Request, context: RouteContext
    ) -> Response:
        """Add an email to the suppression list."""
        async def operation() -> dict[str, Any]:
            verify_admin(request, context)
            body = await request.json()
            entry = await sendfn_client.add_to_suppression_list(
                email=body["email"],
                reason=body["reason"],
                source=body.get("source", "manual"),
                bounce_type=body.get("bounceType"),
                metadata=body.get("metadata"),
            )
            return entry.model_dump(mode="json")

        return await execute(request, operation, success_status=201)

    async def remove_from_suppression_handler(
        request: Request, context: RouteContext
    ) -> Response:
        """Remove an email from the suppression list."""
        async def operation() -> dict[str, str]:
            verify_admin(request, context)
            email = context.params["email"]
            await sendfn_client.remove_from_suppression_list(email)
            return {"message": "Email removed from suppression list"}

        return await execute(request, operation)

    # Webhook endpoint
    async def aws_ses_webhook_handler(
        request: Request, context: RouteContext
    ) -> Response:
        """Handle AWS SES SNS webhook."""
        request_id = _request_id(request)

        async def operation() -> dict[str, Any]:
            body = await request.json()
            handlers = sendfn_client.get_webhook_handlers()
            return await handlers["awsSes"].handle_webhook(
                body,
                request_id=request_id,
            )

        return await execute(request, operation, request_id=request_id)

    webhook_routes = (
        [
            Route(
                method=HttpMethod.POST,
                path="/webhooks/aws-ses",
                handler=aws_ses_webhook_handler,
            )
        ]
        if any(
            isinstance(topic_arn, str) and topic_arn.strip()
            for topic_arn in sendfn_client.config.aws_sns_topic_arns
        )
        else []
    )

    # Define routes
    return [
        # Email routes
        Route(method=HttpMethod.POST, path="/email", handler=send_email_handler),
        Route(
            method=HttpMethod.POST, path="/email/bulk", handler=send_bulk_email_handler
        ),
        # SMS routes
        Route(method=HttpMethod.POST, path="/sms", handler=send_sms_handler),
        # Push routes
        Route(method=HttpMethod.POST, path="/push", handler=send_push_handler),
        Route(
            method=HttpMethod.POST, path="/push/bulk", handler=send_bulk_push_handler
        ),
        # Device routes
        Route(method=HttpMethod.POST, path="/devices", handler=register_device_handler),
        Route(
            method=HttpMethod.GET, path="/devices/{user_id}", handler=get_devices_handler
        ),
        # Event routes
        Route(
            method=HttpMethod.GET,
            path="/events/email/{transaction_id}",
            handler=get_email_events_handler,
        ),
        Route(
            method=HttpMethod.GET,
            path="/events/push/{notification_id}",
            handler=get_push_events_handler,
        ),
        Route(
            method=HttpMethod.GET,
            path="/events/sms/{transaction_id}",
            handler=get_sms_events_handler,
        ),
        # Suppression routes
        Route(
            method=HttpMethod.GET,
            path="/suppression/{email}",
            handler=check_suppression_handler,
        ),
        Route(
            method=HttpMethod.POST,
            path="/suppression",
            handler=add_to_suppression_handler,
        ),
        Route(
            method=HttpMethod.DELETE,
            path="/suppression/{email}",
            handler=remove_from_suppression_handler,
        ),
        *webhook_routes,
    ]

"""Template engine for email templates."""

import html
import re
from typing import Any, Optional

from ..errors import TemplateError
from ..models import EmailTemplate


TemplateNode = dict[str, Any]


class TemplateEngine:
    """Lightweight template engine for email templates."""

    def render(self, template: str, data: dict[str, Any]) -> str:
        """Render a template with data."""
        try:
            nodes = self._parse(template)
            return self._render_nodes(nodes, [data])
        except TemplateError:
            raise
        except Exception as exc:
            raise TemplateError(
                "Malformed template block syntax",
                code="SENDFN_TEMPLATE_RENDER_ERROR",
                details={"cause": str(exc)},
            ) from exc

    def validate(self, template: EmailTemplate, data: dict[str, Any]) -> dict[str, Any]:
        """Validate template data."""
        errors = []
        optional_variables = set((template.metadata or {}).get("optionalVariables", []))

        for var in template.variables:
            if var not in data and var not in optional_variables:
                errors.append(f"Missing required variable: {var}")

        warnings = []
        for key in data.keys():
            if key not in template.variables and key not in optional_variables:
                warnings.append(f"Unused variable: {key}")

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
        }

    def extract_variables(self, template: str) -> list[str]:
        """Extract variable names from a template."""
        nodes = self._parse(template)
        variables: set[str] = set()
        self._collect_variables(nodes, variables)
        return sorted(list(variables))

    def _collect_variables(self, nodes: list[TemplateNode], variables: set[str]) -> None:
        for node in nodes:
            node_type = node["type"]
            if node_type == "variable":
                variables.add(node["name"])
            elif node_type in {"if", "each"}:
                variables.add(node["name"])
                self._collect_variables(node["children"], variables)

    def _parse(self, template: str) -> list[TemplateNode]:
        tag_pattern = re.compile(r"\{\{([^}]+)\}\}")
        frames: list[TemplateNode] = [{"type": "root", "children": []}]
        cursor = 0

        for match in tag_pattern.finditer(template):
            if match.start() > cursor:
                frames[-1]["children"].append(
                    {"type": "text", "value": template[cursor : match.start()]}
                )

            tag = match.group(1).strip()
            if tag.startswith("#"):
                parsed = re.fullmatch(r"#(if|each)\s+([a-zA-Z0-9_.]+)", tag)
                if not parsed:
                    raise ValueError(f"Unsupported block tag: {tag}")

                node = {
                    "type": parsed.group(1),
                    "name": parsed.group(2),
                    "children": [],
                }
                frames[-1]["children"].append(node)
                frames.append(node)
            elif tag.startswith("/"):
                parsed = re.fullmatch(r"/(if|each)", tag)
                if not parsed or len(frames) == 1:
                    raise ValueError(f"Unexpected closing tag: {tag}")

                closed = frames.pop()
                if closed["type"] != parsed.group(1):
                    raise ValueError(f"Mismatched closing tag: {tag}")
            else:
                if not re.fullmatch(r"[a-zA-Z0-9_.]+", tag):
                    raise ValueError(f"Unsupported variable tag: {tag}")
                frames[-1]["children"].append({"type": "variable", "name": tag})

            cursor = match.end()

        if cursor < len(template):
            frames[-1]["children"].append({"type": "text", "value": template[cursor:]})

        if len(frames) != 1:
            raise ValueError("Unclosed template block")

        return frames[0]["children"]

    def _render_nodes(self, nodes: list[TemplateNode], scopes: list[dict[str, Any]]) -> str:
        result: list[str] = []
        for node in nodes:
            node_type = node["type"]
            if node_type == "text":
                result.append(node["value"])
            elif node_type == "variable":
                value = self._resolve_value(node["name"], scopes)
                result.append("" if value is None else html.escape(str(value)))
            elif node_type == "if":
                if self._resolve_value(node["name"], scopes):
                    result.append(self._render_nodes(node["children"], scopes))
            elif node_type == "each":
                value = self._resolve_value(node["name"], scopes)
                if isinstance(value, list):
                    for item in value:
                        scope = {"this": item}
                        if isinstance(item, dict):
                            scope.update(item)
                        result.append(self._render_nodes(node["children"], [scope, *scopes]))
        return "".join(result)

    def _resolve_value(self, path: str, scopes: list[dict[str, Any]]) -> Any:
        parts = path.split(".")

        for scope in scopes:
            value: Any = scope
            matched = True
            for part in parts:
                if isinstance(value, dict) and part in value:
                    value = value[part]
                else:
                    matched = False
                    break
            if matched:
                return value

        return None


class TemplateRegistry:
    """Registry for email templates."""

    def __init__(self) -> None:
        """Initialize the template registry."""
        self._templates: dict[str, EmailTemplate] = {}
        self._load_default_templates()

    def register(self, template: EmailTemplate) -> None:
        """Register a template."""
        self._templates[template.id] = template

    def get(self, template_id: str) -> Optional[EmailTemplate]:
        """Get a template by ID."""
        return self._templates.get(template_id)

    def list(self) -> list[EmailTemplate]:
        """List all registered templates."""
        return list(self._templates.values())

    def _load_default_templates(self) -> None:
        """Load default built-in templates."""
        welcome_template = EmailTemplate(
            id="welcome-email",
            name="Welcome Email",
            subject="Welcome to {{appName}}!",
            html="""
            <html>
            <body>
                <h1>Welcome, {{userName}}!</h1>
                <p>Thank you for joining {{appName}}. We're excited to have you on board.</p>
                {{#if verificationUrl}}
                <p>Please verify your email address by clicking the link below:</p>
                <p><a href="{{verificationUrl}}">Verify Email</a></p>
                {{/if}}
                <p>Best regards,<br>The {{appName}} Team</p>
            </body>
            </html>
            """,
            text="""
            Welcome, {{userName}}!
            
            Thank you for joining {{appName}}. We're excited to have you on board.
            {{#if verificationUrl}}
            Verify your email: {{verificationUrl}}
            {{/if}}
            
            Best regards,
            The {{appName}} Team
            """,
            variables=["userName", "appName"],
            metadata={"optionalVariables": ["verificationUrl"]},
        )
        self.register(welcome_template)

        password_reset_template = EmailTemplate(
            id="password-reset",
            name="Password Reset",
            subject="Reset your password for {{appName}}",
            html="""
            <html>
            <body>
                <h1>Password Reset Request</h1>
                <p>Hi {{userName}},</p>
                <p>We received a request to reset your password for your {{appName}} account.</p>
                <p>Click the link below to reset your password:</p>
                <p><a href="{{resetUrl}}">Reset Password</a></p>
                <p>This link will expire in {{expiryHours}} hours.</p>
                <p>If you didn't request this, you can safely ignore this email.</p>
                <p>Best regards,<br>The {{appName}} Team</p>
            </body>
            </html>
            """,
            text="""
            Password Reset Request
            
            Hi {{userName}},
            
            We received a request to reset your password for your {{appName}} account.
            
            Reset your password: {{resetUrl}}
            
            This link will expire in {{expiryHours}} hours.
            
            If you didn't request this, you can safely ignore this email.
            
            Best regards,
            The {{appName}} Team
            """,
            variables=["userName", "appName", "resetUrl", "expiryHours"],
        )
        self.register(password_reset_template)

        notification_template = EmailTemplate(
            id="notification",
            name="Notification",
            subject="{{subject}}",
            html="""
            <html>
            <body>
                <h1>{{title}}</h1>
                <p>{{message}}</p>
                {{#if actionUrl}}
                <p><a href="{{actionUrl}}">{{actionText}}</a></p>
                {{/if}}
                <p>Best regards,<br>{{appName}}</p>
            </body>
            </html>
            """,
            text="""
            {{title}}
            
            {{message}}
            
            {{#if actionUrl}}{{actionText}}: {{actionUrl}}{{/if}}
            
            Best regards,
            {{appName}}
            """,
            variables=["subject", "title", "message", "appName"],
            metadata={"optionalVariables": ["actionUrl", "actionText"]},
        )
        self.register(notification_template)

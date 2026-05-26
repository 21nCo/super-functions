"""Core type definitions for PlugFn Python SDK."""

from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Protocol, TypeVar, Union
from datetime import datetime
from pydantic import BaseModel, Field


# Auth Types
class AuthType(str, Enum):
    """Authentication type enum."""
    
    OAUTH2 = "oauth2"
    API_KEY = "api-key"
    JWT = "jwt"
    BASIC = "basic"
    NONE = "none"


class ConnectionStatus(str, Enum):
    """Connection status enum."""
    
    ACTIVE = "active"
    EXPIRED = "expired"
    REVOKED = "revoked"
    ERROR = "error"


# Configuration Models
class OAuth2Config(BaseModel):
    """OAuth 2.0 configuration."""
    
    authorization_url: str
    token_url: str
    scopes: List[str]
    scope_separator: str = " "


class ApiKeyConfig(BaseModel):
    """API Key configuration."""
    
    header_name: Optional[str] = None
    param_name: Optional[str] = None
    prefix: Optional[str] = None


class JWTConfig(BaseModel):
    """JWT configuration."""
    
    algorithm: str
    public_key: Optional[str] = None
    private_key: Optional[str] = None
    issuer: Optional[str] = None
    audience: Optional[str] = None


class BasicAuthConfig(BaseModel):
    """Basic authentication configuration."""
    
    username_field: str = "username"
    password_field: str = "password"


# Connection Models
class Connection(BaseModel):
    """User connection to a provider."""
    
    id: str
    user_id: str
    provider: str
    name: Optional[str] = None
    status: ConnectionStatus
    credentials: Dict[str, Any]  # Encrypted
    scopes: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None
    expires_at: Optional[datetime] = None
    connected_at: datetime
    last_used_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


# Action Models
class ActionOptions(BaseModel):
    """Options for executing an action."""
    
    user_id: str
    connection_id: Optional[str] = None
    params: Dict[str, Any]
    retry: Optional[Dict[str, Any]] = None
    timeout: Optional[int] = None
    cache: Optional[Union[bool, Dict[str, Any]]] = None


class ActionResult(BaseModel):
    """Result of an action execution."""
    
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    provider: str
    action: str
    cached: bool = False
    duration: int
    retries: int
    timestamp: datetime


# Provider Models
class Provider(BaseModel):
    """Provider definition."""
    
    name: str
    display_name: str
    version: str
    description: str
    base_url: str
    auth_type: AuthType
    icon_url: Optional[str] = None
    rate_limit: Optional[Dict[str, int]] = None
    auth_config: Optional[Dict[str, Any]] = None
    actions: Dict[str, Any] = Field(default_factory=dict)
    triggers: Dict[str, Any] = Field(default_factory=dict)


# Workflow Models
class WorkflowStatus(str, Enum):
    """Workflow status enum."""
    
    ENABLED = "enabled"
    DISABLED = "disabled"
    DRAFT = "draft"


class WorkflowExecutionStatus(str, Enum):
    """Workflow execution status enum."""
    
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Workflow(BaseModel):
    """Workflow definition."""
    
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    definition: Dict[str, Any]
    status: WorkflowStatus
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


# Protocols for dependency injection
class DatabaseAdapter(Protocol):
    """Protocol for database adapters."""
    
    async def create_connection(self, connection: Connection) -> None:
        """Create a new connection."""
        ...
    
    async def get_connection(self, id: str) -> Optional[Connection]:
        """Get a connection by ID."""
        ...
    
    async def list_connections(self, user_id: str, provider: Optional[str] = None) -> List[Connection]:
        """List connections for a user."""
        ...


class AuthProvider(Protocol):
    """Protocol for auth providers."""
    
    async def get_user_id(self, request: Any) -> Optional[str]:
        """Get user ID from request."""
        ...
    
    async def require_auth(self, request: Any) -> str:
        """Require authentication, raise error if not authenticated."""
        ...


# Type variables
T = TypeVar("T")
P = TypeVar("P")
R = TypeVar("R")

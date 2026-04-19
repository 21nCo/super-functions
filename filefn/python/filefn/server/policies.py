from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Protocol, Union

DEFAULT_STORAGE_TARGET = "durable"
NUCLEUS_MAX_SIZE_BYTES = 100 * 1024 * 1024
NUCLEUS_ALLOWED_CONTENT_TYPES = [
    "image/*",
    "audio/*",
    "video/*",
    "application/pdf",
    "text/markdown",
    "text/plain",
]

@dataclass
class PolicyStoragePathContext:
    fileName: str
    fileId: str
    versionId: str
    principalId: Optional[str] = None
    tenantId: Optional[str] = None

class Policy:
    def __init__(self,
                 name: str,
                 contentTypes: Optional[List[str]] = None,
                 maxSizeBytes: Optional[int] = None,
                 visibility: Optional[str] = None, # 'public' | 'private' | 'shared'
                 storageTarget: Optional[str] = None,
                 artifactStorageTarget: Optional[str] = None,
                 lifecycle: Optional[str] = None,
                 renderProfile: Optional[str] = None,
                 storagePath: Optional[Callable[[PolicyStoragePathContext], str]] = None):
        self.name = name
        self.contentTypes = contentTypes
        self.maxSizeBytes = maxSizeBytes
        self.visibility = visibility
        self.storageTarget = storageTarget
        self.artifactStorageTarget = artifactStorageTarget
        self.lifecycle = lifecycle
        self.renderProfile = renderProfile
        self.storagePath = storagePath

class PolicyRegistry(Protocol):
    def get(self, name: str) -> Optional[Policy]: ...
    def register(self, policy: Policy) -> None: ...
    def list(self) -> List[Policy]: ...
    def define(self, name: str, policy: Optional[Dict[str, Any]] = None, **kwargs: Any) -> None: ...

class InMemoryPolicyRegistry:
    def __init__(self, initial_policies: Optional[List[Policy]] = None):
        self._policies: Dict[str, Policy] = {}
        if initial_policies:
            for p in initial_policies:
                self._policies[p.name] = p

    def get(self, name: str) -> Optional[Policy]:
        return self._policies.get(name)

    def register(self, policy: Policy) -> None:
        self._policies[policy.name] = policy

    def define(self, name: str, policy: Optional[Dict[str, Any]] = None, **kwargs: Any) -> None:
        payload: Dict[str, Any] = dict(policy or {})
        payload.update(kwargs)
        resolved_policy = Policy(name=name, **payload)
        self._policies[name] = resolved_policy

    def list(self) -> List[Policy]:
        return list(self._policies.values())

def create_policy_registry(initial_policies: Optional[List[Policy]] = None) -> InMemoryPolicyRegistry:
    return InMemoryPolicyRegistry(initial_policies)

def validate_policy_constraints(policy: Policy, mime_type: str, size: int) -> Dict[str, Union[bool, str]]:
    if policy.contentTypes and len(policy.contentTypes) > 0:
        if not any(matches_content_type(pattern, mime_type) for pattern in policy.contentTypes):
            return {'valid': False, 'error': f"Content type '{mime_type}' not allowed by policy '{policy.name}'"}

    if policy.maxSizeBytes is not None and size > policy.maxSizeBytes:
        return {'valid': False, 'error': f"Size {size} exceeds max {policy.maxSizeBytes} for policy '{policy.name}'"}

    return {'valid': True}

def compute_storage_path(policy: Policy, ctx: PolicyStoragePathContext) -> str:
    if policy.storagePath:
        return policy.storagePath(ctx)

    parts = []
    if ctx.tenantId:
        parts.append(ctx.tenantId)
    if ctx.principalId:
        parts.append(ctx.principalId)
    parts.append(ctx.fileId)
    parts.append(f"{ctx.versionId}-{ctx.fileName}")
    return "/".join(parts)

def resolve_storage_target(policy: Any) -> str:
    target = getattr(policy, "storageTarget", None) if policy is not None else None
    return target or DEFAULT_STORAGE_TARGET

def resolve_artifact_storage_target(policy: Any) -> str:
    target = getattr(policy, "artifactStorageTarget", None) if policy is not None else None
    return target or resolve_storage_target(policy)

def matches_content_type(pattern: str, mime_type: str) -> bool:
    if pattern == "*/*":
        return True
    if pattern.endswith("/*"):
        return mime_type.startswith(pattern[:-1])
    return pattern == mime_type

def create_nucleus_policies() -> List[Policy]:
    return [
        Policy(
            name="nucleus-durable-default",
            contentTypes=list(NUCLEUS_ALLOWED_CONTENT_TYPES),
            maxSizeBytes=NUCLEUS_MAX_SIZE_BYTES,
            visibility="private",
            storageTarget="durable",
            artifactStorageTarget="durable",
            lifecycle="durable",
            renderProfile="nucleus",
        ),
        Policy(
            name="nucleus-temporary-default",
            contentTypes=list(NUCLEUS_ALLOWED_CONTENT_TYPES),
            maxSizeBytes=NUCLEUS_MAX_SIZE_BYTES,
            visibility="private",
            storageTarget="temporary",
            artifactStorageTarget="temporary",
            lifecycle="temporary",
            renderProfile="nucleus",
        ),
    ]

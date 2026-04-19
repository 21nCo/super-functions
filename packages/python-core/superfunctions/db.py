"""Minimal database contracts shared by Python superfunctions packages."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Protocol, TypedDict


class Operator(str, Enum):
    EQ = "eq"
    NE = "ne"
    GT = "gt"
    GTE = "gte"
    LT = "lt"
    LTE = "lte"
    IN = "in"
    NOT_IN = "not-in"
    LIKE = "like"
    ILIKE = "ilike"
    IS_NULL = "is-null"
    IS_NOT_NULL = "is-not-null"
    CONTAINS = "contains"
    STARTS_WITH = "starts-with"
    ENDS_WITH = "ends-with"


@dataclass
class WhereClause:
    field: str
    operator: Operator | str
    value: Any = None
    connector: Optional[str] = None


@dataclass
class OrderBy:
    field: str
    direction: str = "asc"


class FieldSchema(TypedDict, total=False):
    type: str
    required: bool
    fieldName: str


class IndexSchema(TypedDict, total=False):
    name: str
    fields: List[str]
    unique: bool


class TableSchema(TypedDict, total=False):
    modelName: str
    fields: Dict[str, FieldSchema]
    indexes: List[IndexSchema]


@dataclass
class CreateParams:
    model: str
    data: Dict[str, Any]
    select: Optional[List[str]] = None
    namespace: Optional[str] = None


@dataclass
class CreateManyParams:
    model: str
    data: List[Dict[str, Any]]
    select: Optional[List[str]] = None
    namespace: Optional[str] = None


@dataclass
class FindOneParams:
    model: str
    where: List[WhereClause] = field(default_factory=list)
    select: Optional[List[str]] = None
    namespace: Optional[str] = None


@dataclass
class FindManyParams:
    model: str
    where: List[WhereClause] = field(default_factory=list)
    select: Optional[List[str]] = None
    order_by: Optional[List[OrderBy]] = None
    limit: Optional[int] = None
    offset: Optional[int] = None
    namespace: Optional[str] = None


@dataclass
class UpdateParams:
    model: str
    where: List[WhereClause]
    data: Dict[str, Any]
    select: Optional[List[str]] = None
    namespace: Optional[str] = None


@dataclass
class UpdateManyParams:
    model: str
    where: Optional[List[WhereClause]]
    data: Dict[str, Any]
    namespace: Optional[str] = None


@dataclass
class DeleteParams:
    model: str
    where: List[WhereClause]
    namespace: Optional[str] = None


@dataclass
class DeleteManyParams:
    model: str
    where: Optional[List[WhereClause]]
    namespace: Optional[str] = None


@dataclass
class UpsertParams:
    model: str
    where: List[WhereClause]
    create: Dict[str, Any]
    update: Dict[str, Any]
    select: Optional[List[str]] = None
    namespace: Optional[str] = None


@dataclass
class CountParams:
    model: str
    where: Optional[List[WhereClause]] = None
    namespace: Optional[str] = None


@dataclass
class CreateSchemaParams:
    namespace: Optional[str] = None
    tables: List[TableSchema] = field(default_factory=list)


@dataclass
class AdapterCapabilities:
    transactions: bool = False
    nested_transactions: bool = False
    joins: bool = False
    full_text_search: bool = False
    json_operations: bool = False
    schema_management: bool = False
    migration_support: bool = False
    batch_operations: bool = False


@dataclass
class HealthStatus:
    healthy: bool
    last_error: Optional[str] = None
    uptime: Optional[int] = None


@dataclass
class ValidationResult:
    valid: bool
    errors: List[str] = field(default_factory=list)


@dataclass
class SchemaCreation:
    success: bool
    errors: List[str] = field(default_factory=list)


class DbError(Exception):
    def __init__(self, message: str, *, cause: Optional[BaseException] = None):
        super().__init__(message)
        self.cause = cause


class DuplicateKeyError(DbError):
    pass


class ConstraintViolationError(DbError):
    pass


class ConnectionError(DbError):
    pass


class QueryFailedError(DbError):
    pass


class NotFoundError(DbError):
    pass


class Adapter(Protocol):
    id: str
    name: str
    version: str
    capabilities: AdapterCapabilities

    async def create(self, params: Optional[CreateParams] = None, **kwargs: Any) -> Dict[str, Any]:
        pass

    async def create_many(self, params: Optional[CreateManyParams] = None, **kwargs: Any) -> List[Dict[str, Any]]:
        pass

    async def find_one(self, params: Optional[FindOneParams] = None, **kwargs: Any) -> Optional[Dict[str, Any]]:
        pass

    async def find_many(self, params: Optional[FindManyParams] = None, **kwargs: Any) -> List[Dict[str, Any]]:
        pass

    async def update(self, params: Optional[UpdateParams] = None, **kwargs: Any) -> Dict[str, Any]:
        pass

    async def update_many(self, params: Optional[UpdateManyParams] = None, **kwargs: Any) -> int:
        pass

    async def delete(self, params: Optional[DeleteParams] = None, **kwargs: Any) -> None:
        pass

    async def delete_many(self, params: Optional[DeleteManyParams] = None, **kwargs: Any) -> int:
        pass

    async def upsert(self, params: Optional[UpsertParams] = None, **kwargs: Any) -> Dict[str, Any]:
        pass

    async def count(self, params: Optional[CountParams] = None, **kwargs: Any) -> int:
        pass

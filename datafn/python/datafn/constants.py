"""
DataFn shared constants.

Source of truth is core/src/system-fields.ts; keep in sync with that file.
"""

# All core-managed fields present on every DataFn record.
CORE_FIELDS: frozenset[str] = frozenset([
    "id",
    "createdAt",
    "updatedAt",
    "createdBy",
    "updatedBy",
    "isArchived",
])

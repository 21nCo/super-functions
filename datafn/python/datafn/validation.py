from typing import Any, Dict, List, Optional, Set, Union
from .envelope import DatafnError
from .utils.validate_fields import validate_field_value


class SchemaIndex:
    def __init__(self, schema: Dict[str, Any]):
        self.schema = schema
        self.resources_by_name: Dict[str, Dict[str, Any]] = {}
        self.fields_by_resource: Dict[str, Set[str]] = {}
        self.writable_fields_by_resource: Dict[str, Set[str]] = {}
        self.readonly_fields: Dict[str, Set[str]] = {}
        self.relations_by_resource: Dict[str, Set[str]] = {}
        self.relation_defs_by_resource: Dict[str, Dict[str, Any]] = {}
        self.field_schemas: Dict[str, Dict[str, dict]] = {}
        self.required_fields: Dict[str, Set[str]] = {}
        self.field_defaults: Dict[str, Dict[str, Any]] = {}
        self.date_fields: Dict[str, Set[str]] = {}

        self._build_index()

    def _build_index(self):
        resources = self.schema.get("resources", [])
        relations = self.schema.get("relations", [])

        for resource in resources:
            name = resource["name"]
            self.resources_by_name[name] = resource

            fields = set()
            writable = set()
            readonly = set()
            field_schemas = {}
            required = set()
            defaults = {}
            date_flds = set()

            # System fields
            core_fields = {"id", "createdAt", "updatedAt", "createdBy", "updatedBy", "isArchived", "version"}
            READONLY_SYSTEM = {"createdAt", "updatedAt", "createdBy", "updatedBy"}

            fields.update(core_fields)
            readonly.add("id")
            readonly.update(READONLY_SYSTEM)

            writable.add("id")  # Writable on insert (backward compat)
            writable.add("isArchived")
            writable.add("version")

            for field in resource.get("fields", []):
                fname = field["name"]
                fields.add(fname)
                field_schemas[fname] = field

                if field.get("readonly"):
                    readonly.add(fname)
                else:
                    writable.add(fname)

                if field.get("required") and "default" not in field:
                    required.add(fname)

                if "default" in field:
                    defaults[fname] = field["default"]

                if field.get("type") == "date":
                    date_flds.add(fname)

            self.fields_by_resource[name] = fields
            self.writable_fields_by_resource[name] = writable
            self.readonly_fields[name] = readonly
            self.field_schemas[name] = field_schemas
            self.required_fields[name] = required
            self.field_defaults[name] = defaults
            self.date_fields[name] = date_flds
            self.relations_by_resource[name] = set()
            self.relation_defs_by_resource[name] = {}

        for relation in relations:
            from_res_list = relation["from"] if isinstance(relation["from"], list) else [relation["from"]]
            to_res_list = relation["to"] if isinstance(relation["to"], list) else [relation["to"]]

            # FK injection for many-one relations
            rel_type = relation.get("type", "")
            if rel_type == "many-one":
                rel_name = relation.get("relation", "")
                fk_field = relation.get("fkField", f"{rel_name}Id") if rel_name else None
                if fk_field:
                    for from_res in from_res_list:
                        if from_res in self.fields_by_resource:
                            self.fields_by_resource[from_res].add(fk_field)
                            self.writable_fields_by_resource[from_res].add(fk_field)
                            self.field_schemas.setdefault(from_res, {})[fk_field] = {
                                "name": fk_field,
                                "type": "string",
                                "required": False,
                                "readonly": False,
                            }

            for from_res in from_res_list:
                if from_res in self.relations_by_resource:
                    if "relation" in relation:
                        rel_name = relation["relation"]
                        self.relations_by_resource[from_res].add(rel_name)
                        self.relation_defs_by_resource[from_res][rel_name] = relation

            for to_res in to_res_list:
                if to_res in self.relations_by_resource:
                    if "inverse" in relation:
                        inv_name = relation["inverse"]
                        self.relations_by_resource[to_res].add(inv_name)
                        self.relation_defs_by_resource[to_res][inv_name] = relation


def validate_schema(schema: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(schema, dict):
        return {"ok": False, "error": {"code": "SCHEMA_INVALID", "message": "Schema must be a dict", "details": {"path": "$"}}}

    resources = schema.get("resources")
    if not resources or not isinstance(resources, list):
        return {"ok": False, "error": {"code": "SCHEMA_INVALID", "message": "Schema must have a non-empty 'resources' list", "details": {"path": "$.resources"}}}

    if len(resources) == 0:
        return {"ok": False, "error": {"code": "SCHEMA_INVALID", "message": "Schema must have at least one resource", "details": {"path": "$.resources"}}}

    if len(resources) > 100:
        return {"ok": False, "error": {"code": "SCHEMA_INVALID", "message": f"Too many resources ({len(resources)}), maximum is 100", "details": {"path": "$.resources"}}}

    seen_names = set()
    for i, resource in enumerate(resources):
        rname = resource.get("name")
        if not rname:
            return {"ok": False, "error": {"code": "SCHEMA_INVALID", "message": f"Resource at index {i} has no name", "details": {"path": f"$.resources[{i}]"}}}

        if rname in seen_names:
            return {"ok": False, "error": {"code": "SCHEMA_INVALID", "message": f"Duplicate resource name: {rname}", "details": {"path": f"$.resources[{i}]"}}}
        seen_names.add(rname)

        res_fields = resource.get("fields", [])
        if len(res_fields) > 200:
            return {"ok": False, "error": {"code": "SCHEMA_INVALID", "message": f"Resource '{rname}' has too many fields ({len(res_fields)}), maximum is 200", "details": {"path": f"$.resources[{i}].fields"}}}

        seen_field_names = set()
        for j, field in enumerate(res_fields):
            fname = field.get("name")
            if not fname:
                return {"ok": False, "error": {"code": "SCHEMA_INVALID", "message": f"Field at index {j} in resource '{rname}' has no name", "details": {"path": f"$.resources[{i}].fields[{j}]"}}}
            if fname in seen_field_names:
                return {"ok": False, "error": {"code": "SCHEMA_INVALID", "message": f"Duplicate field name '{fname}' in resource '{rname}'", "details": {"path": f"$.resources[{i}].fields[{j}]"}}}
            seen_field_names.add(fname)

    # Validate relations
    relations = schema.get("relations", [])
    for i, rel in enumerate(relations):
        from_res = rel.get("from")
        to_res = rel.get("to")
        from_list = from_res if isinstance(from_res, list) else [from_res]
        to_list = to_res if isinstance(to_res, list) else [to_res]
        for fr in from_list:
            if fr not in seen_names:
                return {"ok": False, "error": {"code": "SCHEMA_INVALID", "message": f"Relation references unknown resource '{fr}'", "details": {"path": f"$.relations[{i}].from"}}}
        for tr in to_list:
            if tr not in seen_names:
                return {"ok": False, "error": {"code": "SCHEMA_INVALID", "message": f"Relation references unknown resource '{tr}'", "details": {"path": f"$.relations[{i}].to"}}}

    return {"ok": True, "result": schema}


def validate_record_types(record: Dict[str, Any], resource_name: str, schema_index: SchemaIndex) -> List[str]:
    errors = []
    field_schemas = schema_index.field_schemas.get(resource_name, {})
    for key, value in record.items():
        if key in field_schemas:
            fschema = field_schemas[key]
            ftype = fschema.get("type")
            if ftype is None:
                continue  # No type specified, skip validation
            nullable = fschema.get("nullable", True)
            if not validate_field_value(ftype, value, nullable):
                expected = ftype
                got = type(value).__name__
                if value is None:
                    got = "null"
                errors.append(f"Field '{key}' expects {expected}, got {got}")
    return errors


def validate_required_fields(record: Dict[str, Any], resource_name: str, schema_index: SchemaIndex) -> List[str]:
    missing = []
    required = schema_index.required_fields.get(resource_name, set())
    defaults = schema_index.field_defaults.get(resource_name, {})
    for fname in required:
        if fname not in record and fname not in defaults:
            missing.append(fname)
    return missing


def apply_defaults(record: Dict[str, Any], resource_name: str, schema_index: SchemaIndex) -> Dict[str, Any]:
    defaults = schema_index.field_defaults.get(resource_name, {})
    for fname, default_val in defaults.items():
        if fname not in record:
            record[fname] = default_val
    return record


def _count_filter_keys(filters: Any, depth: int = 0) -> int:
    if not isinstance(filters, dict):
        return 0
    count = sum(1 for key in filters if not key.startswith("$"))
    nested_counts = [count]
    for key, value in filters.items():
        if key in ("$and", "$or"):
            if isinstance(value, list):
                for item in value:
                    nested_counts.append(_count_filter_keys(item, depth + 1))
    return max(nested_counts)


def validate_query_limits(query: Dict[str, Any], limits: Dict[str, Any]) -> Optional[DatafnError]:
    max_select = limits.get("maxSelectTokens", 50)
    select = query.get("select", [])
    omit = query.get("omit", [])
    if len(select) > max_select:
        return DatafnError(code="LIMIT_EXCEEDED", message=f"Too many select tokens ({len(select)}), maximum is {max_select}")
    if len(omit) > max_select:
        return DatafnError(code="LIMIT_EXCEEDED", message=f"Too many omit tokens ({len(omit)}), maximum is {max_select}")

    max_sort = limits.get("maxSortFields", 10)
    sort = query.get("sort", [])
    if len(sort) > max_sort:
        return DatafnError(code="LIMIT_EXCEEDED", message=f"Too many sort fields ({len(sort)}), maximum is {max_sort}")

    max_filter_keys = limits.get("maxFilterKeysPerLevel", 20)
    filters = query.get("filters", {})
    if isinstance(filters, dict):
        filter_key_count = _count_filter_keys(filters)
        if filter_key_count > max_filter_keys:
            return DatafnError(code="LIMIT_EXCEEDED", message=f"Too many filter keys ({filter_key_count}), maximum is {max_filter_keys}")

    max_agg = limits.get("maxAggregations", 10)
    aggregations = query.get("aggregations", {})
    if len(aggregations) > max_agg:
        return DatafnError(code="LIMIT_EXCEEDED", message=f"Too many aggregations ({len(aggregations)}), maximum is {max_agg}")

    return None


def validate_mutation_limits(mutation: Dict[str, Any], limits: Dict[str, Any]) -> Optional[DatafnError]:
    max_batch = limits.get("maxBatchSize", 100)
    records = mutation.get("records", [])
    if len(records) > max_batch:
        return DatafnError(code="LIMIT_EXCEEDED", message=f"Batch size ({len(records)}) exceeds maximum of {max_batch}")
    return None


def validate_id_length(id_value: Any, max_length: int = 255) -> Optional[DatafnError]:
    if id_value is not None and isinstance(id_value, str) and len(id_value) > max_length:
        return DatafnError(code="DFQL_INVALID", message=f"ID exceeds maximum length of {max_length}")
    return None


def validate_resource(index: SchemaIndex, resource_name: str, path: str = "$") -> Optional[DatafnError]:
    if resource_name not in index.resources_by_name:
        return DatafnError(
            code="DFQL_UNKNOWN_RESOURCE",
            message=f"Unknown resource: {resource_name}",
            details={"path": path}
        )
    return None


def validate_fields(index: SchemaIndex, resource_name: str, field_names: List[str], path_prefix: str = "$") -> Optional[DatafnError]:
    if resource_name not in index.fields_by_resource:
        return DatafnError(
            code="DFQL_UNKNOWN_RESOURCE",
            message=f"Unknown resource: {resource_name}",
            details={"path": path_prefix}
        )

    valid_fields = index.fields_by_resource[resource_name]
    valid_relations = index.relations_by_resource[resource_name]

    for i, field in enumerate(field_names):
        parts = field.split(".")
        base_name = parts[0]

        if base_name in valid_fields:
            if len(parts) > 1:
                pass
        elif base_name in valid_relations:
            pass
        else:
            code = "DFQL_UNKNOWN_FIELD"
            msg = f"Unknown field: {base_name}"

            if "." in field or field.endswith(".*"):
                return DatafnError(
                    code="DFQL_UNKNOWN_RELATION",
                    message=f"Unknown relation: {base_name}",
                    details={"path": f"{path_prefix}[{i}]"}
                )

            return DatafnError(
                code=code,
                message=msg,
                details={"path": f"{path_prefix}[{i}]"}
            )

    return None


def validate_relation(index: SchemaIndex, resource_name: str, relation_name: str, path: str = "$") -> Optional[DatafnError]:
    if resource_name not in index.resources_by_name:
        return DatafnError(
            code="DFQL_UNKNOWN_RESOURCE",
            message=f"Unknown resource: {resource_name}",
            details={"path": path}
        )

    if relation_name not in index.relations_by_resource[resource_name]:
        return DatafnError(
            code="DFQL_UNKNOWN_RELATION",
            message=f"Unknown relation: {relation_name}",
            details={"path": path}
        )
    return None


def validate_record_keys(index: SchemaIndex, resource_name: str, record: Dict[str, Any], path: str = "$") -> Optional[DatafnError]:
    if resource_name not in index.fields_by_resource:
        return DatafnError(code="DFQL_UNKNOWN_RESOURCE", message=f"Unknown resource: {resource_name}", details={"path": path})

    valid_fields = index.writable_fields_by_resource[resource_name]
    readonly = index.readonly_fields.get(resource_name, set())

    for key in record.keys():
        if key in readonly and key != "id":
            return DatafnError(
                code="DFQL_INVALID",
                message=f"Cannot write to read-only field: {key}",
                details={"path": f"{path}.{key}"}
            )
        if key not in valid_fields and key not in readonly:
            return DatafnError(
                code="DFQL_UNKNOWN_FIELD",
                message=f"Unknown field: {key}",
                details={"path": f"{path}.{key}"}
            )
    return None

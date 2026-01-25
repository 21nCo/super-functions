from typing import Any, Dict, List, Optional, Set, Union
from .envelope import DatafnError

class SchemaIndex:
    def __init__(self, schema: Dict[str, Any]):
        self.schema = schema
        self.resources_by_name: Dict[str, Dict[str, Any]] = {}
        self.fields_by_resource: Dict[str, Set[str]] = {}
        self.writable_fields_by_resource: Dict[str, Set[str]] = {}
        self.relations_by_resource: Dict[str, Set[str]] = {}
        self.relation_defs_by_resource: Dict[str, Dict[str, Any]] = {}
        
        self._build_index()

    def _build_index(self):
        resources = self.schema.get("resources", [])
        relations = self.schema.get("relations", [])

        for resource in resources:
            name = resource["name"]
            self.resources_by_name[name] = resource
            
            # Fields
            fields = set()
            writable = set()
            
            # System fields
            fields.add("id")
            fields.add("createdAt")
            fields.add("updatedAt")
            fields.add("createdBy")
            fields.add("updatedBy")
            fields.add("isArchived")
            fields.add("version")
            
            writable.add("id") # Writable on insert
            writable.add("isArchived")
            writable.add("version")

            for field in resource.get("fields", []):
                fields.add(field["name"])
                if not field.get("readonly"):
                    writable.add(field["name"])
            
            self.fields_by_resource[name] = fields
            self.writable_fields_by_resource[name] = writable
            self.relations_by_resource[name] = set()
            self.relation_defs_by_resource[name] = {}

        for relation in relations:
            from_res_list = relation["from"] if isinstance(relation["from"], list) else [relation["from"]]
            to_res_list = relation["to"] if isinstance(relation["to"], list) else [relation["to"]]
            
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

def validate_resource(index: SchemaIndex, resource_name: str, path: str = "$") -> Optional[DatafnError]:
    if resource_name not in index.resources_by_name:
        return DatafnError(
            code="DFQL_UNKNOWN_RESOURCE",
            message=f"Unknown resource: {resource_name}",
            details={"path": path}
        )
    return None

def validate_fields(index: SchemaIndex, resource_name: str, field_names: List[str], path_prefix: str = "$") -> Optional[DatafnError]:
    # Ensure resource exists
    if resource_name not in index.fields_by_resource:
        return DatafnError(
            code="DFQL_UNKNOWN_RESOURCE",
            message=f"Unknown resource: {resource_name}",
            details={"path": path_prefix}
        )
    
    valid_fields = index.fields_by_resource[resource_name]
    valid_relations = index.relations_by_resource[resource_name]
    
    for i, field in enumerate(field_names):
        # Handle dot paths (nested selection)
        parts = field.split(".")
        base_name = parts[0]
        
        if base_name in valid_fields:
            # It's a field
            if len(parts) > 1:
                # Dot path into field (e.g. json field) - allowed for now
                pass
        elif base_name in valid_relations:
            # It's a relation
            # We don't deeply validate relation expansion fields here yet, 
            # assuming relation existence is enough for top-level validation
            pass
        else:
            # Unknown
            code = "DFQL_UNKNOWN_FIELD"
            msg = f"Unknown field: {base_name}"
            
            # Heuristic: if it looks like a relation expansion
            if len(parts) > 1:
                # If the base is not a field/relation, it's an error on the base
                pass
            
            # If the name suggests a relation (not typically distiguishable without schema, 
            # but if the user provided dot path, they might expect relation)
            if "." in field:
                 # If base name is not in fields/relations, it's unknown. 
                 # We prioritize UNKNOWN_RELATION if it seems they tried a relation access?
                 # But sticking to UNKNOWN_FIELD is safer unless we know better.
                 pass
            
            # Check if it was supposed to be a relation?
            # Actually, Requirements say: Unknown relation returns DFQL_UNKNOWN_RELATION
            # But here we are validating "fields" (select).
            # If "field" is actually a relation name, is it a field or relation error?
            # In select, both are "fields".
            # But the spec says: "Unknown relation returns DFQL_UNKNOWN_RELATION with details.path"
            # This applies when we specifically validate relations (e.g. in mutation.relations).
            # For query select, if I select "tags.*", and "tags" is unknown, is it field or relation error?
            # TV-VALID-RELATION-001 says: select ["unknown_relation.*"] -> DFQL_UNKNOWN_RELATION
            
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
    
    for key in record.keys():
        if key not in valid_fields:
             return DatafnError(
                code="DFQL_UNKNOWN_FIELD",
                message=f"Unknown field: {key}",
                details={"path": f"{path}.{key}"}
            )
    return None

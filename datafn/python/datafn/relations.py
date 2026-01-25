from typing import Any, Dict, List, Optional
from .db import Adapter
from .validation import SchemaIndex

async def execute_relate(db: Adapter, index: SchemaIndex, mutation: Dict[str, Any], namespace: str = "datafn") -> None:
    resource = mutation["resource"]
    record_id = mutation["id"]
    relations = mutation["relations"]
    
    for rel_name, target in relations.items():
        rel_def = index.relation_defs_by_resource[resource].get(rel_name)
        if not rel_def:
            continue
            
        rel_type = rel_def.get("type", "many-one") # Default assumption?
        
        targets = target if isinstance(target, list) else [target]
        
        for t in targets:
            target_id = t if isinstance(t, str) else t.get("$ref")
            metadata = {k: v for k, v in t.items() if k != "$ref"} if isinstance(t, dict) else {}
            
            if rel_type == "many-many":
                join_table = rel_def.get("joinTable")
                if join_table:
                    # Determine columns
                    # If from=tasks, to=tags. joinTable=tasks_tags.
                    # Usually col names are derived from resource names or explicit config.
                    # Assuming standard: {from}_id, {to}_id
                    from_col = f"{resource}_id" # simplified assumption
                    to_col = f"{rel_def['to']}_id" # simplified
                    
                    # Or check 'fromKey', 'toKey' in rel_def
                    if "fromKey" in rel_def: from_col = rel_def["fromKey"]
                    if "toKey" in rel_def: to_col = rel_def["toKey"]
                    
                    # Insert into join table
                    data = {
                        from_col: record_id,
                        to_col: target_id,
                        **metadata
                    }
                    await db.create(join_table, data, namespace=namespace)
            
            elif rel_type == "many-one":
                # We are 'tasks', rel is 'project' (many-one to projects).
                # We update 'tasks' (us) to set project_id = target_id.
                fk = rel_def.get("foreignKey", f"{rel_name}Id")
                await db.update(
                    resource,
                    [{"field": "id", "operator": "eq", "value": record_id}],
                    {fk: target_id},
                    namespace=namespace
                )
            
            elif rel_type == "one-many":
                # We are 'projects', rel is 'tasks' (one-many to tasks).
                # We update 'tasks' (target) to set project_id = us.
                inverse_fk = rel_def.get("inverseForeignKey", f"{rel_def['inverse']}Id")
                await db.update(
                    rel_def["to"],
                    [{"field": "id", "operator": "eq", "value": target_id}],
                    {inverse_fk: record_id},
                    namespace=namespace
                )

async def execute_modify_relation(db: Adapter, index: SchemaIndex, mutation: Dict[str, Any], namespace: str = "datafn") -> None:
    # Updates metadata in join table for many-many
    resource = mutation["resource"]
    record_id = mutation["id"]
    relations = mutation["relations"]
    
    for rel_name, target in relations.items():
        rel_def = index.relation_defs_by_resource[resource].get(rel_name)
        if not rel_def or rel_def.get("type") != "many-many":
            continue
            
        join_table = rel_def.get("joinTable")
        if not join_table:
            continue
            
        targets = target if isinstance(target, list) else [target]
        for t in targets:
            if not isinstance(t, dict): continue # Must have metadata to modify
            
            target_id = t.get("$ref")
            metadata = {k: v for k, v in t.items() if k != "$ref"}
            
            if not metadata: continue

            from_col = rel_def.get("fromKey", f"{resource}_id")
            to_col = rel_def.get("toKey", f"{rel_def['to']}_id")
            
            await db.update(
                join_table,
                [
                    {"field": from_col, "operator": "eq", "value": record_id},
                    {"field": to_col, "operator": "eq", "value": target_id}
                ],
                metadata,
                namespace=namespace
            )

async def execute_unrelate(db: Adapter, index: SchemaIndex, mutation: Dict[str, Any], namespace: str = "datafn") -> None:
    resource = mutation["resource"]
    record_id = mutation["id"]
    relations = mutation["relations"]
    
    for rel_name, target in relations.items():
        rel_def = index.relation_defs_by_resource[resource].get(rel_name)
        if not rel_def:
            continue
            
        rel_type = rel_def.get("type", "many-one")
        targets = target if isinstance(target, list) else [target]
        
        for t in targets:
            target_id = t if isinstance(t, str) else t.get("$ref")
            
            if rel_type == "many-many":
                join_table = rel_def.get("joinTable")
                if join_table:
                    from_col = rel_def.get("fromKey", f"{resource}_id")
                    to_col = rel_def.get("toKey", f"{rel_def['to']}_id")
                    
                    await db.delete(
                        join_table,
                        [
                            {"field": from_col, "operator": "eq", "value": record_id},
                            {"field": to_col, "operator": "eq", "value": target_id}
                        ],
                        namespace=namespace
                    )
            
            elif rel_type == "many-one":
                # Clear FK on self
                fk = rel_def.get("foreignKey", f"{rel_name}Id")
                await db.update(
                    resource,
                    [{"field": "id", "operator": "eq", "value": record_id}],
                    {fk: None},
                    namespace=namespace
                )
                
            elif rel_type == "one-many":
                # Clear FK on target
                inverse_fk = rel_def.get("inverseForeignKey", f"{rel_def['inverse']}Id")
                await db.update(
                    rel_def["to"],
                    [{"field": "id", "operator": "eq", "value": target_id}],
                    {inverse_fk: None},
                    namespace=namespace
                )

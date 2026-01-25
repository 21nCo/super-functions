from typing import Any, Dict, List

def evaluate_filter(record: Dict[str, Any], filters: Dict[str, Any]) -> bool:
    for key, value in filters.items():
        if key == "$and":
            if not isinstance(value, list): return False
            if not all(evaluate_filter(record, f) for f in value): return False
            continue
        if key == "$or":
            if not isinstance(value, list): return False
            if not any(evaluate_filter(record, f) for f in value): return False
            continue
            
        record_val = record.get(key)
        
        if isinstance(value, dict):
            # Operators
            for op, op_val in value.items():
                if op == "eq":
                    if record_val != op_val: return False
                elif op == "ne":
                    if record_val == op_val: return False
                elif op == "gt":
                    if not (record_val > op_val): return False
                elif op == "gte":
                    if not (record_val >= op_val): return False
                elif op == "lt":
                    if not (record_val < op_val): return False
                elif op == "lte":
                    if not (record_val <= op_val): return False
                # ... other operators ...
        else:
            if record_val != value: return False
            
    return True

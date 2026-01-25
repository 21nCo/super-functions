from typing import Any, Dict, Optional, TypedDict

class DatafnError(Exception):
    def __init__(self, code: str, message: str, details: Optional[Dict[str, Any]] = None):
        self.code = code
        self.message = message
        self.details = details or {}
        if "path" not in self.details:
            self.details["path"] = "$"
        super().__init__(message)

    def to_envelope(self) -> Dict[str, Any]:
        return {
            "ok": False,
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details
            }
        }

def ok_response(result: Any) -> Dict[str, Any]:
    return {"ok": True, "result": result}

def error_response(error: Dict[str, Any]) -> Dict[str, Any]:
    return {"ok": False, "error": error}

# Legacy/Helper aliases
def ok(result: Any) -> Dict[str, Any]:
    return ok_response(result)

def err(code: str, message: str, details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    details = details or {}
    if "path" not in details:
        details["path"] = "$"
    return {
        "ok": False,
        "error": {
            "code": code,
            "message": message,
            "details": details
        }
    }

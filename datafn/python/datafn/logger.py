from typing import Any, Dict, Optional, Protocol, runtime_checkable


@runtime_checkable
class DatafnLogger(Protocol):
    def info(self, message: str, context: Optional[Dict[str, Any]] = None) -> None: ...
    def warn(self, message: str, context: Optional[Dict[str, Any]] = None) -> None: ...
    def error(self, message: str, context: Optional[Dict[str, Any]] = None) -> None: ...
    def debug(self, message: str, context: Optional[Dict[str, Any]] = None) -> None: ...


class NoopLogger:
    def info(self, message: str, context: Optional[Dict[str, Any]] = None) -> None:
        pass

    def warn(self, message: str, context: Optional[Dict[str, Any]] = None) -> None:
        pass

    def error(self, message: str, context: Optional[Dict[str, Any]] = None) -> None:
        pass

    def debug(self, message: str, context: Optional[Dict[str, Any]] = None) -> None:
        pass


class ConsoleLogger:
    def info(self, message: str, context: Optional[Dict[str, Any]] = None) -> None:
        print(f"[INFO] {message}", end="")
        if context:
            print(f" {context}", end="")
        print()

    def warn(self, message: str, context: Optional[Dict[str, Any]] = None) -> None:
        print(f"[WARN] {message}", end="")
        if context:
            print(f" {context}", end="")
        print()

    def error(self, message: str, context: Optional[Dict[str, Any]] = None) -> None:
        print(f"[ERROR] {message}", end="")
        if context:
            print(f" {context}", end="")
        print()

    def debug(self, message: str, context: Optional[Dict[str, Any]] = None) -> None:
        print(f"[DEBUG] {message}", end="")
        if context:
            print(f" {context}", end="")
        print()


def create_logger(logger: Any = None) -> DatafnLogger:
    if logger is not None:
        return logger
    return NoopLogger()

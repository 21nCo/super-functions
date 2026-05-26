"""Logger utilities."""

import logging
from typing import Any, Optional


class Logger:
    """Logger interface."""

    def debug(self, message: str, meta: Optional[Any] = None) -> None:
        """Log debug message."""
        raise NotImplementedError

    def info(self, message: str, meta: Optional[Any] = None) -> None:
        """Log info message."""
        raise NotImplementedError

    def warn(self, message: str, meta: Optional[Any] = None) -> None:
        """Log warning message."""
        raise NotImplementedError

    def error(self, message: str, meta: Optional[Any] = None) -> None:
        """Log error message."""
        raise NotImplementedError


class ConsoleLogger(Logger):
    """Simple console logger."""

    def __init__(self, prefix: str = ""):
        """Initialize console logger.

        Args:
            prefix: Prefix for log messages
        """
        self.prefix = prefix
        self.logger = logging.getLogger(__name__)
        
        # Configure logging if not already configured
        if not self.logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
            )
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
            self.logger.setLevel(logging.INFO)

    def _format_message(self, message: str, meta: Optional[Any] = None) -> str:
        """Format log message with prefix and metadata.

        Args:
            message: Log message
            meta: Optional metadata

        Returns:
            Formatted message
        """
        msg = f"{self.prefix} {message}" if self.prefix else message
        
        if meta:
            msg += f" | {meta}"
        
        return msg

    def debug(self, message: str, meta: Optional[Any] = None) -> None:
        """Log debug message."""
        self.logger.debug(self._format_message(message, meta))

    def info(self, message: str, meta: Optional[Any] = None) -> None:
        """Log info message."""
        self.logger.info(self._format_message(message, meta))

    def warn(self, message: str, meta: Optional[Any] = None) -> None:
        """Log warning message."""
        self.logger.warning(self._format_message(message, meta))

    def error(self, message: str, meta: Optional[Any] = None) -> None:
        """Log error message."""
        self.logger.error(self._format_message(message, meta))

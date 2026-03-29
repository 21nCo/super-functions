import pytest
from datafn.logger import NoopLogger, ConsoleLogger, create_logger, DatafnLogger


class TestNoopLogger:
    def test_info_no_raise(self):
        logger = NoopLogger()
        logger.info("test message")

    def test_warn_no_raise(self):
        logger = NoopLogger()
        logger.warn("test warning")

    def test_error_no_raise(self):
        logger = NoopLogger()
        logger.error("test error")

    def test_debug_no_raise(self):
        logger = NoopLogger()
        logger.debug("test debug")

    def test_with_context(self):
        logger = NoopLogger()
        logger.info("test", {"key": "value"})


class TestConsoleLogger:
    def test_info_output(self, capsys):
        logger = ConsoleLogger()
        logger.info("server started")
        captured = capsys.readouterr()
        assert "[INFO] server started" in captured.out

    def test_warn_output(self, capsys):
        logger = ConsoleLogger()
        logger.warn("deprecated feature")
        captured = capsys.readouterr()
        assert "[WARN] deprecated feature" in captured.out

    def test_error_output(self, capsys):
        logger = ConsoleLogger()
        logger.error("something failed")
        captured = capsys.readouterr()
        assert "[ERROR] something failed" in captured.out

    def test_debug_output(self, capsys):
        logger = ConsoleLogger()
        logger.debug("debug info")
        captured = capsys.readouterr()
        assert "[DEBUG] debug info" in captured.out

    def test_with_context(self, capsys):
        logger = ConsoleLogger()
        logger.info("test", {"key": "value"})
        captured = capsys.readouterr()
        assert "[INFO] test" in captured.out
        assert "key" in captured.out


class TestCreateLogger:
    def test_none_returns_noop(self):
        logger = create_logger(None)
        assert isinstance(logger, NoopLogger)

    def test_provided_logger_returned(self):
        custom = ConsoleLogger()
        logger = create_logger(custom)
        assert logger is custom

    def test_noop_satisfies_protocol(self):
        logger = NoopLogger()
        assert isinstance(logger, DatafnLogger)

    def test_console_satisfies_protocol(self):
        logger = ConsoleLogger()
        assert isinstance(logger, DatafnLogger)

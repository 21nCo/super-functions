.PHONY: help install install-dev test lint typecheck format clean build publish publish-test

help:
	@echo "authfn - Python Package Management"
	@echo ""
	@echo "Available commands:"
	@echo "  make install       - Install package in production mode"
	@echo "  make install-dev   - Install package with dev dependencies"
	@echo "  make test          - Run tests"
	@echo "  make test-cov      - Run tests with coverage"
	@echo "  make lint          - Run linter (ruff)"
	@echo "  make typecheck     - Run type checker (mypy)"
	@echo "  make format        - Format code (black)"
	@echo "  make clean         - Clean build artifacts"
	@echo "  make build         - Build package"
	@echo "  make publish-test  - Publish to TestPyPI"
	@echo "  make publish       - Publish to PyPI (production)"

install:
	pip install -e .

install-dev:
	pip install -e ".[dev]"

test:
	pytest

test-cov:
	pytest --cov=authfn --cov-report=html --cov-report=term

lint:
	ruff check authfn

typecheck:
	mypy authfn

format:
	black authfn tests examples
	ruff check --fix authfn

clean:
	rm -rf dist/ build/ *.egg-info authfn.egg-info
	rm -rf .pytest_cache .mypy_cache .ruff_cache
	rm -rf htmlcov .coverage
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete

build: clean
	python -m build

check:
	twine check dist/*

publish-test: build check
	twine upload --repository testpypi dist/*

publish: build check
	@echo "WARNING: This will publish to production PyPI!"
	@read -p "Are you sure? (y/n) " -n 1 -r; \
	echo; \
	if [ "$$REPLY" = "y" ]; then \
		twine upload dist/*; \
	else \
		echo "Cancelled."; \
	fi

all: clean install-dev test lint typecheck

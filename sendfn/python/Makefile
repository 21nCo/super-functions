.PHONY: install test lint format clean build

install:
	pip install -e ".[dev,all]"

test:
	pytest tests/ -v --cov=sendfn --cov-report=term-missing

lint:
	ruff check sendfn/ tests/
	mypy sendfn/

format:
	black sendfn/ tests/
	ruff check --fix sendfn/ tests/

clean:
	rm -rf build/ dist/ *.egg-info
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete

build:
	python -m build

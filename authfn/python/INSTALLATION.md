# Installation and Setup Guide

## Prerequisites

- Python 3.10 or higher
- pip (Python package installer)

## Installation

### Option 1: Install from Source (Development)

```bash
cd /Users/ar/dev/superfunctions/authfn/python

# Install in development mode
pip install -e .

# Install with development dependencies
pip install -e ".[dev]"

# Install with FastAPI support
pip install -e ".[fastapi]"

# Install with Flask support
pip install -e ".[flask]"
```

### Option 2: Install from PyPI (when published)

```bash
pip install authfn
```

## Verify Installation

```python
python -c "from authfn import __version__; print(f'authfn version: {__version__}')"
```

## Running Tests

```bash
# Install test dependencies
pip install -e ".[dev]"

# Run all tests
pytest

# Run with coverage
pytest --cov=authfn --cov-report=html

# Run specific test file
pytest tests/test_authfn.py

# Run with verbose output
pytest -v
```

## Running the Example

```bash
# Make sure dependencies are installed
pip install -e .

# Run the basic usage example
python examples/basic_usage.py
```

Expected output:
```
=== authfn Python SDK Example ===

1. Setting up authfn with in-memory adapter...
✓ Setup complete

2. Creating an API key...
✓ Created API key
  ID: key_...
  Key: ak_... (truncated)

3. Authenticating with the API key...
✓ Authentication successful!
  Session ID: key_...
  Name: My App Key
  Type: api-key
  Resource IDs: ['app-1', 'app-2']
  Scopes: ['read', 'write']

... (more output)
```

## Type Checking

```bash
# Install mypy
pip install mypy

# Run type checking
mypy authfn
```

## Linting and Formatting

```bash
# Install ruff and black
pip install ruff black

# Check code quality
ruff check authfn

# Format code
black authfn
```

## Development Workflow

1. **Clone the repository:**
   ```bash
   cd /Users/ar/dev/superfunctions/authfn/python
   ```

2. **Create a virtual environment (recommended):**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install in development mode:**
   ```bash
   pip install -e ".[dev]"
   ```

4. **Make your changes and run tests:**
   ```bash
   pytest
   mypy authfn
   ruff check authfn
   black authfn
   ```

5. **Run the example to verify:**
   ```bash
   python examples/basic_usage.py
   ```

## Troubleshooting

### ModuleNotFoundError: No module named 'pydantic'

Make sure you've installed the package:
```bash
pip install -e .
```

Or install pydantic directly:
```bash
pip install pydantic>=2.5.0
```

### Import errors

Make sure you're in the correct directory or have installed the package:
```bash
# Option 1: Install the package
pip install -e .

# Option 2: Add to PYTHONPATH
export PYTHONPATH=/Users/ar/dev/superfunctions/authfn/python:$PYTHONPATH
```

### Type checking errors

Some type errors may be expected if optional dependencies aren't installed. Install all dev dependencies:
```bash
pip install -e ".[dev]"
```

## Using with Different Frameworks

### FastAPI

```bash
pip install "authfn[fastapi]"
```

```python
from fastapi import FastAPI, Request, Depends
from authfn import create_authfn, AuthFnConfig

app = FastAPI()
auth = create_authfn(AuthFnConfig(database=adapter))

async def get_session(request: Request):
    return await auth.provider.authenticate(request)

@app.get("/protected")
async def protected_route(session = Depends(get_session)):
    if not session:
        raise HTTPException(status_code=401)
    return {"message": f"Hello, {session.name}"}
```

### Flask

```bash
pip install "authfn[flask]"
```

```python
from flask import Flask, request
from authfn import create_authfn, AuthFnConfig

app = Flask(__name__)
auth = create_authfn(AuthFnConfig(database=adapter))

@app.route("/protected")
async def protected_route():
    session = await auth.provider.authenticate(request)
    if not session:
        return {"error": "Unauthorized"}, 401
    return {"message": f"Hello, {session.name}"}
```

## Next Steps

- Read the [README.md](README.md) for usage examples
- Check out [COMPARISON.md](COMPARISON.md) to understand differences from TypeScript
- Explore [examples/basic_usage.py](examples/basic_usage.py) for a complete example
- Implement your own database adapter following the `DatabaseAdapter` protocol

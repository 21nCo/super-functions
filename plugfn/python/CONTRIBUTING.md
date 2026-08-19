# Contributing to PlugFn Python SDK

Thank you for your interest in contributing to PlugFn! This document provides guidelines for contributing to the Python SDK.

## Getting Started

### Prerequisites

- Python 3.10 or higher
- pip or poetry for package management
- Git for version control

### Setup Development Environment

1. Clone the repository:
```bash
git clone https://github.com/superfunctions/superfunctions.git
cd superfunctions/plugfn/python
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -e ".[dev]"
```

4. Run tests to verify setup:
```bash
pytest
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

Use prefixes:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions/updates

### 2. Make Changes

Follow the coding guidelines below.

### 3. Run Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=plugfn --cov-report=html

# Run specific test file
pytest tests/test_basic.py

# Run specific test
pytest tests/test_basic.py::test_initialization
```

### 4. Check Code Quality

```bash
# Type checking
mypy plugfn

# Linting
ruff check plugfn

# Formatting
black plugfn

# Or run all checks
./scripts/check.sh  # If available
```

### 5. Commit Changes

```bash
git add .
git commit -m "feat: add new feature"
```

Commit message format:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `refactor:` - Code refactoring
- `test:` - Test updates
- `chore:` - Maintenance

### 6. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## Coding Guidelines

### Python Style

- Follow PEP 8
- Use type hints everywhere
- Use async/await for I/O operations
- Prefer Pydantic models for data validation

### Type Hints

Always include type hints:

```python
# Good
def get_connection(self, connection_id: str) -> Connection:
    ...

# Bad
def get_connection(self, connection_id):
    ...
```

### Docstrings

Use Google-style docstrings:

```python
def create_connection(self, connection: Connection) -> None:
    """Create a new connection.
    
    Args:
        connection: Connection object to create
        
    Raises:
        ValueError: If connection already exists
    """
    pass
```

### Error Handling

- Use specific exception types
- Provide helpful error messages
- Don't catch exceptions unless you handle them

```python
# Good
if not provider:
    raise ValueError(f"Provider {name} not found")

# Bad
try:
    provider = get_provider(name)
except:
    pass
```

### Async/Await

- Use `async def` for I/O operations
- Use `await` for async calls
- Don't block the event loop

```python
# Good
async def get_data(self) -> Dict[str, Any]:
    return await self.http.get("/data")

# Bad
def get_data(self) -> Dict[str, Any]:
    return asyncio.run(self.http.get("/data"))
```

## Adding a New Provider

See [docs/CREATING_PROVIDERS.md](docs/CREATING_PROVIDERS.md) for detailed guide.

### Quick Steps

1. Create provider file in `plugfn/providers/`:

```python
# plugfn/providers/myservice.py

from typing import Any, Dict
from pydantic import BaseModel, Field
from ..types import Provider, AuthType

# Define parameter models
class CreateItemParams(BaseModel):
    name: str = Field(..., description="Item name")

# Define actions
class CreateItemAction:
    def __init__(self):
        self.name = "items.create"
        self.display_name = "Create Item"
        self.description = "Create a new item"
    
    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        validated = CreateItemParams(**params)
        return await context.http.post("/items", json={"name": validated.name})

# Create provider
myservice_provider = Provider(
    name="myservice",
    display_name="My Service",
    version="1.0.0",
    description="My Service integration",
    base_url="https://api.myservice.com",
    auth_type=AuthType.OAUTH2,
)

myservice_provider.auth_config = {
    "authorization_url": "https://myservice.com/oauth/authorize",
    "token_url": "https://myservice.com/oauth/token",
    "scopes": ["read", "write"],
}

myservice_provider.actions = {
    "items.create": CreateItemAction(),
}
```

2. Export in `plugfn/providers/__init__.py`:

```python
from .myservice import myservice_provider

__all__ = [..., "myservice_provider"]
```

3. Add tests in `tests/test_providers.py`:

```python
def test_myservice_provider():
    assert myservice_provider.name == "myservice"
    assert "items.create" in myservice_provider.actions
```

4. Update documentation

## Testing Guidelines

### Unit Tests

Test individual components in isolation:

```python
@pytest.mark.asyncio
async def test_get_auth_url():
    plug = PlugFn(...)
    url = await plug.connections.get_auth_url(...)
    assert "client_id" in url
```

### Integration Tests

Test component interactions:

```python
@pytest.mark.asyncio
async def test_oauth_flow():
    plug = PlugFn(...)
    
    # Get auth URL
    auth_url = await plug.connections.get_auth_url(...)
    
    # Simulate callback
    connection = await plug.connections.handle_callback(...)
    
    assert connection.status == "active"
```

### Mock External Services

Use mock adapters:

```python
class MockAdapter(DatabaseAdapter):
    def __init__(self):
        self.data = {}
    
    async def createConnection(self, connection):
        self.data[connection["id"]] = connection
```

### Test Fixtures

Use pytest fixtures for common setup:

```python
@pytest.fixture
def plug():
    return PlugFn(
        database=MockAdapter(),
        auth=MockAuthProvider(),
        ...
    )

def test_something(plug):
    # plug is automatically provided
    pass
```

## Documentation

### Docstrings

- Add docstrings to all public functions/classes
- Use Google-style format
- Include Args, Returns, Raises sections

### Type Hints

- Add type hints to all function signatures
- Use `Optional[T]` for nullable values
- Use `List[T]`, `Dict[K, V]` for collections

### README Updates

Update README.md when:
- Adding new features
- Changing API
- Adding examples

### Examples

Add examples when:
- Adding new providers
- Adding new features
- Common use cases

## Pull Request Process

### Before Submitting

- [ ] Tests pass (`pytest`)
- [ ] Code is formatted (`black`)
- [ ] Code is linted (`ruff`)
- [ ] Type hints are correct (`mypy`)
- [ ] Documentation is updated
- [ ] CHANGELOG.md is updated

### PR Description

Include:
1. What changes were made
2. Why the changes were needed
3. How to test the changes
4. Screenshots (if UI changes)

### Review Process

1. Automated checks run
2. Maintainer reviews code
3. Address feedback
4. Merge when approved

## Release Process

(For maintainers)

1. Update version in `pyproject.toml` and `setup.py`
2. Update CHANGELOG.md
3. Create git tag: `git tag v0.1.0`
4. Push tag: `git push origin v0.1.0`
5. Build package: `python -m build`
6. Upload to PyPI: `twine upload dist/*`

## Code of Conduct

### Our Standards

- Be respectful and inclusive
- Welcome newcomers
- Accept constructive criticism
- Focus on what's best for the community

### Unacceptable Behavior

- Harassment or discrimination
- Trolling or insulting comments
- Public or private harassment
- Publishing others' private information

### Enforcement

Report violations to: support@superfunctions.dev

## Questions?

- **Documentation**: https://docs.superfunctions.dev/plugfn
- **GitHub Issues**: https://github.com/superfunctions/superfunctions/issues
- **Discord**: Join our community
- **Email**: support@superfunctions.dev

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.

## Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Given credit in documentation

Thank you for contributing to PlugFn! 🎉

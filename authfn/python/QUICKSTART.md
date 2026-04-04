# authfn Python SDK - Quick Start Guide

## 🚀 Quick Publishing (TL;DR)

```bash
cd /Users/ar/dev/superfunctions/authfn/python

# Install build tools
pip install build twine

# Build and publish
./publish.sh
```

Or using Make:
```bash
make publish
```

---

## 📦 Installation

### For Development
```bash
pip install -e ".[dev]"
```

### For Users (after publishing)
```bash
pip install authfn
```

---

## 🧪 Running Tests

```bash
# Quick test
pytest

# With coverage
pytest --cov=authfn --cov-report=html

# Or using Make
make test
make test-cov
```

---

## ✅ Code Quality

```bash
# Type checking
mypy authfn

# Linting
ruff check authfn

# Format code
black authfn

# Or using Make
make typecheck
make lint
make format
```

---

## 📤 Publishing to PyPI

### Method 1: Interactive Script (Recommended)
```bash
./publish.sh
```

### Method 2: Manual Steps
```bash
# 1. Clean and build
rm -rf dist/ build/ *.egg-info
python -m build

# 2. Check package
twine check dist/*

# 3. Upload to TestPyPI (test first!)
twine upload --repository testpypi dist/*

# 4. Test installation
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ authfn

# 5. Upload to PyPI (production)
twine upload dist/*
```

### Method 3: Using Makefile
```bash
# Test on TestPyPI
make publish-test

# Publish to production
make publish
```

---

## 🔑 Setting Up PyPI Credentials

### Option 1: API Tokens (Recommended)

1. **Get TestPyPI token:**
   - Go to https://test.pypi.org/manage/account/token/
   - Create new token
   - Save it securely

2. **Get PyPI token:**
   - Go to https://pypi.org/manage/account/token/
   - Create new token
   - Save it securely

3. **Use when uploading:**
   ```
   Username: __token__
   Password: pypi-YOUR-TOKEN-HERE
   ```

### Option 2: .pypirc File

Create `~/.pypirc`:
```ini
[distutils]
index-servers =
    pypi
    testpypi

[pypi]
username = __token__
password = pypi-YOUR-PYPI-TOKEN

[testpypi]
repository = https://test.pypi.org/legacy/
username = __token__
password = pypi-YOUR-TESTPYPI-TOKEN
```

Then secure it:
```bash
chmod 600 ~/.pypirc
```

---

## 🔄 Releasing a New Version

### 1. Update Version
Edit `pyproject.toml`:
```toml
version = "0.1.1"
```

Edit `authfn/__init__.py`:
```python
__version__ = "0.1.1"
```

### 2. Commit and Tag
```bash
git add .
git commit -m "Release v0.1.1"
git tag -a v0.1.1 -m "Release v0.1.1"
git push origin main --tags
```

### 3. Build and Publish
```bash
./publish.sh
```

---

## 🧰 Common Commands

```bash
# Development
make install-dev          # Install with dev dependencies
make test                 # Run tests
make lint                 # Check code quality
make typecheck            # Check types
make format               # Format code

# Building
make clean                # Clean build artifacts
make build                # Build package

# Publishing
make publish-test         # Publish to TestPyPI
make publish              # Publish to PyPI

# All in one
make all                  # Clean, install, test, lint, typecheck
```

---

## 📚 Full Documentation

- **Complete Publishing Guide:** [PUBLISHING.md](PUBLISHING.md)
- **Installation Instructions:** [INSTALLATION.md](INSTALLATION.md)
- **Usage Examples:** [README.md](README.md)
- **Implementation Details:** [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)
- **TS vs Python:** [COMPARISON.md](COMPARISON.md)

---

## 🐛 Troubleshooting

### "Module not found" errors
```bash
pip install -e .
```

### Build errors
```bash
pip install --upgrade build setuptools wheel
make clean
make build
```

### "Version already exists" on PyPI
Increment version in `pyproject.toml` and `authfn/__init__.py`

### Authentication errors
Make sure you're using `__token__` as username and your API token as password

---

## 📞 Need Help?

1. Read [PUBLISHING.md](PUBLISHING.md) for detailed instructions
2. Check [PyPI Help](https://pypi.org/help/)
3. Search [Stack Overflow](https://stackoverflow.com/questions/tagged/pypi)

---

**Ready to publish?** Just run `./publish.sh` and follow the prompts! 🎉

# Publishing authfn to PyPI

This guide walks you through the process of publishing the authfn Python package to PyPI (Python Package Index).

## Prerequisites

### 1. Create PyPI Account

1. Go to [https://pypi.org/account/register/](https://pypi.org/account/register/)
2. Create an account
3. Verify your email address

### 2. Create TestPyPI Account (Optional but Recommended)

TestPyPI is a separate instance for testing package uploads:

1. Go to [https://test.pypi.org/account/register/](https://test.pypi.org/account/register/)
2. Create an account
3. Verify your email address

### 3. Install Build Tools

```bash
# Install build and upload tools
pip install --upgrade build twine
```

## Step-by-Step Publishing Process

### Step 1: Prepare the Package

Make sure your package is ready:

```bash
cd /Users/ar/dev/superfunctions/authfn/python

# Verify all files are present
ls -la

# Check that pyproject.toml is correct
cat pyproject.toml
```

### Step 2: Build the Package

```bash
# Clean any previous builds
rm -rf dist/ build/ *.egg-info

# Build the package
python -m build

# This creates two files in dist/:
# - authfn-0.1.0-py3-none-any.whl (wheel)
# - authfn-0.1.0.tar.gz (source distribution)
```

Expected output:
```
Successfully built authfn-0.1.0.tar.gz and authfn-0.1.0-py3-none-any.whl
```

### Step 3: Check the Package

```bash
# Check the built package for errors
twine check dist/*
```

Should output:
```
Checking dist/authfn-0.1.0-py3-none-any.whl: PASSED
Checking dist/authfn-0.1.0.tar.gz: PASSED
```

### Step 4: Test Upload to TestPyPI (Recommended)

First, test your upload on TestPyPI:

```bash
# Upload to TestPyPI
twine upload --repository testpypi dist/*
```

You'll be prompted for:
- Username: `__token__`
- Password: (your TestPyPI API token, see below)

Or with API token directly:
```bash
twine upload --repository testpypi dist/* --username __token__ --password <your-test-token>
```

#### Creating API Tokens

**TestPyPI Token:**
1. Go to [https://test.pypi.org/manage/account/token/](https://test.pypi.org/manage/account/token/)
2. Click "Add API token"
3. Give it a name like "authfn-upload"
4. Copy the token (starts with `pypi-`)
5. Save it securely!

**PyPI Token:**
1. Go to [https://pypi.org/manage/account/token/](https://pypi.org/manage/account/token/)
2. Click "Add API token"
3. Give it a name like "authfn-upload"
4. Copy the token (starts with `pypi-`)
5. Save it securely!

### Step 5: Test Installation from TestPyPI

```bash
# Create a test environment
python -m venv test_env
source test_env/bin/activate  # On Windows: test_env\Scripts\activate

# Install from TestPyPI
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ authfn

# Test the installation
python -c "from authfn import __version__; print(f'authfn version: {__version__}')"

# Test basic functionality
python -c "from authfn import create_authfn, AuthFnConfig; print('Import successful!')"

# Clean up
deactivate
rm -rf test_env
```

### Step 6: Upload to PyPI (Production)

If everything works on TestPyPI, upload to the real PyPI:

```bash
# Upload to PyPI
twine upload dist/*
```

You'll be prompted for:
- Username: `__token__`
- Password: (your PyPI API token)

Or with API token directly:
```bash
twine upload dist/* --username __token__ --password <your-pypi-token>
```

### Step 7: Verify the Upload

1. Visit [https://pypi.org/project/authfn/](https://pypi.org/project/authfn/)
2. Verify the package page looks correct
3. Check that the README displays properly
4. Verify the version number is correct

### Step 8: Test Installation from PyPI

```bash
# Create a test environment
python -m venv test_env
source test_env/bin/activate

# Install from PyPI
pip install authfn

# Test the installation
python -c "from authfn import __version__; print(f'authfn version: {__version__}')"

# Clean up
deactivate
rm -rf test_env
```

## Using Configuration Files

### Option 1: .pypirc File

Create `~/.pypirc` to store credentials:

```ini
[distutils]
index-servers =
    pypi
    testpypi

[pypi]
username = __token__
password = pypi-YOUR-PYPI-TOKEN-HERE

[testpypi]
repository = https://test.pypi.org/legacy/
username = __token__
password = pypi-YOUR-TESTPYPI-TOKEN-HERE
```

**Important:** Make sure this file is secure:
```bash
chmod 600 ~/.pypirc
```

Then you can upload without entering credentials:
```bash
twine upload --repository testpypi dist/*
twine upload dist/*
```

### Option 2: Environment Variables

```bash
# Set environment variables
export TWINE_USERNAME=__token__
export TWINE_PASSWORD=pypi-YOUR-TOKEN-HERE

# Upload
twine upload dist/*
```

## Complete Publishing Script

Create a script `publish.sh`:

```bash
#!/bin/bash
set -e

echo "=== Publishing authfn to PyPI ==="

# Clean previous builds
echo "1. Cleaning previous builds..."
rm -rf dist/ build/ *.egg-info

# Run tests
echo "2. Running tests..."
pytest

# Type checking
echo "3. Running type checks..."
mypy authfn

# Linting
echo "4. Running linter..."
ruff check authfn

# Build
echo "5. Building package..."
python -m build

# Check
echo "6. Checking package..."
twine check dist/*

# Upload to TestPyPI
echo "7. Uploading to TestPyPI..."
read -p "Upload to TestPyPI? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    twine upload --repository testpypi dist/*
    echo "✓ Uploaded to TestPyPI"
    echo "  View at: https://test.pypi.org/project/authfn/"
fi

# Upload to PyPI
echo "8. Uploading to PyPI..."
read -p "Upload to PyPI (PRODUCTION)? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    twine upload dist/*
    echo "✓ Uploaded to PyPI"
    echo "  View at: https://pypi.org/project/authfn/"
fi

echo "=== Publishing complete! ==="
```

Make it executable:
```bash
chmod +x publish.sh
```

Run it:
```bash
./publish.sh
```

## Updating the Package

When releasing a new version:

### 1. Update Version Number

Edit `pyproject.toml`:
```toml
[project]
version = "0.1.1"  # Increment version
```

Also update in `authfn/__init__.py`:
```python
__version__ = "0.1.1"
```

### 2. Update CHANGELOG

Create a `CHANGELOG.md` if you don't have one:

```markdown
# Changelog

## [0.1.1] - 2026-01-12

### Added
- New feature X
- New feature Y

### Fixed
- Bug fix A
- Bug fix B

## [0.1.0] - 2026-01-12

- Initial release
```

### 3. Commit and Tag

```bash
git add .
git commit -m "Release v0.1.1"
git tag -a v0.1.1 -m "Release v0.1.1"
git push origin main
git push origin v0.1.1
```

### 4. Build and Upload

```bash
# Clean, build, and upload
rm -rf dist/ build/ *.egg-info
python -m build
twine check dist/*
twine upload dist/*
```

## Troubleshooting

### Error: "File already exists"

You cannot upload the same version twice. Increment the version number.

```toml
# In pyproject.toml
version = "0.1.1"  # Increment this
```

### Error: "Invalid package name"

Make sure your package name follows PyPI rules:
- Only letters, numbers, hyphens, underscores
- No spaces
- Case-insensitive (authfn = AuthFn = AUTHFN)

### Error: "403 Forbidden"

Your API token is invalid or expired. Create a new one.

### Error: "README rendering failed"

Check your README.md for syntax errors:
```bash
# Install readme_renderer
pip install readme_renderer

# Check README
python -m readme_renderer README.md
```

### Build Errors

```bash
# Make sure build tools are up to date
pip install --upgrade build setuptools wheel

# Clean everything and rebuild
rm -rf dist/ build/ *.egg-info authfn.egg-info
python -m build
```

## Best Practices

### 1. Version Numbers (Semantic Versioning)

Follow [semver.org](https://semver.org/):
- `0.1.0` - Initial development
- `0.1.1` - Bug fixes
- `0.2.0` - New features (backward compatible)
- `1.0.0` - First stable release
- `2.0.0` - Breaking changes

### 2. Pre-release Versions

For alpha/beta releases:
```toml
version = "0.2.0a1"  # Alpha 1
version = "0.2.0b1"  # Beta 1
version = "0.2.0rc1" # Release candidate 1
```

### 3. Always Test First

1. Run all tests
2. Upload to TestPyPI
3. Install from TestPyPI and test
4. Only then upload to PyPI

### 4. Use API Tokens

Don't use username/password - use API tokens:
- More secure
- Can be scoped to specific projects
- Can be revoked independently

### 5. Automate with GitHub Actions

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to PyPI

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      
      - name: Install dependencies
        run: |
          pip install build twine
      
      - name: Build package
        run: python -m build
      
      - name: Publish to PyPI
        env:
          TWINE_USERNAME: __token__
          TWINE_PASSWORD: ${{ secrets.PYPI_API_TOKEN }}
        run: twine upload dist/*
```

Add your PyPI token to GitHub Secrets as `PYPI_API_TOKEN`.

## Checklist Before Publishing

- [ ] All tests pass (`pytest`)
- [ ] Type checking passes (`mypy authfn`)
- [ ] Linting passes (`ruff check authfn`)
- [ ] Version number updated
- [ ] CHANGELOG updated
- [ ] README is up to date
- [ ] LICENSE file exists
- [ ] Dependencies are correct in pyproject.toml
- [ ] Package builds without errors
- [ ] Tested on TestPyPI
- [ ] Git committed and tagged
- [ ] Ready for production!

## After Publishing

1. **Announce the release:**
   - GitHub Releases
   - Social media
   - Documentation site
   - Mailing lists

2. **Monitor issues:**
   - Watch for bug reports
   - Check PyPI statistics
   - Monitor download counts

3. **Plan next version:**
   - Gather feedback
   - Plan new features
   - Track issues

## Useful Commands

```bash
# Check package metadata
twine check dist/*

# View package contents
tar -tzf dist/authfn-0.1.0.tar.gz

# Extract and inspect
tar -xzf dist/authfn-0.1.0.tar.gz
ls -la authfn-0.1.0/

# Check wheel contents
unzip -l dist/authfn-0.1.0-py3-none-any.whl

# Install in editable mode (development)
pip install -e .

# Uninstall
pip uninstall authfn
```

## Resources

- **PyPI:** https://pypi.org/
- **TestPyPI:** https://test.pypi.org/
- **Twine Documentation:** https://twine.readthedocs.io/
- **Build Documentation:** https://build.pypa.io/
- **Packaging Guide:** https://packaging.python.org/
- **PEP 517:** https://peps.python.org/pep-0517/
- **PEP 621:** https://peps.python.org/pep-0621/

## Support

If you encounter issues:
1. Check [PyPI Help](https://pypi.org/help/)
2. Search [Stack Overflow](https://stackoverflow.com/questions/tagged/pypi)
3. Ask in [Python Packaging Discourse](https://discuss.python.org/c/packaging/)

---

**Ready to publish?** Follow the steps above and your package will be live on PyPI! 🚀

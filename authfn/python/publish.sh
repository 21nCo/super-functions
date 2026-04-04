#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================="
echo "   Publishing authfn to PyPI"
echo "========================================="
echo ""

# Check we're in the right directory
if [ ! -f "pyproject.toml" ]; then
    echo -e "${RED}Error: pyproject.toml not found. Are you in the right directory?${NC}"
    exit 1
fi

# Check we have the necessary tools
if ! command -v python &> /dev/null; then
    echo -e "${RED}Error: python not found. Please install Python 3.10+${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Checking Python version...${NC}"
python --version
echo ""

echo -e "${YELLOW}Step 2: Setting up virtual environment...${NC}"
if [ ! -d ".venv" ]; then
    python -m venv .venv
    echo -e "${GREEN}✓ Created virtual environment${NC}"
else
    echo -e "${GREEN}✓ Using existing virtual environment${NC}"
fi
source .venv/bin/activate
echo ""

echo -e "${YELLOW}Step 3: Installing/upgrading build tools...${NC}"
pip install --upgrade build twine
echo ""

echo -e "${YELLOW}Step 4: Cleaning previous builds...${NC}"
rm -rf dist/ build/ *.egg-info authfn.egg-info
echo -e "${GREEN}✓ Cleaned${NC}"
echo ""

echo -e "${YELLOW}Step 5: Running tests...${NC}"
if command -v pytest &> /dev/null; then
    if [ -d "tests" ]; then
        pytest -v || {
            echo -e "${RED}Tests failed! Fix tests before publishing.${NC}"
            exit 1
        }
        echo -e "${GREEN}✓ All tests passed${NC}"
    else
        echo -e "${YELLOW}⚠ No tests directory found, skipping tests${NC}"
    fi
else
    echo -e "${YELLOW}⚠ pytest not installed, skipping tests${NC}"
fi
echo ""

echo -e "${YELLOW}Step 6: Running type checks...${NC}"
if command -v mypy &> /dev/null; then
    mypy authfn || {
        echo -e "${YELLOW}⚠ Type check warnings found (continuing anyway)${NC}"
    }
    echo -e "${GREEN}✓ Type checks complete${NC}"
else
    echo -e "${YELLOW}⚠ mypy not installed, skipping type checks${NC}"
fi
echo ""

echo -e "${YELLOW}Step 7: Running linter...${NC}"
if command -v ruff &> /dev/null; then
    ruff check authfn || {
        echo -e "${YELLOW}⚠ Linting warnings found (continuing anyway)${NC}"
    }
    echo -e "${GREEN}✓ Linting complete${NC}"
else
    echo -e "${YELLOW}⚠ ruff not installed, skipping linting${NC}"
fi
echo ""

echo -e "${YELLOW}Step 8: Building package...${NC}"
python -m build
echo -e "${GREEN}✓ Package built${NC}"
echo ""

echo -e "${YELLOW}Step 9: Checking package...${NC}"
twine check dist/*
echo -e "${GREEN}✓ Package check passed${NC}"
echo ""

echo "Built packages:"
ls -lh dist/
echo ""

# Ask about TestPyPI
echo -e "${YELLOW}Step 10: Upload to TestPyPI?${NC}"
echo "This is recommended before uploading to production PyPI."
echo "You'll need a TestPyPI account and API token."
echo "Get token at: https://test.pypi.org/manage/account/token/"
echo ""
read -p "Upload to TestPyPI? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Uploading to TestPyPI...${NC}"
    twine upload --repository testpypi dist/* || {
        echo -e "${RED}Upload to TestPyPI failed!${NC}"
        echo "Common issues:"
        echo "  - Invalid credentials (use username: __token__)"
        echo "  - Version already exists (increment version number)"
        echo "  - Network issues"
        exit 1
    }
    echo -e "${GREEN}✓ Uploaded to TestPyPI${NC}"
    echo ""
    echo "View your package at: https://test.pypi.org/project/authfn/"
    echo ""
    echo "Test installation with:"
    echo "  pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ authfn"
    echo ""
    read -p "Press enter to continue..."
else
    echo "Skipping TestPyPI upload"
fi
echo ""

# Ask about PyPI
echo -e "${YELLOW}Step 11: Upload to PyPI (PRODUCTION)?${NC}"
echo -e "${RED}WARNING: This will publish to production PyPI!${NC}"
echo "You'll need a PyPI account and API token."
echo "Get token at: https://pypi.org/manage/account/token/"
echo ""
read -p "Upload to PyPI? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Uploading to PyPI...${NC}"
    twine upload dist/* || {
        echo -e "${RED}Upload to PyPI failed!${NC}"
        echo "Common issues:"
        echo "  - Invalid credentials (use username: __token__)"
        echo "  - Version already exists (increment version number)"
        echo "  - Package name already taken"
        echo "  - Network issues"
        exit 1
    }
    echo -e "${GREEN}✓ Uploaded to PyPI${NC}"
    echo ""
    echo "========================================="
    echo -e "${GREEN}   SUCCESS! Package published! 🎉${NC}"
    echo "========================================="
    echo ""
    echo "View your package at: https://pypi.org/project/authfn/"
    echo ""
    echo "Install with:"
    echo "  pip install authfn"
    echo ""
    echo "Next steps:"
    echo "  1. Test installation: pip install authfn"
    echo "  2. Create GitHub release"
    echo "  3. Update documentation"
    echo "  4. Announce the release"
else
    echo "Skipping PyPI upload"
    echo ""
    echo "To upload later, run:"
    echo "  twine upload dist/*"
fi
echo ""

echo "========================================="
echo "   Publishing process complete!"
echo "========================================="

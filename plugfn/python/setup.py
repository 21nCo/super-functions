"""Setup script for PlugFn Python SDK."""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="plugfn",
    version="0.1.0",
    author="SuperFunctions",
    author_email="support@superfunctions.dev",
    description="Self-hosted integration platform for Python applications",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/superfunctions/superfunctions",
    project_urls={
        "Documentation": "https://docs.superfunctions.dev/plugfn",
        "Source": "https://github.com/superfunctions/superfunctions/tree/main/plugfn",
        "Bug Tracker": "https://github.com/superfunctions/superfunctions/issues",
    },
    packages=find_packages(exclude=["tests", "tests.*", "examples", "examples.*", "docs"]),
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: Apache Software License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "Topic :: Internet :: WWW/HTTP",
        "Framework :: AsyncIO",
    ],
    python_requires=">=3.10",
    install_requires=[
        "httpx>=0.25.0",
        "pydantic>=2.5.0",
        "cryptography>=41.0.0",
        "python-jose>=3.3.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "pytest-asyncio>=0.21.0",
            "pytest-cov>=4.1.0",
            "mypy>=1.7.0",
            "ruff>=0.1.6",
            "black>=23.11.0",
        ],
        "fastapi": [
            "fastapi>=0.104.0",
            "uvicorn>=0.24.0",
        ],
        "flask": [
            "flask>=3.0.0",
        ],
        "all": [
            "pytest>=7.4.0",
            "pytest-asyncio>=0.21.0",
            "pytest-cov>=4.1.0",
            "mypy>=1.7.0",
            "ruff>=0.1.6",
            "black>=23.11.0",
            "fastapi>=0.104.0",
            "uvicorn>=0.24.0",
            "flask>=3.0.0",
        ],
    },
    keywords="integrations oauth webhooks api superfunctions plugfn",
    include_package_data=True,
)
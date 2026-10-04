"""Resolve and validate package-local Python releases without publishing."""
import argparse
from email.parser import BytesParser
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import tomllib
from urllib.error import HTTPError
from urllib.request import urlopen
import zipfile

from packaging.utils import canonicalize_name
from packaging.version import Version

ROOT = Path(__file__).resolve().parent.parent
TARGETS = {
    "apifn": "apifn/python",
    "authfn": "authfn/python",
    "billfn": "billfn/python",
    "datafn": "datafn/python",
    "filefn": "filefn/python",
    "plugfn": "plugfn/python",
    "searchfn": "searchfn/python",
    "sendfn": "sendfn/python",
    "superfunctions-core": "packages/python-core",
    "superfunctions-fastapi": "packages/python-fastapi",
    "superfunctions-flask": "packages/python-flask",
    "superfunctions-sqlalchemy": "packages/python-sqlalchemy",
}

# Non-library fixture files needed by tests outside the checkout.
TEST_FIXTURES = {"billfn": ("examples/mock_api.py",)}


def resolve(tag, root=ROOT):
    prefix, separator, version = tag.rpartition("-v")
    name = prefix.removeprefix("python-")
    if not separator or prefix != f"python-{name}" or name not in TARGETS:
        raise ValueError("Expected python-<supported-project>-v<PEP440-version>")
    parsed = Version(version)
    if str(parsed) != version or parsed.local is not None or parsed.is_devrelease or parsed.is_postrelease or parsed.epoch:
        raise ValueError("Use a canonical stable or a/b/rc prerelease version without local, epoch, dev or post identifiers")
    directory = root / TARGETS[name]
    with (directory / "pyproject.toml").open("rb") as source:
        manifest = tomllib.load(source)
    project = manifest["project"]
    if project.get("name") != name or project.get("version") != version:
        raise ValueError(f"Tag identity {name}@{version} does not exactly match pyproject.toml")
    return {"tag": tag, "name": name, "version": version, "path": TARGETS[name], "prerelease": parsed.is_prerelease}


def check_version_policy(target, releases):
    version = Version(target["version"])
    occupied = [Version(item) for item in releases]
    if version in occupied:
        raise ValueError(f"{target['name']}@{version} already exists on PyPI; choose a new release version")
    stable = [item for item in occupied if not item.is_prerelease and not item.is_devrelease]
    if stable and version <= max(stable):
        raise ValueError(f"{target['name']}@{version} must be newer than stable PyPI release {max(stable)}")


def check_registry(target):
    try:
        with urlopen(f"https://pypi.org/pypi/{target['name']}/json", timeout=30) as response:
            releases = json.load(response)["releases"]
    except HTTPError as error:
        if error.code != 404:
            raise
        releases = {}
    check_version_policy(target, releases)


def metadata_identity(data, target):
    metadata = BytesParser().parsebytes(data)
    if canonicalize_name(metadata["Name"] or "") != canonicalize_name(target["name"]) or metadata["Version"] != target["version"]:
        raise ValueError("Distribution metadata does not exactly match the requested release")


def verify_artifacts(directory, target):
    wheels = list(directory.glob("*.whl"))
    sdists = list(directory.glob("*.tar.gz"))
    if len(wheels) != 1 or len(sdists) != 1 or len(list(directory.iterdir())) != 2:
        raise ValueError("Expected exactly one wheel and one sdist")
    with zipfile.ZipFile(wheels[0]) as archive:
        metadata = [name for name in archive.namelist() if name.endswith(".dist-info/METADATA")]
        if len(metadata) != 1:
            raise ValueError("Wheel must have exactly one METADATA file")
        metadata_identity(archive.read(metadata[0]), target)
        if not any(name.endswith(".py") and ".dist-info/" not in name for name in archive.namelist()):
            raise ValueError("Wheel contains no Python library source")
    with tarfile.open(sdists[0]) as archive:
        metadata = [member for member in archive.getmembers() if member.name.count("/") == 1 and member.name.endswith("/PKG-INFO")]
        if len(metadata) != 1:
            raise ValueError("Sdist must have exactly one root PKG-INFO")
        metadata_identity(archive.extractfile(metadata[0]).read(), target)
    return wheels[0], sdists[0]


def run(*args, cwd=ROOT):
    subprocess.run([sys.executable, *map(str, args)], cwd=cwd, check=True)


def build(target, out_dir):
    directory = ROOT / target["path"]
    out_dir = out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=False)
    # Default build creates an sdist, then builds the wheel FROM that sdist;
    # this exercises both archives and fails on missing sdist build inputs.
    run("-m", "build", "--outdir", out_dir, directory, cwd=directory)
    wheel, _ = verify_artifacts(out_dir, target)
    run("-m", "twine", "check", "--strict", *sorted(out_dir.iterdir()), cwd=directory)
    with (directory / "pyproject.toml").open("rb") as source:
        manifest = tomllib.load(source)
    extras = sorted(manifest["project"].get("optional-dependencies", {}))
    wheel_requirement = str(wheel) + (f"[{','.join(extras)}]" if extras else "")
    # Standard pip environment (e.g. PIP_FIND_LINKS) may supply actual packed
    # prerequisites for local validation; never install dependency source trees.
    run("-m", "pip", "install", wheel_requirement, "pytest", "pytest-asyncio", cwd=directory)
    run("-m", "pip", "check", cwd=directory)
    modules = [Path(package).name for package in manifest["tool"]["hatch"]["build"]["targets"]["wheel"]["packages"]]
    # Import from outside the source tree, so a missing wheel module cannot be
    # hidden by the checkout or pytest's import path.
    with tempfile.TemporaryDirectory(prefix="python-release-consumer-") as consumer:
        # Repo conftests prepend checkout source paths. Copy only tests/config,
        # so those paths cannot shadow the installed wheel or its dependencies.
        test_root = Path(consumer) / "project"
        test_root.mkdir()
        shutil.copy2(directory / "pyproject.toml", test_root / "pyproject.toml")
        test_paths = manifest.get("tool", {}).get("pytest", {}).get("ini_options", {}).get("testpaths", ["tests"])
        for test_path in test_paths:
            source = directory / test_path
            destination = test_root / test_path
            if source.is_dir():
                shutil.copytree(source, destination)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
        for fixture in TEST_FIXTURES.get(target["name"], ()):
            destination = test_root / fixture
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(directory / fixture, destination)
        run("-m", "pytest", "--import-mode=importlib", "-o", "pythonpath=", cwd=test_root)
        run("-I", "-c", "import importlib; " + "; ".join(f"importlib.import_module({module!r})" for module in modules), cwd=consumer)
    return out_dir


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["resolve", "check-registry", "build", "verify"])
    parser.add_argument("tag")
    parser.add_argument("--out-dir", type=Path)
    args = parser.parse_args()
    target = resolve(args.tag)
    if args.command == "check-registry":
        check_registry(target)
    elif args.command == "build":
        target["artifact_dir"] = str(build(target, args.out_dir or ROOT / "release-artifacts" / args.tag))
    elif args.command == "verify":
        verify_artifacts(args.out_dir or ROOT / "release-artifacts" / args.tag, target)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf8") as output:
            for key, value in target.items():
                output.write(f"{key}={str(value).lower() if isinstance(value, bool) else value}\n")
    print(json.dumps(target, indent=2))


if __name__ == "__main__":
    main()

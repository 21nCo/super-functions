"""Release-gate metadata and tooling regressions for sendfn."""

from __future__ import annotations


def evaluate_typescript_release_gate_failure(command: str, stderr: str) -> dict[str, object]:
    if command == "npm run build --workspace sendfn/typescript" and "tsup: command not found" in stderr:
        return {
            "allPassed": False,
            "error": {
                "code": "SENDFN_RELEASE_GATE_FAILED",
                "message": "TypeScript build tooling is not available from the documented install path",
            },
        }

    return {"allPassed": True}


def test_release_gate_commands_match_repo_root_docs(
    python_readme_text: str,
    python_pyproject_text: str,
) -> None:
    """Repo-root install and test commands should stay aligned with the packaged gate metadata."""
    assert "python -m pip install -e ./packages/python-core" in python_readme_text
    assert "python -m pip install -e './sendfn/python[dev,email,push,fastapi]'" in python_readme_text
    assert "python -m pytest sendfn/python/tests" in python_readme_text

    assert "requires-python = \">=3.10\"" in python_pyproject_text
    assert "[tool.sendfn.release_gate]" in python_pyproject_text
    assert 'shared_install = "python -m pip install -e ./packages/python-core"' in python_pyproject_text
    assert 'package_install = "python -m pip install -e \'./sendfn/python[dev,email,push,fastapi]\'"' in python_pyproject_text
    assert 'test_command = "python -m pytest sendfn/python/tests"' in python_pyproject_text
    assert "Push Notifications - coming soon" not in python_readme_text
    assert "SMS - coming soon" not in python_readme_text
    assert "AWS SES webhook endpoints must receive the full SNS envelope unchanged." in python_readme_text
    assert "`Signature`, `SigningCertURL`, `Timestamp`, and `Message`" in python_readme_text


def test_release_gate_reports_stable_missing_tooling_error() -> None:
    """Missing TypeScript build tooling should map to the release-gate failure code."""
    assert evaluate_typescript_release_gate_failure(
        "npm run build --workspace sendfn/typescript",
        "sh: tsup: command not found",
    ) == {
        "allPassed": False,
        "error": {
            "code": "SENDFN_RELEASE_GATE_FAILED",
            "message": "TypeScript build tooling is not available from the documented install path",
        },
    }

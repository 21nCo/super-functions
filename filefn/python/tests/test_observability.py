from filefn.server import redact_secrets


def test_redact_secrets_preserves_safe_identifiers_and_counts() -> None:
    redacted = redact_secrets(
        {
            "fileId": "file_123",
            "versionId": "ver_123",
            "artifactId": "art_123",
            "policyId": "policy_123",
            "requestId": "req_123",
            "uploadSessionToken": "secret_upload_token",
            "shareToken": "secret_share_token",
            "signedUrl": "https://example.com/file?sig=secret",
            "authorization": "Bearer secret.jwt.token",
            "counts": {"imported": 3, "failed": 1},
        }
    )

    assert redacted["fileId"] == "file_123"
    assert redacted["versionId"] == "ver_123"
    assert redacted["artifactId"] == "art_123"
    assert redacted["policyId"] == "policy_123"
    assert redacted["requestId"] == "req_123"
    assert redacted["uploadSessionToken"] == "[REDACTED]"
    assert redacted["shareToken"] == "[REDACTED]"
    assert redacted["signedUrl"] == "[REDACTED]"
    assert redacted["authorization"] == "[REDACTED]"
    assert redacted["counts"] == {"imported": 3, "failed": 1}

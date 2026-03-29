import pytest
from datafn.server import create_datafn_server
from .mock_db import MockAdapter


class LogCollector:
    def __init__(self):
        self.events = []

    def _push(self, level, message, context=None):
        self.events.append({"level": level, "message": message, "context": context or {}})

    def info(self, message, context=None):
        self._push("info", message, context)

    def warn(self, message, context=None):
        self._push("warn", message, context)

    def error(self, message, context=None):
        self._push("error", message, context)

    def debug(self, message, context=None):
        self._push("debug", message, context)


SCHEMA = {
    "resources": [
        {
            "name": "notes",
            "version": 1,
            "capabilities": [
                {"shareable": {"levels": ["viewer", "editor", "owner"], "default": "private"}}
            ],
            "permissions": {
                "read": {"fields": ["id", "title"]},
                "write": {"fields": ["title"]},
            },
            "fields": [{"name": "title", "type": "string", "required": True}],
        },
        {
            "name": "privateNotes",
            "version": 1,
            "capabilities": [
                {"shareable": {"levels": ["viewer", "editor", "owner"], "default": "private"}}
            ],
            "fields": [{"name": "title", "type": "string", "required": True}],
        },
        {
            "name": "cycleLogs",
            "version": 1,
            "fields": [
                {"name": "symptoms", "type": "string"},
                {"name": "mood", "type": "string"},
            ],
        },
    ],
    "relations": [],
}


def _ctx(actor):
    return {"namespace": "user:owner", "actorId": actor}


@pytest.mark.asyncio
async def test_tv_py_001_p_owner_allow_viewer_deny_for_share():
    db = MockAdapter()
    server = create_datafn_server({"schema": SCHEMA, "db": db})
    mutation = server["routes"]["POST /datafn/mutation"]

    seed = await mutation(_ctx("owner"), {
        "resource": "notes",
        "version": 1,
        "operation": "insert",
        "clientId": "c-py-1",
        "mutationId": "m-seed",
        "id": "n1",
        "record": {"title": "Owner note"},
    })
    assert seed["ok"] is True

    owner_share = await mutation(_ctx("owner"), {
        "resource": "notes",
        "version": 1,
        "operation": "share",
        "clientId": "c-py-1",
        "mutationId": "m-owner-share",
        "id": "n1",
        "shareWith": {"principalId": "user:viewer", "level": "viewer"},
    })
    assert owner_share["ok"] is True

    viewer_share = await mutation(_ctx("viewer"), {
        "resource": "notes",
        "version": 1,
        "operation": "share",
        "clientId": "c-py-1",
        "mutationId": "m-viewer-share",
        "id": "n1",
        "shareWith": {"principalId": "user:eve", "level": "viewer"},
    })
    assert viewer_share["ok"] is False
    assert viewer_share["error"]["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_tv_py_001_n_private_shareable_missing_permissions_denied_by_default():
    db = MockAdapter()
    server = create_datafn_server({"schema": SCHEMA, "db": db})
    mutation = server["routes"]["POST /datafn/mutation"]

    res = await mutation(_ctx("eve"), {
        "resource": "privateNotes",
        "version": 1,
        "operation": "merge",
        "clientId": "c-py-1n",
        "mutationId": "m-py-1n",
        "id": "pn1",
        "record": {"title": "Should not allow"},
    })

    assert res["ok"] is False
    assert res["error"]["code"] == "FORBIDDEN"
    assert res["error"]["message"] == "Access denied: resource requires explicit permissions"
    assert res["error"]["details"]["path"] == "python.authz"


@pytest.mark.asyncio
async def test_sync_actor_visible_filtering_and_backfill_revoke():
    db = MockAdapter()
    server = create_datafn_server({"schema": SCHEMA, "db": db})
    mutation = server["routes"]["POST /datafn/mutation"]
    clone = server["routes"]["POST /datafn/clone"]
    pull = server["routes"]["POST /datafn/pull"]
    push = server["routes"]["POST /datafn/push"]

    await mutation(_ctx("owner"), {
        "resource": "notes",
        "version": 1,
        "operation": "insert",
        "clientId": "c-sync",
        "mutationId": "m-sync-seed",
        "id": "n-historical",
        "record": {"title": "Historical"},
    })

    baseline_pull = await pull(_ctx("viewer"), {"clientId": "viewer-client", "cursors": {"notes": "0"}})
    assert baseline_pull["ok"] is True
    assert baseline_pull["result"].get("records", {}).get("notes", []) == []
    baseline_cursor = baseline_pull["result"].get("cursors", {}).get("notes", "0")

    share = await mutation(_ctx("owner"), {
        "resource": "notes",
        "version": 1,
        "operation": "share",
        "clientId": "c-sync",
        "mutationId": "m-sync-share",
        "id": "n-historical",
        "shareWith": {"principalId": "user:viewer", "level": "viewer"},
    })
    assert share["ok"] is True

    clone_res = await clone(_ctx("viewer"), {"clientId": "viewer-client", "tables": ["notes"]})
    assert clone_res["ok"] is True
    assert [row["id"] for row in clone_res["result"]["data"].get("notes", [])] == ["n-historical"]

    backfill_pull = await pull(
        _ctx("viewer"),
        {"clientId": "viewer-client", "cursors": {"notes": baseline_cursor}},
    )
    assert backfill_pull["ok"] is True
    assert [row["id"] for row in backfill_pull["result"].get("records", {}).get("notes", [])] == ["n-historical"]
    post_share_cursor = backfill_pull["result"].get("cursors", {}).get("notes", baseline_cursor)

    # viewer cannot mutate non-editor private record via push
    viewer_push = await push(_ctx("viewer"), {
        "clientId": "viewer-client",
        "mutations": [
            {
                "resource": "notes",
                "version": 1,
                "operation": "merge",
                "clientId": "viewer-client",
                "mutationId": "m-viewer-merge",
                "id": "n-historical",
                "record": {"title": "Viewer edit"},
            }
        ],
    })
    assert viewer_push["ok"] is True
    assert viewer_push["result"]["errors"][0]["error"]["code"] == "FORBIDDEN"

    unshare = await mutation(_ctx("owner"), {
        "resource": "notes",
        "version": 1,
        "operation": "unshare",
        "clientId": "c-sync",
        "mutationId": "m-sync-unshare",
        "id": "n-historical",
        "shareWith": {"principalId": "user:viewer"},
    })
    assert unshare["ok"] is True

    revoke_pull = await pull(
        _ctx("viewer"),
        {"clientId": "viewer-client", "cursors": {"notes": post_share_cursor}},
    )
    assert revoke_pull["ok"] is True
    assert "n-historical" in revoke_pull["result"].get("deleted", {}).get("notes", [])


@pytest.mark.asyncio
async def test_tv_sec_001_p_n_logs_redact_sensitive_payload_and_log_unauthorized_share_context():
    logger = LogCollector()
    db = MockAdapter()
    server = create_datafn_server({"schema": SCHEMA, "db": db, "logger": logger})
    mutation = server["routes"]["POST /datafn/mutation"]

    insert = await mutation(_ctx("owner"), {
        "resource": "cycleLogs",
        "version": 1,
        "operation": "insert",
        "clientId": "c-sec",
        "mutationId": "m-sec-insert",
        "id": "cl1",
        "record": {"symptoms": "private", "mood": "private"},
    })
    assert insert["ok"] is True

    contexts_blob = "\n".join(str(event.get("context", {})) for event in logger.events)
    assert "private detail" not in contexts_blob
    assert "'symptoms': 'private'" not in contexts_blob
    assert "'mood': 'private'" not in contexts_blob

    request_events = [
        event for event in logger.events
        if event["message"] == "Mutation request" and event["context"].get("resource") == "cycleLogs"
    ]
    assert request_events
    assert all("record" not in event["context"] for event in request_events)

    # Seed a private note and share viewer access.
    await mutation(_ctx("owner"), {
        "resource": "notes",
        "version": 1,
        "operation": "insert",
        "clientId": "c-sec",
        "mutationId": "m-sec-note",
        "id": "n-sec",
        "record": {"title": "Sec note"},
    })
    await mutation(_ctx("owner"), {
        "resource": "notes",
        "version": 1,
        "operation": "share",
        "clientId": "c-sec",
        "mutationId": "m-sec-share",
        "id": "n-sec",
        "shareWith": {"principalId": "user:viewer", "level": "viewer"},
    })

    # Unauthorized share attempt should emit security context log.
    denied_share = await mutation(_ctx("viewer"), {
        "resource": "notes",
        "version": 1,
        "operation": "share",
        "clientId": "c-sec",
        "mutationId": "m-sec-denied",
        "id": "n-sec",
        "shareWith": {"principalId": "user:eve", "level": "viewer"},
    })
    assert denied_share["ok"] is False

    security_logs = [event for event in logger.events if event["message"] == "Unauthorized share access"]
    assert security_logs
    assert any(
        event["context"].get("actorId") == "viewer"
        and event["context"].get("resource") == "notes"
        and event["context"].get("recordId") == "n-sec"
        for event in security_logs
    )

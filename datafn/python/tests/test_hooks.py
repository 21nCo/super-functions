import pytest
from datafn.hooks import run_before_hook, run_after_hook


# --- Test plugin classes ---

class ModifyQueryPlugin:
    name = "modify-query"
    runs_on = ["server"]

    async def before_query(self, ctx, query):
        query = dict(query)
        query["limit"] = 10
        return query

    async def after_query(self, ctx, query, result):
        return {"transformed": True, "original": result}


class FailingPlugin:
    name = "failing-plugin"
    runs_on = ["server"]

    async def before_query(self, ctx, query):
        raise ValueError("plugin error")

    async def after_query(self, ctx, query, result):
        raise ValueError("after hook error")


class ClientOnlyPlugin:
    name = "client-plugin"
    runs_on = ["client"]

    async def before_query(self, ctx, query):
        query = dict(query)
        query["injected"] = True
        return query


class PassthroughPlugin:
    name = "passthrough"
    runs_on = ["server"]

    async def before_query(self, ctx, query):
        return None  # No modification

    async def after_query(self, ctx, query, result):
        return None  # No modification


# --- Before hook tests ---

class TestRunBeforeHook:
    @pytest.mark.asyncio
    async def test_single_plugin_modifies_payload(self):
        result = await run_before_hook(
            [ModifyQueryPlugin()], "server", "before_query", {}, {"resource": "tasks"}
        )
        assert result["ok"] is True
        assert result["value"]["limit"] == 10

    @pytest.mark.asyncio
    async def test_fail_closed_on_error(self):
        result = await run_before_hook(
            [FailingPlugin()], "server", "before_query", {}, {"resource": "tasks"}
        )
        assert result["ok"] is False
        assert result["error"]["code"] == "PLUGIN_ERROR"
        assert "failing-plugin" in result["error"]["message"]

    @pytest.mark.asyncio
    async def test_filtered_by_runs_on(self):
        result = await run_before_hook(
            [ClientOnlyPlugin()], "server", "before_query", {}, {"resource": "tasks"}
        )
        assert result["ok"] is True
        assert "injected" not in result["value"]

    @pytest.mark.asyncio
    async def test_no_plugins(self):
        result = await run_before_hook(
            [], "server", "before_query", {}, {"resource": "tasks"}
        )
        assert result["ok"] is True
        assert result["value"] == {"resource": "tasks"}

    @pytest.mark.asyncio
    async def test_passthrough_returns_original(self):
        result = await run_before_hook(
            [PassthroughPlugin()], "server", "before_query", {}, {"resource": "tasks"}
        )
        assert result["ok"] is True
        assert result["value"] == {"resource": "tasks"}

    @pytest.mark.asyncio
    async def test_chaining(self):
        class AddFieldPlugin:
            name = "add-field"
            runs_on = ["server"]
            async def before_query(self, ctx, query):
                query = dict(query)
                query["extra"] = True
                return query

        result = await run_before_hook(
            [ModifyQueryPlugin(), AddFieldPlugin()], "server", "before_query", {}, {"resource": "tasks"}
        )
        assert result["ok"] is True
        assert result["value"]["limit"] == 10
        assert result["value"]["extra"] is True

    @pytest.mark.asyncio
    async def test_error_stops_chain(self):
        class TrackPlugin:
            name = "tracker"
            runs_on = ["server"]
            called = False
            async def before_query(self, ctx, query):
                TrackPlugin.called = True
                return query

        TrackPlugin.called = False
        result = await run_before_hook(
            [FailingPlugin(), TrackPlugin()], "server", "before_query", {}, {}
        )
        assert result["ok"] is False
        assert TrackPlugin.called is False


# --- After hook tests ---

class TestRunAfterHook:
    @pytest.mark.asyncio
    async def test_result_transformation(self):
        result = await run_after_hook(
            [ModifyQueryPlugin()], "server", "after_query", {}, {}, {"data": []}
        )
        assert result["transformed"] is True

    @pytest.mark.asyncio
    async def test_fail_open_on_error(self):
        result = await run_after_hook(
            [FailingPlugin()], "server", "after_query", {}, {}, {"data": []}
        )
        # Error swallowed, original result returned
        assert result == {"data": []}

    @pytest.mark.asyncio
    async def test_no_plugins(self):
        result = await run_after_hook(
            [], "server", "after_query", {}, {}, {"data": [1, 2]}
        )
        assert result == {"data": [1, 2]}

    @pytest.mark.asyncio
    async def test_passthrough(self):
        result = await run_after_hook(
            [PassthroughPlugin()], "server", "after_query", {}, {}, {"data": []}
        )
        assert result == {"data": []}

    @pytest.mark.asyncio
    async def test_filtered_by_runs_on(self):
        result = await run_after_hook(
            [ClientOnlyPlugin()], "server", "after_query", {}, {}, {"data": []}
        )
        assert result == {"data": []}

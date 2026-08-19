"""Workflow trigger lifecycle tests."""

import asyncio
from datetime import datetime
from typing import Any, Dict

import pytest

from plugfn.core.workflow_engine import WorkflowEngine, WorkflowEngineError
from plugfn.types import Workflow, WorkflowStatus


class WorkflowStorageStub:
    def __init__(self, workflow: Workflow) -> None:
        self.workflow = workflow
        self.executions: Dict[str, Dict[str, Any]] = {}
        self.deleted = False

    async def get_workflow(self, workflow_id: str) -> Workflow | None:
        if self.deleted or workflow_id != self.workflow.id:
            return None
        return self.workflow

    async def list_workflows(
        self, user_id: str | None = None, status: WorkflowStatus | None = None
    ) -> list[Workflow]:
        if self.deleted:
            return []
        if user_id is not None and self.workflow.user_id != user_id:
            return []
        if status is not None and self.workflow.status != status:
            return []
        return [self.workflow]

    async def update_workflow(self, workflow_id: str, updates: Dict[str, Any]) -> None:
        assert workflow_id == self.workflow.id
        self.workflow = self.workflow.model_copy(update=updates)

    async def delete_workflow(self, workflow_id: str) -> None:
        assert workflow_id == self.workflow.id
        self.deleted = True

    async def create_workflow_execution(self, execution: Dict[str, Any]) -> None:
        self.executions[execution["id"]] = execution

    async def update_workflow_execution(self, execution_id: str, updates: Dict[str, Any]) -> None:
        self.executions[execution_id].update(updates)


class WebhookHandlerStub:
    def __init__(self) -> None:
        self.handlers: Dict[tuple[str, str], Any] = {}
        self.fail_next_registration = False
        self.mutate_then_fail_registration = False

    def register_handler(self, provider: str, event: str, handler: Any) -> None:
        if self.fail_next_registration:
            self.fail_next_registration = False
            raise RuntimeError("registration failed")
        self.handlers[(provider, event)] = handler
        if self.mutate_then_fail_registration:
            self.mutate_then_fail_registration = False
            raise RuntimeError("registration failed after mutation")

    def unregister_handler(self, provider: str, event: str, handler: Any) -> None:
        if self.handlers.get((provider, event)) is handler:
            del self.handlers[(provider, event)]


class LoggerStub:
    def info(self, _message: str, _metadata: Any = None) -> None:
        return None

    def error(self, _message: str, _metadata: Any = None) -> None:
        return None


class ActionExecutorStub:
    def __init__(self, result: Dict[str, Any] | None = None) -> None:
        self.result = result or {"success": True, "data": {"ok": True}}
        self.calls: list[Dict[str, Any]] = []

    async def execute(self, **kwargs: Any) -> Dict[str, Any]:
        self.calls.append(kwargs)
        return self.result


def create_workflow(status: WorkflowStatus = WorkflowStatus.DRAFT) -> Workflow:
    now = datetime.now()
    return Workflow(
        id="workflow-1",
        user_id="user-1",
        name="Issue workflow",
        definition={
            "trigger": {"provider": "github", "event": "issues.opened"},
            "steps": [
                {
                    "id": "step-1",
                    "type": "action",
                    "provider": "github",
                    "action": "issues.create",
                    "params": {"title": "Created by workflow"},
                }
            ],
        },
        status=status,
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_workflow_enable_disable_and_delete_manage_webhook_binding() -> None:
    workflow = create_workflow()
    storage = WorkflowStorageStub(workflow)
    webhooks = WebhookHandlerStub()
    actions = ActionExecutorStub()
    engine = WorkflowEngine(storage, webhooks, LoggerStub(), actions)  # type: ignore[arg-type]

    await engine.enable_workflow(workflow.id)
    binding = webhooks.handlers[("github", "issues.opened")]
    result = await binding({"issue": {"id": 1}})
    assert result["status"] == "completed"
    assert actions.calls == [
        {
            "provider": "github",
            "action": "issues.create",
            "user_id": "user-1",
            "params": {"title": "Created by workflow"},
            "connection_id": None,
        }
    ]

    await engine.disable_workflow(workflow.id)
    assert ("github", "issues.opened") not in webhooks.handlers

    await engine.enable_workflow(workflow.id)
    assert ("github", "issues.opened") in webhooks.handlers
    await engine.delete_workflow(workflow.id)
    assert ("github", "issues.opened") not in webhooks.handlers
    assert storage.deleted is True


@pytest.mark.asyncio
async def test_invalid_trigger_does_not_persist_enabled_status() -> None:
    workflow = create_workflow()
    workflow.definition["trigger"] = {"provider": "github"}
    storage = WorkflowStorageStub(workflow)
    engine = WorkflowEngine(
        storage,  # type: ignore[arg-type]
        WebhookHandlerStub(),
        LoggerStub(),
        ActionExecutorStub(),
    )

    with pytest.raises(ValueError, match="trigger event is invalid"):
        await engine.enable_workflow(workflow.id)

    assert storage.workflow.status == WorkflowStatus.DRAFT


@pytest.mark.asyncio
async def test_enabled_workflow_disable_fails_closed_without_live_binding() -> None:
    workflow = create_workflow(WorkflowStatus.ENABLED)
    storage = WorkflowStorageStub(workflow)
    engine = WorkflowEngine(
        storage,  # type: ignore[arg-type]
        WebhookHandlerStub(),
        LoggerStub(),
        ActionExecutorStub(),
    )

    with pytest.raises(WorkflowEngineError) as error:
        await engine.disable_workflow(workflow.id)

    assert error.value.code == "WORKFLOW_TRIGGER_UNREGISTER_FAILED"
    assert storage.workflow.status == WorkflowStatus.ENABLED


@pytest.mark.asyncio
async def test_ready_rehydrates_persisted_enabled_workflow_after_restart() -> None:
    workflow = create_workflow(WorkflowStatus.ENABLED)
    storage = WorkflowStorageStub(workflow)
    webhooks = WebhookHandlerStub()
    engine = WorkflowEngine(
        storage,  # type: ignore[arg-type]
        webhooks,
        LoggerStub(),
        ActionExecutorStub(),
    )

    await engine.ready()

    assert ("github", "issues.opened") in webhooks.handlers


@pytest.mark.asyncio
async def test_failed_rehydration_restores_the_previous_live_binding() -> None:
    workflow = create_workflow(WorkflowStatus.ENABLED)
    storage = WorkflowStorageStub(workflow)
    webhooks = WebhookHandlerStub()
    engine = WorkflowEngine(
        storage,  # type: ignore[arg-type]
        webhooks,
        LoggerStub(),
        ActionExecutorStub(),
    )
    await engine.ready()
    previous_handler = webhooks.handlers[("github", "issues.opened")]
    webhooks.fail_next_registration = True

    result = await engine.rehydrate_enabled_triggers()

    assert result == {"registered": 0, "failed": 1}
    assert webhooks.handlers[("github", "issues.opened")] is previous_handler


@pytest.mark.asyncio
async def test_partial_registration_failure_removes_attempted_handler_before_restore() -> None:
    workflow = create_workflow(WorkflowStatus.ENABLED)
    storage = WorkflowStorageStub(workflow)
    webhooks = WebhookHandlerStub()
    engine = WorkflowEngine(
        storage,  # type: ignore[arg-type]
        webhooks,
        LoggerStub(),
        ActionExecutorStub(),
    )
    await engine.ready()
    previous_handler = webhooks.handlers[("github", "issues.opened")]
    webhooks.mutate_then_fail_registration = True

    result = await engine.rehydrate_enabled_triggers()

    assert result == {"registered": 0, "failed": 1}
    assert webhooks.handlers[("github", "issues.opened")] is previous_handler


@pytest.mark.asyncio
async def test_enable_gates_webhooks_until_enabled_status_is_durable() -> None:
    workflow = create_workflow()

    class BlockingWorkflowStorage(WorkflowStorageStub):
        def __init__(self, item: Workflow) -> None:
            super().__init__(item)
            self.update_started = asyncio.Event()
            self.release_update = asyncio.Event()

        async def update_workflow(self, workflow_id: str, updates: Dict[str, Any]) -> None:
            self.update_started.set()
            await self.release_update.wait()
            await super().update_workflow(workflow_id, updates)

    storage = BlockingWorkflowStorage(workflow)
    webhooks = WebhookHandlerStub()
    engine = WorkflowEngine(
        storage,  # type: ignore[arg-type]
        webhooks,
        LoggerStub(),
        ActionExecutorStub(),
    )

    enable_task = asyncio.create_task(engine.enable_workflow(workflow.id))
    await storage.update_started.wait()
    handler_task = asyncio.create_task(
        webhooks.handlers[("github", "issues.opened")]({"issue": {"id": 1}})
    )
    await asyncio.sleep(0)
    assert handler_task.done() is False

    storage.release_update.set()
    await enable_task
    result = await handler_task

    assert result["status"] == "completed"


@pytest.mark.asyncio
async def test_cancelled_enable_releases_gate_and_removes_new_binding() -> None:
    workflow = create_workflow()

    class BlockingWorkflowStorage(WorkflowStorageStub):
        def __init__(self, item: Workflow) -> None:
            super().__init__(item)
            self.update_started = asyncio.Event()

        async def update_workflow(self, workflow_id: str, updates: Dict[str, Any]) -> None:
            self.update_started.set()
            await asyncio.Event().wait()

    storage = BlockingWorkflowStorage(workflow)
    webhooks = WebhookHandlerStub()
    engine = WorkflowEngine(
        storage,  # type: ignore[arg-type]
        webhooks,
        LoggerStub(),
        ActionExecutorStub(),
    )

    enable_task = asyncio.create_task(engine.enable_workflow(workflow.id))
    await storage.update_started.wait()
    handler_task = asyncio.create_task(
        webhooks.handlers[("github", "issues.opened")]({"issue": {"id": 1}})
    )
    await asyncio.sleep(0)

    enable_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await enable_task
    with pytest.raises(asyncio.CancelledError):
        await handler_task

    assert ("github", "issues.opened") not in webhooks.handlers
    assert storage.workflow.status == WorkflowStatus.DRAFT


@pytest.mark.asyncio
async def test_cancelled_enable_keeps_binding_when_status_already_committed() -> None:
    workflow = create_workflow()

    class CommitThenBlockWorkflowStorage(WorkflowStorageStub):
        def __init__(self, item: Workflow) -> None:
            super().__init__(item)
            self.committed = asyncio.Event()

        async def update_workflow(self, workflow_id: str, updates: Dict[str, Any]) -> None:
            await super().update_workflow(workflow_id, updates)
            self.committed.set()
            await asyncio.Event().wait()

    storage = CommitThenBlockWorkflowStorage(workflow)
    webhooks = WebhookHandlerStub()
    engine = WorkflowEngine(
        storage,  # type: ignore[arg-type]
        webhooks,
        LoggerStub(),
        ActionExecutorStub(),
    )

    enable_task = asyncio.create_task(engine.enable_workflow(workflow.id))
    await storage.committed.wait()
    enable_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await enable_task

    handler = webhooks.handlers[("github", "issues.opened")]
    result = await handler({"issue": {"id": 1}})

    assert storage.workflow.status == WorkflowStatus.ENABLED
    assert result["status"] == "completed"


@pytest.mark.asyncio
async def test_action_failure_marks_workflow_execution_failed() -> None:
    workflow = create_workflow()
    storage = WorkflowStorageStub(workflow)
    webhooks = WebhookHandlerStub()
    engine = WorkflowEngine(
        storage,  # type: ignore[arg-type]
        webhooks,
        LoggerStub(),
        ActionExecutorStub({"success": False, "error": "provider rejected action"}),
    )
    await engine.enable_workflow(workflow.id)

    with pytest.raises(RuntimeError, match="provider rejected action"):
        await webhooks.handlers[("github", "issues.opened")]({"issue": {"id": 1}})

    execution = next(iter(storage.executions.values()))
    assert execution["status"] == "failed"
    assert execution["error"] == "provider rejected action"

"""Workflow trigger lifecycle tests."""

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

    def register_handler(self, provider: str, event: str, handler: Any) -> None:
        self.handlers[(provider, event)] = handler

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
    engine = WorkflowEngine(  # type: ignore[arg-type]
        storage, WebhookHandlerStub(), LoggerStub(), ActionExecutorStub()
    )

    with pytest.raises(ValueError, match="trigger event is invalid"):
        await engine.enable_workflow(workflow.id)

    assert storage.workflow.status == WorkflowStatus.DRAFT


@pytest.mark.asyncio
async def test_enabled_workflow_disable_fails_closed_without_live_binding() -> None:
    workflow = create_workflow(WorkflowStatus.ENABLED)
    storage = WorkflowStorageStub(workflow)
    engine = WorkflowEngine(  # type: ignore[arg-type]
        storage, WebhookHandlerStub(), LoggerStub(), ActionExecutorStub()
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
    engine = WorkflowEngine(  # type: ignore[arg-type]
        storage, webhooks, LoggerStub(), ActionExecutorStub()
    )

    await engine.ready()

    assert ("github", "issues.opened") in webhooks.handlers


@pytest.mark.asyncio
async def test_action_failure_marks_workflow_execution_failed() -> None:
    workflow = create_workflow()
    storage = WorkflowStorageStub(workflow)
    webhooks = WebhookHandlerStub()
    engine = WorkflowEngine(  # type: ignore[arg-type]
        storage,
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

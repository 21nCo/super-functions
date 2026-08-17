"""Workflow trigger lifecycle tests."""

from datetime import datetime
from typing import Any, Dict

import pytest

from plugfn.core.workflow_engine import WorkflowEngine
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

    async def update_workflow(self, workflow_id: str, updates: Dict[str, Any]) -> None:
        assert workflow_id == self.workflow.id
        self.workflow = self.workflow.model_copy(update=updates)

    async def delete_workflow(self, workflow_id: str) -> None:
        assert workflow_id == self.workflow.id
        self.deleted = True

    async def create_workflow_execution(self, execution: Dict[str, Any]) -> None:
        self.executions[execution["id"]] = execution

    async def update_workflow_execution(
        self, execution_id: str, updates: Dict[str, Any]
    ) -> None:
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


@pytest.mark.asyncio
async def test_workflow_enable_disable_and_delete_manage_webhook_binding() -> None:
    now = datetime.now()
    workflow = Workflow(
        id="workflow-1",
        user_id="user-1",
        name="Issue workflow",
        definition={
            "trigger": {"provider": "github", "event": "issues.opened"},
            "steps": [{"id": "step-1", "type": "action"}],
        },
        status=WorkflowStatus.DRAFT,
        created_at=now,
        updated_at=now,
    )
    storage = WorkflowStorageStub(workflow)
    webhooks = WebhookHandlerStub()
    engine = WorkflowEngine(storage, webhooks, LoggerStub())  # type: ignore[arg-type]

    await engine.enable_workflow(workflow.id)
    binding = webhooks.handlers[("github", "issues.opened")]
    result = await binding({"issue": {"id": 1}})
    assert result["status"] == "completed"

    await engine.disable_workflow(workflow.id)
    assert ("github", "issues.opened") not in webhooks.handlers

    await engine.enable_workflow(workflow.id)
    assert ("github", "issues.opened") in webhooks.handlers
    await engine.delete_workflow(workflow.id)
    assert ("github", "issues.opened") not in webhooks.handlers
    assert storage.deleted is True

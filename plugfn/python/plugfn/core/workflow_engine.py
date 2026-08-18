"""Workflow engine for managing and executing workflows."""

import asyncio
from datetime import datetime
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

from ..storage.workflow_storage import WorkflowStorage
from ..types import Workflow, WorkflowStatus


class WorkflowEngineError(RuntimeError):
    """Structured workflow lifecycle failure."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class WorkflowEngine:
    """Engine for managing workflows."""

    def __init__(
        self,
        storage: WorkflowStorage,
        webhook_handler: Any,
        logger: Any,
        action_executor: Optional[Any] = None,
    ) -> None:
        """Initialize workflow engine.

        Args:
            storage: Workflow storage
            webhook_handler: Webhook handler for triggers
            logger: Logger instance
        """
        self.storage = storage
        self.webhook_handler = webhook_handler
        self.logger = logger
        self.action_executor = action_executor
        self._ready = False
        self._ready_lock = asyncio.Lock()
        self._trigger_bindings: Dict[
            str, Tuple[str, str, Callable[[Dict[str, Any]], Awaitable[Any]]]
        ] = {}

    async def list_workflows(
        self, user_id: Optional[str] = None, status: Optional[WorkflowStatus] = None
    ) -> List[Workflow]:
        """List workflows.

        Args:
            user_id: Optional user ID filter
            status: Optional status filter

        Returns:
            List of workflows
        """
        workflows = await self.storage.list_workflows(user_id=user_id)

        if status:
            workflows = [w for w in workflows if w.status == status]

        return workflows

    async def get_workflow(self, workflow_id: str) -> Optional[Workflow]:
        """Get a workflow by ID.

        Args:
            workflow_id: Workflow ID

        Returns:
            Workflow or None if not found
        """
        return await self.storage.get_workflow(workflow_id)

    async def create_workflow(
        self,
        user_id: str,
        name: str,
        definition: Dict[str, Any],
        description: Optional[str] = None,
    ) -> Workflow:
        """Create a new workflow.

        Args:
            user_id: User ID
            name: Workflow name
            definition: Workflow definition
            description: Optional description

        Returns:
            Created workflow
        """
        import secrets

        workflow_id = f"wf_{secrets.token_urlsafe(16)}"
        now = datetime.now()

        workflow = Workflow(
            id=workflow_id,
            user_id=user_id,
            name=name,
            description=description,
            definition=definition,
            status=WorkflowStatus.DRAFT,
            metadata={},
            created_at=now,
            updated_at=now,
        )

        await self.storage.create_workflow(workflow)

        self.logger.info(f"Created workflow: {workflow_id}", {"user_id": user_id})

        return workflow

    async def enable_workflow(self, workflow_id: str) -> None:
        """Enable a workflow.

        Args:
            workflow_id: Workflow ID

        Raises:
            ValueError: If workflow not found
        """
        workflow = await self.get_workflow(workflow_id)
        if not workflow:
            raise ValueError(f"Workflow {workflow_id} not found")

        self._trigger_coordinates(workflow)
        previous_binding = self._trigger_bindings.get(workflow.id)
        try:
            await self._register_trigger(workflow)
        except Exception:
            if previous_binding is not None:
                self._restore_trigger_binding(workflow.id, previous_binding)
            raise
        try:
            await self.storage.update_workflow(
                workflow_id,
                {"status": WorkflowStatus.ENABLED, "updated_at": datetime.now()},
            )
        except Exception:
            self._unregister_trigger(workflow, required=False)
            if previous_binding is not None:
                self._restore_trigger_binding(workflow.id, previous_binding)
            raise

        self.logger.info(f"Enabled workflow: {workflow_id}")

    async def disable_workflow(self, workflow_id: str) -> None:
        """Disable a workflow.

        Args:
            workflow_id: Workflow ID

        Raises:
            ValueError: If workflow not found
        """
        workflow = await self.get_workflow(workflow_id)
        if not workflow:
            raise ValueError(f"Workflow {workflow_id} not found")

        binding = self._unregister_trigger(
            workflow, required=workflow.status == WorkflowStatus.ENABLED
        )
        try:
            await self.storage.update_workflow(
                workflow_id,
                {"status": WorkflowStatus.DISABLED, "updated_at": datetime.now()},
            )
        except Exception:
            if binding is not None:
                self._restore_trigger_binding(workflow.id, binding)
            raise

        self.logger.info(f"Disabled workflow: {workflow_id}")

    async def delete_workflow(self, workflow_id: str) -> None:
        """Delete a workflow.

        Args:
            workflow_id: Workflow ID

        Raises:
            ValueError: If workflow not found
        """
        workflow = await self.get_workflow(workflow_id)
        if not workflow:
            raise ValueError(f"Workflow {workflow_id} not found")

        binding = self._unregister_trigger(
            workflow, required=workflow.status == WorkflowStatus.ENABLED
        )
        try:
            await self.storage.delete_workflow(workflow_id)
        except Exception:
            if binding is not None:
                self._restore_trigger_binding(workflow.id, binding)
            raise

        self.logger.info(f"Deleted workflow: {workflow_id}")

    async def _register_trigger(self, workflow: Workflow) -> None:
        provider, event = self._trigger_coordinates(workflow)

        self._unregister_trigger(workflow, required=False)

        async def handler(payload: Dict[str, Any]) -> Any:
            return await self.execute_workflow(workflow.id, payload)

        self.webhook_handler.register_handler(provider, event, handler)
        self._trigger_bindings[workflow.id] = (provider, event, handler)

    @staticmethod
    def _trigger_coordinates(workflow: Workflow) -> Tuple[str, str]:
        trigger = workflow.definition.get("trigger")
        if not isinstance(trigger, dict):
            raise ValueError(f"Workflow {workflow.id} trigger is invalid")

        provider = trigger.get("provider")
        event = trigger.get("event")
        if not isinstance(provider, str) or not provider:
            raise ValueError(f"Workflow {workflow.id} trigger provider is invalid")
        if not isinstance(event, str) or not event:
            raise ValueError(f"Workflow {workflow.id} trigger event is invalid")
        return provider, event

    def _restore_trigger_binding(
        self,
        workflow_id: str,
        binding: Tuple[str, str, Callable[[Dict[str, Any]], Awaitable[Any]]],
    ) -> None:
        provider, event, handler = binding
        self.webhook_handler.register_handler(provider, event, handler)
        self._trigger_bindings[workflow_id] = binding

    def _unregister_trigger(
        self, workflow: Workflow, *, required: bool
    ) -> Optional[Tuple[str, str, Callable[[Dict[str, Any]], Awaitable[Any]]]]:
        binding = self._trigger_bindings.pop(workflow.id, None)
        if binding is None:
            if required:
                raise WorkflowEngineError(
                    "WORKFLOW_TRIGGER_UNREGISTER_FAILED",
                    f"Workflow {workflow.id} has no registered trigger binding",
                )
            return None
        provider, event, handler = binding
        self.webhook_handler.unregister_handler(provider, event, handler)
        return binding

    async def rehydrate_enabled_triggers(self) -> Dict[str, int]:
        """Restore persisted enabled trigger bindings after process startup."""
        workflows = await self.storage.list_workflows(status=WorkflowStatus.ENABLED)
        registered = 0
        failed = 0
        for workflow in workflows:
            try:
                await self._register_trigger(workflow)
                registered += 1
            except Exception as error:
                failed += 1
                self.logger.error(
                    f"Failed to rehydrate workflow trigger: {workflow.id}",
                    {"error": str(error)},
                )
        return {"registered": registered, "failed": failed}

    async def ready(self) -> None:
        """Ensure enabled triggers are restored; failed attempts remain retryable."""
        if self._ready:
            return
        async with self._ready_lock:
            if self._ready:
                return
            result = await self.rehydrate_enabled_triggers()
            if result["failed"]:
                raise WorkflowEngineError(
                    "WORKFLOW_TRIGGER_REHYDRATION_FAILED",
                    f"Failed to rehydrate {result['failed']} workflow trigger(s)",
                )
            self._ready = True

    async def get_workflow_stats(self, workflow_id: str) -> Dict[str, Any]:
        """Get workflow execution statistics.

        Args:
            workflow_id: Workflow ID

        Returns:
            Workflow statistics

        Raises:
            ValueError: If workflow not found
        """
        workflow = await self.get_workflow(workflow_id)
        if not workflow:
            raise ValueError(f"Workflow {workflow_id} not found")

        # Get executions
        executions = await self.storage.list_workflow_executions(workflow_id)

        total = len(executions)
        completed = len([e for e in executions if e.get("status") == "completed"])
        failed = len([e for e in executions if e.get("status") == "failed"])

        avg_duration = 0
        if executions:
            durations = [e.get("duration", 0) for e in executions if e.get("duration")]
            if durations:
                avg_duration = sum(durations) / len(durations)

        return {
            "workflow_id": workflow_id,
            "total_executions": total,
            "completed": completed,
            "failed": failed,
            "success_rate": completed / total if total > 0 else 0,
            "avg_duration": avg_duration,
        }

    async def execute_workflow(
        self, workflow_id: str, trigger_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute a workflow.

        Args:
            workflow_id: Workflow ID
            trigger_data: Trigger event data

        Returns:
            Execution result

        Raises:
            ValueError: If workflow not found or disabled
        """
        workflow = await self.get_workflow(workflow_id)
        if not workflow:
            raise ValueError(f"Workflow {workflow_id} not found")

        if workflow.status != WorkflowStatus.ENABLED:
            raise ValueError(f"Workflow {workflow_id} is not enabled")

        # Create execution record
        import secrets

        execution_id = f"exec_{secrets.token_urlsafe(16)}"
        start_time = datetime.now()

        execution = {
            "id": execution_id,
            "workflow_id": workflow_id,
            "status": "running",
            "trigger_data": trigger_data,
            "started_at": start_time,
            "steps": [],
        }

        await self.storage.create_workflow_execution(execution)

        # Execute workflow steps (simplified)
        # In a full implementation, this would process the workflow definition
        try:
            # Process workflow definition
            steps = workflow.definition.get("steps", [])
            if not isinstance(steps, list):
                raise ValueError(f"Workflow {workflow_id} steps are invalid")
            results = []

            for step in steps:
                if not isinstance(step, dict) or step.get("type") != "action":
                    raise ValueError("Workflow step type must be 'action'")
                if self.action_executor is None:
                    raise RuntimeError("Workflow action executor is not configured")
                provider = step.get("provider")
                action = step.get("action")
                params = step.get("params", {})
                if not isinstance(provider, str) or not provider:
                    raise ValueError("Workflow action step provider is invalid")
                if not isinstance(action, str) or not action:
                    raise ValueError("Workflow action step action is invalid")
                if not isinstance(params, dict):
                    raise ValueError("Workflow action step params are invalid")

                action_result = await self.action_executor.execute(
                    provider=provider,
                    action=action,
                    user_id=workflow.user_id,
                    params=params,
                    connection_id=step.get("connection_id"),
                )
                if action_result.get("success") is False:
                    raise RuntimeError(str(action_result.get("error") or "Workflow action failed"))
                step_result = {
                    "step": step,
                    "status": "completed",
                    "result": action_result,
                }
                results.append(step_result)

            # Update execution
            end_time = datetime.now()
            duration = int((end_time - start_time).total_seconds() * 1000)

            await self.storage.update_workflow_execution(
                execution_id,
                {
                    "status": "completed",
                    "steps": results,
                    "completed_at": end_time,
                    "duration": duration,
                },
            )

            return {
                "execution_id": execution_id,
                "status": "completed",
                "duration": duration,
                "results": results,
            }

        except Exception as e:
            # Update execution with error
            end_time = datetime.now()
            duration = int((end_time - start_time).total_seconds() * 1000)

            await self.storage.update_workflow_execution(
                execution_id,
                {
                    "status": "failed",
                    "error": str(e),
                    "completed_at": end_time,
                    "duration": duration,
                },
            )

            raise

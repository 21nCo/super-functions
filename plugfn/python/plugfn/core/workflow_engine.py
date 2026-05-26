"""Workflow engine for managing and executing workflows."""

from typing import Any, Dict, List, Optional
from datetime import datetime

from ..types import Workflow, WorkflowStatus


class WorkflowEngine:
    """Engine for managing workflows."""

    def __init__(self, storage: Any, webhook_handler: Any, logger: Any):
        """Initialize workflow engine.

        Args:
            storage: Workflow storage
            webhook_handler: Webhook handler for triggers
            logger: Logger instance
        """
        self.storage = storage
        self.webhook_handler = webhook_handler
        self.logger = logger

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

        await self.storage.update_workflow(
            workflow_id,
            {"status": WorkflowStatus.ENABLED, "updated_at": datetime.now()},
        )

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

        await self.storage.update_workflow(
            workflow_id,
            {"status": WorkflowStatus.DISABLED, "updated_at": datetime.now()},
        )

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

        await self.storage.delete_workflow(workflow_id)

        self.logger.info(f"Deleted workflow: {workflow_id}")

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
            results = []

            for step in steps:
                # Execute step
                step_result = {"step": step, "status": "completed"}
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

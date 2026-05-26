"""Workflow storage using database adapter."""

from typing import Any, Dict, List, Optional

from ..types import Workflow


class WorkflowStorage:
    """Storage layer for workflows."""

    def __init__(self, adapter: Any):
        """Initialize workflow storage.

        Args:
            adapter: Database adapter
        """
        self.adapter = adapter

    async def create_workflow(self, workflow: Workflow) -> None:
        """Create a new workflow.

        Args:
            workflow: Workflow to create
        """
        await self.adapter.createWorkflow(workflow.model_dump())

    async def get_workflow(self, workflow_id: str) -> Optional[Workflow]:
        """Get a workflow by ID.

        Args:
            workflow_id: Workflow ID

        Returns:
            Workflow or None if not found
        """
        data = await self.adapter.getWorkflow(workflow_id)
        if not data:
            return None

        return Workflow(**data)

    async def list_workflows(
        self, user_id: Optional[str] = None, status: Optional[str] = None
    ) -> List[Workflow]:
        """List workflows.

        Args:
            user_id: Optional user ID filter
            status: Optional status filter

        Returns:
            List of workflows
        """
        data_list = await self.adapter.listWorkflows(user_id, status)
        return [Workflow(**data) for data in data_list]

    async def update_workflow(
        self, workflow_id: str, updates: Dict[str, Any]
    ) -> None:
        """Update a workflow.

        Args:
            workflow_id: Workflow ID
            updates: Fields to update
        """
        await self.adapter.updateWorkflow(workflow_id, updates)

    async def delete_workflow(self, workflow_id: str) -> None:
        """Delete a workflow.

        Args:
            workflow_id: Workflow ID
        """
        await self.adapter.deleteWorkflow(workflow_id)

    async def create_workflow_execution(self, execution: Dict[str, Any]) -> None:
        """Create a workflow execution record.

        Args:
            execution: Execution data
        """
        await self.adapter.createWorkflowExecution(execution)

    async def update_workflow_execution(
        self, execution_id: str, updates: Dict[str, Any]
    ) -> None:
        """Update a workflow execution.

        Args:
            execution_id: Execution ID
            updates: Fields to update
        """
        await self.adapter.updateWorkflowExecution(execution_id, updates)

    async def list_workflow_executions(
        self, workflow_id: str, limit: int = 100
    ) -> List[Dict[str, Any]]:
        """List workflow executions.

        Args:
            workflow_id: Workflow ID
            limit: Maximum number of executions to return

        Returns:
            List of execution records
        """
        return await self.adapter.listWorkflowExecutions(workflow_id, limit)

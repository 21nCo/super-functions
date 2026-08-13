"""Linear provider implementation."""

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

from ..types import AuthType, Provider
from ._shared import require_object_response


class LinearIssueGetParams(BaseModel):
    """Parameters for fetching a Linear issue."""

    issue_id: str = Field(..., description="Linear issue ID")


class LinearIssueSearchParams(BaseModel):
    """Parameters for searching Linear issues."""

    team_id: Optional[str] = Field(None, description="Linear team ID")
    query: Optional[str] = Field(None, description="Issue search text")


class LinearAction:
    """Linear action definition."""

    def __init__(self, name: str, display_name: str, description: str) -> None:
        self.name = name
        self.display_name = display_name
        self.description = description

    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        raise NotImplementedError


class LinearIssuesGetAction(LinearAction):
    """Fetch a single Linear issue."""

    idempotent = True

    def __init__(self) -> None:
        super().__init__(
            name="issues.get",
            display_name="Get Issue",
            description="Fetch a single Linear issue by ID",
        )

    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        validated = LinearIssueGetParams(**params)
        query = """
        query Issue($id: String!) {
          issue(id: $id) {
            id
            identifier
            title
            url
          }
        }
        """

        response = require_object_response(
            await context.http.post(
                "",
                json={"query": query, "variables": {"id": validated.issue_id}},
            )
        )
        data = response.get("data")
        if isinstance(data, dict):
            issue = data.get("issue")
            if isinstance(issue, dict):
                return require_object_response(issue)
        return response


class LinearIssuesSearchAction(LinearAction):
    """Search Linear issues."""

    idempotent = True

    def __init__(self) -> None:
        super().__init__(
            name="issues.search",
            display_name="Search Issues",
            description="Search Linear issues for a team or query string",
        )

    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        validated = LinearIssueSearchParams(**params)
        query = """
        query Issues($teamId: String, $query: String) {
          issues(
            filter: {
              team: { id: { eq: $teamId } }
              title: { containsIgnoreCase: $query }
            }
          ) {
            nodes {
              id
              identifier
              title
              url
            }
          }
        }
        """

        response = require_object_response(
            await context.http.post(
                "",
                json={
                    "query": query,
                    "variables": {"teamId": validated.team_id, "query": validated.query},
                },
            )
        )
        data = response.get("data")
        if isinstance(data, dict):
            issues = data.get("issues")
            if isinstance(issues, dict):
                return require_object_response(issues)
        return response


linear_provider = Provider(
    name="linear",
    display_name="Linear",
    version="1.0.0",
    description="Linear issue and project management integration",
    base_url="https://api.linear.app/graphql",
    auth_type=AuthType.OAUTH2,
    icon_url="https://linear.app/favicon.ico",
    rate_limit={"requests": 1500, "window": 3600000},
    auth_config={
        "authorization_url": "https://linear.app/oauth/authorize",
        "token_url": "https://api.linear.app/oauth/token",
        "scopes": ["read", "write"],
        "scope_separator": ",",
    },
    actions={
        "issues.get": LinearIssuesGetAction(),
        "issues.search": LinearIssuesSearchAction(),
    },
    triggers={
        "issue.updated": {
            "name": "issue.updated",
            "display_name": "Issue Updated",
            "description": "Triggered when a Linear issue is updated",
        }
    },
)

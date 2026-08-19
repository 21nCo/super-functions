"""GitHub provider implementation."""

from typing import Any, Dict

from pydantic import BaseModel, Field

from ..types import AuthType, Provider
from ._shared import require_object_response


class GitHubIssueParams(BaseModel):
    """Parameters for creating a GitHub issue."""

    owner: str = Field(..., description="Repository owner")
    repo: str = Field(..., description="Repository name")
    title: str = Field(..., description="Issue title")
    body: str = Field(default="", description="Issue body")
    labels: list[str] = Field(default_factory=list, description="Issue labels")
    assignees: list[str] = Field(default_factory=list, description="Issue assignees")


class GitHubIssue(BaseModel):
    """GitHub issue response."""

    id: int
    number: int
    title: str
    body: str
    state: str
    html_url: str
    created_at: str
    updated_at: str


class GitHubIssueGetParams(BaseModel):
    """Parameters for getting a GitHub issue."""

    owner: str = Field(..., description="Repository owner")
    repo: str = Field(..., description="Repository name")
    issue_number: int = Field(..., description="Issue number")


class GitHubRepoParams(BaseModel):
    """Parameters for getting a repository."""

    owner: str = Field(..., description="Repository owner")
    repo: str = Field(..., description="Repository name")


class GitHubPRParams(BaseModel):
    """Parameters for creating a pull request."""

    owner: str = Field(..., description="Repository owner")
    repo: str = Field(..., description="Repository name")
    title: str = Field(..., description="PR title")
    head: str = Field(..., description="Branch containing changes")
    base: str = Field(..., description="Branch to merge into")
    body: str = Field(default="", description="PR body")


class GitHubAction:
    """GitHub action definition."""

    def __init__(self, name: str, display_name: str, description: str) -> None:
        self.name = name
        self.display_name = display_name
        self.description = description

    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        """Execute the action."""
        raise NotImplementedError


class GitHubIssuesCreateAction(GitHubAction):
    """Create a GitHub issue."""

    def __init__(self) -> None:
        super().__init__(
            name="issues.create",
            display_name="Create Issue",
            description="Create a new issue in a GitHub repository",
        )

    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        """Create a GitHub issue."""
        validated = GitHubIssueParams(**params)

        response = await context.http.post(
            f"/repos/{validated.owner}/{validated.repo}/issues",
            json={
                "title": validated.title,
                "body": validated.body,
                "labels": validated.labels,
                "assignees": validated.assignees,
            },
        )

        return require_object_response(response)


class GitHubIssuesGetAction(GitHubAction):
    """Get a GitHub issue."""

    idempotent = True

    def __init__(self) -> None:
        super().__init__(
            name="issues.get",
            display_name="Get Issue",
            description="Get a GitHub issue by number",
        )

    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        """Get a GitHub issue."""
        validated = GitHubIssueGetParams(**params)

        response = await context.http.get(
            f"/repos/{validated.owner}/{validated.repo}/issues/{validated.issue_number}"
        )

        return require_object_response(response)


class GitHubReposGetAction(GitHubAction):
    """Get a GitHub repository."""

    idempotent = True

    def __init__(self) -> None:
        super().__init__(
            name="repos.get",
            display_name="Get Repository",
            description="Get information about a GitHub repository",
        )

    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        """Get repository information."""
        validated = GitHubRepoParams(**params)

        response = await context.http.get(
            f"/repos/{validated.owner}/{validated.repo}"
        )

        return require_object_response(response)


class GitHubPRsCreateAction(GitHubAction):
    """Create a GitHub pull request."""

    def __init__(self) -> None:
        super().__init__(
            name="pulls.create",
            display_name="Create Pull Request",
            description="Create a new pull request in a GitHub repository",
        )

    async def execute(self, params: Dict[str, Any], context: Any) -> Dict[str, Any]:
        """Create a pull request."""
        validated = GitHubPRParams(**params)

        response = await context.http.post(
            f"/repos/{validated.owner}/{validated.repo}/pulls",
            json={
                "title": validated.title,
                "head": validated.head,
                "base": validated.base,
                "body": validated.body,
            },
        )

        return require_object_response(response)


# GitHub provider definition
github_provider = Provider(
    name="github",
    display_name="GitHub",
    version="1.0.0",
    description="GitHub API integration for repositories, issues, and pull requests",
    base_url="https://api.github.com",
    auth_type=AuthType.OAUTH2,
    icon_url="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
    rate_limit={"requests": 5000, "window": 3600000},  # 5000 per hour
    auth_config={
        "authorization_url": "https://github.com/login/oauth/authorize",
        "token_url": "https://github.com/login/oauth/access_token",
        "scopes": ["repo", "user"],
        "scope_separator": " ",
    },
    actions={
        "issues.create": GitHubIssuesCreateAction(),
        "issues.get": GitHubIssuesGetAction(),
        "repos.get": GitHubReposGetAction(),
        "pulls.create": GitHubPRsCreateAction(),
    },
    triggers={
        "issues.opened": {
            "name": "issues.opened",
            "display_name": "Issue Opened",
            "description": "Triggered when an issue is opened",
        },
        "pull_request.opened": {
            "name": "pull_request.opened",
            "display_name": "Pull Request Opened",
            "description": "Triggered when a pull request is opened",
        },
        "push": {
            "name": "push",
            "display_name": "Push",
            "description": "Triggered when code is pushed",
        },
    },
)

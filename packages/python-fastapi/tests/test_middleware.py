from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
from superfunctions.http import HttpMethod, Response, Route

from superfunctions_fastapi import create_router


def test_fastapi_adapter_executes_route_middleware_before_handler() -> None:
    effects: list[str] = []

    async def placement_guard(request, context, next_handler):
        effects.append("guard")
        return Response(status=401, body={"code": "AUTHFN_ROUTING_ASSERTION_INVALID"})

    async def identity_handler(request, context):
        effects.append("handler")
        return Response(status=200, body={"ok": True})

    app = FastAPI()
    app.include_router(
        create_router(
            [
                Route(
                    method=HttpMethod.POST,
                    path="/auth/sign-in/password",
                    handler=identity_handler,
                    middleware=[placement_guard],
                )
            ]
        )
    )

    response = TestClient(app).post("/auth/sign-in/password")
    assert response.status_code == 401
    assert response.json() == {"code": "AUTHFN_ROUTING_ASSERTION_INVALID"}
    assert effects == ["guard"]

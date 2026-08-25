from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
from superfunctions.http import HttpError, HttpMethod, Response, Route

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


def test_fastapi_adapter_composes_pass_through_middleware_in_order() -> None:
    effects: list[str] = []

    async def outer(request, context, next_handler):
        effects.append("outer-before")
        response = await next_handler(request, context)
        effects.append("outer-after")
        return response

    async def inner(request, context, next_handler):
        effects.append("inner-before")
        response = await next_handler(request, context)
        effects.append("inner-after")
        return response

    async def identity_handler(request, context):
        effects.append("handler")
        return Response(status=200, body={"ok": True})

    app = FastAPI()
    app.include_router(create_router([
        Route(
            method=HttpMethod.GET,
            path="/auth/session",
            handler=identity_handler,
            middleware=[outer, inner],
        )
    ]))

    response = TestClient(app).get("/auth/session")
    assert response.status_code == 200
    assert effects == [
        "outer-before", "inner-before", "handler", "inner-after", "outer-after"
    ]


def test_fastapi_adapter_maps_http_errors_raised_by_middleware() -> None:
    async def reject(request, context, next_handler):
        raise HttpError("placement moving", status=503, code="AUTHFN_PLACEMENT_MOVING")

    async def identity_handler(request, context):
        return Response(status=200)

    app = FastAPI()
    app.include_router(create_router([
        Route(
            method=HttpMethod.GET,
            path="/auth/session",
            handler=identity_handler,
            middleware=[reject],
        )
    ]))

    response = TestClient(app).get("/auth/session")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AUTHFN_PLACEMENT_MOVING"

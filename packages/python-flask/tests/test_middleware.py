from __future__ import annotations

from flask import Flask
from superfunctions.http import HttpMethod, Response, Route

from superfunctions_flask import create_blueprint


def test_flask_adapter_executes_route_middleware_before_handler() -> None:
    effects: list[str] = []

    async def placement_guard(request, context, next_handler):
        effects.append("guard")
        return Response(status=401, body={"code": "AUTHFN_ROUTING_ASSERTION_INVALID"})

    async def identity_handler(request, context):
        effects.append("handler")
        return Response(status=200, body={"ok": True})

    app = Flask(__name__)
    app.register_blueprint(
        create_blueprint(
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

    response = app.test_client().post("/auth/sign-in/password")
    assert response.status_code == 401
    assert response.get_json() == {"code": "AUTHFN_ROUTING_ASSERTION_INVALID"}
    assert effects == ["guard"]


def test_flask_adapter_composes_pass_through_middleware_in_order() -> None:
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

    app = Flask(__name__)
    app.register_blueprint(create_blueprint([
        Route(
            method=HttpMethod.GET,
            path="/auth/session",
            handler=identity_handler,
            middleware=[outer, inner],
        )
    ]))

    response = app.test_client().get("/auth/session")
    assert response.status_code == 200
    assert effects == [
        "outer-before", "inner-before", "handler", "inner-after", "outer-after"
    ]

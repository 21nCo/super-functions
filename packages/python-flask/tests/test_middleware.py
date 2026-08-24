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

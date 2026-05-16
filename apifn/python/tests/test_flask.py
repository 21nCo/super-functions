from __future__ import annotations

from flask import Flask, jsonify

from apifn import ApifnConfig, introspect_flask


def test_tv_py_002_flask_introspection() -> None:
    app = Flask(__name__)

    @app.get("/users/<int:user_id>")
    def get_user(user_id: int):
        return jsonify({"id": user_id})

    spec = introspect_flask(app, ApifnConfig(title="Flask Test", version="1.0.0"))

    assert spec["openapi"] == "3.1.0"
    assert "/users/{user_id}" in spec["paths"]
    op = spec["paths"]["/users/{user_id}"]["get"]
    assert op["parameters"][0]["name"] == "user_id"
    assert op["parameters"][0]["schema"]["type"] == "integer"


def test_tv_py_003_openapi_augmentation_preserves_content() -> None:
    app = Flask(__name__)

    @app.get("/health")
    def health():
        return jsonify({"ok": True})

    spec = introspect_flask(app, ApifnConfig(title="Keep", version="2.0.0", metadata={"env": "test"}))

    assert "/health" in spec["paths"]
    assert spec["x-apifn-config"]["env"] == "test"
    assert spec["info"]["title"] == "Keep"

# superfunctions-flask

Flask adapter for `superfunctions.http`

**Location:** `packages/python-flask/`  
**Package:** `superfunctions-flask`  
**Import:** `from superfunctions_flask import create_blueprint`

## Installation

```bash
pip install superfunctions-flask
```

## Usage

### Option 1: Create Blueprint from Routes

```python
from flask import Flask
from superfunctions.http import Route, HttpMethod, Response, NotFoundError
from superfunctions_flask import create_blueprint

app = Flask(__name__)

# Define handlers using superfunctions abstractions
async def get_user(request, context):
    user_id = context.params["id"]
    
    # Your logic here
    user = await db.find_one(...)
    if not user:
        raise NotFoundError(f"User {user_id} not found")
    
    return Response(status=200, body=user)

async def create_user(request, context):
    data = await request.json()
    user = await db.create(...)
    return Response(status=201, body=user)

# Create blueprint from routes
routes = [
    Route(method=HttpMethod.GET, path="/users/<id>", handler=get_user),
    Route(method=HttpMethod.POST, path="/users", handler=create_user),
]

blueprint = create_blueprint(routes, name="api", url_prefix="/api/v1")
app.register_blueprint(blueprint)
```

### Option 2: Convert Individual Handlers

```python
from flask import Flask
from superfunctions_flask import to_flask_handler
from superfunctions.http import Response

app = Flask(__name__)

async def get_user(request, context):
    return Response(status=200, body={"id": context.params["id"]})

@app.route("/users/<id>")
def route(id):
    handler = to_flask_handler(get_user)
    return handler(id=id)
```

## Features

- ✅ Automatic request/response conversion
- ✅ HTTP error handling
- ✅ Path parameters
- ✅ Query parameters
- ✅ Headers
- ✅ JSON body parsing
- ✅ Blueprint support

## Benefits

Write framework-agnostic handlers that work across:
- Flask
- FastAPI (with `superfunctions-fastapi`)
- Django (with `superfunctions-django`)

## Example with authfn

```python
from flask import Flask
from superfunctions_flask import create_blueprint
from superfunctions.http import Route, HttpMethod, Response, UnauthorizedError
from authfn import create_authfn, AuthFnConfig

app = Flask(__name__)
auth = create_authfn(AuthFnConfig(database=adapter))

async def get_protected_resource(request, context):
    # Authenticate using authfn
    auth_header = context.headers.get("authorization")
    if not auth_header:
        raise UnauthorizedError("Missing authorization header")
    
    session = await auth.provider.authenticate(request)
    if not session:
        raise UnauthorizedError("Invalid credentials")
    
    return Response(status=200, body={"message": "Protected resource", "user": session.keyId})

routes = [
    Route(method=HttpMethod.GET, path="/protected", handler=get_protected_resource),
]

blueprint = create_blueprint(routes)
app.register_blueprint(blueprint)
```

## License

MIT

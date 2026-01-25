# superfunctions-fastapi

FastAPI adapter for `superfunctions.http`

**Location:** `packages/python-fastapi/`  
**Package:** `superfunctions-fastapi`  
**Import:** `from superfunctions_fastapi import create_router`

## Installation

```bash
pip install superfunctions-fastapi
```

## Usage

### Option 1: Create Router from Routes

```python
from fastapi import FastAPI
from superfunctions.http import Route, HttpMethod, Response, NotFoundError
from superfunctions_fastapi import create_router

app = FastAPI()

# Define handlers using superfunctions abstractions
async def get_user(request, context):
    user_id = context.params["id"]
    
    # Your logic here
    user = await db.find_one(...)
    if not user:
        raise NotFoundError(f"User {user_id} not found")
    
    return Response(status=200, body=user)

async def create_user(request, context):
    data = await context.json()
    user = await db.create(...)
    return Response(status=201, body=user)

# Create router from routes
routes = [
    Route(method=HttpMethod.GET, path="/users/{id}", handler=get_user),
    Route(method=HttpMethod.POST, path="/users", handler=create_user),
]

router = create_router(routes, prefix="/api/v1", tags=["users"])
app.include_router(router)
```

### Option 2: Convert Individual Handlers

```python
from fastapi import FastAPI, Request
from superfunctions_fastapi import to_fastapi_handler
from superfunctions.http import Response

app = FastAPI()

async def get_user(request, context):
    return Response(status=200, body={"id": context.params["id"]})

@app.get("/users/{id}")
async def route(request: Request, id: str):
    handler = to_fastapi_handler(get_user)
    return await handler(request, id=id)
```

## Features

- ✅ Automatic request/response conversion
- ✅ HTTP error handling
- ✅ Path parameters
- ✅ Query parameters
- ✅ Headers
- ✅ JSON body parsing
- ✅ OpenAPI documentation support

## Benefits

Write framework-agnostic handlers that work across:
- FastAPI
- Flask (with `superfunctions-flask`)
- Django (with `superfunctions-django`)

## Example with authfn

```python
from fastapi import FastAPI, Depends
from superfunctions_fastapi import create_router
from superfunctions.http import Route, HttpMethod, Response, UnauthorizedError
from authfn import create_authfn, AuthFnConfig

app = FastAPI()
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

router = create_router(routes)
app.include_router(router)
```

## License

MIT

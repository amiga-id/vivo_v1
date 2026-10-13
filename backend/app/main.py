from asyncio import timeout
from contextlib import asynccontextmanager
from datetime import datetime
from os.path import join
from pathlib import Path
from time import time

from fastapi import (
    FastAPI,
    HTTPException,
    Request,
    status,
)
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (
    HTMLResponse,
    JSONResponse,
)
from fastapi.templating import Jinja2Templates

from app.api.main import router
from app.core.config import settings
from app.core.db import (
    SessionLocal,
    init_db,
)
from app.schemas.health import HealthResponse
from app.schemas.response import ApiResponse, ErrorDetails
from app.services.health import check_postgres_health

# safety check to prevent obscure runtime errors later
env_vars: dict[str, str | None] = {
    "AWS_REGION": settings.AWS_REGION,
    "AWS_ACCESS_KEY_ID": settings.AWS_ACCESS_KEY_ID,
    "AWS_SECRET_ACCESS_KEY": settings.AWS_SECRET_ACCESS_KEY,
    "AWS_BEARER_TOKEN_BEDROCK": settings.AWS_BEARER_TOKEN_BEDROCK,
    "AWS_KNOWLEDGE_BASE_ID": settings.AWS_KNOWLEDGE_BASE_ID,
    "AWS_KNOWLEDGE_BASE_MODEL_ARN": settings.AWS_KNOWLEDGE_BASE_MODEL_ARN,
}

for key, val in env_vars.items():
    if not val:
        raise RuntimeError(f"{key} is missing from the environment or .env file.")

base = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=join(base, "templates"))
state = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.APP_INIT:
        print(" ▕  Initializing database")  # noqa: T201

        try:
            session = SessionLocal()
            await init_db(session=session)
        except Exception as ex:
            print(f"Error initializing database: {ex}")  # noqa: T201
        finally:
            await session.close()

    state["start"] = time()
    yield
    state.clear()


def _get_uptime() -> int | str:
    uptime = time() - state.get("start", time())

    days, rem = divmod(uptime, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, seconds = divmod(rem, 60)

    return f"{int(days)}d {int(hours)}h {int(minutes)}m {int(seconds)}s"


app = FastAPI(
    title=settings.APP_NAME,
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
    openapi_url="/openapi.json" if settings.is_development else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.APP_FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers_to_health(request: Request, call_next):
    response = await call_next(request)

    if "health" in request.url.path or "metrics" in request.url.path:
        response.headers["Cache-Control"] = (
            "no-store, no-cache, must-revalidate, max-age=0"
        )
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

    return response


@app.exception_handler(RequestValidationError)
async def custom_validation_exception_handler(
    request: Request, exc: RequestValidationError
):
    details = []
    for error in exc.errors():
        details.append(
            {
                "field": " -> ".join(str(loc) for loc in error["loc"] if loc != "body"),
                "error": error["msg"],
                "value": error.get("input"),
            }
        )

    error = (
        exc
        if isinstance(exc, ErrorDetails)
        else ErrorDetails(
            code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            message="Validation error",
            details=details,
        )
    )

    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=jsonable_encoder(
            ApiResponse[None](success=False, error=error), exclude_none=True
        ),
    )


@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    error = (
        exc.detail
        if isinstance(exc.detail, ErrorDetails)
        else ErrorDetails(
            code=exc.status_code,
            message=exc.detail,
        )
    )

    return JSONResponse(
        status_code=exc.status_code,
        content=jsonable_encoder(
            ApiResponse[None](success=False, error=error), exclude_none=True
        ),
        headers=exc.headers,
    )


@app.get("/", tags=["Root"], include_in_schema=False, response_class=HTMLResponse)
async def home(request: Request):
    host = request.url.hostname
    port = request.url.port
    url = request.base_url

    healthy = await check_postgres_health()
    health = HealthResponse(
        status="pass" if healthy else "fail",
        database="online" if healthy else "offline",
    )

    context: dict[str] = {
        "host": host,
        "port": port,
        "url": str(url),
        "start": state.get("start"),
        "uptime": _get_uptime(),
        "format_date": lambda d: (
            datetime.fromtimestamp(d).date() if d is not None else ""
        ),
        "health": health,
        "mode": "demo" if settings.APP_DEMO else "",
    }

    return templates.TemplateResponse(
        request,
        name="index.html",
        context=context,
    )


@app.get(
    "/health",
    tags=["Root"],
    status_code=status.HTTP_200_OK,
    response_model=HealthResponse,
    response_model_exclude_none=True,
)
async def health():
    try:
        async with timeout(2.0):
            healthy = await check_postgres_health()
    except TimeoutError:
        healthy = False

    response = HealthResponse(
        status="pass" if healthy else "fail",
        database="online" if healthy else "offline",
    )
    status_code = status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE

    return JSONResponse(status_code=status_code, content=response.model_dump())


app.include_router(router, prefix="/api")

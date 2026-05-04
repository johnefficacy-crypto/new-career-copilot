"from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timezone

app = FastAPI(title=\"Career Copilot API\")
api = APIRouter(prefix=\"/api\")


class Health(BaseModel):
    status: str
    service: str
    ts: str


@api.get(\"/health\", response_model=Health)
async def health() -> Health:
    return Health(
        status=\"ok\",
        service=\"career-copilot\",
        ts=datetime.now(timezone.utc).isoformat(),
    )


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[\"*\"],
    allow_credentials=True,
    allow_methods=[\"*\"],
    allow_headers=[\"*\"],
)
"
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import router as auth_router
from .config import get_settings
from . import db as db_mod
from .routes.keys import router as keys_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await db_mod.close_pool()


app = FastAPI(title="LiteLLM Key Manager", version="1.0.0", lifespan=lifespan)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(keys_router)

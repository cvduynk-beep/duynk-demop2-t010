from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import router
from src.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    print(f"🚀 Starting {settings.app_name} at Vinhomes Ocean Park in {settings.app_env} mode")
    yield
    print("🛑 Shutting down VinStay AI Agent...")


app = FastAPI(
    title="VinStay AI Matchmaker Copilot",
    description="Hệ điều hành Cho thuê & Vận hành Căn hộ tại Vinhomes Ocean Park (LangGraph Engine)",
    version="2.0.0",
    lifespan=lifespan,
)

settings = get_settings()
cors_origins = [orig.strip() for orig in settings.cors_origins.split(",") if orig.strip()]
if "http://localhost:3001" not in cors_origins:
    cors_origins.append("http://localhost:3001")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "app": "VinStay AI Matchmaker Copilot",
        "env": settings.app_env,
        "pilot_area": "Vinhomes Ocean Park (The Sapphire 1 & 2)",
    }

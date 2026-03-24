"""
SignVerify Backend – FastAPI Application Entry Point

Initializes FastAPI, sets up CORS, creates database tables on startup,
and includes routers for Flow 1 (Auth, Users).
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.routers import auth, users, signing, ocr, anchors, search
from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables (in a production app, use Alembic migrations instead)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Cleanup on shutdown
    await engine.dispose()


app = FastAPI(
    title="SignVerify API",
    description="Backend for cryptographic document signing and verification",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow React Native app to connect (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)

# Include Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(signing.router)
app.include_router(ocr.router)
app.include_router(anchors.router)
app.include_router(search.router)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


@app.get("/health")
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "service": "signverify"}


if __name__ == "__main__":
    import uvicorn
    # Make sure to run with uvicorn main:app --reload
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

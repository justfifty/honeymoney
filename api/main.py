"""
HoneyMoney FastAPI - Main Application Entry Point
Zero-cost, local-first, secure by default.
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.database import init_db
from app.routers import auth, users, accounts, transactions, budgets, goals, chat

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise DB on startup."""
    await init_db()
    yield

app = FastAPI(
    title="HoneyMoney API",
    description="AI-powered money management — Happy Wife, Happy Life 🍯",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",        # Swagger UI at /docs
    redoc_url="/redoc",
)

# ─── CORS ────────────────────────────────────────────────────────────────────
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ─────────────────────────────────────────────────────────────────
app.include_router(auth.router,         prefix="/api/auth",         tags=["Auth"])
app.include_router(users.router,        prefix="/api/users",        tags=["Users"])
app.include_router(accounts.router,     prefix="/api/accounts",     tags=["Accounts"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["Transactions"])
app.include_router(budgets.router,      prefix="/api/budgets",      tags=["Budgets"])
app.include_router(goals.router,        prefix="/api/goals",        tags=["Goals"])
app.include_router(chat.router,         prefix="/api/chat",         tags=["AI Honey"])

@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "service": "HoneyMoney API 🍯"}

@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}

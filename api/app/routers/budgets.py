"""Budgets Router"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models import Budget, User
from app.security import get_current_user

router = APIRouter()

class BudgetCreate(BaseModel):
    category:      str
    monthly_limit: float
    month:         str   # YYYY-MM

@router.get("/")
async def list_budgets(month: str = None, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    q = select(Budget).where(Budget.user_id == current_user.id)
    if month:
        q = q.where(Budget.month == month)
    result = await db.execute(q)
    return result.scalars().all()

@router.post("/", status_code=201)
async def upsert_budget(req: BudgetCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Budget).where(Budget.user_id == current_user.id, Budget.category == req.category, Budget.month == req.month)
    )
    budget = result.scalar_one_or_none()
    if budget:
        budget.monthly_limit = req.monthly_limit
    else:
        budget = Budget(**req.model_dump(), user_id=current_user.id)
        db.add(budget)
    await db.flush()
    return budget

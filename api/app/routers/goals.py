"""Goals Router"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import Goal, User
from app.security import get_current_user

router = APIRouter()

class GoalCreate(BaseModel):
    title:         str
    target_amount: float
    saved_amount:  float = 0.0
    target_date:   Optional[str] = None
    emoji:         str = "🎯"

class GoalUpdate(BaseModel):
    saved_amount: float

@router.get("/")
async def list_goals(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Goal).where(Goal.user_id == current_user.id))
    return result.scalars().all()

@router.post("/", status_code=201)
async def create_goal(req: GoalCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    goal = Goal(**req.model_dump(), user_id=current_user.id)
    db.add(goal)
    await db.flush()
    return goal

@router.patch("/{goal_id}")
async def update_goal_savings(goal_id: int, req: GoalUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Goal).where(Goal.id == goal_id, Goal.user_id == current_user.id))
    goal = result.scalar_one_or_none()
    if goal:
        goal.saved_amount = req.saved_amount
        await db.flush()
    return goal

@router.delete("/{goal_id}", status_code=204)
async def delete_goal(goal_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Goal).where(Goal.id == goal_id, Goal.user_id == current_user.id))
    goal = result.scalar_one_or_none()
    if goal:
        await db.delete(goal)

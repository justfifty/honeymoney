"""Accounts Router"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models import Account, User
from app.security import get_current_user

router = APIRouter()

class AccountCreate(BaseModel):
    name:     str
    type:     str       # bank | ewallet | cash | investment
    balance:  float = 0.0
    currency: str   = "MYR"

@router.get("/")
async def list_accounts(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Account).where(Account.user_id == current_user.id))
    return result.scalars().all()

@router.post("/", status_code=201)
async def create_account(req: AccountCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    acc = Account(**req.model_dump(), user_id=current_user.id)
    db.add(acc)
    await db.flush()
    return acc

@router.delete("/{account_id}", status_code=204)
async def delete_account(account_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Account).where(Account.id == account_id, Account.user_id == current_user.id))
    acc = result.scalar_one_or_none()
    if acc:
        await db.delete(acc)

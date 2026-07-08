"""Transactions Router"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import Transaction
from app.security import get_current_user
from app.models import User

router = APIRouter()

class TransactionCreate(BaseModel):
    account_id:  int
    amount:      float
    type:        str        # income | expense | transfer
    category:    str = "Uncategorised"
    description: Optional[str] = None
    date:        str        # YYYY-MM-DD

@router.get("/")
async def list_transactions(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == current_user.id)
        .order_by(desc(Transaction.date))
        .limit(limit)
    )
    return result.scalars().all()

@router.post("/", status_code=201)
async def create_transaction(
    req: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tx = Transaction(**req.model_dump(), user_id=current_user.id)
    db.add(tx)
    await db.flush()
    return tx

@router.delete("/{tx_id}", status_code=204)
async def delete_transaction(
    tx_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Transaction).where(Transaction.id == tx_id, Transaction.user_id == current_user.id)
    )
    tx = result.scalar_one_or_none()
    if tx:
        await db.delete(tx)

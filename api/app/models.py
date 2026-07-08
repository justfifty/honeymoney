"""
SQLAlchemy ORM Models for HoneyMoney
"""
from datetime import datetime
from sqlalchemy import Integer, String, Float, Text, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class Household(Base):
    __tablename__ = "households"
    id:         Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    name:       Mapped[str]      = mapped_column(String(100), nullable=False)
    type:       Mapped[str]      = mapped_column(String(20), default="family")  # family|sme|corporate
    currency:   Mapped[str]      = mapped_column(String(10), default="MYR")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    users:      Mapped[list["User"]] = relationship("User", back_populates="household")

class User(Base):
    __tablename__ = "users"
    id:           Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    email:        Mapped[str]      = mapped_column(String(255), unique=True, nullable=False, index=True)
    name:         Mapped[str]      = mapped_column(String(100), nullable=False)
    password:     Mapped[str]      = mapped_column(String(255), nullable=False)  # bcrypt
    role:         Mapped[str]      = mapped_column(String(20), default="owner")
    household_id: Mapped[int|None] = mapped_column(Integer, ForeignKey("households.id"), nullable=True)
    created_at:   Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    household:    Mapped["Household|None"]  = relationship("Household", back_populates="users")
    accounts:     Mapped[list["Account"]]   = relationship("Account", back_populates="owner")
    goals:        Mapped[list["Goal"]]      = relationship("Goal", back_populates="owner")

class Account(Base):
    __tablename__ = "accounts"
    id:         Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    user_id:    Mapped[int]      = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    name:       Mapped[str]      = mapped_column(String(100), nullable=False)
    type:       Mapped[str]      = mapped_column(String(30), nullable=False)  # bank|ewallet|cash|investment
    balance:    Mapped[float]    = mapped_column(Float, default=0.0)
    currency:   Mapped[str]      = mapped_column(String(10), default="MYR")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    owner:        Mapped["User"]            = relationship("User", back_populates="accounts")
    transactions: Mapped[list["Transaction"]] = relationship("Transaction", back_populates="account")

class Transaction(Base):
    __tablename__ = "transactions"
    id:           Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    account_id:   Mapped[int]      = mapped_column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"))
    user_id:      Mapped[int]      = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    amount:       Mapped[float]    = mapped_column(Float, nullable=False)
    type:         Mapped[str]      = mapped_column(String(20), nullable=False)  # income|expense|transfer
    category:     Mapped[str]      = mapped_column(String(50), default="Uncategorised")
    ai_category:  Mapped[str|None] = mapped_column(String(50), nullable=True)
    description:  Mapped[str|None] = mapped_column(Text, nullable=True)
    date:         Mapped[str]      = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    created_at:   Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    account: Mapped["Account"] = relationship("Account", back_populates="transactions")

class Budget(Base):
    __tablename__ = "budgets"
    id:            Mapped[int]   = mapped_column(Integer, primary_key=True, index=True)
    user_id:       Mapped[int]   = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    category:      Mapped[str]   = mapped_column(String(50), nullable=False)
    monthly_limit: Mapped[float] = mapped_column(Float, nullable=False)
    month:         Mapped[str]   = mapped_column(String(7), nullable=False)  # YYYY-MM
    created_at:    Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Goal(Base):
    __tablename__ = "goals"
    id:            Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    user_id:       Mapped[int]      = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    title:         Mapped[str]      = mapped_column(String(100), nullable=False)
    target_amount: Mapped[float]    = mapped_column(Float, nullable=False)
    saved_amount:  Mapped[float]    = mapped_column(Float, default=0.0)
    target_date:   Mapped[str|None] = mapped_column(String(10), nullable=True)
    emoji:         Mapped[str]      = mapped_column(String(10), default="🎯")
    created_at:    Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    owner: Mapped["User"] = relationship("User", back_populates="goals")

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id:         Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    user_id:    Mapped[int]      = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    role:       Mapped[str]      = mapped_column(String(20), nullable=False)   # user|assistant
    content:    Mapped[str]      = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

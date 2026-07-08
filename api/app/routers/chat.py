"""
AI "Honey" Chatbot Router — Powered by Google Gemini Free Tier
Context-aware: reads user's recent transactions to give personal advice.
"""
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from app.database import get_db
from app.models import User, Transaction, ChatMessage
from app.security import get_current_user

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

router = APIRouter()

HONEY_SYSTEM_PROMPT = """
You are Honey, a friendly and smart AI money coach inside HoneyMoney app.
Your personality: warm, encouraging, practical — like a financially savvy best friend.
You speak in a conversational, jargon-free way.
You always ground your advice in the user's actual transaction data when available.
You never share or reference other users' data.
If you don't know something, you say so honestly.
Keep responses concise (under 200 words) unless the user asks for detail.
Currency is MYR (Malaysian Ringgit) by default.
"""

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str

@router.post("/", response_model=ChatResponse)
async def chat_with_honey(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "CHANGE_ME":
        raise HTTPException(
            status_code=503,
            detail="AI service not configured. Add GEMINI_API_KEY to your .env file."
        )

    # Fetch last 20 transactions for context
    result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == current_user.id)
        .order_by(desc(Transaction.date))
        .limit(20)
    )
    recent = result.scalars().all()

    # Fetch last 10 chat messages for conversation continuity
    history_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == current_user.id)
        .order_by(desc(ChatMessage.created_at))
        .limit(10)
    )
    history = list(reversed(history_result.scalars().all()))

    # Build context
    tx_summary = "\n".join(
        f"- {t.date}: {t.type} RM {abs(t.amount):.2f} [{t.category}] {t.description or ''}"
        for t in recent
    ) or "No transactions recorded yet."

    context = f"""
User: {current_user.name}
Recent transactions:
{tx_summary}
"""

    if not GEMINI_AVAILABLE:
        raise HTTPException(status_code=503, detail="google-generativeai package not installed.")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",   # free tier
        system_instruction=HONEY_SYSTEM_PROMPT + "\n\nUser financial context:\n" + context,
    )

    # Build chat history
    chat_history = []
    for msg in history:
        chat_history.append({
            "role": "user" if msg.role == "user" else "model",
            "parts": [msg.content]
        })

    chat = model.start_chat(history=chat_history)
    response = chat.send_message(req.message)
    reply = response.text

    # Persist messages
    db.add(ChatMessage(user_id=current_user.id, role="user", content=req.message))
    db.add(ChatMessage(user_id=current_user.id, role="assistant", content=reply))

    return ChatResponse(reply=reply)

@router.get("/history")
async def get_chat_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
):
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == current_user.id)
        .order_by(ChatMessage.created_at)
        .limit(limit)
    )
    messages = result.scalars().all()
    return [{"role": m.role, "content": m.content, "time": m.created_at} for m in messages]

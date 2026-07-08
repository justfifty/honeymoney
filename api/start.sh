#!/usr/bin/env bash
# Start HoneyMoney backend (run from /api folder)
# Usage: bash start.sh

set -e
cd "$(dirname "$0")"

if [ ! -f ".env" ]; then
  echo "⚠️  No .env found. Copy .env.example to .env and fill in values."
  exit 1
fi

if [ ! -d ".venv" ]; then
  echo "📦 Creating virtual environment..."
  python -m venv .venv
fi

echo "📦 Installing dependencies..."
.venv/bin/pip install -r requirements.txt -q

echo "🍯 Starting HoneyMoney API on http://localhost:8000"
echo "📖 API docs → http://localhost:8000/docs"
.venv/bin/uvicorn main:app --reload --host 127.0.0.1 --port 8000

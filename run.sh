#!/bin/bash
set -e

echo "========================================="
echo "  LeadSprout — B2B Lead Enrichment Tool"
echo "========================================="
echo ""

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Check prerequisites
echo "[1/4] Checking prerequisites..."

if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js not found. Install via: nvm install --lts"
  exit 1
fi
echo "  Node.js $(node -v) ✓"

if ! command -v psql &> /dev/null; then
  echo "  WARNING: PostgreSQL CLI not found. Make sure PostgreSQL is running."
else
  echo "  PostgreSQL ✓"
fi

if ! command -v redis-cli &> /dev/null; then
  echo "  WARNING: Redis CLI not found. Make sure Redis is running."
else
  echo "  Redis ✓"
fi

# Setup env
echo ""
echo "[2/4] Setting up environment..."
cd "$(dirname "$0")"
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "  Created backend/.env — edit with your database credentials"
fi

# Install dependencies
echo ""
echo "[3/4] Installing dependencies..."
cd backend && npm install --silent && cd ..
cd frontend && npm install --silent && cd ..

# Start services
echo ""
echo "[4/4] Starting services..."
echo ""
echo "Starting backend server on http://localhost:3001"
echo "Starting worker process..."
echo "Starting frontend on http://localhost:5173"
echo ""

# Start backend + worker in background, frontend in foreground
cd backend
node server.js &
SERVER_PID=$!
node workers/leadWorker.js &
WORKER_PID=$!
cd ..

cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "========================================="
echo "  All services running!"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:3001"
echo "========================================="
echo ""
echo "Press Ctrl+C to stop all services"

# Cleanup on exit
trap "kill $SERVER_PID $WORKER_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait

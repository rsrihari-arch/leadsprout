FROM node:20-slim

WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Install frontend dependencies and build
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npx vite build

# Copy backend source
COPY backend/ ./backend/

EXPOSE 3001

WORKDIR /app/backend
CMD ["node", "server.js"]

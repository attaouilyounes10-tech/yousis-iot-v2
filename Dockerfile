# ============================================================
# YOUXIS IOT v2 — Monorepo Full-Stack pour Railway
# Multi-stage : build frontend (Vite) → serve via Express + SQLite + WebSocket
# ============================================================

# ---- Stage 1: Build Frontend ----
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

# Install deps (avec devDependencies pour vite build)
COPY frontend/package*.json ./
RUN npm ci

# Copy arduino folder for ?raw import in Montage.jsx. L'import est
# « ../../../arduino/... » depuis src/pages/ → résout vers /app/arduino/
# (3 niveaux au-dessus de /app/frontend). On copie donc à la racine /app,
# pas dans /app/frontend, sans quoi l'import ?raw échoue au build.
COPY arduino/ /app/arduino/

# Copy source and build
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Backend + Static Server ----
FROM node:22-alpine

WORKDIR /app

# Install backend deps (production only)
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy backend source
COPY backend/src/ ./backend/src/
COPY backend/db/ ./backend/db/

# Copy built frontend to backend/public (served by Express static)
COPY --from=frontend-builder /app/frontend/dist ./backend/public

# Create data directory for SQLite (Railway volume mounts here)
RUN mkdir -p /data

# Expose port (Railway sets PORT env var)
EXPOSE 3001

# Environment (overridden by Railway Dashboard)
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/data/yousis.db
# ALLOWED_ORIGINS=* (or set specific origin in Railway)
# JWT_SECRET= (set in Railway Dashboard)

# Start server
CMD ["node", "backend/src/server.js"]
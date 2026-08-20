# ============================================================
# YOUXIS IOT — Backend Docker (Railway / Render / Fly.io / VPS)
# Node 20 (LTS), SQLite natif (node:sqlite), pas de compilation native
# ============================================================
FROM node:20-alpine

# Dossier de travail
WORKDIR /app

# Copie package.json et installe les deps (cache layer)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copie le code source
COPY src/ ./src/
COPY db/ ./db/

# Crée le dossier data pour SQLite (volume persistant monté sur /data par Railway)
RUN mkdir -p /data

# Expose le port
EXPOSE 3001

# Variables d'env par défaut (surchargées par Railway Dashboard)
ENV PORT=3001
ENV DB_PATH=/data/yousis.db
ENV NODE_ENV=production

# Commande de démarrage
CMD ["node", "src/server.js"]
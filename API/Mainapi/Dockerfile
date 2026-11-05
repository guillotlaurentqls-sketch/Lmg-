FROM node:22-bookworm-slim
WORKDIR /app
# Outils de compilation au cas où better-sqlite3 n'aurait pas de binaire précompilé.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
ENV NODE_ENV=production PORT=25565
EXPOSE 25565
CMD ["node", "server.js"]

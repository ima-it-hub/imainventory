FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    g++ \
    libodbc2 \
    make \
    odbc-postgresql \
    python3 \
    unixodbc \
    unixodbc-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev
RUN node -e "require('odbc')"

COPY --chown=node:node server.js ./
COPY --chown=node:node src ./src

ENV NODE_ENV=production
USER node

CMD ["node", "server.js"]
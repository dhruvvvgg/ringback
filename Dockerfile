# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates tar && rm -rf /var/lib/apt/lists/*
ENV ONNXRUNTIME_NODE_INSTALL=skip
COPY package*.json .npmrc ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/llm/package.json packages/llm/package.json
RUN --mount=type=secret,id=proxy_ca,required=false \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci
COPY . .
RUN --mount=type=secret,id=proxy_ca,required=false \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; export CURL_CA_BUNDLE=/run/secrets/proxy_ca; fi; npm run setup && rm -f .env.local && npm run build
ENV NODE_ENV=production PORT=10000 EMBEDDING_PROVIDER=keyword
EXPOSE 10000
CMD ["npm", "start"]

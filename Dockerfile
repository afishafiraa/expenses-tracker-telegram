# Stage 1: Build TypeScript
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Production
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist/ ./dist/
EXPOSE 3333
CMD ["node", "dist/index.js"]

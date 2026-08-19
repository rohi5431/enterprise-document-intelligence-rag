# Multi-stage build for optimal image size
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies to build the app
RUN npm install

# Copy application source
COPY . .

# Run production build (Vite client bundling + Esbuild backend bundling)
RUN npm run build

# Reinstall production-only dependencies
RUN rm -rf node_modules && npm install --omit=dev

# --- Production runner image ---
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy compiled files and required packages
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/db.json ./db.json

# Expose server ingress port
EXPOSE 3000

# Directly launch the compiled CJS server bundle
CMD ["node", "dist/server.cjs"]

# Multi-stage build for optimal image size
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies including devDependencies to build the app
RUN npm ci

# Copy application source
COPY . .

# Run production build (Vite client bundling + Esbuild backend bundling)
RUN npm run build

# Remove development dependencies to keep production image light
RUN rm -rf node_modules && npm ci --only=production

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

# Run the single CJS production server bundle
CMD ["npm", "start"]

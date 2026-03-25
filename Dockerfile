FROM node:20-alpine

# Chromium dependencies for Puppeteer on Alpine
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Puppeteer to use system Chromium (skip the 200MB download)
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy all backend source directories
COPY backend/server.js backend/supabase.js ./
COPY backend/routes/ ./routes/
COPY backend/lib/ ./lib/
COPY backend/middleware/ ./middleware/
COPY backend/mcp/ ./mcp/


EXPOSE 3001

CMD ["node", "server.js"]

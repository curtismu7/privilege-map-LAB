# Local Docker form (OrbStack). Mock only: no tenant, no credentials, no outbound calls.
# The server has no runtime dependencies: Vite is only needed to build the page.
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production \
    BIND_HOST=0.0.0.0 \
    PORT=5301 \
    DATA_ROOT=/tmp/privilege-map-data
COPY package.json server.js ./
COPY lib ./lib
COPY diagrams ./diagrams
COPY content ./content
# lib/diagrams.js reads the feature list to know which diagrams exist.
COPY src/data/features.json ./src/data/features.json
COPY docs/talk-track.md ./docs/talk-track.md
COPY --from=build /app/dist ./dist
USER node
EXPOSE 5301
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:5301/api/health >/dev/null || exit 1
CMD ["node", "server.js"]

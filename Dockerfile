# Debian slim (glibc) rather than Alpine: @resvg/resvg-js ships prebuilt glibc binaries.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src

USER node
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# Run tsx directly (not via npm) so SIGTERM reaches node and `docker stop` is fast.
CMD ["node_modules/.bin/tsx", "src/server.ts"]

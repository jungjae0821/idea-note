FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --include=dev --no-audit --no-fund

COPY . .
RUN npm run build

EXPOSE 8787

CMD ["node", "--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--local", "--persist-to", ".wrangler/state", "--ip", "0.0.0.0", "--port", "8787", "--inspector-port", "0"]

FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --include=dev --no-audit --no-fund

COPY . .
RUN npm run build

# 수업 배포 서버(Spring 기준)는 컨테이너의 8080 포트를 본다. SERVER_PORT/PORT가 주어지면 그 값을 쓴다.
EXPOSE 8080

CMD ["sh", "-c", "exec node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to .wrangler/state --ip 0.0.0.0 --port \"${SERVER_PORT:-${PORT:-8080}}\" --inspector-port 0"]

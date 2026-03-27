FROM node:20-slim AS base

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Dependencies
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

# Source
COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
COPY bin/ ./bin/

# Build
RUN pnpm build

# --- Production stage ---
FROM node:20-slim AS production

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=base /app/package.json /app/pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

COPY --from=base /app/dist/ ./dist/
COPY --from=base /app/bin/ ./bin/

# Install CLI tools that ATELIER orchestrates
# Users should mount their own CLI configs
RUN npm install -g @anthropic-ai/claude-code 2>/dev/null || true

# Git for worktree support
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

ENTRYPOINT ["node", "bin/atelier.js"]

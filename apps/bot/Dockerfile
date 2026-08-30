FROM node:26.7-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install --global corepack@latest
RUN corepack enable pnpm

LABEL fly_launch_runtime="NestJS"

WORKDIR /app
# All workspace manifests + lockfile so `pnpm install --frozen-lockfile` can
# link the workspaces. scripts/ is needed by the prepare hook.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/bot/package.json ./apps/bot/package.json
COPY apps/cli/package.json ./apps/cli/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY scripts ./scripts

FROM base AS prod-deps
ENV NODE_ENV="production"
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
COPY apps/bot ./apps/bot
COPY apps/cli ./apps/cli
COPY packages/shared ./packages/shared
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build:all

FROM node:26.7-slim
WORKDIR /app
ENV NODE_ENV="production"

COPY package.json ./
COPY apps/bot/package.json ./apps/bot/package.json
COPY apps/bot/instrumentation.ts ./apps/bot/instrumentation.ts
COPY packages/shared/package.json ./packages/shared/package.json
# Workspace links live per-consumer: bot's deps + the @ulti-project/shared
# symlink are in apps/bot/node_modules, backed by the pruned virtual store at
# node_modules/.pnpm. Both must ship for resolution to work in the container.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/bot/node_modules ./apps/bot/node_modules
COPY --from=prod-deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /app/apps/bot/dist ./apps/bot/dist
# Native-TS package: runtime ships the erasable source; the workspace symlink
# in apps/bot/node_modules resolves @ulti-project/shared to this directory.
COPY --from=build /app/packages/shared/src ./packages/shared/src

EXPOSE 3000
CMD [ "node", "--import", "./apps/bot/instrumentation.ts", "apps/bot/dist/main.js" ]
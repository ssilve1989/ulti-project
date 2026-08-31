# Build context MUST be the repository root — this Dockerfile needs the whole
# pnpm workspace (root manifest, pnpm-lock.yaml, pnpm-workspace.yaml, every
# package). Invoke it as one of:
#   flyctl deploy --config ./apps/bot/fly.toml --dockerfile ./apps/bot/Dockerfile   # from repo root
#   docker build -f apps/bot/Dockerfile .                                           # from repo root
#   mise run deploy:bot
#
# Layout follows the pnpm "build multiple images in a monorepo" recipe
# (https://pnpm.io/docker): install + build the whole workspace once, then
# `pnpm deploy` a self-contained, symlink-free bundle for the bot alone.

FROM node:26.7-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# corepack is no longer bundled with Node 26; install it, then activate the
# pnpm version pinned in the root package.json "packageManager" field.
RUN npm install --global corepack@latest && corepack enable pnpm
WORKDIR /usr/src/app

FROM base AS build
COPY . .
# Fail early with a clear message if the build context was not the repo root.
RUN test -f pnpm-workspace.yaml && test -d apps/bot \
  || { echo "ERROR: Docker build context must be the repository root"; exit 1; }
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build:all
# Prune to a production bundle containing only the bot's own dist,
# @ulti-project/shared, and third-party prod dependencies. --legacy: this
# workspace does not opt into injected workspace packages.
RUN pnpm deploy --filter=@ulti-project/bot --prod --legacy /prod/bot

FROM node:26.7-slim AS runner
LABEL fly_launch_runtime="NestJS"
ENV NODE_ENV="production"
WORKDIR /prod/bot
COPY --from=build /prod/bot ./

EXPOSE 3000
CMD ["node", "--import", "./instrumentation.ts", "dist/main.js"]

# Build context MUST be the repository root — this Dockerfile needs the whole
# pnpm workspace (root manifest, pnpm-lock.yaml, pnpm-workspace.yaml, every
# package). Invoke it as one of:
#   flyctl deploy --config ./apps/bot/fly.toml --dockerfile ./apps/bot/Dockerfile   # from repo root
#   docker build -f apps/bot/Dockerfile .                                           # from repo root
#   mise run deploy:bot

FROM node:26.7-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# corepack is no longer bundled with Node 26; install it, then activate the
# pnpm version pinned in the root package.json "packageManager" field.
RUN npm install --global corepack@latest && corepack enable pnpm
WORKDIR /usr/src/app

# Compile the bot (and @ulti-project/shared, via the project-reference graph).
FROM base AS build
COPY . .
RUN test -f pnpm-workspace.yaml && test -d apps/bot \
  || { echo "ERROR: Docker build context must be the repository root"; exit 1; }
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build:all

# Production dependency tree, pruned to the bot + its workspace deps.
# `--filter @ulti-project/bot...` drops apps/cli's exclusive deps from the image.
FROM base AS prod-deps
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --prod --frozen-lockfile --filter "@ulti-project/bot..."

FROM node:26.7-slim AS runner
LABEL fly_launch_runtime="NestJS"
ENV NODE_ENV="production"
WORKDIR /usr/src/app
# pnpm's per-consumer layout: the bot resolves @ulti-project/shared through the
# symlink in apps/bot/node_modules (-> packages/shared); the .pnpm virtual store
# under the root node_modules backs every third-party resolution.
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=prod-deps /usr/src/app/apps/bot/node_modules ./apps/bot/node_modules
COPY --from=prod-deps /usr/src/app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prod-deps /usr/src/app/package.json ./package.json
COPY --from=prod-deps /usr/src/app/apps/bot/package.json ./apps/bot/package.json
COPY --from=prod-deps /usr/src/app/packages/shared/package.json ./packages/shared/package.json
# Bot: compiled output + the Sentry preload. @ulti-project/shared is native-TS —
# ship its erasable source; Node strips types at runtime via the exports "default"
# condition (dist holds only the .d.ts, used at build time).
COPY --from=build /usr/src/app/apps/bot/dist ./apps/bot/dist
COPY --from=build /usr/src/app/apps/bot/instrumentation.ts ./apps/bot/instrumentation.ts
COPY --from=build /usr/src/app/packages/shared/src ./packages/shared/src

EXPOSE 3000
CMD ["node", "--import", "./apps/bot/instrumentation.ts", "apps/bot/dist/main.js"]

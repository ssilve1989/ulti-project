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
# ca-certificates: sentry-cli is a Rust binary that verifies sentry.io's TLS
# cert against the OS trust store, which node:*-slim (Debian slim) omits. Node's
# own HTTP stack ships a bundled CA set, so only this stage — where sentry-cli
# runs — needs the package. Without it the upload fails with curl error 60
# ("unable to get local issuer certificate").
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY . .
RUN test -f pnpm-workspace.yaml && test -d apps/bot \
  || { echo "ERROR: Docker build context must be the repository root"; exit 1; }
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build:all
# Inject Sentry Debug IDs into apps/bot/dist and upload the maps here, so the
# injected .js is exactly what the image ships (a copy injected on the CI runner
# would be discarded by this rebuild). The `sentry_auth` secret is optional —
# builds without it (e.g. the PR "Test Build Docker Image" workflow) just skip.
RUN --mount=type=secret,id=sentry_auth \
  if [ -s /run/secrets/sentry_auth ]; then \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth)" \
      pnpm --filter @ulti-project/bot run sentry:sourcemaps; \
  else \
    echo "sentry_auth build secret absent — skipping Sentry sourcemap upload"; \
  fi

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
#
# Why this hand-assembled layout instead of `pnpm deploy` into one self-contained
# dir: @ulti-project/shared is native-TS — its package "exports" resolve to
# ./src/index.ts and Node strips the types at runtime. Node *refuses* to strip
# types for any .ts file whose realpath is under a node_modules directory
# (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), and there is no opt-in flag —
# nodejs/node#57215 was closed as not planned. `pnpm deploy` (and any bundler
# that vendors workspace deps) places shared's real files under
# node_modules/@ulti-project/shared, so the bot crashes on first import. Keeping
# packages/shared/ at its own top-level path, reached via the pnpm symlink whose
# realpath is NOT inside node_modules, is the only layout Node will run.
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=prod-deps /usr/src/app/apps/bot/node_modules ./apps/bot/node_modules
COPY --from=prod-deps /usr/src/app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prod-deps /usr/src/app/package.json ./package.json
COPY --from=prod-deps /usr/src/app/apps/bot/package.json ./apps/bot/package.json
COPY --from=prod-deps /usr/src/app/packages/shared/package.json ./packages/shared/package.json
# Bot: compiled output + the Sentry preload. packages/shared/src lands at its
# own top-level path (NOT under node_modules — see the type-stripping note
# above); dist/ there holds only the emitted .d.ts, used at build time.
COPY --from=build /usr/src/app/apps/bot/dist ./apps/bot/dist
COPY --from=build /usr/src/app/apps/bot/instrumentation.ts ./apps/bot/instrumentation.ts
COPY --from=build /usr/src/app/packages/shared/src ./packages/shared/src

EXPOSE 3000
CMD ["node", "--import", "./apps/bot/instrumentation.ts", "apps/bot/dist/main.js"]

ARG NODE_VERSION=22.15.1
# Switch to alpine instead of slim
FROM node:${NODE_VERSION}-alpine AS base  

LABEL fly_launch_runtime="NestJS"

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# Used to workaround issues where corepack doesn't know about the pnpm
# version we are using
ENV COREPACK_INTEGRITY_KEYS=0
RUN corepack enable

# Print the pnpm version
RUN pnpm --version

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
COPY packages/shared /app/packages/shared
COPY apps/discord-bot /app/apps/discord-bot
COPY scripts /app/scripts

WORKDIR /app

FROM base AS prod-deps

ENV NODE_ENV="production"
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
# Build shared package first
RUN pnpm --filter @ulti-project/shared build
# Build discord bot
RUN pnpm --filter @ulti-project/discord-bot build

FROM base

ENV FORCE_COLOR=1

COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps /app/packages/shared/node_modules /app/packages/shared/node_modules
COPY --from=prod-deps /app/apps/discord-bot/node_modules /app/apps/discord-bot/node_modules
COPY --from=build /app/packages/shared/dist /app/packages/shared/dist
COPY --from=build /app/apps/discord-bot/dist /app/apps/discord-bot/dist

WORKDIR /app/apps/discord-bot

EXPOSE 3000
CMD [ "node", "--import", "./instrumentation.mjs", "dist/main" ]

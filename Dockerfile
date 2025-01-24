ARG BUN_VERSION=1.2.4
FROM oven/bun:${BUN_VERSION}-alpine AS base

LABEL fly_launch_runtime="NestJS"

COPY package.json bun.lock tsconfig.json tsconfig.build.json /app/
COPY src /app/src
COPY scripts /app/scripts

WORKDIR /app

FROM base AS prod-deps
ENV NODE_ENV="production"
RUN --mount=type=cache,id=bun,target=/root/.bun bun install --frozen-lockfile --production

FROM base AS build
RUN --mount=type=cache,id=bun,target=/root/.bun bun install --frozen-lockfile
RUN bun run build

FROM base

ENV FORCE_COLOR=1

COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist

EXPOSE 3000
CMD [ "bun", "dist/main" ]

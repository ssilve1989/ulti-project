ARG NODE_VERSION=26
FROM node:${NODE_VERSION}-alpine AS base

LABEL fly_launch_runtime="NestJS"

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN wget -qO- https://get.pnpm.io/install.sh | PNPM_VERSION=10.32.1 ENV="$HOME/.shrc" SHELL="$(which sh)" sh -

WORKDIR /app

COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json instrumentation.mjs ./
# scripts/ needed by prepare hook in both prod-deps and build stages; exits cleanly without .git
COPY scripts ./scripts

FROM base AS prod-deps
ENV NODE_ENV="production"
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
COPY src ./src
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM node:${NODE_VERSION}-alpine
WORKDIR /app

COPY package.json instrumentation.mjs ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD [ "node", "--import", "./instrumentation.mjs", "dist/main" ]

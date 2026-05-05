FROM ghcr.io/jdx/mise AS base

LABEL fly_launch_runtime="NestJS"

ENV MISE_YES=1

WORKDIR /app

COPY mise.toml ./
RUN mise install node pnpm

COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json instrumentation.mjs ./
# scripts/ needed by prepare hook in both prod-deps and build stages; exits cleanly without .git
COPY scripts ./scripts

FROM base AS prod-deps
ENV NODE_ENV="production"
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
COPY src ./src
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM ghcr.io/jdx/mise
LABEL fly_launch_runtime="NestJS"

ENV MISE_YES=1

WORKDIR /app

COPY mise.toml ./
RUN mise install node pnpm

COPY package.json instrumentation.mjs ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["mise", "exec", "--", "node", "--import", "./instrumentation.mjs", "dist/main"]

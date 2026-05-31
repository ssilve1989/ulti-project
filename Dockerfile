FROM platformatic/node-caged:26-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install --global corepack@latest
RUN corepack enable pnpm

LABEL fly_launch_runtime="NestJS"

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.build.json instrumentation.ts ./
# scripts/ needed by prepare hook in both prod-deps and build stages; exits cleanly without .git
COPY scripts ./scripts

FROM base AS prod-deps
ENV NODE_ENV="production"
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
COPY src ./src
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM platformatic/node-caged:26-slim
WORKDIR /app

COPY package.json instrumentation.ts ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD [ "node", "--import", "./instrumentation.ts", "dist/main" ]

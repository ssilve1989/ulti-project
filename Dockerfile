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

COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json instrumentation.mjs /app/
COPY src /app/src
COPY scripts /app/scripts

WORKDIR /app

FROM base AS prod-deps

ENV NODE_ENV="production"
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM base

ENV FORCE_COLOR=1

COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist

EXPOSE 3000
CMD [ "node", "--import", "./instrumentation.mjs", "dist/main" ]

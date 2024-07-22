ARG NODE_VERSION=20.15.1
FROM node:${NODE_VERSION}-slim as base

LABEL fly_launch_runtime="NestJS"

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Print the pnpm version
RUN pnpm --version

COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json /app/
COPY src /app/src
COPY scripts /app/scripts

WORKDIR /app

FROM base as prod-deps

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
CMD [ "node", "dist/main" ]

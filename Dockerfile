ARG BUN_VERSION=1.3.2
FROM oven/bun:${BUN_VERSION}-alpine

LABEL fly_launch_runtime="NestJS"

WORKDIR /app

# Copy package files and source code
COPY package.json bun.lock tsconfig.json /app/
COPY src /app/src
COPY scripts /app/scripts
COPY instrumentation.ts /app/

# Install dependencies
ENV NODE_ENV="production"
RUN --mount=type=cache,id=bun,target=/root/.bun bun install --frozen-lockfile --production --ignore-scripts

EXPOSE 3000
CMD [ "bun", "-r", "./instrumentation.ts", "src/main.ts" ]

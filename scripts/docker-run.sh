#!/usr/bin/env bash
# Runs the image built by `pnpm docker:build` with the same dotenvx-decrypted
# environment that `pnpm start:dev` uses. Extra args are passed to `docker run`.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

IMAGE="${IMAGE:-ulti-project-bot:latest}"
# Same files, same precedence (first wins) as apps/bot's start:dev.
ENV_FILES=(apps/bot/.env.development .env)

# dotenvx decrypts on the host; forward each key by name so values never hit
# the command line. The DOTENV_PUBLIC_KEY* entries are dotenvx metadata.
env_flags=()
while IFS= read -r key; do
  env_flags+=(-e "$key")
done < <(grep -hoE '^[A-Za-z_][A-Za-z0-9_]*' "${ENV_FILES[@]}" | grep -v '^DOTENV_PUBLIC_KEY' | sort -u)

file_flags=()
for f in "${ENV_FILES[@]}"; do
  file_flags+=(-f "$f")
done

exec pnpm exec dotenvx run -fk .env.keys "${file_flags[@]}" -- \
  docker run --rm --init "${env_flags[@]}" "$@" "$IMAGE"

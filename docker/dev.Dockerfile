# Thin dev image for the watch containers (etl + web). Source is bind-mounted
# and dependencies are installed at container start into named volumes, so the
# image itself only needs the toolchain — no COPY, no build. pnpm pinned to the
# same major as the prod Dockerfile.
FROM node:22-slim

RUN npm install -g pnpm@10

WORKDIR /app

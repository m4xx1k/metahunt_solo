FROM node:22-alpine AS deps
WORKDIR /app

RUN npm install -g pnpm@10

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json drizzle.config.ts ./
COPY apps/etl/package.json apps/etl/package.json
COPY libs/database/package.json libs/database/package.json

RUN pnpm install -r --frozen-lockfile --prod=false


FROM node:22-alpine AS build
WORKDIR /app

RUN npm install -g pnpm@10

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=deps /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=deps /app/tsconfig.json ./tsconfig.json
COPY --from=deps /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=deps /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=deps /app/apps/etl/package.json ./apps/etl/package.json
COPY --from=deps /app/libs/database/package.json ./libs/database/package.json
COPY . .

RUN pnpm install -r --frozen-lockfile --prod=false
RUN pnpm build


FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules

COPY --from=build /app/apps/etl/dist ./apps/etl/dist
COPY --from=build /app/libs/database/dist ./libs/database/dist
COPY --from=build /app/libs/database/migrations ./libs/database/migrations
COPY --from=build /app/libs/database/migrate.ts ./libs/database/migrate.ts
COPY --from=build /app/libs/database/package.json ./libs/database/package.json
COPY --from=build /app/tsconfig.json ./tsconfig.json

EXPOSE 3000
CMD ["node", "apps/etl/dist/main.js"]

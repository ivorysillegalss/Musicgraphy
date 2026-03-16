FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
ARG NEXT_PUBLIC_FORCE_DEFAULT_AUTH=false
ARG NEXT_PUBLIC_LOCAL_DEFAULT_USER_ID=local-user
ARG NEXT_PUBLIC_LOCAL_DEFAULT_USER_EMAIL=local@localhost
ENV NEXT_PUBLIC_FORCE_DEFAULT_AUTH=$NEXT_PUBLIC_FORCE_DEFAULT_AUTH
ENV NEXT_PUBLIC_LOCAL_DEFAULT_USER_ID=$NEXT_PUBLIC_LOCAL_DEFAULT_USER_ID
ENV NEXT_PUBLIC_LOCAL_DEFAULT_USER_EMAIL=$NEXT_PUBLIC_LOCAL_DEFAULT_USER_EMAIL
ENV NODE_OPTIONS=--max-old-space-size=2048
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -- --webpack

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV LOCAL_DB_PATH=/app/data/dream.db
ENV LOCAL_DEFAULT_USER_ID=local-user
ENV LOCAL_DEFAULT_USER_EMAIL=local@localhost

RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static

RUN mkdir -p /app/data && chown -R nextjs:nextjs /app/data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

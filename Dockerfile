FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_BASE_URL=https://api.agencia2c.cloud
ENV NEXT_PUBLIC_API_URL=https://api.agencia2c.cloud
ENV NEXT_PUBLIC_APP_URL=https://api.agencia2c.cloud
ENV NEXT_PUBLIC_DASHBOARD_STATE_ENDPOINT=/webhook/barberagency/dashboard/state
ENV NEXT_PUBLIC_DRAFT_SAVE_ENDPOINT=/webhook/barberagency/landing/draft/save
ENV NEXT_PUBLIC_PUBLISH_ENDPOINT=/webhook/barberagency/landing/save-v2

COPY --from=deps /app/node_modules ./node_modules
COPY . ./
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV NEXT_PUBLIC_API_BASE_URL=https://api.agencia2c.cloud
ENV NEXT_PUBLIC_API_URL=https://api.agencia2c.cloud
ENV NEXT_PUBLIC_APP_URL=https://api.agencia2c.cloud
ENV NEXT_PUBLIC_DASHBOARD_STATE_ENDPOINT=/webhook/barberagency/dashboard/state
ENV NEXT_PUBLIC_DRAFT_SAVE_ENDPOINT=/webhook/barberagency/landing/draft/save
ENV NEXT_PUBLIC_PUBLISH_ENDPOINT=/webhook/barberagency/landing/save-v2

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["npm", "run", "start", "--", "-p", "3000"]

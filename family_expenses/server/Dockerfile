FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations
COPY tsconfig.json ./
EXPOSE 8787
USER node
# Apply pending migrations, then serve
CMD ["sh", "-c", "npx tsx scripts/migrate.ts && exec npx tsx src/index.ts"]

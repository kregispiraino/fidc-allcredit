FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gosu && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node apps ./apps
COPY --chown=node:node database/migrations ./database/migrations
COPY --chown=node:node database/migrate.js ./database/migrate.js
COPY --chown=node:node scripts ./scripts
RUN chmod +x scripts/entrypoint.sh && mkdir -p /data && chown node:node /data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4310 ALLCREDIT_DB=/data/allcredit.sqlite
EXPOSE 4310
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
CMD ["node","apps/system/backend/src/server.js"]

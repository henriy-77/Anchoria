FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 STORAGE_DIR=/data TRUST_PROXY=1
COPY server.js ./
COPY netlify/functions ./netlify/functions
COPY *.html *.png *.pdf ./
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server.js"]

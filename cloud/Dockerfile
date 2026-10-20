FROM node:22-bookworm-slim
WORKDIR /app
COPY memory-core.js sync-core.js ./
COPY cloud/server.cjs ./cloud/server.cjs
RUN mkdir -p /data && chown node:node /data
USER node
ENV XINZAI_HOST=0.0.0.0 XINZAI_DATABASE=/data/xinzai.sqlite PORT=8787
EXPOSE 8787
CMD ["node", "cloud/server.cjs"]

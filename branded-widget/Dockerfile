FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json server.mjs management.mjs ./
COPY --chown=node:node public ./public
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3100
CMD ["node", "server.mjs"]

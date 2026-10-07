FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node public ./public
USER node
EXPOSE 3100
CMD ["node", "server.mjs"]

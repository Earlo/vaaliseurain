FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs ./
COPY lib ./lib
COPY scripts ./scripts
COPY data ./data
COPY public ./public

RUN mkdir -p /app/runtime && chown node:node /app/runtime

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

USER node
CMD ["node", "server.mjs"]

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
USER node
EXPOSE 4000
# Run node directly (not through npm) so the stop signal reaches it and pending writes are flushed.
CMD ["node", "src/index.js"]

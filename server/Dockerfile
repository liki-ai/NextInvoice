FROM node:22-alpine
# A headless browser prints invoices to PDF for the emails; the fonts are the ones the invoice
# templates ask for (Carlito stands in for Calibri, Liberation for Arial and Helvetica).
RUN apk add --no-cache chromium font-liberation font-carlito
ENV CHROMIUM_PATH=/usr/bin/chromium
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
USER node
EXPOSE 4000
# Run node directly (not through npm) so the stop signal reaches it and pending writes are flushed.
CMD ["node", "src/index.js"]

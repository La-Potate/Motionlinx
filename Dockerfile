FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

# Backend source.
COPY src ./src

# Build the SPA from source so the image is reproducible from the repo alone.
COPY client/package*.json ./client/
RUN cd client && npm install

COPY client/src ./client/src
COPY client/public ./client/public
COPY client/index.html ./client/
COPY client/vite.config.js ./client/
COPY client/tsconfig.json ./client/
RUN cd client && npm run build

RUN mkdir -p /var/lib/app-data && chown -R node:node /var/lib/app-data /app

USER node

EXPOSE 3000

CMD ["node", "src/index.js"]

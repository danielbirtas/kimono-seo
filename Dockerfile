FROM node:20-alpine
RUN apk add --no-cache openssl curl
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci && npm cache clean --force
COPY . .
RUN npm run build && npx prisma generate
RUN npm prune --production
ENV NODE_ENV=production
CMD ["sh", "-c", "npx prisma db push --skip-generate 2>&1 && echo STARTING_ON_PORT_$PORT && npx react-router-serve ./build/server/index.js 2>&1"]

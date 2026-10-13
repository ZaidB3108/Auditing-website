FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache ca-certificates curl \
  && curl --fail --show-error --silent https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
    --output /app/rds-global-bundle.pem

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
EXPOSE 3001

CMD ["node", "dist/server.js"]

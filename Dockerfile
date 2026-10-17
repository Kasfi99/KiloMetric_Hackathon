# API + web dashboard + /driver PWA in one container (Cloud Run). Data lives in DATA_FILE, which must be on a
# persistent mount (a Cloud Storage bucket at /data): the container filesystem is lost on every restart.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 DATA_FILE=/data/fleet.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json server.js ./
COPY lib ./lib
CMD ["node", "server.js", "--production"]

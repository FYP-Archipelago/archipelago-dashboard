FROM node:22-alpine AS build
WORKDIR /app
COPY --from=oven/bun:1.3.12-alpine /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock ./

RUN bun install --frozen-lockfile
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
ARG VITE_BACKEND_URL
RUN bun run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

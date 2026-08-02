# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Multi-service API bases (empty = same-origin nginx path proxy in smoke).
ARG VITE_API_URL=
ARG VITE_ORCHESTRATOR_URL=
ARG VITE_PERF_LAB_URL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ORCHESTRATOR_URL=$VITE_ORCHESTRATOR_URL
ENV VITE_PERF_LAB_URL=$VITE_PERF_LAB_URL
RUN npm run build

# Runtime stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# NAS/NFS docker storage can hang forever on the stock nginx entrypoint's
# `touch /etc/nginx/conf.d/default.conf` (IPv6 listen probe). We already ship a
# complete default.conf — skip that script so the container reaches nginx.
RUN rm -f /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]


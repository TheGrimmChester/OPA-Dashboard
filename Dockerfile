# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Opt-in reworked visualizations (charts v2 + trace-tree virtualization).
# Default false => original UI. Build with --build-arg VITE_VIZ_V2=true to enable.
ARG VITE_VIZ_V2=false
ENV VITE_VIZ_V2=$VITE_VIZ_V2
RUN npm run build

# Runtime stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]


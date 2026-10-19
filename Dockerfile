# BlueSec Nightshift web: the built frontend, served by nginx, which also
# reverse-proxies /api and /socket.io to the backend and /auth to Keycloak.
# Site configuration and config.json are written at startup from environment
# variables (deploy/web/40-nightshift.sh), so one image serves any installation.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/web/40-nightshift.sh /docker-entrypoint.d/40-nightshift.sh
USER root
RUN rm -f /etc/nginx/conf.d/default.conf \
    && chmod 755 /docker-entrypoint.d/40-nightshift.sh \
    && chown -R nginx:nginx /usr/share/nginx/html /etc/nginx/conf.d
USER nginx
EXPOSE 8080 8443
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

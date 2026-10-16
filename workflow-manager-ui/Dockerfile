# --- build: production bundle (never contains a dev token) ---
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npx ng build --configuration production

# --- runtime: nginx serves the app and proxies /api and /management to workflow-manager ---
FROM nginx:1.29-alpine
# Set at deploy time (the container stops with a message if one is wrong or a required one is missing):
#   WM_BACKEND_URL  required: base URL of the service, with its context path, e.g. http://workflow-manager:8081/workflowmanager
#   WM_TOKEN        required: JWT that nginx sends as `Authorization: Bearer ...`; it never reaches the browser
#   APP_BASE_PATH   optional: the path a portal serves the app under, e.g. /workflows/ (default /)
#   APP_LINKS       optional: the portal's apps for the top bar, "Name=url;Name=url"
# Only the WM_ variables are substituted into the nginx template, so nginx's own $variables are left alone.
ENV NGINX_ENVSUBST_FILTER=^WM_
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 docker/15-app-config.sh /docker-entrypoint.d/15-app-config.sh
COPY --from=build /app/dist/workflow-manager-ui/browser /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --start-interval=2s CMD wget -qO- http://127.0.0.1/healthz || exit 1

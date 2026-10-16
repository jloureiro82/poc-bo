# The configurator portal: one address for the micro frontends (workflow-manager-ui, process-orchestrator-ui).
# It holds no app code: each app is its own image, built and deployed on its own.
FROM nginx:1.29-alpine
# Set at deploy time:
#   PORTAL_WM_UI_URL  where the workflow-manager-ui container listens, e.g. http://workflow-manager-ui
#   PORTAL_PO_UI_URL  where the process-orchestrator-ui container listens, e.g. http://process-orchestrator-ui
# Only the PORTAL_ variables are substituted into the nginx template, so nginx's own $variables are left alone.
ENV NGINX_ENVSUBST_FILTER=^PORTAL_ \
    PORTAL_WM_UI_URL=http://workflow-manager-ui \
    PORTAL_PO_UI_URL=http://process-orchestrator-ui
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY html/ /usr/share/nginx/html/
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --start-interval=2s CMD wget -qO- http://127.0.0.1/healthz || exit 1

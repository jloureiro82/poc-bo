#!/bin/sh
# Runs before nginx's template step (20-envsubst-on-templates.sh). Checks the deploy-time settings, points the page at
# the path it is served under, and writes /config.json, which tells the app that the deployment owns the connection
# (see core/deployment.ts). Shared with workflow-manager-ui, which uses WM_ instead of PO_.
set -eu
app=process-orchestrator-ui
html=/usr/share/nginx/html

if [ -z "${PO_BACKEND_URL:-}" ]; then
  echo "$app: PO_BACKEND_URL is required (e.g. http://process-orchestrator:8081/process-orchestrator)" >&2
  exit 1
fi
if [ -z "${PO_TOKEN:-}" ]; then
  echo "$app: PO_TOKEN is required (the JWT nginx sends as 'Authorization: Bearer <token>')" >&2
  exit 1
fi
case "$PO_TOKEN" in
  Bearer\ *|bearer\ *)
    echo "$app: PO_TOKEN must be the bare JWT, without the 'Bearer ' prefix" >&2
    exit 1
    ;;
esac

# APP_BASE_PATH: the path a portal serves this app under, e.g. /workflows/. The portal strips it before forwarding,
# so nginx here still serves from /; only the page's <base href> changes, and with it every bundle and API URL.
base=${APP_BASE_PATH:-/}
case "$base" in
  /|/*/) ;;
  *)
    echo "$app: APP_BASE_PATH must start and end with '/' (e.g. /workflows/), got '$base'" >&2
    exit 1
    ;;
esac
case "$base" in
  *[!A-Za-z0-9/_.~-]*)
    echo "$app: APP_BASE_PATH may only hold letters, digits and / _ . ~ -, got '$base'" >&2
    exit 1
    ;;
esac
sed -i "s|<base href=\"[^\"]*\">|<base href=\"$base\">|" "$html/index.html"

json() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# APP_LINKS: the portal's apps, linked from the top bar: "Name=url;Name=url" (this app may be listed too).
apps=''
if [ -n "${APP_LINKS:-}" ]; then
  set -f
  old_ifs=$IFS
  IFS=';'
  for entry in $APP_LINKS; do
    IFS=$old_ifs
    entry=$(printf '%s' "$entry" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
    [ -z "$entry" ] && continue
    name=$(printf '%s' "${entry%%=*}" | sed 's/[[:space:]]*$//')
    url=$(printf '%s' "${entry#*=}" | sed 's/^[[:space:]]*//')
    if [ "$name" = "$entry" ] || [ -z "$name" ] || [ -z "$url" ]; then
      echo "$app: APP_LINKS entries are Name=url, separated by ';' (got '$entry')" >&2
      exit 1
    fi
    apps="$apps${apps:+, }{ \"name\": \"$(json "$name")\", \"url\": \"$(json "$url")\" }"
  done
  IFS=$old_ifs
  set +f
fi

# Only the backend URL goes to the browser; the token stays in nginx.
printf '{ "managed": true, "backend": "%s", "apps": [%s] }\n' "$(json "$PO_BACKEND_URL")" "$apps" > "$html/config.json"
echo "$app: served under $base, service $PO_BACKEND_URL"

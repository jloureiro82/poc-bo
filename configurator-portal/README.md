# Configurator portal

One address for the configurator micro frontends:

| Path | App | Folder | Service |
|---|---|---|---|
| `/` | Landing page: both apps, with a live check of each one's service | this one | |
| `/workflows/` | Workflow Configurator | [`../workflow-manager-ui`](../workflow-manager-ui) | workflow-manager |
| `/flows/` | Flow Configurator | [`../process-orchestrator-ui`](../process-orchestrator-ui) | process-orchestrator |

The portal is a small nginx image with no app code. It forwards each path to the app's container and strips the
prefix. Building, running and deploying the whole stack is described in the [root README](../README.md).

Why not one page that loads both apps, such as Module Federation? The two apps style the same global CSS classes
from their own stylesheets, which drift apart as each app changes. Both listen for keys on `document`, and both use
the hash routes `#/workflow`, `#/executions` and `#/settings`. Loaded into one page, they would break each other.
Separate pages keep them independent: each one updates its own Angular version and styles, and ships on its own
schedule.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `PORTAL_WM_UI_URL` | `http://workflow-manager-ui` | Where the workflow-manager-ui container listens |
| `PORTAL_PO_UI_URL` | `http://process-orchestrator-ui` | Where the process-orchestrator-ui container listens |

## Files

| File | What it is |
|---|---|
| `Dockerfile` | The portal image (nginx) |
| `nginx.conf.template` | Path routing to the apps; `${PORTAL_*}` are filled in at startup |
| `html/index.html` | The landing page |

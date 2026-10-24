# Developing Nightshift

How to work on the code. For what Nightshift is, see the [README](README.md). Client
documentation lives in [docs/](docs/): that folder is shipped in every release kit, so
keep it client-facing. This file, the README and `.github/` are not shipped.

## Repository layout

| Path | What |
|---|---|
| `src/` | Frontend: React + TypeScript (Vite). Branding in `src/brand.ts`, runtime config in `src/config.ts` |
| `backend/app/` | API: FastAPI + Socket.IO. AI agents in `agents/`, SIEM/SOAR connectors in `connectors/`, alert intake in `services/ingest.py` |
| `backend/migrations/` | Database migrations (Alembic), applied automatically at startup |
| `backend/tests/` | Backend unit tests |
| `backend/keycloak-theme/` | Login page theme |
| `deploy/` | Production stack and the client install kit (compose file, install/upgrade/backup scripts, Keycloak image, web entrypoint) |
| `docs/` | Client documentation, shipped in the release kit |
| `Dockerfile` | Web image (built frontend + nginx) |
| `release.sh` | Builds a release kit |

## Development setup

Requirements: Docker Desktop (or Docker Engine), Node.js 22.

1. **Backend, database, cache, Keycloak**: `backend/docker-compose.yml` runs them with
   the backend source mounted and auto-reload. Create `backend/.env` from
   `backend/.env.example` first (generate `NIGHTSHIFT_SECRET_KEY` as described there).

   ```bash
   cd backend && docker compose up -d
   ```

2. **Frontend**: Vite proxies `/api` and `/socket.io` to the backend on port 8000, so the
   app always talks to its own origin, as in production.

   ```bash
   npm install
   npm run dev          # http://localhost:5173
   ```

A SIEM and a SOAR for testing (Wazuh, Flowintel, TheHive) run as separate stacks.
Point them at the app under **Integrations**.

## Checks

```bash
npx tsc -b                  # frontend type check (must be clean: the production build runs it)
npm run build               # production frontend build

# backend unit tests, in a throwaway container from a backend image
docker build -t nightshift-backend:dev backend/
docker run --rm -v "$PWD/backend:/app" -w /app --user 0 --entrypoint sh nightshift-backend:dev \
  -c "pip install -q -r requirements-dev.txt && python -m pytest"
```

## Database changes

Change the models in `backend/app/models/`, then create a migration (inside the dev
backend container) and review it:

```bash
docker exec -it backend alembic revision --autogenerate -m "describe the change"
```

Migrations run automatically when the backend starts, on development machines and on
client installations alike. Keep them add-only where possible: upgrades of client
installations depend on them.

## Adding a SIEM or SOAR connector

1. Add a class in `backend/app/connectors/siem/` or `soar/`, deriving from
   `SiemConnector` or `SoarConnector` (`connectors/base.py`). Declare its settings as
   `ConnectorField`s: the Integrations screen builds its form from them, and fields of
   type `password` are encrypted and masked automatically (name them `*_api_key`,
   `*_password`, `*_token` or `*_secret`).
2. Register it in `connectors/registry.py`.
3. Add tests in `backend/tests/test_connectors.py`.

SIEM alerts then arrive on `POST /api/ingest/<connector id>` with the source's token.

## Releasing

```bash
./release.sh 1.2.0                   # full package: kit + offline image bundle (~550 MB)
./release.sh 1.2.0 --no-bundle --push registry.example.com/bluesec/
                                     # small package (~20 KB): images pushed to the registry
```

The kit (`release/nightshift-<version>.tar.gz`, with its `.sha256`) is what clients
install. Before shipping a release, install it on a clean Linux server and run an
upgrade from the previous version. Then tag the commit it was built from
(`git tag -a v1.2.0`) and push the tag.

`release.sh` also writes the download page, `release/index.html` (template in
`deploy/download-page/`): requirements, download buttons, the checksum and copy-paste
install steps. Host it in the same folder as the package, or set
`NIGHTSHIFT_DOWNLOAD_BASE` to the address where the package is hosted (for example
GitHub release assets); `deploy/download-page/build.sh <version> [address]` rebuilds it
alone.

To publish a release on GitHub, run `deploy/download-page/publish-github.sh <version>`.
It uploads the package as release assets of the public repository
`Imad-SH/nightshift-downloads` (`NIGHTSHIFT_DOWNLOADS_REPO`), creating the repository if
it does not exist, and puts the download page on its GitHub Pages site. That repository
holds the page and the packages only, and anyone with the link can download them.

For the small package, `docker login` to the registry first. `--push` also pushes
the Postgres and Redis images, so clients need access to that one registry only, and
the kit records the registry (`REGISTRY` file) for `install.sh` and `upgrade.sh`. Give
each client its own pull-only account on the registry, so access can be revoked per
client.

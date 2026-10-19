"""
Operator commands, run inside the backend container, e.g.:

    docker compose exec backend python -m app.cli ingest-token wazuh

The running backend reads settings at startup: restart it after changing a token here
(install.sh does this for you).
"""
import argparse
import asyncio
import sys

from app.connectors import registry
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.services import integrations, settings_store


async def _load_settings(db) -> None:
    settings.update_from_dict(await settings_store.load_all(db))


async def ingest_token(source: str, only_if_missing: bool) -> int:
    connector = registry.SIEM.get(source)
    if connector is None:
        print(f"Unknown alert source '{source}'. Choose from: {', '.join(registry.SIEM)}", file=sys.stderr)
        return 2
    async with AsyncSessionLocal() as db:
        await _load_settings(db)
        if only_if_missing and integrations.has_ingest_token(connector):
            print("exists")
            return 0
        print(await integrations.generate_ingest_token(db, connector))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    tok = sub.add_parser("ingest-token", help="create or replace an alert source's ingest token and print it")
    tok.add_argument("source", help="alert source id, e.g. wazuh or webhook")
    tok.add_argument("--if-missing", action="store_true", help="do nothing (print 'exists') if a token is already set")
    args = parser.parse_args()

    if args.command == "ingest-token":
        return asyncio.run(ingest_token(args.source, args.if_missing))
    return 1


if __name__ == "__main__":
    sys.exit(main())

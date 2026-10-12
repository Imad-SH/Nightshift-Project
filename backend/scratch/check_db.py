import asyncio
import os
import sys

# Add the project root to sys.path
sys.path.append('c:/Users/imads/Desktop/Web App/backend')

from sqlalchemy.future import select
from app.core.database import AsyncSessionLocal
from app.models.settings import SystemSettings

async def check_db_settings():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(SystemSettings))
        settings = {s.key: s.value for s in result.scalars().all()}
        print("--- DB SETTINGS ---")
        for k, v in settings.items():
            if 'password' in k or 'key' in k:
                print(f"{k}: [REDACTED] (len: {len(v) if v else 0})")
            else:
                print(f"{k}: {v}")
        print("-------------------")

if __name__ == "__main__":
    asyncio.run(check_db_settings())

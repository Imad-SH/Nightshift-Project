import asyncio
import sys
import os

# Fix for windows terminal unicode
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())
from sqlalchemy import select, func
from app.core.database import AsyncSessionLocal, engine
from app.models.alert import AlertModel
from datetime import datetime, timezone

async def check_february_data():
    async with AsyncSessionLocal() as db:
        start_time = datetime(2026, 2, 1, tzinfo=timezone.utc)
        end_time = datetime(2026, 3, 1, tzinfo=timezone.utc)
        
        result = await db.execute(
            select(func.count(AlertModel.id))
            .where(AlertModel.timestamp >= start_time)
            .where(AlertModel.timestamp < end_time)
        )
        count = result.scalar()
        print(f"Total alerts in Feb: {count}")
        
        # Check raw_data structure
        result = await db.execute(
            select(AlertModel.raw_data)
            .where(AlertModel.timestamp >= start_time)
            .where(AlertModel.timestamp < end_time)
            .limit(5)
        )
        rows = result.scalars().all()
        for i, raw in enumerate(rows):
            print(f"Alert {i} raw_data type: {type(raw)}")
            print(f"Alert {i} raw_data keys: {raw.keys() if isinstance(raw, dict) else 'Not a dict'}")
            if isinstance(raw, dict):
                inner_raw = raw.get('raw_data', {})
                print(f"Alert {i} nested raw_data keys: {inner_raw.keys() if isinstance(inner_raw, dict) else 'Not a dict'}")
                if isinstance(inner_raw, dict):
                    mitre = inner_raw.get('rule', {}).get('mitre', {})
                    print(f"Alert {i} mitre (from nested): {mitre}")
                
                # Check root too just in case
                mitre_root = raw.get('rule', {}).get('mitre', {})
                print(f"Alert {i} mitre (from root): {mitre_root}")

if __name__ == "__main__":
    asyncio.run(check_february_data())

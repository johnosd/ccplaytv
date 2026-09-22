import asyncio
import sys

import httpx
import pytest_asyncio

from main import app

if sys.platform == "win32":
    # psycopg (modo assíncrono) não funciona com o ProactorEventLoop padrão
    # do Windows — necessário trocar para SelectorEventLoop.
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


@pytest_asyncio.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def make_engine(database_url: str):
    return create_async_engine(database_url, pool_pre_ping=True)


def make_session_factory(engine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


_engine = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def configure(database_url: str) -> None:
    """Configura o engine/session factory globais a partir de Settings.database_url."""
    global _engine, _session_factory
    _engine = make_engine(database_url)
    _session_factory = make_session_factory(_engine)


async def get_session() -> AsyncGenerator[AsyncSession]:
    if _session_factory is None:
        raise RuntimeError("app.db.configure() precisa ser chamado antes de usar get_session().")
    async with _session_factory() as session:
        yield session


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Para uso fora do ciclo de request (ex.: BackgroundTasks), que precisa
    abrir sua própria sessão, já que a sessão da requisição é fechada antes
    da task rodar."""
    if _session_factory is None:
        raise RuntimeError("app.db.configure() precisa ser chamado antes de usar get_session_factory().")
    return _session_factory

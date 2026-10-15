from unittest.mock import AsyncMock, Mock

import pytest
from google.api_core.exceptions import Aborted

from app.portal.repositories import control as module
from app.portal.repositories.control import ControlRepository, RepositoryConflict


@pytest.mark.parametrize("during_commit", [False, True])
async def test_retries_aborted_read_or_commit_as_whole_unit(monkeypatch, during_commit):
    error = Aborted("fixture contention")
    if during_commit:
        wrapped = ValueError("SDK exhausted")
        wrapped.__cause__ = error
        error = wrapped
    execute = AsyncMock(side_effect=[error, "committed"])
    monkeypatch.setattr(module, "async_transactional", lambda _: execute)
    sleep = AsyncMock()
    monkeypatch.setattr(module.asyncio, "sleep", sleep)
    client = Mock()
    result = await ControlRepository(client).transact(("jobs/example",), Mock())
    assert result == "committed"
    assert execute.await_count == 2
    assert client.transaction.call_count == 2
    assert all(call.kwargs == {"max_attempts": 1} for call in client.transaction.call_args_list)
    sleep.assert_awaited_once()
    assert 0.05 <= sleep.call_args.args[0] <= 0.2


async def test_business_rejection_never_retries_and_exhaustion_is_sanitized(monkeypatch):
    execute = AsyncMock(side_effect=RepositoryConflict("immutable_trial"))
    monkeypatch.setattr(module, "async_transactional", lambda _: execute)
    sleep = AsyncMock()
    monkeypatch.setattr(module.asyncio, "sleep", sleep)
    repository = ControlRepository(Mock())
    with pytest.raises(RepositoryConflict, match="immutable_trial"):
        await repository.transact(("jobs/example",), Mock())
    assert execute.await_count == 1
    sleep.assert_not_awaited()
    execute.reset_mock(side_effect=True)
    execute.side_effect = Aborted("fixture private exception")
    with pytest.raises(RepositoryConflict, match="^transaction_unavailable$"):
        await repository.transact(("jobs/example",), Mock())
    assert execute.await_count == 5
    assert sleep.await_count == 4

"""In-process behavior tests for the optional Nokia Launcher backend."""

import asyncio
import os
import threading
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
import pytest_asyncio

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "nokia_launcher_test")

import server


ADMIN_TOKEN = "test-admin-token-with-sufficient-random-length"


@pytest.mark.asyncio
@pytest.mark.parametrize("queued", [True, False])
async def test_cancelled_verification_keeps_slot_until_worker_finishes(monkeypatch, queued):
    release = threading.Event()
    started = threading.Event()
    executor = ThreadPoolExecutor(max_workers=1)
    if queued:
        executor.submit(lambda: (started.set(), release.wait(3)))
        assert started.wait(1)
    loop = asyncio.get_running_loop()
    original = loop.run_in_executor
    monkeypatch.setattr(loop, "run_in_executor", lambda _pool, function: original(executor, function))
    slots = threading.BoundedSemaphore(1)
    monkeypatch.setattr(server, "_integrity_slots", slots)
    monkeypatch.setattr(server, "verify_integrity_token", lambda *a, **k: (started.set(), release.wait(3), {"ok": True})[-1])
    request = server.IntegrityVerifyRequest(integrityToken="token", challenge="challenge")
    task = asyncio.create_task(server.verify_integrity(request))
    try:
        await asyncio.sleep(0)
        for _ in range(100):
            if started.is_set():
                break
            await asyncio.sleep(0.01)
        assert started.is_set()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert not slots.acquire(blocking=False)
        release.set()
        for _ in range(100):
            await asyncio.sleep(0.01)
            if slots.acquire(blocking=False):
                slots.release()
                break
        else:
            pytest.fail("cancelled queued request leaked its capacity slot")
    finally:
        release.set()
        executor.shutdown(wait=True)


class FakeCursor:
    def __init__(self, documents):
        self.documents = documents

    async def to_list(self, limit):
        return self.documents[:limit]


class FakePreferences:
    def __init__(self):
        self.documents = {}

    async def update_one(self, query, update, upsert=False):
        assert upsert is True
        self.documents[query["app_id"]] = update["$set"]

    def find(self, query, projection):
        assert query["app_id"]["$regex"] == r"^[A-Za-z0-9._:-]{1,128}$"
        assert query["is_hidden"] == {"$type": "bool"}
        assert projection == {"_id": 0, "app_id": 1, "is_hidden": 1, "custom_order": 1}
        return FakeCursor(list(self.documents.values()))


class FakeDb:
    def __init__(self):
        self.app_preferences = FakePreferences()


@pytest.fixture(autouse=True)
def isolated_backend(monkeypatch):
    monkeypatch.setattr(server, "db", FakeDb())
    monkeypatch.setattr(server, "_integrity_slots", threading.BoundedSemaphore(4))
    monkeypatch.delenv("PREFERENCES_ADMIN_TOKEN", raising=False)


@pytest_asyncio.fixture
async def api():
    transport = httpx.ASGITransport(app=server.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def admin_headers():
    return {"Authorization": f"Bearer {ADMIN_TOKEN}"}


@pytest.mark.asyncio
async def test_public_catalog_remains_available(api):
    response = await api.get("/api/apps")

    assert response.status_code == 200
    assert len(response.json()["apps"]) == 19


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["get", "post"])
async def test_preferences_fail_closed_when_admin_token_is_disabled(api, method):
    kwargs = {"json": [{"app_id": "youtube"}]} if method == "post" else {}

    response = await getattr(api, method)("/api/apps/preferences", **kwargs)

    assert response.status_code == 503
    assert response.json()["detail"] == "preference administration is disabled"


@pytest.mark.asyncio
async def test_preferences_reject_missing_and_invalid_bearer_tokens(
    api, monkeypatch
):
    monkeypatch.setenv("PREFERENCES_ADMIN_TOKEN", ADMIN_TOKEN)

    missing = await api.get("/api/apps/preferences")
    invalid = await api.get(
        "/api/apps/preferences", headers={"Authorization": "Bearer wrong"}
    )

    assert missing.status_code == 401
    assert invalid.status_code == 401
    assert invalid.headers["www-authenticate"] == "Bearer"


@pytest.mark.asyncio
async def test_authorized_preferences_round_trip_without_mongo_id(
    api, monkeypatch
):
    monkeypatch.setenv("PREFERENCES_ADMIN_TOKEN", ADMIN_TOKEN)
    payload = [{"app_id": "youtube", "is_hidden": True, "custom_order": 5}]

    saved = await api.post(
        "/api/apps/preferences", json=payload, headers=admin_headers()
    )
    loaded = await api.get("/api/apps/preferences", headers=admin_headers())

    assert saved.status_code == 200
    assert loaded.status_code == 200
    assert loaded.json()["preferences"] == payload
    assert "_id" not in loaded.json()["preferences"][0]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        [],
        [{"app_id": "a"}] * 101,
        [{"app_id": "a" * 129}],
        [{"app_id": "unsafe app id"}],
        [{"app_id": "youtube", "custom_order": -1}],
        [{"app_id": "youtube", "custom_order": 10_000}],
        [{"app_id": "youtube", "unexpected": True}],
    ],
)
async def test_preference_input_is_bounded(api, monkeypatch, payload):
    monkeypatch.setenv("PREFERENCES_ADMIN_TOKEN", ADMIN_TOKEN)

    response = await api.post(
        "/api/apps/preferences", json=payload, headers=admin_headers()
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_request_body_limit_rejects_oversized_input(api):
    response = await api.post(
        "/api/integrity/verify",
        content=b"x" * (server.MAX_REQUEST_BODY_BYTES + 1),
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 413


@pytest.mark.asyncio
async def test_request_body_limit_rejects_chunked_input_without_content_length(api):
    async def oversized_chunks():
        yield b"x" * (server.MAX_REQUEST_BODY_BYTES // 2)
        yield b"x" * (server.MAX_REQUEST_BODY_BYTES // 2 + 1)

    response = await api.post(
        "/api/integrity/verify",
        content=oversized_chunks(),
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 413


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path,payload",
    [
        ("/api/integrity/challenge", {"action": "a" * 81}),
        (
            "/api/integrity/verify",
            {"integrityToken": "t" * 16_385, "challenge": "c"},
        ),
        (
            "/api/integrity/verify",
            {"integrityToken": "t", "challenge": "c" * 2_049},
        ),
    ],
)
async def test_integrity_fields_are_bounded(api, path, payload):
    response = await api.post(path, json=payload)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_integrity_overload_rejects_without_releasing_running_worker(
    api, monkeypatch
):
    started = threading.Event()
    release = threading.Event()

    def blocking_verify(*args, **kwargs):
        started.set()
        assert release.wait(timeout=2)
        return {"action": "device-check"}

    monkeypatch.setattr(server, "verify_integrity_token", blocking_verify)
    monkeypatch.setattr(server, "_integrity_slots", threading.BoundedSemaphore(1))
    payload = {"integrityToken": "token", "challenge": "challenge"}

    first = asyncio.create_task(api.post("/api/integrity/verify", json=payload))
    assert await asyncio.to_thread(started.wait, 1)
    overloaded = await api.post("/api/integrity/verify", json=payload)

    assert overloaded.status_code == 503
    assert overloaded.headers["retry-after"] == "1"
    assert server._integrity_slots.acquire(blocking=False) is False

    release.set()
    completed = await first
    assert completed.status_code == 200
    assert server._integrity_slots.acquire(blocking=False) is True


@pytest.mark.asyncio
async def test_legacy_preferences_are_validated_before_response(api, monkeypatch):
    from bson.decimal128 import Decimal128
    monkeypatch.setenv("PREFERENCES_ADMIN_TOKEN", ADMIN_TOKEN)
    rows = [{"app_id": "ok", "is_hidden": False, "custom_order": 3}]
    rows += [{"app_id": "bad", "is_hidden": False, "custom_order": value}
             for value in (1.5, Decimal128("1"), True, [2], -1, 10000)]
    rows += [{"app_id": ["bad"], "is_hidden": False}, {"app_id": "bad", "is_hidden": [True]}]
    # Return invalid legacy rows even if a provider overmatches the query.
    monkeypatch.setattr(server.db.app_preferences, "find", lambda *args: FakeCursor(rows))
    response = await api.get("/api/apps/preferences", headers=admin_headers())
    assert response.status_code == 200
    assert response.json()["preferences"] == rows[:1]

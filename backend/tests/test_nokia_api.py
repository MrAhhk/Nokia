"""Backend API tests for Nokia Launcher."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://nokia-launcher-1.preview.emergentagent.com').rstrip('/')


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# Root endpoint
def test_root(api):
    r = api.get(f"{BASE_URL}/api/")
    assert r.status_code == 200
    assert r.json().get("message") == "Nokia Launcher API"


# Apps list endpoint
def test_get_apps_status(api):
    r = api.get(f"{BASE_URL}/api/apps")
    assert r.status_code == 200


def test_get_apps_structure(api):
    r = api.get(f"{BASE_URL}/api/apps")
    data = r.json()
    assert "apps" in data
    assert isinstance(data["apps"], list)
    assert len(data["apps"]) == 19


def test_get_apps_required_important(api):
    r = api.get(f"{BASE_URL}/api/apps")
    apps = r.json()["apps"]
    important_ids = {a["id"] for a in apps if a["category"] == "important"}
    expected = {"phone", "messages", "contacts", "whatsapp", "messenger",
                "maps", "camera", "gallery", "clock", "calendar", "settings"}
    assert expected.issubset(important_ids)


def test_get_apps_required_unimportant(api):
    r = api.get(f"{BASE_URL}/api/apps")
    apps = r.json()["apps"]
    unimp = {a["id"] for a in apps if a["category"] == "unimportant"}
    expected = {"youtube", "facebook", "tiktok", "instagram", "twitter",
                "spotify", "games", "snake"}
    assert expected.issubset(unimp)


def test_get_apps_fields(api):
    r = api.get(f"{BASE_URL}/api/apps")
    apps = r.json()["apps"]
    for a in apps:
        assert "id" in a and "name" in a and "icon" in a and "category" in a
        assert a["category"] in ("important", "unimportant")
        assert isinstance(a["is_system"], bool)


# Preferences endpoints
def test_get_preferences(api):
    r = api.get(f"{BASE_URL}/api/apps/preferences")
    assert r.status_code == 200
    assert "preferences" in r.json()


def test_save_preferences_and_verify(api):
    payload = [{"app_id": "TEST_youtube", "is_hidden": True, "custom_order": 5}]
    r = api.post(f"{BASE_URL}/api/apps/preferences", json=payload)
    assert r.status_code == 200
    # Verify persistence
    r2 = api.get(f"{BASE_URL}/api/apps/preferences")
    prefs = r2.json()["preferences"]
    match = [p for p in prefs if p.get("app_id") == "TEST_youtube"]
    assert len(match) >= 1
    assert match[0]["is_hidden"] is True
    # No mongodb _id leakage
    assert "_id" not in match[0]

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, ConfigDict, Field
from typing import Annotated, List, Optional
import asyncio
import hashlib
import hmac
import threading
from contextlib import asynccontextmanager

from play_integrity import (
    IntegrityConfigurationError,
    IntegrityDecodeError,
    IntegrityValidationError,
    issue_integrity_challenge,
    verify_integrity_token,
)


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    client.close()


# Create the main app without a prefix
app = FastAPI(lifespan=lifespan)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

MAX_REQUEST_BODY_BYTES = 32 * 1024
MAX_PREFERENCES = 100
MAX_INTEGRITY_CONCURRENCY = 4
_integrity_slots = threading.BoundedSemaphore(MAX_INTEGRITY_CONCURRENCY)


class RequestBodyLimitMiddleware:
    """Reject oversized API request bodies before validation or remote work."""

    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        content_length = headers.get(b"content-length")
        if content_length:
            try:
                if int(content_length) > self.max_bytes:
                    await JSONResponse(
                        {"detail": "request body is too large"}, status_code=413
                    )(scope, receive, send)
                    return
            except ValueError:
                await JSONResponse(
                    {"detail": "content-length is invalid"}, status_code=400
                )(scope, receive, send)
                return

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise HTTPException(413, "request body is too large")
            return message

        await self.app(scope, limited_receive, send)


def _preference_admin_token() -> str:
    return os.environ.get("PREFERENCES_ADMIN_TOKEN", "").strip()


async def require_preferences_admin(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    configured = _preference_admin_token()
    if not configured:
        raise HTTPException(
            status_code=503,
            detail="preference administration is disabled",
        )

    scheme, separator, supplied = (authorization or "").partition(" ")
    valid_scheme = separator == " " and scheme.lower() == "bearer"
    supplied_digest = hashlib.sha256(supplied.encode("utf-8")).digest()
    configured_digest = hashlib.sha256(configured.encode("utf-8")).digest()
    if not valid_scheme or not hmac.compare_digest(supplied_digest, configured_digest):
        raise HTTPException(
            status_code=401,
            detail="invalid administrative credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


# Define Models
class App(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str
    name: str
    icon: str
    category: str  # 'important' or 'unimportant'
    is_system: bool = False

class AppList(BaseModel):
    apps: List[App]

class AppPreference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    
    app_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$")
    is_hidden: bool = False
    custom_order: Optional[int] = Field(default=None, ge=0, le=9999)


class IntegrityChallengeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: str = Field(default="device-check", min_length=1, max_length=80)


class IntegrityVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    integrityToken: str = Field(min_length=1, max_length=16_384)
    challenge: str = Field(min_length=1, max_length=2_048)


PreferenceList = Annotated[
    List[AppPreference], Field(min_length=1, max_length=MAX_PREFERENCES)
]

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Nokia Launcher API"}

@api_router.get("/apps", response_model=AppList)
async def get_apps():
    """Get all available apps with categorization"""
    apps = [
        # Important Apps
        {"id": "phone", "name": "Phone", "icon": "Phone", "category": "important", "is_system": True},
        {"id": "messages", "name": "Messages", "icon": "MessageSquare", "category": "important", "is_system": True},
        {"id": "contacts", "name": "Contacts", "icon": "Users", "category": "important", "is_system": True},
        {"id": "whatsapp", "name": "WhatsApp", "icon": "MessageCircle", "category": "important", "is_system": False},
        {"id": "messenger", "name": "Messenger", "icon": "Send", "category": "important", "is_system": False},
        {"id": "maps", "name": "Maps", "icon": "Map", "category": "important", "is_system": False},
        {"id": "camera", "name": "Camera", "icon": "Camera", "category": "important", "is_system": True},
        {"id": "gallery", "name": "Gallery", "icon": "Image", "category": "important", "is_system": True},
        {"id": "clock", "name": "Clock", "icon": "Clock", "category": "important", "is_system": True},
        {"id": "calendar", "name": "Calendar", "icon": "Calendar", "category": "important", "is_system": True},
        {"id": "settings", "name": "Settings", "icon": "Settings", "category": "important", "is_system": True},
        
        # Unimportant Apps
        {"id": "youtube", "name": "YouTube", "icon": "Youtube", "category": "unimportant", "is_system": False},
        {"id": "facebook", "name": "Facebook", "icon": "Facebook", "category": "unimportant", "is_system": False},
        {"id": "tiktok", "name": "TikTok", "icon": "Video", "category": "unimportant", "is_system": False},
        {"id": "instagram", "name": "Instagram", "icon": "Instagram", "category": "unimportant", "is_system": False},
        {"id": "twitter", "name": "Twitter", "icon": "Twitter", "category": "unimportant", "is_system": False},
        {"id": "spotify", "name": "Spotify", "icon": "Music", "category": "unimportant", "is_system": False},
        {"id": "games", "name": "Games", "icon": "Gamepad2", "category": "unimportant", "is_system": False},
        {"id": "snake", "name": "Snake", "icon": "Gamepad", "category": "unimportant", "is_system": True},
    ]
    
    return {"apps": apps}

@api_router.post("/apps/preferences")
async def save_app_preferences(
    preferences: PreferenceList,
    _: None = Depends(require_preferences_admin),
):
    """Replace shared administrative app preferences."""
    for pref in preferences:
        pref_dict = pref.model_dump()
        await db.app_preferences.update_one(
            {"app_id": pref.app_id},
            {"$set": pref_dict},
            upsert=True
        )
    return {"message": "Preferences saved"}

@api_router.get("/apps/preferences")
async def get_app_preferences(_: None = Depends(require_preferences_admin)):
    """Read shared administrative app preferences."""
    preferences = await db.app_preferences.find({
        "app_id": {"$type": "string", "$regex": r"^[A-Za-z0-9._:-]{1,128}$"},
        "is_hidden": {"$type": "bool"},
        "$or": [{"custom_order": None}, {"custom_order": {"$type": ["int", "long"], "$gte": 0, "$lte": 9999}}],
    }, {"_id": 0, "app_id": 1, "is_hidden": 1, "custom_order": 1}).to_list(
        MAX_PREFERENCES
    )
    # Legacy records may predate validation; Mongo type predicates also match
    # array elements, so validate projected scalar values before serialization.
    safe = []
    for item in preferences:
        app_id, hidden, order = item.get("app_id"), item.get("is_hidden"), item.get("custom_order")
        if not isinstance(app_id, str) or type(hidden) is not bool:
            continue
        if order is not None and (not isinstance(order, int) or isinstance(order, bool) or not 0 <= order <= 9999):
            continue
        try:
            safe.append(AppPreference(**item).model_dump())
        except ValueError:
            continue
    return {"preferences": safe}


@api_router.post("/integrity/challenge")
async def create_integrity_challenge(request: IntegrityChallengeRequest):
    """Issue a signed request hash for an on-demand standard integrity check."""
    try:
        return issue_integrity_challenge(
            request.action,
            secret=os.environ.get("PLAY_INTEGRITY_CHALLENGE_SECRET", ""),
            cloud_project_number=os.environ.get(
                "PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER", ""
            ),
        )
    except IntegrityConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except IntegrityValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@api_router.post("/integrity/verify")
async def verify_integrity(request: IntegrityVerifyRequest):
    """Decode on Google's server and return normalized device/environment signals."""
    secret = os.environ.get("PLAY_INTEGRITY_CHALLENGE_SECRET", "")
    package_name = os.environ.get(
        "PLAY_INTEGRITY_PACKAGE_NAME", "com.nokialauncher"
    )
    if not _integrity_slots.acquire(blocking=False):
        raise HTTPException(
            status_code=503,
            detail="integrity verification capacity is busy",
            headers={"Retry-After": "1"},
        )

    def verify_with_owned_slot():
        return verify_integrity_token(
                request.integrityToken,
                request.challenge,
                secret=secret,
                package_name=package_name,
        )

    try:
        slot_owner = _integrity_slots
        try:
            worker = asyncio.get_running_loop().run_in_executor(None, verify_with_owned_slot)
        except BaseException:
            slot_owner.release()
            raise
        def finish_worker(future):
            slot_owner.release()
            if not future.cancelled():
                future.exception()  # Consume errors even when the request has disconnected.
        worker.add_done_callback(finish_worker)
        return await asyncio.shield(worker)
    except IntegrityValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except IntegrityConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except IntegrityDecodeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(RequestBodyLimitMiddleware, max_bytes=MAX_REQUEST_BODY_BYTES)


def _cors_origins() -> list[str]:
    return [
        origin.strip()
        for origin in os.environ.get("CORS_ORIGINS", "").split(",")
        if origin.strip()
    ]


cors_origins = _cors_origins()
cors_allow_credentials = os.environ.get(
    "CORS_ALLOW_CREDENTIALS", "false"
).lower() in {"1", "true", "yes"}
if cors_allow_credentials and "*" in cors_origins:
    raise RuntimeError("CORS credentials cannot be enabled with a wildcard origin")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=cors_allow_credentials,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

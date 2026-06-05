from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


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
    model_config = ConfigDict(extra="ignore")
    
    app_id: str
    is_hidden: bool = False
    custom_order: Optional[int] = None

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
async def save_app_preferences(preferences: List[AppPreference]):
    """Save user app preferences"""
    for pref in preferences:
        pref_dict = pref.model_dump()
        await db.app_preferences.update_one(
            {"app_id": pref.app_id},
            {"$set": pref_dict},
            upsert=True
        )
    return {"message": "Preferences saved"}

@api_router.get("/apps/preferences")
async def get_app_preferences():
    """Get user app preferences"""
    preferences = await db.app_preferences.find({}, {"_id": 0}).to_list(1000)
    return {"preferences": preferences}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
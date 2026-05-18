import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class Settings:
    NEXT_PUBLIC_SUPABASE_URL: str = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    NEXT_PUBLIC_SUPABASE_ANON_KEY: str = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    RAZORPAY_KEY_ID: str = os.getenv("RAZORPAY_KEY_ID", "")
    RAZORPAY_KEY_SECRET: str = os.getenv("RAZORPAY_KEY_SECRET", "")
    NEXT_PUBLIC_RAZORPAY_KEY_ID: str = os.getenv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "")
    RAZORPAY_WEBHOOK_SECRET: str = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")

    # Admin Study OS operations layer is off by default. When enabled,
    # /api/admin/study-os/* routes serve and the AdminShell nav exposes
    # the Study OS section. See docs/engineering/admin-study-os-operations.md.
    ADMIN_STUDY_OS_ENABLED: bool = os.getenv("ADMIN_STUDY_OS_ENABLED", "0").lower() in {"1", "true", "yes", "on"}

    # Document Assets (PR1) — Supabase Storage bucket holding personal library
    # uploads. Single-bucket default; admin scopes will route into separate
    # buckets in later PRs. Max upload guard is enforced server-side before a
    # signed upload URL is minted.
    LIBRARY_STORAGE_BUCKET: str = os.getenv("LIBRARY_STORAGE_BUCKET", "library")
    LIBRARY_MAX_UPLOAD_MB: int = int(os.getenv("LIBRARY_MAX_UPLOAD_MB", "25"))
    LIBRARY_DOWNLOAD_URL_TTL_SECONDS: int = int(os.getenv("LIBRARY_DOWNLOAD_URL_TTL_SECONDS", "300"))
    LIBRARY_UPLOAD_URL_TTL_SECONDS: int = int(os.getenv("LIBRARY_UPLOAD_URL_TTL_SECONDS", "300"))

    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
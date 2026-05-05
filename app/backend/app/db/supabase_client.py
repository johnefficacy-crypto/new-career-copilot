from supabase import Client, create_client

from app.core.config import get_settings

settings = get_settings()


def get_supabase_admin() -> Client:
    if not settings.NEXT_PUBLIC_SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
        )

    return create_client(
        settings.NEXT_PUBLIC_SUPABASE_URL,
        settings.SUPABASE_SERVICE_ROLE_KEY,
    )


def get_supabase_public() -> Client:
    if not settings.NEXT_PUBLIC_SUPABASE_URL or not settings.NEXT_PUBLIC_SUPABASE_ANON_KEY:
        raise RuntimeError(
            "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
        )

    return create_client(
        settings.NEXT_PUBLIC_SUPABASE_URL,
        settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    )
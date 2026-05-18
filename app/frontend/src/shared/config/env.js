const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const API_TIMEOUT_MS = Number(process.env.REACT_APP_API_TIMEOUT_MS || 15000);
const ENABLE_PROTOTYPE_ROUTES = process.env.REACT_APP_ENABLE_PROTOTYPE_ROUTES === "true";

// Cloudflare Turnstile SITE key (public). The matching SECRET key lives
// only in Supabase dashboard → Auth → CAPTCHA Protection. If the site
// key is set we assume Supabase has CAPTCHA enabled, so anonymous
// sign-ins must carry a Turnstile token — no token = 400 from
// /auth/v1/signup. Empty string when unset so consumers can treat it as
// a plain boolean check.
const TURNSTILE_SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY || "";
const CAPTCHA_REQUIRED_FOR_ANON = Boolean(TURNSTILE_SITE_KEY);

if (!BACKEND_URL && ["development", "test"].includes(process.env.NODE_ENV)) {
  throw new Error(
    "Missing REACT_APP_BACKEND_URL. Set it in app/frontend/.env (for local dev) or CI environment variables before running the frontend."
  );
}

export {
  BACKEND_URL,
  API_TIMEOUT_MS,
  ENABLE_PROTOTYPE_ROUTES,
  TURNSTILE_SITE_KEY,
  CAPTCHA_REQUIRED_FOR_ANON,
};

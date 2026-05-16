const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const API_TIMEOUT_MS = Number(process.env.REACT_APP_API_TIMEOUT_MS || 15000);
const ENABLE_PROTOTYPE_ROUTES = process.env.REACT_APP_ENABLE_PROTOTYPE_ROUTES === "true";

if (!BACKEND_URL && ["development", "test"].includes(process.env.NODE_ENV)) {
  throw new Error(
    "Missing REACT_APP_BACKEND_URL. Set it in app/frontend/.env (for local dev) or CI environment variables before running the frontend."
  );
}

export { BACKEND_URL, API_TIMEOUT_MS, ENABLE_PROTOTYPE_ROUTES };

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

if (!BACKEND_URL && ["development", "test"].includes(process.env.NODE_ENV)) {
  throw new Error(
    "Missing REACT_APP_BACKEND_URL. Set it in app/frontend/.env (for local dev) or CI environment variables before running the frontend."
  );
}

export { BACKEND_URL };

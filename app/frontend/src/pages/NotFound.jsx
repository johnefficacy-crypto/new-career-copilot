import React from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="soft-card rounded-2xl p-8 max-w-xl w-full text-center">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground mt-2">
          The page you requested does not exist or may have moved.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link className="btn btn-primary" to="/">Go home</Link>
          <Link className="btn btn-ghost" to="/app">Go to dashboard</Link>
        </div>
      </div>
    </div>
  );
}

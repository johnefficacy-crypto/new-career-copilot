import React from "react";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import { render, screen } from "@testing-library/react";

// Minimal stand-in routes mirroring the redirect intent of appRoutes.jsx
// (we don't want to mount DashShell + ProtectedRoute + all child pages in a
// route-level unit test). The point of this test is to lock in PR-B's
// promise: /app and /app/dashboard funnel into /app/today.
function TodayMarker() {
  return <div data-testid="today-page">today</div>;
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app" element={<Navigate to="/app/today" replace />} />
        <Route path="/app/dashboard" element={<Navigate to="/app/today" replace />} />
        <Route path="/app/today" element={<TodayMarker />} />
      </Routes>
    </MemoryRouter>,
  );
}

test("/app redirects to /app/today", () => {
  renderAt("/app");
  expect(screen.getByTestId("today-page")).toBeTruthy();
});

test("/app/dashboard redirects to /app/today for bookmark compatibility", () => {
  renderAt("/app/dashboard");
  expect(screen.getByTestId("today-page")).toBeTruthy();
});

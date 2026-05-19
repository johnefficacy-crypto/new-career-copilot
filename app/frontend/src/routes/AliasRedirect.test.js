import React from "react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import AliasRedirect from "./AliasRedirect";

// Probe component renders the current pathname/search/hash so assertions
// can verify both the alias target and the search+hash preservation
// promise required by PR2.
function LocationProbe() {
  const { pathname, search, hash } = useLocation();
  return (
    <div>
      <div data-testid="loc-pathname">{pathname}</div>
      <div data-testid="loc-search">{search}</div>
      <div data-testid="loc-hash">{hash}</div>
    </div>
  );
}

function renderAt(initialPath) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/app/exams" element={<AliasRedirect to="/app/eligibility/exams" />} />
        <Route path="/app/exams/:slug" element={<AliasRedirect to="/app/eligibility/exams/:slug" />} />
        <Route path="/app/tracker" element={<AliasRedirect to="/app/eligibility/tracker" />} />
        <Route path="/app/study-plan" element={<AliasRedirect to="/app/study/plan" />} />
        <Route path="/app/study/home" element={<AliasRedirect to="/app/study" />} />

        <Route path="/app/eligibility/exams" element={<LocationProbe />} />
        <Route path="/app/eligibility/exams/:slug" element={<LocationProbe />} />
        <Route path="/app/eligibility/tracker" element={<LocationProbe />} />
        <Route path="/app/study/plan" element={<LocationProbe />} />
        <Route path="/app/study" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AliasRedirect", () => {
  test("/app/exams redirects to /app/eligibility/exams", () => {
    renderAt("/app/exams");
    expect(screen.getByTestId("loc-pathname").textContent).toBe("/app/eligibility/exams");
  });

  test("/app/exams/:slug redirects to /app/eligibility/exams/:slug", () => {
    renderAt("/app/exams/ssc-cgl-2026");
    expect(screen.getByTestId("loc-pathname").textContent).toBe(
      "/app/eligibility/exams/ssc-cgl-2026",
    );
  });

  test("/app/tracker redirects to /app/eligibility/tracker", () => {
    renderAt("/app/tracker");
    expect(screen.getByTestId("loc-pathname").textContent).toBe("/app/eligibility/tracker");
  });

  test("/app/study-plan redirects to /app/study/plan", () => {
    renderAt("/app/study-plan");
    expect(screen.getByTestId("loc-pathname").textContent).toBe("/app/study/plan");
  });

  test("/app/study/home redirects to /app/study", () => {
    renderAt("/app/study/home");
    expect(screen.getByTestId("loc-pathname").textContent).toBe("/app/study");
  });

  test("alias preserves query string", () => {
    renderAt("/app/exams?q=banking&sort=deadline");
    expect(screen.getByTestId("loc-pathname").textContent).toBe("/app/eligibility/exams");
    expect(screen.getByTestId("loc-search").textContent).toBe("?q=banking&sort=deadline");
  });

  test("alias preserves hash fragment", () => {
    renderAt("/app/exams/ssc-cgl-2026#eligibility");
    expect(screen.getByTestId("loc-pathname").textContent).toBe(
      "/app/eligibility/exams/ssc-cgl-2026",
    );
    expect(screen.getByTestId("loc-hash").textContent).toBe("#eligibility");
  });

  test("alias preserves both query string and hash together", () => {
    renderAt("/app/study-plan?week=3#today");
    expect(screen.getByTestId("loc-pathname").textContent).toBe("/app/study/plan");
    expect(screen.getByTestId("loc-search").textContent).toBe("?week=3");
    expect(screen.getByTestId("loc-hash").textContent).toBe("#today");
  });
});

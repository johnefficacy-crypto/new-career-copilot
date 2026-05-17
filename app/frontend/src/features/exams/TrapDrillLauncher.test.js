import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("../../lib/api", () => {
  const get = jest.fn();
  return { __esModule: true, api: { get } };
});

import { api } from "../../lib/api";
import TrapDrillLauncher from "./TrapDrillLauncher";

afterEach(() => {
  api.get.mockReset();
});

test("renders nothing without an exam slug", () => {
  const { container } = render(<TrapDrillLauncher examSlug={null} />);
  expect(container.firstChild).toBeNull();
});

test("renders launcher card with default size in heading", () => {
  render(<TrapDrillLauncher examSlug="upsc-cse" />);
  expect(screen.getByTestId("trap-drill-launcher")).toBeTruthy();
  expect(screen.getByText(/Run a 5-question trap-awareness drill/)).toBeTruthy();
  expect(api.get).not.toHaveBeenCalled();
});

test("clicking Start drill opens the modal and fires the fetch", async () => {
  api.get.mockResolvedValueOnce({
    verified_only: true,
    questions: [],
    total_pool_size: 0,
    trap_annotated_pool_size: 0,
  });
  render(<TrapDrillLauncher examSlug="upsc-cse" topicId="t1" size={3} />);
  fireEvent.click(screen.getByTestId("trap-drill-start"));
  await waitFor(() => screen.getByTestId("trap-drill-modal"));
  expect(api.get).toHaveBeenCalledWith(
    "/api/exam-intelligence/exams/upsc-cse/trap-drill?topic_id=t1&size=3"
  );
});

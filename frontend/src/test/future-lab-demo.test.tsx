import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/services/config", () => ({ DATA_MODE: "synthetic_demo", API_BASE_URL: "" }));
import { FutureLab } from "@/components/future-lab/FutureLab";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("does not substitute mock financial trajectories in synthetic mode", () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  render(<FutureLab />);
  expect(screen.getByText("Connect the backend to explore these futures.")).toBeInTheDocument();
  expect(screen.getByText(/No mock trajectories are substituted/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Purchase amount (USD)")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

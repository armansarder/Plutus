import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/services/financial", () => ({ snapshotQueryOptions: { queryKey: ["situation-test"], queryFn: load, retry: false } }));
vi.mock("@/services/config", () => ({ DATA_MODE: "remote", API_BASE_URL: "" }));
import { BackendSituation, Route } from "@/routes/dashboard";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function page() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BackendSituation /></QueryClientProvider>); }
it("does not preload Alex's financial data in remote mode", async () => {
  const queryClient = new QueryClient();
  const ensure = vi.spyOn(queryClient, "ensureQueryData");
  const loader = Route.options.loader;
  if (typeof loader !== "function") throw new Error("Expected dashboard loader");
  await loader({ context: { queryClient } } as Parameters<typeof loader>[0]);
  expect(ensure).not.toHaveBeenCalled();
});
it("shows an explicit loading state", () => { load.mockReturnValue(new Promise(() => {})); page(); expect(screen.getByRole("status")).toHaveTextContent("Loading"); });
it("shows a retryable error without substituting demo data", async () => { load.mockRejectedValue(new Error("unavailable")); page(); expect(await screen.findByRole("alert")).toHaveTextContent("No demo data has been substituted"); expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument(); });
it("renders backend balance and estimated provenance with unavailable plans", async () => {
  load.mockResolvedValue({ customer: { displayName: "synthetic_demo" }, startDate: "2026-11-07", startingBalanceCents: 80000, cashFlows: [{ id: "pay", date: "2026-11-09", type: "income", amountCents: 100000, label: "Income", provenance: "assumed" }], backend: { synthetic: true, notes: [], basis: "opening" } });
  page(); expect(await screen.findByText("$800")).toBeInTheDocument();
  expect(screen.getByText(/Synthetic demo dataset/)).toHaveTextContent("estimated upcoming");
  expect(screen.getAllByText("Unavailable")).toHaveLength(2);
  expect(screen.queryByText("$600")).not.toBeInTheDocument();
});
it("retries the backend after failure and displays its snapshot", async () => {
  load.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue({ customer: { displayName: "synthetic_demo" }, startDate: "2026-11-07", startingBalanceCents: 80000, cashFlows: [], backend: { synthetic: true, notes: [], basis: "opening" } });
  page();
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  expect(await screen.findByText("$800")).toBeInTheDocument();
  expect(load).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

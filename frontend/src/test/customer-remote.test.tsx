import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRouteWithContext, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/services/config", () => ({ DATA_MODE: "remote", API_BASE_URL: "" }));
import { Route as DashboardRoute } from "@/routes/dashboard";
import { Route as MonthlyRoute } from "@/routes/monthly-plan";
import { Route as SimulatorRoute } from "@/routes/simulator";
import { Route as CashFlowRoute } from "@/routes/cash-flow";
import { Route as AlertsRoute } from "@/routes/alerts";
import { Route as SuggestionsRoute } from "@/routes/suggestions";
import { Route as TalkRoute } from "@/routes/talk";
import { AppShell } from "@/components/app/AppShell";
import { financialDataAdapter, snapshotQueryOptions } from "@/services/financial";
import { situationQueryOptions } from "@/services/situation";
import { budgetAdapter } from "@/services/budgets";
import { simulationAdapter } from "@/services/simulation";
import { historyAdapter } from "@/services/history";
import { agentAdapter, messagingAdapter } from "@/services/agent";
import { SyntheticDataAdapter, SyntheticSimulationAdapter } from "@/mocks/syntheticSimulationAdapter";
import { syntheticBudgetAdapter } from "@/mocks/syntheticBudgetAdapter";
import { financialPayload, forecastPayload } from "./fixtures/engineResponses";

const pages = [
  { path: "/dashboard", Component: DashboardRoute.options.component!, message: "Here's where you stand." },
  { path: "/monthly-plan", Component: MonthlyRoute.options.component!, message: "We don't have your monthly spending plan yet." },
  { path: "/simulator", Component: SimulatorRoute.options.component!, message: "What if you bought it?" },
  { path: "/cash-flow", Component: CashFlowRoute.options.component!, message: "A look at what's next." },
  { path: "/alerts", Component: AlertsRoute.options.component!, message: "We don't have enough information to assess your plan yet." },
  { path: "/suggestions", Component: SuggestionsRoute.options.component!, message: "We don't have your monthly spending plan yet." },
  { path: "/talk", Component: TalkRoute.options.component!, message: "Personalized answers aren't available for this customer yet." },
] as const;
const payload = financialPayload;
let clients: QueryClient[] = [];
function client() { const result = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(result); return result; }
beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); vi.stubGlobal("fetch", vi.fn().mockImplementation(async (path: string) => Response.json(path === "/api/forecast" ? forecastPayload : payload))); });
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); clients = []; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(pages)("uses the backend customer and honest availability on $path", async ({ Component, message, path }) => {
  render(<QueryClientProvider client={client()}><Component /></QueryClientProvider>);
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(screen.getByText(/synthetic_demo/)).toBeInTheDocument();
  expect(screen.getByText(/Synthetic demo dataset/)).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/\$1,800|\$1,600|\$600|Reserved ticket|Emergency fund|Fun & Entertainment/);
  if (path === "/dashboard") expect(screen.getByText("$800")).toBeInTheDocument();
  if (["/dashboard", "/alerts"].includes(path)) {
    expect(screen.getByText(/Backend-only expense/)).toHaveTextContent("Estimated");
    expect(screen.getByText("−$900")).toBeInTheDocument();
  }
  expect(fetch).toHaveBeenCalledTimes(path === "/cash-flow" ? 2 : 1);
  expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("/api/financial-data");
});

it.each(pages)("does not fall back after a backend failure on $path", async ({ Component }) => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));
  render(<QueryClientProvider client={client()}><Component /></QueryClientProvider>);
  expect(await screen.findByRole("alert")).toHaveTextContent("No demo data has been substituted");
  expect(screen.queryByText(/\$1,800|\$600|Reserved ticket/)).not.toBeInTheDocument();
  vi.mocked(fetch).mockImplementation(async () => Response.json(payload));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText(/synthetic_demo/)).toBeInTheDocument();
});

it("keeps customer identity and one shared snapshot while navigating all financial pages", async () => {
  const demoSnapshot = vi.spyOn(SyntheticDataAdapter.prototype, "getSnapshot");
  const demoSimulation = vi.spyOn(SyntheticSimulationAdapter.prototype, "compareScenarios");
  const demoPlan = vi.spyOn(syntheticBudgetAdapter, "getPlan");
  const queryClient = client();
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: () => <AppShell><Outlet /></AppShell> });
  const tree = root.addChildren(pages.map(({ path, Component }) => createRoute({ getParentRoute: () => root, path, component: Component })));
  const router = createRouter({ routeTree: tree, history: createMemoryHistory({ initialEntries: ["/dashboard"] }), context: { queryClient } });
  render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
  expect(await screen.findByText("$800")).toBeInTheDocument();
  for (const { path, message } of pages.slice(1)) {
    const link = screen.getAllByRole("link").find(l => l.getAttribute("href") === path);
    expect(link).toBeDefined();
    fireEvent.click(link!);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText(/synthetic_demo/)).toBeInTheDocument();
    expect(screen.getByText("Backend-connected data")).toBeInTheDocument();
    expect(screen.queryByText("Synthetic demo data · Alex")).not.toBeInTheDocument();
  }
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(demoSnapshot).not.toHaveBeenCalled();
  expect(demoSimulation).not.toHaveBeenCalled();
  expect(demoPlan).not.toHaveBeenCalled();
});

it("shares the legacy and global snapshot queries and blocks unconnected capabilities", async () => {
  expect(snapshotQueryOptions).toBe(situationQueryOptions);
  const snapshot = await financialDataAdapter.getSnapshot();
  expect(snapshot.customer.displayName).toBe("synthetic_demo");
  expect(await budgetAdapter.getPlan("2026-11")).toBeNull();
  await expect(simulationAdapter.compareScenarios({ snapshotId: snapshot.snapshotId, startDate: snapshot.startDate, horizonDays: 30, bufferCents: 0, scenarios: [] })).rejects.toThrow("not available");
  await expect(historyAdapter.getYearHistory(2026)).rejects.toThrow("not available");
  await expect(agentAdapter.ask("Can I buy a laptop?")).rejects.toThrow("not available");
  await expect(messagingAdapter.getStatus()).rejects.toThrow("not available");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("does not preload demo dependencies from any remote route loader", async () => {
  const queryClient = client();
  const ensure = vi.spyOn(queryClient, "ensureQueryData");
  for (const route of [DashboardRoute, MonthlyRoute, SimulatorRoute, CashFlowRoute, AlertsRoute, SuggestionsRoute]) {
    const loader = route.options.loader;
    if (typeof loader !== "function") throw new Error("Expected loader");
    await (loader as (args: { context: { queryClient: QueryClient } }) => unknown)({ context: { queryClient } });
  }
  expect(ensure).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

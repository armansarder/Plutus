import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRouteWithContext, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/services/config", () => ({ DATA_MODE: "synthetic_demo", API_BASE_URL: "" }));
import { Route as CurrentSituationRoute } from "@/routes/dashboard";
import { Route as MonthlyPlanRoute } from "@/routes/monthly-plan";
import { Route as SimulatorRoute } from "@/routes/simulator";
import { Route as CashFlowRoute } from "@/routes/cash-flow";
import { Route as AlertsRoute } from "@/routes/alerts";
import { Route as SuggestionsRoute } from "@/routes/suggestions";
import { Route as TalkRoute } from "@/routes/talk";
import { AppShell } from "@/components/app/AppShell";
import { DecisionProvider } from "@/components/app/DecisionContext";
import { financialDataAdapter, snapshotQueryOptions } from "@/services/financial";
import { situationQueryOptions } from "@/services/situation";
import { budgetQueryOptions } from "@/services/budgets";
import { baselineQueryOptions } from "@/services/simulation";
import { yearHistoryQueryOptions } from "@/services/history";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("keeps every demo page on Alex's independent records without backend access", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("Demo must not fetch"));
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const queryClient = new QueryClient();
  try {
    expect(snapshotQueryOptions).toBe(situationQueryOptions);
    const snapshot = await queryClient.ensureQueryData(snapshotQueryOptions);
    expect(snapshot.customer.displayName).toBe("Alex");
    expect(snapshot.startingBalanceCents).toBe(180000);
    expect(await financialDataAdapter.getSnapshot()).toEqual(snapshot);
    const [plan, baseline, history] = await Promise.all([
      queryClient.ensureQueryData(budgetQueryOptions("2026-11")),
      queryClient.ensureQueryData(baselineQueryOptions(snapshot.snapshotId, snapshot.startDate)),
      queryClient.ensureQueryData(yearHistoryQueryOptions(2026)),
    ]);
    expect(plan?.categories.find(c => c.categoryId === "savings")?.allocatedCents).toBe(60000);
    expect(baseline.snapshotId).toBe(snapshot.snapshotId);
    expect(history.months).toHaveLength(10);
    const pages = [
      { path: "/dashboard", Component: CurrentSituationRoute.options.component!, heading: "Here's where you stand." },
      { path: "/monthly-plan", Component: MonthlyPlanRoute.options.component!, heading: "Make room for what matters." },
      { path: "/simulator", Component: SimulatorRoute.options.component!, heading: "What if you bought it?" },
      { path: "/cash-flow", Component: CashFlowRoute.options.component!, heading: "A look at what's next." },
      { path: "/alerts", Component: AlertsRoute.options.component!, heading: "A gentle heads-up." },
      { path: "/suggestions", Component: SuggestionsRoute.options.component!, heading: "A few possibilities for you." },
      { path: "/talk", Component: TalkRoute.options.component!, heading: "Ask Plutus anything about your money." },
    ];
    const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: () => <DecisionProvider><AppShell><Outlet /></AppShell></DecisionProvider> });
    const tree = root.addChildren(pages.map(({ path, Component }) => createRoute({ getParentRoute: () => root, path, component: Component })));
    const router = createRouter({ routeTree: tree, history: createMemoryHistory({ initialEntries: ["/dashboard"] }), context: { queryClient } });
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    expect(await screen.findByText("$1,800")).toBeInTheDocument();
    for (const { path, heading } of pages.slice(1)) {
      const link = screen.getAllByRole("link").find(l => l.getAttribute("href") === path);
      fireEvent.click(link!);
      expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
      expect(screen.getByText("Synthetic demo data · Alex")).toBeInTheDocument();
      expect(screen.queryByText(/synthetic_demo/)).not.toBeInTheDocument();
      expect(screen.queryByText("Backend-connected data")).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Can I afford a $500 laptop?" }));
    expect(await screen.findByText(/\$500 · Laptop/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  } finally { cleanup(); queryClient.clear(); }
}, 10000);

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRouteWithContext, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/services/config", () => ({ DATA_MODE: "remote", API_BASE_URL: "" }));
import { Route as Dashboard } from "@/routes/dashboard";
import { Route as MonthlyPlan } from "@/routes/monthly-plan";
import { Route as Simulator } from "@/routes/simulator";
import { Route as CashFlow } from "@/routes/cash-flow";
import { Route as Alerts } from "@/routes/alerts";
import { Route as Suggestions } from "@/routes/suggestions";
import { Route as Talk } from "@/routes/talk";
import { AppShell } from "@/components/app/AppShell";
import { BackendSituationAdapter } from "@/services/situation";
import { nessieFinancial, nessieForecast } from "./fixtures/nessieResponses";
import { proxyFinancialData } from "@/financialProxy.server";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("keeps the same Nessie customer and accurate source badge across every financial page", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const fetch = vi.fn(async (url: string) => Response.json(url === "/api/forecast" ? nessieForecast : nessieFinancial));
  vi.stubGlobal("fetch", fetch);
  const queryClient = new QueryClient();
  try {
    const pages = [
      { path: "/dashboard", route: Dashboard, heading: "Here's where you stand." },
      { path: "/monthly-plan", route: MonthlyPlan, heading: "Make room for what matters." },
      { path: "/simulator", route: Simulator, heading: "What if you bought it?" },
      { path: "/cash-flow", route: CashFlow, heading: "A look at what's next." },
      { path: "/alerts", route: Alerts, heading: "A gentle heads-up." },
      { path: "/suggestions", route: Suggestions, heading: "A few possibilities for you." },
      { path: "/talk", route: Talk, heading: "Explore a purchase with Plutus." },
    ];
    const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: () => <AppShell><Outlet /></AppShell> });
    const tree = root.addChildren(pages.map(({ path, route }) => createRoute({ getParentRoute: () => root, path, component: route.options.component! })));
    const router = createRouter({ routeTree: tree, history: createMemoryHistory({ initialEntries: ["/dashboard"] }), context: { queryClient } });
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    expect(await screen.findByText("$1,250.25")).toBeInTheDocument();
    for (const { path, heading } of pages) {
      fireEvent.click(screen.getAllByRole("link").find(l => l.getAttribute("href") === path)!);
      expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
      expect(screen.getByText("Nessie sandbox data")).toBeInTheDocument();
      expect(screen.getByText(/nessie_test_customer/)).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/synthetic_demo|\$1,800|\$600|Alex|Emergency fund/);
    }
    expect(fetch.mock.calls.filter(c => c[0] === "/api/financial-data")).toHaveLength(1);
    expect(fetch.mock.calls.every(c => ["/api/financial-data", "/api/forecast"].includes(c[0]))).toBe(true);
  } finally { cleanup(); queryClient.clear(); }
});

it("preserves server-declared Nessie provenance through the existing secure proxy", async () => {
  vi.stubEnv("FINPILOT_API_TOKEN", "test-server-token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(nessieFinancial)));
  const response = await proxyFinancialData(new Request("http://localhost/api/financial-data"));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.source).toBe("nessie_sandbox");
  expect(body.data).not.toHaveProperty("historical_transactions");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
  const snapshot = await new BackendSituationAdapter().getSnapshot();
  expect(snapshot.backend?.source).toBe("nessie_sandbox");
  expect(snapshot.backend?.synthetic).toBe(false);
  expect(snapshot.customer.displayName).toBe("nessie_test_customer");
  expect(snapshot.startingBalanceCents).toBe(125025);
});

it("does not mislabel an unknown configured backend as Nessie", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: nessieFinancial.data })));
  const snapshot = await new BackendSituationAdapter().getSnapshot();
  expect(snapshot.source).toBe("configured_backend");
});

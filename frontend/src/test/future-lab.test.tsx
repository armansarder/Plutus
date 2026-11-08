import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/services/config", () => ({ DATA_MODE: "remote", API_BASE_URL: "" }));
vi.mock("@/components/future-lab/FutureLabChart", () => ({ FUTURE_COLORS: { "Buy now": "red", "Buy later": "blue", "Skip purchase": "green" }, FutureLabChart: () => <div role="img" aria-label="Backend comparison chart" /> }));
import { FutureLab } from "@/components/future-lab/FutureLab";
import { BackendSituationAdapter } from "@/services/situation";
import { balanceAt, eventDates, reserveBreach, validateFutureLab } from "@/services/futureLab";
import { engineComparisonSchema } from "@/types/engine";
import { futureLabCouncil } from "@/services/futureLabCouncil";
import { nessieFinancial } from "./fixtures/nessieResponses";
import { futureLabComparisons } from "./fixtures/futureLabResponses";
import { QueryClient as RoutingClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";

let clients: QueryClient[] = [];
const responseFor = (amount: string) => futureLabComparisons[amount as keyof typeof futureLabComparisons] ?? futureLabComparisons["400.00"];
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => Response.json(url === "/api/financial-data" ? nessieFinancial : responseFor(JSON.parse(init!.body as string).scenarios[0].purchase_amount)))); });
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); clients = []; vi.unstubAllGlobals(); });
function page() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client); return render(<QueryClientProvider client={client}><FutureLab /></QueryClientProvider>); }
async function ready() { return screen.findByRole("button", { name: "Explore Buy now" }, { timeout: 5000 }); }
function compareCalls() { return vi.mocked(fetch).mock.calls.filter(c => c[0] === "/api/compare"); }

it("registers the standalone route", () => {
  const router = createRouter({ routeTree, context: { queryClient: new RoutingClient() } });
  expect(router.matchRoutes("/future-lab").at(-1)?.routeId).toBe("/future-lab");
});

it("compares all three futures using one authenticated-adapter request and the selected Nessie customer", async () => {
  page(); await ready();
  expect(screen.getByText(/Nessie sandbox data/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Explore Buy later" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Explore Skip purchase" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Backend comparison chart" })).toBeInTheDocument();
  expect(within(screen.getByRole("button", { name: "Explore Buy now" })).getAllByText("$740.25")).toHaveLength(2);
  expect(screen.getByText(/Category budgets and protected savings may be unavailable/)).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/Alex|synthetic_demo|\$1,800|guaranteed|Fully affordable/);
  expect(compareCalls()).toHaveLength(1);
  const init = compareCalls()[0]![1]!;
  expect(new Headers(init.headers).has("Authorization")).toBe(false);
  expect(JSON.parse(init.body as string)).toEqual({ scenarios: [
    { name: "Buy now", purchase_amount: "400.00", purchase_date: "2026-11-08" },
    { name: "Buy later", purchase_amount: "400.00", purchase_date: "2026-11-15" },
    { name: "Skip purchase", purchase_amount: "0.00", purchase_date: "2026-11-08" },
  ] });
});

it("scrubs actual event balances, switches futures, and exposes reserve-breaching events", async () => {
  page(); await ready();
  fireEvent.change(screen.getByLabelText("Inspect date"), { target: { value: "2026-11-09" } });
  expect(screen.getByTestId("inspected-balance")).toHaveTextContent("$740.25");
  expect(screen.getByText("Source-dated bill")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Explore Skip purchase" }));
  expect(screen.getByTestId("inspected-balance")).toHaveTextContent("$1,140.25");
  expect(screen.getByRole("button", { name: "Explore Skip purchase" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.change(screen.getByLabelText("Minimum cash reserve (USD)"), { target: { value: "1200" } });
  expect(screen.queryByTestId("inspected-balance")).not.toBeInTheDocument();
  await ready();
  expect(await screen.findByText(/First reserve breach/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Inspect reserve breach" }));
  expect(screen.getByLabelText("Inspect date")).toHaveValue("2026-11-09");
  expect(compareCalls()).toHaveLength(2); // Reserve changes also revalidate against the backend.
});

it("validates edits and debounces rapid changes without sending invalid inputs", async () => {
  page(); await ready();
  const amount = screen.getByLabelText("Purchase amount (USD)");
  fireEvent.change(amount, { target: { value: "bad" } });
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a purchase amount");
  expect(screen.queryByRole("button", { name: "Explore Buy now" })).not.toBeInTheDocument();
  fireEvent.change(amount, { target: { value: "100" } });
  fireEvent.change(amount, { target: { value: "300" } });
  await ready();
  expect(compareCalls()).toHaveLength(2);
  expect(JSON.parse(compareCalls()[1]![1]!.body as string).scenarios[0].purchase_amount).toBe("300.00");
});

it("aborts older requests and ignores late responses when inputs change", async () => {
  const pending = new Map<string, { finish: (response: Response) => void; signal: AbortSignal | null | undefined }>();
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (url === "/api/financial-data") return Response.json(nessieFinancial);
    const amount = JSON.parse(init!.body as string).scenarios[0].purchase_amount;
    if (amount === "400.00") return Response.json(responseFor(amount));
    return new Promise<Response>(finish => { pending.set(amount, { finish, signal: init?.signal }); });
  });
  page(); await ready();
  fireEvent.change(screen.getByLabelText("Purchase amount (USD)"), { target: { value: "100" } });
  await waitFor(() => expect(pending.has("100.00")).toBe(true), { timeout: 3000 });
  fireEvent.change(screen.getByLabelText("Purchase amount (USD)"), { target: { value: "300" } });
  expect(pending.get("100.00")!.signal?.aborted).toBe(true);
  await waitFor(() => expect(pending.has("300.00")).toBe(true), { timeout: 3000 });
  pending.get("300.00")!.finish(Response.json(responseFor("300.00")));
  await ready();
  expect(within(screen.getByRole("button", { name: "Explore Buy now" })).getAllByText("$840.25")).toHaveLength(2);
  pending.get("100.00")!.finish(Response.json(responseFor("100.00")));
  await waitFor(() => expect(within(screen.getByRole("button", { name: "Explore Buy now" })).queryByText("$1,040.25")).not.toBeInTheDocument());
});

it("retries errors without demo or stale results and keeps Council handoff honestly disabled", async () => {
  vi.mocked(fetch).mockImplementation(async url => url === "/api/financial-data" ? Response.json(nessieFinancial) : new Response("", { status: 503 }));
  page();
  expect(await screen.findByRole("alert", {}, { timeout: 5000 })).toHaveTextContent("No demo or stale balances were substituted");
  vi.mocked(fetch).mockImplementation(async url => Response.json(url === "/api/financial-data" ? nessieFinancial : responseFor("400.00")));
  fireEvent.click(screen.getByRole("button", { name: "Try again" })); await ready();
  expect(screen.getByRole("button", { name: /Send selected future to Council/ })).toBeDisabled();
  expect(screen.getByText(/Council handoff contract has not been provided/)).toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.every(c => ["/api/financial-data", "/api/compare"].includes(String(c[0])))).toBe(true);
});

it("selects returned balances without summing events and detects an opening reserve breach", async () => {
  const comparison = engineComparisonSchema.parse(futureLabComparisons["400.00"].data);
  const now = comparison.scenarios[0]!;
  expect(eventDates(comparison)).toContain("2026-11-09");
  expect(balanceAt(now, "2026-11-09")).toBe("740.25");
  expect(balanceAt(now, "2026-11-10")).toBe("740.25");
  expect(reserveBreach(now, "1300.00")?.date).toBe(now.as_of_date);
  expect(reserveBreach(now, "200.00")).toBeNull();
  const snapshot = await new BackendSituationAdapter().getSnapshot();
  expect(validateFutureLab({ amount: "400", purchaseDate: "2026-11-07", comparisonDate: "2026-11-15", reserve: "200" }, snapshot).error).toMatch(/next 90 days/);
  expect(validateFutureLab({ amount: "400", purchaseDate: "2026-11-08", comparisonDate: "2026-11-08", reserve: "200" }, snapshot).error).toBeTruthy();
  expect(futureLabCouncil.available).toBe(false);
});

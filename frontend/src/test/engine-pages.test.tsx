import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/services/config", () => ({ DATA_MODE: "remote", API_BASE_URL: "" }));
vi.mock("@tanstack/react-router", async importOriginal => ({ ...await importOriginal<typeof import("@tanstack/react-router")>(), Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a> }));
import { BackendSimulator } from "@/components/simulator/BackendSimulator";
import { BackendCashFlow } from "@/components/financial/BackendCashFlow";
import { DecisionProvider } from "@/components/app/DecisionContext";
import { financialPayload, simulationPayload, comparisonPayload, forecastPayload, historyPayload } from "./fixtures/engineResponses";

const payloads: Record<string, unknown> = { "/api/financial-data": financialPayload, "/api/simulate": simulationPayload, "/api/compare": comparisonPayload, "/api/forecast": forecastPayload, "/api/history?months=12": historyPayload };
let clients: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(payloads[url])));
});
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); clients = []; vi.unstubAllGlobals(); });
function page(children: ReactNode) { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client); return render(<QueryClientProvider client={client}><DecisionProvider>{children}</DecisionProvider></QueryClientProvider>); }
function Pages() { const [cash, setCash] = useState(false); return <><button onClick={() => setCash(true)}>Open cash flow</button>{cash ? <BackendCashFlow /> : <BackendSimulator />}</>; }

it("shows backend-calculated purchase alternatives and retains them in Cash Flow", async () => {
  page(<Pages />);
  const submit = await screen.findByRole("button", { name: "Compare choices" });
  expect(screen.getByText(/Budget affordability cannot yet be determined/)).toBeInTheDocument();
  expect(screen.queryByText("Fits your plan")).not.toBeInTheDocument();
  fireEvent.click(submit);
  expect(await screen.findByText("A cash shortfall is projected.")).toBeInTheDocument();
  expect(screen.getByText("−$500")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Buy later" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Skip purchase" })).toBeInTheDocument();
  expect(screen.getByText(/Event-day closing balances/)).toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.map(c => c[0])).toEqual(["/api/financial-data", "/api/simulate", "/api/compare"]);
  fireEvent.click(screen.getByRole("button", { name: "Open cash flow" }));
  expect(await screen.findByText(/Daily closing balances/)).toBeInTheDocument();
  expect(screen.getByText("−$100")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Last purchase comparison" }));
  expect(await screen.findByText("−$500")).toBeInTheDocument();
  expect(screen.getByText(/synthetic_demo/)).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/\$1,800|\$600|Reserved ticket|Emergency fund/);
});

it("validates purchase inputs before submitting financial requests", async () => {
  page(<BackendSimulator />);
  const amount = await screen.findByLabelText("Purchase amount (USD)");
  fireEvent.change(amount, { target: { value: "-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Compare choices" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter a purchase amount");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("shows a retryable calculation failure and never displays old demo results", async () => {
  vi.mocked(fetch).mockImplementation(async url => url === "/api/simulate" ? new Response("", { status: 422 }) : Response.json(payloads[url as string]));
  page(<BackendSimulator />);
  fireEvent.click(await screen.findByRole("button", { name: "Compare choices" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No demo results were substituted");
  expect(screen.queryByText("Fits your plan")).not.toBeInTheDocument();
  vi.mocked(fetch).mockImplementation(async url => Response.json(payloads[url as string]));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("−$500")).toBeInTheDocument();
});

it("keeps the forecast working when history is unavailable, with an independent retry", async () => {
  vi.mocked(fetch).mockImplementation(async url => url === "/api/history?months=12" ? new Response("", { status: 503 }) : Response.json(payloads[url as string]));
  page(<BackendCashFlow />);
  expect(await screen.findByText(/Daily closing balances/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "History" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No demo history has been substituted");
  vi.mocked(fetch).mockImplementation(async url => Response.json(payloads[url as string]));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("2026-10")).toBeInTheDocument();
  expect(screen.getByText("$58")).toBeInTheDocument();
  expect(screen.queryByText(/protected savings.*\$58/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Next 30 days" }));
  expect(await screen.findByText(/Daily closing balances/)).toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.filter(c => c[0] === "/api/forecast")).toHaveLength(1);
});

it("keeps loading and forecast errors explicit without synthetic fallback", async () => {
  vi.mocked(fetch).mockImplementation(async url => url === "/api/forecast" ? new Response("", { status: 503 }) : Response.json(payloads[url as string]));
  page(<BackendCashFlow />);
  expect(await screen.findByRole("alert")).toHaveTextContent("No demo results were substituted");
  vi.mocked(fetch).mockImplementation(async url => Response.json(payloads[url as string]));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.getByText(/Daily closing balances/)).toBeInTheDocument());
});

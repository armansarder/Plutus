import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/services/config", () => ({ DATA_MODE: "remote", API_BASE_URL: "" }));
import { BackendTalk } from "@/components/chat/BackendTalk";
import { NemotronResult } from "@/components/chat/NemotronResult";
import { SyntheticAgentAdapter } from "@/mocks/syntheticAgentAdapter";
import { financialPayload } from "./fixtures/engineResponses";
import { agentFallback, agentNemotron } from "./fixtures/nemotronResponses";

let clients: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url === "/api/financial-data" ? financialPayload : agentFallback)));
});
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); clients = []; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function page() { const client = new QueryClient(); clients.push(client); const wrap = (children: ReactNode) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; return { ...render(wrap(<BackendTalk />)), wrap, client }; }
async function fill(allowModel = false) {
  fireEvent.change(await screen.findByLabelText("Your question"), { target: { value: "What if my paycheck arrives late?" } });
  fireEvent.change(screen.getByLabelText("Purchase amount (USD)"), { target: { value: "400" } });
  fireEvent.change(screen.getByLabelText("Purchase date"), { target: { value: "2026-11-08" } });
  if (!allowModel) fireEvent.click(screen.getByRole("checkbox"));
}
function send() { fireEvent.click(screen.getByRole("button", { name: "Check this purchase" })); }

it("submits confirmed fields to the real endpoint and labels deterministic fallback honestly", async () => {
  const demo = vi.spyOn(SyntheticAgentAdapter.prototype, "ask");
  page(); await fill();
  expect(fetch).toHaveBeenCalledTimes(1);
  send();
  expect(await screen.findByText("Deterministic fallback")).toBeInTheDocument();
  expect(screen.queryByText(/0 of 2 applicable stress tests/)).not.toBeInTheDocument();
  expect(screen.getByText(/does not confirm full budget affordability/)).toBeInTheDocument();
  expect(screen.queryByText(/Fits your plan/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Fun budget left/)).not.toBeInTheDocument();
  expect(screen.getByText(/synthetic_demo · Talk to Plutus/)).toBeInTheDocument();
  const [url, init] = vi.mocked(fetch).mock.calls[1]!;
  expect(url).toBe("/api/agent/run");
  expect(JSON.parse(init!.body as string)).toEqual({ message: "What if my paycheck arrives late?", purchase_amount: "400.00", purchase_date: "2026-11-08", reserve: "200.00", horizon_days: 30, allow_model: false, channel: "web" });
  expect(new Headers(init!.headers).has("Authorization")).toBe(false);
  expect(demo).not.toHaveBeenCalled();
});

it("requires explicit purchase fields rather than interpreting amounts in a question", async () => {
  page();
  fireEvent.change(await screen.findByLabelText("Your question"), { target: { value: "Can I afford a $500 laptop?" } });
  send();
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter a purchase");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("shows pending state and retries a real failure without fabricated answers", async () => {
  vi.mocked(fetch).mockImplementation(async url => url === "/api/agent/run" ? new Response("", { status: 503 }) : Response.json(financialPayload));
  page(); await fill(true); send();
  expect(await screen.findByRole("alert")).toHaveTextContent("No demo response was substituted");
  expect(screen.queryByText(/Deterministic fallback/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Nemotron investigation/)).not.toBeInTheDocument();
  vi.mocked(fetch).mockImplementation(async url => Response.json(url === "/api/financial-data" ? financialPayload : agentNemotron));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Nemotron investigation")).toBeInTheDocument();
  expect(screen.getByText("What if my paycheck arrives late?")).toBeInTheDocument();
});

it("keeps completed conversation in memory across navigation, with explicit clearing", async () => {
  const view = page(); await fill(); send();
  await screen.findByText(/Deterministic fallback/);
  view.rerender(view.wrap(<div>Another page</div>));
  view.rerender(view.wrap(<BackendTalk />));
  expect(await screen.findByText(/Deterministic fallback/)).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Clear conversation" }));
  await waitFor(() => expect(screen.queryByText("What if my paycheck arrives late?")).not.toBeInTheDocument());
  expect(screen.queryByText(/Deterministic fallback/)).not.toBeInTheDocument();
});

it("cancels pending analysis on navigation and rejects late responses", async () => {
  let complete!: (response: Response) => void;
  vi.mocked(fetch).mockImplementation(async url => url === "/api/agent/run" ? new Promise<Response>(resolve => { complete = resolve; }) : Response.json(financialPayload));
  const view = page(); await fill(); send();
  expect(await screen.findByRole("status")).toHaveTextContent("Checking");
  expect(screen.getByRole("button", { name: /Checking/ })).toBeDisabled();
  view.rerender(view.wrap(<div>Another page</div>));
  complete(Response.json(agentNemotron));
  view.rerender(view.wrap(<BackendTalk />));
  expect(await screen.findByRole("alert")).toHaveTextContent("Analysis cancelled");
  await waitFor(() => expect(screen.queryByText(/Nemotron investigation/)).not.toBeInTheDocument());
});

it("renders no-income applicability without inflating stress counts", async () => {
  const response = structuredClone(agentFallback);
  response.scenarios.find(s => s.name === "delayed_income")!.applicable = false;
  response.stress_tests_total = 1;
  response.stress_tests_passed = 0;
  render(<NemotronResult response={response} />);
  fireEvent.click(screen.getByText("Explore the details"));
  expect(await screen.findByText(/0 of 1 applicable stress tests/)).toBeInTheDocument();
  expect(screen.getByText(/Not applicable: no eligible income/)).toBeInTheDocument();
});

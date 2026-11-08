import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { isRedirect } from "@tanstack/react-router";
vi.mock("@/services/council",()=>({COUNCIL_UI_ENABLED:true}));
vi.mock("@/components/chat/CouncilWorkspace",()=>({CouncilWorkspace:()=> <div>Council and specialist workspace</div>}));
import { TalkWorkspace } from "@/components/chat/TalkWorkspace";
import { Route as Suggestions } from "@/routes/suggestions";
import { Route as MonthlyPlan } from "@/routes/monthly-plan";
import { Route as Alerts } from "@/routes/alerts";
afterEach(cleanup);
it("opens the existing Council workspace directly without the legacy purchase-analysis selector",()=>{
 render(<TalkWorkspace/>);
 expect(screen.getByText("Council and specialist workspace")).toBeVisible();
 expect(screen.queryByRole("button",{name:/purchase analysis/i})).not.toBeInTheDocument();
 expect(screen.queryByLabelText("Analysis experience")).not.toBeInTheDocument();
});
it.each([Suggestions,Alerts,MonthlyPlan])("redirects retired page bookmarks to Current situation",route=>{
 try {
  (route.options.beforeLoad as unknown as ()=>unknown)();
  throw new Error("Expected retired page redirect");
 } catch(error) {
  expect(isRedirect(error)).toBe(true);
  if (isRedirect(error)) expect(error.options).toMatchObject({to:"/dashboard",replace:true});
 }
});

import { createFileRoute, redirect } from "@tanstack/react-router";

// Planning controls now live in Current Situation.
export const Route = createFileRoute("/monthly-plan")({
  beforeLoad: () => { throw redirect({to: "/dashboard", replace: true}); },
});

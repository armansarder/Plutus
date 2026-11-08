import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired page: preserve old bookmarks without exposing the removed feature.
export const Route = createFileRoute("/alerts")({
  beforeLoad: () => { throw redirect({to: "/dashboard", replace: true}); },
});

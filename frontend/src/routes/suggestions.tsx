import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired page: preserve old bookmarks without exposing the removed feature.
export const Route = createFileRoute("/suggestions")({
  beforeLoad: () => { throw redirect({to: "/dashboard", replace: true}); },
});

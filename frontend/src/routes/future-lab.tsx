import { createFileRoute } from "@tanstack/react-router";
import { FutureLab } from "@/components/future-lab/FutureLab";

export const Route = createFileRoute("/future-lab")({
  head: () => ({ meta: [
    { title: "Future Lab — Plutus" },
    { name: "description", content: "Explore buy now, buy later and skip futures with backend-calculated cash-flow evidence." },
  ] }),
  component: FutureLab,
});

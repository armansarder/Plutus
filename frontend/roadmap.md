# Plutus Stage 2 & 3

## Phase A — Stage 2 (financial awareness)
- [x] Centralize proposed backend endpoint paths (`src/services/endpoints.ts`).
- [x] Cash Flow: "Next 30 Days | Year So Far" segmented control; colored clickable event markers; labeled synthetic year history view.
- [x] Alerts page (`/alerts`) derived from real plan/snapshot/baseline calculations; statuses; demo-labeled.
- [x] Current Situation: three health indicators (Monthly plan, Savings goal, Upcoming bills) with explanations.
- [x] Current Situation: lightweight milestones section.
- [x] Navigation: add Alerts and Talk to Plutus.

## Phase B — Stage 3 (assistant frontend)
- [x] Typed agent/messaging contracts + adapters (synthetic default, HTTP stubs; never silent fallback).
- [x] Talk to Plutus page (`/talk`): chat UI, suggested questions, loading/error states, mic control when supported.
- [x] Structured affordability answers from real simulation runs; "Compare these options" → Simulator.
- [x] Devil's Advocate: "We checked a few possibilities" cards from real stress-test simulations.
- [x] Photon section: "Prefer texting?" with honest "Messaging demo — not connected" state.
- [x] Suggestions page: Demo recommendation badges, collapsible "Why Plutus suggested it", Try this scenario.

## Verify & wrap up
- [x] New tests (alerts, history, agent) + full suite green (55 tests).
- [x] Browser check: new pages, navigation, mobile.
- [x] Update README / SECURITY_HANDOFF / AGENTS.md / memory; commit.

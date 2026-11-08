import { createFileRoute } from "@tanstack/react-router";
import { AlertsWorkspace } from "@/components/notifications/AlertsWorkspace";
export const Route=createFileRoute("/alerts")({head:()=>({meta:[{title:"Alerts — Plutus"},{name:"description",content:"Account-based purchase and spending alerts, with optional Photon texts."}]}),component:AlertsWorkspace});

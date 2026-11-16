import { createFileRoute, notFound } from "@tanstack/react-router";
import { OperatorWorkspace } from "@/components/notifications/OperatorWorkspace";
export const Route=createFileRoute("/operator")({
 beforeLoad:async()=>{if(typeof window!=="undefined"){const r=await fetch('/api/operator/jobs');if(!r.ok)throw notFound();}},
 component:OperatorWorkspace,
});

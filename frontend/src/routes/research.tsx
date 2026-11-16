import { createFileRoute,notFound } from "@tanstack/react-router";
import { ResearchWorkspace } from "@/components/research/ResearchWorkspace";
export const Route=createFileRoute('/research')({beforeLoad:async()=>{if(typeof window!=='undefined'){const r=await fetch('/api/operator/jobs');if(!r.ok)throw notFound();}},component:ResearchWorkspace});

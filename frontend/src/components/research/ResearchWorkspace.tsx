import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { multiverseSchema } from "@/types/multiverse";
import { PageHeading } from "@/components/app/PageHeading";
import { Button } from "@/components/ui/button";
import { CashFlowChart } from "@/components/financial/CashFlowChart";
import { centsValue } from "@/services/engine";
export const researchSchema=z.object({experiment_version:z.literal('pilot-1'),source:z.literal('research_scenario'),instance_id:z.string(),condition:z.string(),assigned_recommendation:z.string(),explanation:z.string(),simulated_presentation:z.literal(true),collection_enabled:z.literal(false),financial_truth:multiverseSchema});
export function ResearchWorkspace(){
 const [scenario,setScenario]=useState('comfortable'),[condition,setCondition]=useState('direct'),[seed,setSeed]=useState('42'),[data,setData]=useState<z.infer<typeof researchSchema>|null>(null),[error,setError]=useState('');
 const revision=useRef(0),abort=useRef<AbortController|null>(null);
 useEffect(()=>()=>abort.current?.abort(),[]);
 function invalidate(){revision.current++;abort.current?.abort();setData(null);}
 async function show(){invalidate();const current=revision.current;const controller=new AbortController();abort.current=controller;setError('');try{const r=await fetch('/api/research/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario_id:scenario,seed:Number(seed),condition}),signal:controller.signal});if(!r.ok)throw new Error();const value=researchSchema.parse(await r.json());if(current===revision.current&&!controller.signal.aborted)setData(value);}catch{if(current===revision.current&&!controller.signal.aborted)setError('Research preview unavailable. Check private authorization, configuration and seed.');}}
 return <div><PageHeading eyebrow="Private research preview" title="Controlled recommendation pilot" description="Research Scenario · Fictional personas only. No participant responses are collected. University approval and consent procedures are required before a human study."/>
 <form className="panel my-5 flex flex-wrap gap-4 p-5" onSubmit={e=>{e.preventDefault();void show();}}>
 <label>Scenario<select className="ml-2 border p-2" value={scenario} onChange={e=>{setScenario(e.target.value);invalidate();}}>{['comfortable','tight_timing','shortfall'].map(s=><option key={s}>{s}</option>)}</select></label>
 <label>Presentation<select className="ml-2 border p-2" value={condition} onChange={e=>{setCondition(e.target.value);invalidate();}}>{['direct','evidence','multi_agent','uncertainty'].map(s=><option key={s}>{s}</option>)}</select></label>
 <label>Seed<input className="ml-2 w-24 border p-2" type="number" min="0" max="2147483647" value={seed} onChange={e=>{setSeed(e.target.value);invalidate();}}/></label><Button type="submit">Preview condition</Button></form>
 {error&&<p role="alert">{error}</p>}{data&&<section className="panel p-5"><p className="text-xs">{data.experiment_version} · {data.instance_id} · Collection disabled · Templated experimental presentation, no live agents consulted</p><h2 className="my-3 text-xl">{data.assigned_recommendation.replaceAll('_',' ')}</h2><p>{data.explanation}</p><details className="mt-5"><summary>Researcher financial truth (identical across conditions)</summary><CashFlowChart bufferCents={centsValue(data.financial_truth.reserve)} events={[]} series={data.financial_truth.scenarios.filter(s=>s.applicable).map((s,i)=>({shortName:s.name,color:['var(--brand)','var(--scenario-now)','var(--scenario-later)'][i%3]!,result:{id:s.name,lowestBalanceDate:s.forecast.minimum_balance_date,lowestBalanceCents:centsValue(s.forecast.minimum_balance),dailyBalances:s.forecast.daily_balances.map(p=>({date:p.date,endOfDayBalanceCents:centsValue(p.ending_balance)}))}}))}/><pre className="overflow-auto text-xs">{JSON.stringify(data.financial_truth.scenarios.map(s=>({scenario:s.name,minimum:s.forecast.minimum_balance,ending:s.forecast.ending_balance})),null,2)}</pre></details></section>}
 </div>;
}

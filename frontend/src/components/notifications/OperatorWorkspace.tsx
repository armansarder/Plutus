import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/app/PageHeading";
type Job={id:string;kind:string;status:string;attempts:number;outcome:string|null;created_at:string};
export function OperatorWorkspace(){
 const [jobs,setJobs]=useState<Job[]>([]),[error,setError]=useState("");
 async function refresh(){try{const r=await fetch('/api/operator/jobs');if(!r.ok)throw new Error();const data=await r.json();setJobs(data.jobs);setError("");}catch{setError('Operator access unavailable. Check private configuration and authentication.');}}
 useEffect(()=>{void refresh();},[]);
 async function action(path:string){const r=await fetch('/api/operator/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)setError('Action unavailable: job state, retry limit or authorization rejected it.');else await refresh();}
 return <div><PageHeading eyebrow="Private operator" title="Alert operations" description="Persistent delivery jobs and attempts. Provider acceptance is not confirmed delivery. No bank mutation controls."/>
  <div className="my-5 flex flex-wrap gap-3"><Button onClick={()=>void refresh()}>Refresh jobs</Button><Button onClick={()=>void action('evaluate')}>Evaluate current account</Button><Button onClick={()=>void action('process')}>Process due jobs</Button></div>
  <p className="text-sm text-muted-foreground">Preview never sends. Unconfirmed submissions cannot be retried. Retries are capped at three attempts with backoff for connection refusal. No phone numbers or account histories are displayed.</p>
  {error&&<p role="alert">{error}</p>}
  <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><caption>Latest delivery jobs</caption><thead><tr><th>Kind</th><th>Status</th><th>Attempts</th><th>Outcome</th><th>Actions</th></tr></thead><tbody>{jobs.map(job=><tr key={job.id}><td>{job.kind}</td><td>{job.status}</td><td>{job.attempts}</td><td>{job.outcome??'Pending'}</td><td>{['queued','failed'].includes(job.status)&&<Button variant="outline" onClick={()=>void action(`jobs/${job.id}/cancel`)}>Cancel</Button>}{job.status==='failed'&&job.attempts<3&&<Button variant="outline" onClick={()=>void action(`jobs/${job.id}/retry`)}>Retry if safe</Button>}</td></tr>)}</tbody></table></div>
 </div>;
}

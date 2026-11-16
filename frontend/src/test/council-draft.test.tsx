import type {ReactNode} from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {DecisionProvider,useDecision} from '@/components/app/DecisionContext';
import {Multiverse} from '@/components/simulator/Multiverse';
import {BackendSituationAdapter} from '@/services/situation';
import fixture from './fixtures/multiverse.json';
vi.mock('@/components/financial/CashFlowChart',()=>({CashFlowChart:()=>null}));
vi.mock('@tanstack/react-router',async original=>({...await original<typeof import('@tanstack/react-router')>(),Link:({children,to,onClick}:{children:ReactNode;to:string;onClick?:()=>void})=><a href={to} onClick={e=>{e.preventDefault();onClick?.();}}>{children}</a>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function Probe(){const {councilDraft}=useDecision();return <output aria-label="Confirmation draft">{JSON.stringify(councilDraft)}</output>;}
it('stages only confirmed ordinary purchase fields in memory without financial URL parameters',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url==='/api/financial-data'?fixture.snapshot:fixture.result)));
 const snapshot=await new BackendSituationAdapter().getSnapshot();render(<DecisionProvider><Multiverse snapshot={snapshot}/><Probe/></DecisionProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Explore futures'}));
 const link=await screen.findByRole('link',{name:'Review selected purchase with Council'});
 expect(link).toHaveAttribute('href','/talk');fireEvent.click(link);
 expect(screen.getByLabelText('Confirmation draft')).toHaveTextContent(JSON.stringify({amount:'400.00',date:fixture.result.input.purchase_date,reserve:'200.00'}));
 fireEvent.click(screen.getByRole('button',{name:'Skip purchase'}));
 expect(screen.queryByRole('link',{name:'Review selected purchase with Council'})).not.toBeInTheDocument();
});

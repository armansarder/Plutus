import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {ResearchWorkspace} from "@/components/research/ResearchWorkspace";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('makes collection limits visible and reports unavailable private research without fake results',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:403})));
 render(<ResearchWorkspace/>);
 expect(screen.getByText(/No participant responses are collected/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Preview condition'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Research preview unavailable');
 expect(screen.queryByText('consider purchase')).not.toBeInTheDocument();
});

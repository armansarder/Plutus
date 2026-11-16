import { afterEach,expect,it,vi } from "vitest";
import { privateAccess,proxyPrivate } from "../privateGateway.server";
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it("keeps tools absent publicly and requires a separate password when enabled",async()=>{
 const request=new Request('https://demo.example/operator');
 expect(privateAccess(request)?.status).toBe(404);
 vi.stubEnv('PLUTUS_PRIVATE_TOOLS','1');vi.stubEnv('PLUTUS_OPERATOR_PASSWORD','x'.repeat(48));
 expect(privateAccess(request)?.status).toBe(401);
 const authorization='Basic '+Buffer.from('operator:'+'x'.repeat(48)).toString('base64');
 expect(privateAccess(new Request(request,{headers:{Authorization:authorization}}))).toBeNull();
 expect(privateAccess(new Request(request,{headers:{Authorization:authorization,Origin:'https://evil.example'}}))?.status).toBe(403);
 expect((await proxyPrivate(new Request('https://demo.example/api/operator/jobs?customer=other',{headers:{Authorization:authorization}}))).status).toBe(404);
});

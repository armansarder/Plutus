import {afterEach,expect,it,vi} from 'vitest';
import {canonicalRequest} from '../publicOrigin.server';
afterEach(()=>vi.unstubAllEnvs());
it('pins production origin and rejects forged hosts without trusting forwarded headers',()=>{
 vi.stubEnv('NODE_ENV','production');vi.stubEnv('PLUTUS_PUBLIC_ORIGIN','https://demo.example');
 const result=canonicalRequest(new Request('http://demo.example/api/source',{headers:{'X-Forwarded-Host':'evil.example'}}));
 expect(result).toBeInstanceOf(Request);expect((result as Request).url).toBe('https://demo.example/api/source');
 expect((canonicalRequest(new Request('http://evil.example/api/source')) as Response).status).toBe(400);
});

import {expect,it} from 'vitest';
import {multiverseSchema} from '@/types/multiverse';
import fixture from './fixtures/multiverse.json';
it('rejects incomplete differences, foreign customers and contradictory reserve claims',()=>{
 expect(multiverseSchema.safeParse(fixture.result).success).toBe(true);
 const incomplete=structuredClone(fixture.result);incomplete.scenarios[0]!.differences=[];
 expect(multiverseSchema.safeParse(incomplete).success).toBe(false);
 const foreign=structuredClone(fixture.result);foreign.scenarios[0]!.forecast.customer_id='foreign';
 expect(multiverseSchema.safeParse(foreign).success).toBe(false);
 const reserve=structuredClone(fixture.result);reserve.scenarios[0]!.maintains_reserve=!reserve.scenarios[0]!.maintains_reserve;
 expect(multiverseSchema.safeParse(reserve).success).toBe(false);
});

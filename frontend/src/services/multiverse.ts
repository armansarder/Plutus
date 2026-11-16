import { requestJson } from "./apiClient";
import { ENDPOINTS } from "./endpoints";
import { multiverseSchema, multiverseRequestSchema } from "@/types/multiverse";
import type { z } from "zod";
export function compareMultiverse(input:z.input<typeof multiverseRequestSchema>,signal?:AbortSignal){
  return requestJson("",ENDPOINTS.multiverse,multiverseSchema,{method:"POST",body:JSON.stringify(multiverseRequestSchema.parse(input)),signal});
}

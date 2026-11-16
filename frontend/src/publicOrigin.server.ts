/** Canonical external origin avoids trusting arbitrary forwarded-host/proto headers. */
export function canonicalRequest(request:Request):Request|Response{
 const actual=new URL(request.url);
 if(process.env["NODE_ENV"]!=="production"||actual.pathname==="/health")return request;
 const configured=process.env["PLUTUS_PUBLIC_ORIGIN"];
 if(!configured){return ["localhost","127.0.0.1"].includes(actual.hostname)?request:new Response("Public origin is not configured",{status:503});}
 try{
  const origin=new URL(configured);
  if(origin.protocol!=="https:"||origin.username||origin.password||origin.pathname!=="/"||origin.search||origin.hash)return new Response("Invalid public origin configuration",{status:503});
  if(actual.host!==origin.host)return new Response("Host not allowed",{status:400});
  return new Request(new URL(actual.pathname+actual.search,origin),request);
 }catch{return new Response("Invalid public origin configuration",{status:503});}
}

export const recipes = ["local-edit-test", "local-search-edit-test", "local-create-test"] as const;
export type Recipe = typeof recipes[number];
export const difficulty = "0000";
export function validRecipe(value: unknown): value is Recipe {return typeof value === "string" && (recipes as readonly string[]).includes(value);}
export function parseReport(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("invalid report");
  const o = v as Record<string,unknown>;
  if (Object.keys(o).sort().join(",") !== "nonce,outcome,recipe,schema,ticket" || o.schema !== 1 || !validRecipe(o.recipe) || !["passed","failed"].includes(String(o.outcome)) || typeof o.ticket !== "string" || !/^[0-9a-f-]{36}$/.test(o.ticket) || !Number.isSafeInteger(o.nonce) || Number(o.nonce)<0 || Number(o.nonce)>10000000) throw Error("invalid report");
  return {schema:1,recipe:o.recipe,outcome:o.outcome as "passed"|"failed",ticket:o.ticket,nonce:Number(o.nonce)};
}
export async function proof(ticket:string, nonce:number) {return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${ticket}:${nonce}`))),b=>b.toString(16).padStart(2,"0")).join("");}
export async function boundedJson(request:Request, max=512) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw Error("json required");
  const reader=request.body?.getReader(); if(!reader) throw Error("empty");
  const chunks:Uint8Array[]=[];let size=0;
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error("too large");chunks.push(value);}} finally {await reader.cancel();}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export const response=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});

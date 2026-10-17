import {env} from "cloudflare:workers";
import {boundedJson,validRecipe,response} from "../../../../lib/protocol";
export async function POST(request:Request){
 const secret=(env as unknown as Record<string,string>).LEARNING_ADMIN_TOKEN;
 if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return response({error:"unauthorized"},401);
 let v;try{v=await boundedJson(request);if(Object.keys(v).sort().join(",")!=="recipe,retracted"||!validRecipe(v.recipe)||typeof v.retracted!=="boolean")throw Error();}catch{return response({error:"invalid request"},400);}
 await env.DB!.prepare("INSERT INTO lessons(id,recipe,retracted,revision) VALUES (?,?,?,1) ON CONFLICT(id) DO UPDATE SET retracted=excluded.retracted, revision=revision+1").bind(v.recipe,v.recipe,v.retracted?1:0).run();
 return response({ok:true});
}

import {env} from "cloudflare:workers";
import {recipes,response} from "../../../../lib/protocol";
export async function GET(){
 const rows=await env.DB!.prepare("SELECT recipe,successes,failures,revision,retracted FROM lessons ORDER BY recipe LIMIT 10").all<{recipe:string;successes:number;failures:number;revision:number;retracted:number}>();
 const lessons=recipes.map(recipe=>{const r=rows.results.find(r=>r.recipe===recipe);return {recipe,successes:r?.successes??0,failures:r?.failures??0,revision:r?.revision??1,retracted:!!r?.retracted||!!(r && r.failures>=3 && r.failures>r.successes)};});
 return response({schema:1,lessons});
}

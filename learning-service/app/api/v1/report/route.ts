import {env} from "cloudflare:workers";
import {boundedJson,parseReport,proof,difficulty,response} from "../../../../lib/protocol";
export async function POST(request:Request){
 let r;try{r=parseReport(await boundedJson(request));if(!(await proof(r.ticket,r.nonce)).startsWith(difficulty))throw Error("proof");}catch{return response({error:"invalid report"},400);}
 const db=env.DB!, now=Math.floor(Date.now()/1000);
 // One transaction: only a live, unused challenge can increment a canonical recipe.
 const result=await db.batch([
  db.prepare("INSERT INTO lessons(id,recipe,successes,failures,revision,retracted) SELECT ?,?,?,?,1,0 WHERE EXISTS(SELECT 1 FROM tickets WHERE id=? AND expires>=?) ON CONFLICT(id) DO UPDATE SET successes=MIN(1000000,successes+excluded.successes), failures=MIN(1000000,failures+excluded.failures), revision=revision+1").bind(r.recipe,r.recipe,r.outcome==="passed"?1:0,r.outcome==="failed"?1:0,r.ticket,now),
  db.prepare("DELETE FROM tickets WHERE id=? AND expires>=?").bind(r.ticket,now)
 ]);
 if(!result[1].meta.changes)return response({error:"expired or used ticket"},409);
 return response({ok:true,schema:1});
}

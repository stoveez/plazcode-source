import {env} from "cloudflare:workers";
import {response,difficulty} from "../../../../lib/protocol";
export async function POST(request:Request) {
 if(request.headers.get("content-length") && request.headers.get("content-length")!=="0")return response({error:"empty body required"},400);
 const db=env.DB!;const now=Math.floor(Date.now()/1000),day=new Date().toISOString().slice(0,10),ticket=crypto.randomUUID();
 await db.batch([db.prepare("DELETE FROM tickets WHERE expires < ?").bind(now),db.prepare("DELETE FROM budget WHERE day < ?").bind(day)]);
 const r=await db.prepare("INSERT INTO budget(day,used) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET used=used+1 WHERE used<10000 RETURNING used").bind(day).first();
 if(!r)return response({error:"daily capacity reached"},429);
 await db.prepare("INSERT INTO tickets(id,expires) VALUES (?,?)").bind(ticket,now+120).run();
 return response({schema:1,ticket,expires:now+120,prefix:difficulty});
}

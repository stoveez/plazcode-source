import {ApiError,SESSION_MS,BODY_LIMIT,randomHex,sha,strict,username,password,same,verifier,boundedJson,document as cleanDocument} from '../lib/protocol.js';
const PROOF_BITS=20;
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
async function first(db,sql,...args){return db.prepare(sql).bind(...args).first();}
async function run(db,sql,...args){return db.prepare(sql).bind(...args).run();}
async function budget(db,id,max,expires){const row=await first(db,'INSERT INTO budgets (id,used,expires_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET used=used+1 WHERE used < ? RETURNING used',id,expires,max);if(!row)throw new ApiError(429,'Too many attempts. Please try again later.');}
// Dispatch may proxy every caller through one IP. Quotas bind to verified proof/account, never a proxy IP.
async function clientBudget(request,db,kind,now,max){if(kind==='registration')await budget(db,'registration-day:'+Math.floor(now/86400000),2000,now+86400000);}
async function proof(db,value,now){strict(value,['id','nonce']);if(!/^[a-f0-9]{48}$/.test(value.id)||!Number.isSafeInteger(value.nonce)||value.nonce<0||value.nonce>0xffffffff)throw new ApiError(400,'Invalid sign-in challenge.');const digest=await sha(value.id+':'+value.nonce);if(!digest.startsWith('0'.repeat(PROOF_BITS/4)))throw new ApiError(400,'Invalid sign-in challenge.');const ticket=await first(db,'DELETE FROM challenges WHERE id=? AND expires_at>? RETURNING id',value.id,now);if(!ticket)throw new ApiError(401,'Sign-in challenge expired. Please try again.');}
async function session(db,request,now){const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)throw new ApiError(401,'Please sign in again.');const hash=await sha(token);const row=await first(db,'SELECT accounts.id,accounts.username,sessions.expires_at FROM sessions JOIN accounts ON accounts.id=sessions.account_id WHERE sessions.hash=? AND sessions.expires_at>?',hash,now);if(!row)throw new ApiError(401,'Please sign in again.');return {...row,hash};}
async function issue(db,account,now){const token=randomHex(32),expires=now+SESSION_MS;await run(db,'INSERT INTO sessions (hash,account_id,expires_at,created_at) VALUES (?,?,?,?)',await sha(token),account.id,expires,now);return {profile:{id:account.id,username:account.username},token,expires_at:expires};}
export default {async fetch(request,env){
 try{
  const url=new URL(request.url),path=url.pathname,now=Date.now();
  if(request.headers.has('origin')&&request.headers.get('origin')!==url.origin)throw new ApiError(403,'Request origin is not allowed.');
  if(path==='/'&&request.method==='GET')return json({service:'PlazCode Accounts',version:1});
  if(!path.startsWith('/v1/')||!env.DB)throw new ApiError(503,'The account service is not ready. Please try again later.');
  const db=env.DB;
  if(path==='/v1/challenge'&&request.method==='POST'){
   await clientBudget(request,db,'challenge',now,40);await budget(db,'challenge-day:'+Math.floor(now/86400000),20000,now+86400000);
   await db.batch([db.prepare('DELETE FROM challenges WHERE id IN (SELECT id FROM challenges WHERE expires_at<? LIMIT 100)').bind(now),db.prepare('DELETE FROM budgets WHERE id IN (SELECT id FROM budgets WHERE expires_at<? LIMIT 100)').bind(now),db.prepare('DELETE FROM sessions WHERE hash IN (SELECT hash FROM sessions WHERE expires_at<? LIMIT 100)').bind(now)]);
   const id=randomHex(24);await run(db,'INSERT INTO challenges (id,expires_at) VALUES (?,?)',id,now+120000);return json({id,bits:PROOF_BITS,expires_at:now+120000});
  }
  if(['/v1/register','/v1/login'].includes(path)&&request.method==='POST'){
   await clientBudget(request,db,'password',now,12);const body=strict(await boundedJson(request),['username','password','proof']);const name=username(body.username);password(body.password);await proof(db,body.proof,now);await budget(db,'password-day:'+Math.floor(now/86400000),20000,now+86400000);await budget(db,'name:'+Math.floor(now/900000)+':'+await sha(name.key),12,now+900000);
   if(path==='/v1/register'){
    await clientBudget(request,db,'registration',now,4);
    const salt=randomHex(32),hash=await verifier(body.password,salt),id=crypto.randomUUID();
    try{await run(db,'INSERT INTO accounts (id,username,username_key,salt,verifier,created_at) VALUES (?,?,?,?,?,?)',id,name.display,name.key,salt,hash,now);}catch(error){if(/unique/i.test(String(error.message)))throw new ApiError(409,'That username is already taken.');throw error;}
    return json(await issue(db,{id,username:name.display},now),201);
   }
   const account=await first(db,'SELECT id,username,salt,verifier FROM accounts WHERE username_key=?',name.key);
   const hash=await verifier(body.password,account?.salt||'0000000000000000000000000000000000000000000000000000000000000000');
   if(!same(hash,account?.verifier||'f'.repeat(64)))throw new ApiError(401,'Incorrect username or password.');
   return json(await issue(db,account,now));
  }
  if(path==='/v1/session'&&request.method==='GET'){const auth=await session(db,request,now);const expires=now+SESSION_MS;await run(db,'UPDATE sessions SET expires_at=? WHERE hash=?',expires,auth.hash);return json({profile:{id:auth.id,username:auth.username},expires_at:expires});}
  if(path==='/v1/session'&&request.method==='DELETE'){const auth=await session(db,request,now);await run(db,'DELETE FROM sessions WHERE hash=?',auth.hash);return json({ok:true});}
  if(path==='/v1/sync'&&request.method==='GET'){const auth=await session(db,request,now);const row=await first(db,'SELECT revision,document FROM documents WHERE account_id=?',auth.id);return json({revision:row?.revision||0,document:row?JSON.parse(row.document):{settings:{},skills:{}}});}
  if(path==='/v1/sync'&&request.method==='PUT'){
   const auth=await session(db,request,now);await budget(db,'sync:'+auth.id+':'+Math.floor(now/900000),240,now+900000);const body=strict(await boundedJson(request,BODY_LIMIT),['revision','document']);if(!Number.isSafeInteger(body.revision)||body.revision<0)throw new ApiError(400,'Invalid sync revision.');const document=cleanDocument(body.document);
   const row=body.revision===0?await first(db,'INSERT INTO documents (account_id,revision,document,updated_at) VALUES (?,1,?,?) ON CONFLICT(account_id) DO NOTHING RETURNING revision',auth.id,JSON.stringify(document),now):await first(db,'UPDATE documents SET revision=revision+1,document=?,updated_at=? WHERE account_id=? AND revision=? RETURNING revision',JSON.stringify(document),now,auth.id,body.revision);
   if(!row)throw new ApiError(409,'Settings changed on another computer. Retry after reading the latest revision.');return json({revision:row.revision,document});
  }
  throw new ApiError(404,'Not found.');
 }catch(error){if(error instanceof ApiError)return json({error:error.message},error.status);console.error('Account operation failed:',error?.name||'Error');return json({error:'The account service could not finish that request. Please try again.'},503);}
}};

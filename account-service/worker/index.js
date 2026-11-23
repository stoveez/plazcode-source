import {ApiError,SESSION_MS,BODY_LIMIT,randomHex,sha,strict,username,password,same,verifier,boundedJson,document as cleanDocument} from '../lib/protocol.js';
const PROOF_BITS=20;
const ONLINE_WINDOW_MS=150000;
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
async function first(db,sql,...args){return db.prepare(sql).bind(...args).first();}
async function all(db,sql,...args){return db.prepare(sql).bind(...args).all();}
async function run(db,sql,...args){return db.prepare(sql).bind(...args).run();}
async function budget(db,id,max,expires){const row=await first(db,'INSERT INTO budgets (id,used,expires_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET used=used+1 WHERE used < ? RETURNING used',id,expires,max);if(!row)throw new ApiError(429,'Too many attempts. Please try again later.');}
// Dispatch may proxy every caller through one IP. Quotas bind to verified proof/account, never a proxy IP.
async function clientBudget(request,db,kind,now,max){if(kind==='registration')await budget(db,'registration-day:'+Math.floor(now/86400000),2000,now+86400000);}
async function proof(db,value,now){strict(value,['id','nonce']);if(!/^[a-f0-9]{48}$/.test(value.id)||!Number.isSafeInteger(value.nonce)||value.nonce<0||value.nonce>0xffffffff)throw new ApiError(400,'Invalid sign-in challenge.');const digest=await sha(value.id+':'+value.nonce);if(!digest.startsWith('0'.repeat(PROOF_BITS/4)))throw new ApiError(400,'Invalid sign-in challenge.');const ticket=await first(db,'DELETE FROM challenges WHERE id=? AND expires_at>? RETURNING id',value.id,now);if(!ticket)throw new ApiError(401,'Sign-in challenge expired. Please try again.');}
function ownerSet(env){return new Set(String(env?.OWNER_USERNAMES||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean));}
function isOwnerUsername(usernameKey,env){return ownerSet(env).has(String(usernameKey||'').toLowerCase());}
function bannedError(reason){const clean=String(reason||'').trim();const err=new ApiError(403,clean?`Account banned: ${clean}`:'This account has been banned from PlazCode.');err.extra={code:'account_banned',banned:true,reason:clean};return err;}
function bearerToken(request){return request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/)?.[1]||'';}
async function session(db,request,now,env){const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)throw new ApiError(401,'Please sign in again.');const hash=await sha(token);const row=await first(db,'SELECT accounts.id,accounts.username,accounts.username_key,accounts.banned_at,accounts.ban_reason,sessions.expires_at FROM sessions JOIN accounts ON accounts.id=sessions.account_id WHERE sessions.hash=?',hash);if(!row)throw new ApiError(401,'Please sign in again.');if(row.banned_at){await run(db,'DELETE FROM sessions WHERE account_id=?',row.id);throw bannedError(row.ban_reason);}if(row.expires_at<=now)throw new ApiError(401,'Please sign in again.');return {...row,hash,is_owner:isOwnerUsername(row.username_key,env)};}
async function issue(db,account,now,env){const token=randomHex(32),expires=now+SESSION_MS;await run(db,'INSERT INTO sessions (hash,account_id,expires_at,created_at) VALUES (?,?,?,?)',await sha(token),account.id,expires,now);await run(db,'UPDATE accounts SET last_seen_at=? WHERE id=?',now,account.id);const key=account.username_key||String(account.username||'').toLowerCase();return {profile:{id:account.id,username:account.username,is_owner:isOwnerUsername(key,env)},token,expires_at:expires};}
async function requireOwner(db,request,env,now){
 const expected=String(env?.OWNER_ADMIN_TOKEN||'');
 const headerTok=request.headers.get('x-owner-token')||'';
 const bearer=bearerToken(request);
 if(expected&&((headerTok&&same(headerTok,expected))||(bearer&&same(bearer,expected)))){return {mode:'token'};}
 if(/^[a-f0-9]{64}$/.test(bearer)){const auth=await session(db,request,now,env);if(auth.is_owner)return {mode:'session',auth};}
 throw new ApiError(403,'Owner authorization required.');
}
function extractAvatar(docJson){
 if(!docJson||typeof docJson!=='string')return null;
 try{
  const parsed=JSON.parse(docJson);
  const pic=parsed?.settings?.rsProfilePicture;
  return typeof pic==='string'&&/^data:image\/(png|jpeg|gif);base64,[A-Za-z0-9+/=]+$/.test(pic)?pic:null;
 }catch{return null;}
}
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
    try{await run(db,'INSERT INTO accounts (id,username,username_key,salt,verifier,created_at,last_seen_at) VALUES (?,?,?,?,?,?,?)',id,name.display,name.key,salt,hash,now,now);}catch(error){if(/unique/i.test(String(error.message)))throw new ApiError(409,'That username is already taken.');throw error;}
    return json(await issue(db,{id,username:name.display,username_key:name.key},now,env),201);
   }
   const account=await first(db,'SELECT id,username,username_key,salt,verifier,banned_at,ban_reason FROM accounts WHERE username_key=?',name.key);
   const hash=await verifier(body.password,account?.salt||'0000000000000000000000000000000000000000000000000000000000000000');
   if(!same(hash,account?.verifier||'f'.repeat(64)))throw new ApiError(401,'Incorrect username or password.');
   if(account.banned_at)throw bannedError(account.ban_reason);
   return json(await issue(db,account,now,env));
  }
  if(path==='/v1/session'&&request.method==='GET'){const auth=await session(db,request,now,env);const expires=now+SESSION_MS;await run(db,'UPDATE sessions SET expires_at=? WHERE hash=?',expires,auth.hash);await run(db,'UPDATE accounts SET last_seen_at=? WHERE id=?',now,auth.id);return json({profile:{id:auth.id,username:auth.username,is_owner:auth.is_owner},expires_at:expires});}
  if(path==='/v1/session'&&request.method==='DELETE'){const auth=await session(db,request,now,env);await run(db,'DELETE FROM sessions WHERE hash=?',auth.hash);return json({ok:true});}
  if(path==='/v1/heartbeat'&&request.method==='POST'){
   const auth=await session(db,request,now,env);
   let body={};
   try{body=await boundedJson(request,1024);}catch(error){if(!(error instanceof ApiError)||error.status!==400)throw error;}
   if(!body||typeof body!=='object'||Array.isArray(body))body={};
   const closing=body.status==='closing';
   const appVersion=typeof body.app_version==='string'?body.app_version.trim().slice(0,32):null;
   const seenAt=closing?0:now;
   if(appVersion){await run(db,'UPDATE accounts SET last_seen_at=?,app_version=? WHERE id=?',seenAt,appVersion,auth.id);}
   else{await run(db,'UPDATE accounts SET last_seen_at=? WHERE id=?',seenAt,auth.id);}
   return json({ok:true,online:!closing,is_owner:auth.is_owner,last_seen_at:seenAt});
  }
  if(path==='/v1/sync'&&request.method==='GET'){const auth=await session(db,request,now,env);await run(db,'UPDATE accounts SET last_seen_at=? WHERE id=?',now,auth.id);const row=await first(db,'SELECT revision,document FROM documents WHERE account_id=?',auth.id);return json({revision:row?.revision||0,document:row?JSON.parse(row.document):{settings:{},skills:{}}});}
  if(path==='/v1/sync'&&request.method==='PUT'){
   const auth=await session(db,request,now,env);await budget(db,'sync:'+auth.id+':'+Math.floor(now/900000),240,now+900000);const body=strict(await boundedJson(request,BODY_LIMIT),['revision','document']);if(!Number.isSafeInteger(body.revision)||body.revision<0)throw new ApiError(400,'Invalid sync revision.');const document=cleanDocument(body.document);
   // Older clients do not know about profile pictures. An omitted field must
   // preserve the existing picture; only an explicit null removes it.
   if(!Object.hasOwn(document.settings,'rsProfilePicture')&&body.revision>0){const previous=await first(db,'SELECT document FROM documents WHERE account_id=? AND revision=?',auth.id,body.revision);if(previous){const settings=JSON.parse(previous.document).settings;if(Object.hasOwn(settings,'rsProfilePicture')){document.settings.rsProfilePicture=settings.rsProfilePicture;cleanDocument(document);}}}
   await run(db,'UPDATE accounts SET last_seen_at=? WHERE id=?',now,auth.id);
   const row=body.revision===0?await first(db,'INSERT INTO documents (account_id,revision,document,updated_at) VALUES (?,1,?,?) ON CONFLICT(account_id) DO NOTHING RETURNING revision',auth.id,JSON.stringify(document),now):await first(db,'UPDATE documents SET revision=revision+1,document=?,updated_at=? WHERE account_id=? AND revision=? RETURNING revision',JSON.stringify(document),now,auth.id,body.revision);
   if(!row)throw new ApiError(409,'Settings changed on another computer. Retry after reading the latest revision.');return json({revision:row.revision,document});
  }
  if(path==='/v1/owner/status'&&request.method==='GET'){
   await requireOwner(db,request,env,now);
   return json({ok:true,is_owner:true,online_window_ms:ONLINE_WINDOW_MS});
  }
  if(path==='/v1/owner/users'&&request.method==='GET'){
   await requireOwner(db,request,env,now);
   const q=(url.searchParams.get('q')||'').trim().toLowerCase();
   const filter=(url.searchParams.get('filter')||'all').trim().toLowerCase();
   const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit')||100)||100));
   const offset=Math.max(0,Number(url.searchParams.get('offset')||0)||0);
   // Strict non-leakage: never select salt/verifier, and expose only rsProfilePicture from synced documents.
   const rows=await all(db,'SELECT a.id,a.username,a.username_key,a.created_at,a.last_seen_at,a.app_version,a.banned_at,a.ban_reason,d.document FROM accounts a LEFT JOIN documents d ON d.account_id=a.id ORDER BY a.created_at DESC');
   const mapped=(rows.results||[]).map(r=>{
    const seen=typeof r.last_seen_at==='number'?r.last_seen_at:null;
    const online=Boolean(seen&&!r.banned_at&&(now-seen)<=ONLINE_WINDOW_MS);
    return {id:r.id,username:r.username,created_at:r.created_at,last_seen_at:seen,online,app_version:r.app_version||'',banned:Boolean(r.banned_at),banned_at:r.banned_at||null,ban_reason:r.ban_reason||'',is_owner:isOwnerUsername(r.username_key,env),profile_picture:extractAvatar(r.document)};
   });
   const counts={total:mapped.length,online:mapped.filter(u=>u.online).length,banned:mapped.filter(u=>u.banned).length};
   const filtered=mapped.filter(u=>{
    if(filter==='online'&&!u.online)return false;
    if(filter==='banned'&&!u.banned)return false;
    if(q&&!u.username.toLowerCase().includes(q))return false;
    return true;
   });
   return json({ok:true,online_window_ms:ONLINE_WINDOW_MS,counts,users:filtered.slice(offset,offset+limit)});
  }
  const banMatch=path.match(/^\/v1\/owner\/users\/([A-Za-z0-9-]{4,80})\/ban$/);
  if(banMatch&&request.method==='POST'){
   await requireOwner(db,request,env,now);
   const targetId=banMatch[1];
   const target=await first(db,'SELECT id,username,username_key FROM accounts WHERE id=?',targetId);
   if(!target)throw new ApiError(404,'User not found.');
   if(isOwnerUsername(target.username_key,env))throw new ApiError(400,'Owner accounts cannot be banned.');
   let body={};
   try{body=await boundedJson(request,2048);}catch(error){if(!(error instanceof ApiError)||error.status!==400)throw error;}
   const reason=String(body?.reason||'Banned by owner.').trim().slice(0,300);
   await db.batch([
    db.prepare('UPDATE accounts SET banned_at=?,ban_reason=?,last_seen_at=0 WHERE id=?').bind(now,reason,targetId),
    db.prepare('UPDATE sessions SET expires_at=-1 WHERE account_id=?').bind(targetId),
   ]);
   return json({ok:true,id:targetId,username:target.username,banned:true,banned_at:now,ban_reason:reason});
  }
  const unbanMatch=path.match(/^\/v1\/owner\/users\/([A-Za-z0-9-]{4,80})\/unban$/);
  if(unbanMatch&&request.method==='POST'){
   await requireOwner(db,request,env,now);
   const targetId=unbanMatch[1];
   const target=await first(db,'SELECT id,username FROM accounts WHERE id=?',targetId);
   if(!target)throw new ApiError(404,'User not found.');
   await run(db,'UPDATE accounts SET banned_at=NULL,ban_reason=NULL WHERE id=?',targetId);
   return json({ok:true,id:targetId,username:target.username,banned:false});
  }
  const removeMatch=path.match(/^\/v1\/owner\/users\/([A-Za-z0-9-]{4,80})(?:\/remove)?$/);
  if(removeMatch&&((path.endsWith('/remove')&&request.method==='POST')||(!path.endsWith('/remove')&&request.method==='DELETE'))){
   await requireOwner(db,request,env,now);
   const targetId=removeMatch[1];
   const target=await first(db,'SELECT id,username,username_key FROM accounts WHERE id=?',targetId);
   if(!target)throw new ApiError(404,'User not found.');
   if(isOwnerUsername(target.username_key,env))throw new ApiError(400,'Owner accounts cannot be removed.');
   await db.batch([
    db.prepare('DELETE FROM sessions WHERE account_id=?').bind(targetId),
    db.prepare('DELETE FROM documents WHERE account_id=?').bind(targetId),
    db.prepare('DELETE FROM accounts WHERE id=?').bind(targetId),
   ]);
   return json({ok:true,id:targetId,username:target.username,removed:true});
  }
  throw new ApiError(404,'Not found.');
 }catch(error){if(error instanceof ApiError)return json({error:error.message,...(error.extra||{})},error.status);console.error('Account operation failed:',error?.name||'Error');return json({error:'The account service could not finish that request. Please try again.'},503);}
}};

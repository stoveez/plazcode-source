import {ApiError,SESSION_MS,BODY_LIMIT,normalizeUserId,generateUserId,randomHex,sha,strict,username,validateRegistrationUsername,password,same,verifier,boundedJson,document as cleanDocument} from '../lib/protocol.js';
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
async function isOwnerAccount(db,account,env){
 const key=String(account?.username_key||account?.username||'').toLowerCase();
 if(isOwnerUsername(key,env))return true;
 const uid=normalizeUserId(account?.user_id||'');
 if(uid&&(await first(db,'SELECT target_key FROM owner_grants WHERE target_key=?',`uid:${uid}`)))return true;
 if(key&&(await first(db,'SELECT target_key FROM owner_grants WHERE target_key=?',`user:${key}`)))return true;
 return false;
}
async function generateUniqueUserId(db){
 for(let i=0;i<16;i++){
  const candidate=generateUserId();
  const usedAcct=await first(db,'SELECT id FROM accounts WHERE user_id=? LIMIT 1',candidate);
  const usedDev=usedAcct?null:await first(db,'SELECT device_hash FROM device_user_links WHERE user_id=? LIMIT 1',candidate);
  if(!usedAcct&&!usedDev)return candidate;
 }
 throw new ApiError(503,'Could not allocate a unique User ID. Please try again.');
}
async function resolveDeviceUserId(db,deviceHash){
 if(!deviceHash)return null;
 const linked=await first(db,'SELECT user_id FROM device_user_links WHERE device_hash=?',deviceHash);
 if(linked?.user_id){const uid=normalizeUserId(linked.user_id);if(uid)return uid;}
 const acct=await first(db,'SELECT user_id FROM accounts WHERE last_device_hash=? AND user_id IS NOT NULL ORDER BY created_at ASC LIMIT 1',deviceHash);
 return acct?.user_id?normalizeUserId(acct.user_id):null;
}
async function linkDeviceUser(db,deviceHash,userId,now){
 if(!deviceHash||!userId)return;
 await run(db,'INSERT INTO device_user_links (device_hash,user_id,updated_at) VALUES (?,?,?) ON CONFLICT(device_hash) DO UPDATE SET user_id=excluded.user_id,updated_at=excluded.updated_at',deviceHash,userId,now);
}
async function ensureAccountUserId(db,account,dev,now){
 const existing=normalizeUserId(account?.user_id||'');
 if(existing){
  if(dev)await linkDeviceUser(db,dev,existing,now);
  return existing;
 }
 const resolved=(dev&&await resolveDeviceUserId(db,dev))||(account?.last_device_hash&&await resolveDeviceUserId(db,account.last_device_hash))||await generateUniqueUserId(db);
 await run(db,'UPDATE accounts SET user_id=? WHERE id=?',resolved,account.id);
 if(dev)await linkDeviceUser(db,dev,resolved,now);
 else if(account?.last_device_hash)await linkDeviceUser(db,account.last_device_hash,resolved,now);
 return resolved;
}
async function ensureAllUserIds(db,now){
 const missing=await all(db,'SELECT id,last_device_hash FROM accounts WHERE user_id IS NULL ORDER BY created_at ASC');
 for(const row of (missing.results||[])){
  await ensureAccountUserId(db,row,row.last_device_hash||null,now);
 }
}
async function findUserIdBan(db,userId){
 const uid=normalizeUserId(userId||'');
 if(!uid)return null;
 const row=await first(db,'SELECT id,username,banned_at,terminated_at,ban_reason FROM accounts WHERE user_id=? AND (terminated_at IS NOT NULL OR banned_at IS NOT NULL) ORDER BY terminated_at DESC, banned_at DESC LIMIT 1',uid);
 if(!row)return null;
 return {id:row.id,username:row.username,permanent:Boolean(row.terminated_at),reason:row.ban_reason||''};
}
async function collectLinkedAccountsAndDevices(db,target,now){
 const uid=await ensureAccountUserId(db,target,target.last_device_hash||null,now);
 const linkedRows=await all(db,'SELECT id,username,username_key,last_device_hash,banned_at,terminated_at,ban_reason FROM accounts WHERE user_id=?',uid);
 const accounts=linkedRows.results?.length?linkedRows.results:[target];
 const deviceRows=await all(db,'SELECT device_hash FROM device_user_links WHERE user_id=?',uid);
 const devices=new Set();
 for(const d of (deviceRows.results||[]))if(d.device_hash)devices.add(d.device_hash);
 for(const a of accounts){
  if(a.last_device_hash)devices.add(a.last_device_hash);
  const existingDevs=await all(db,'SELECT device_hash FROM banned_devices WHERE account_id=?',a.id);
  for(const ed of (existingDevs.results||[]))if(ed.device_hash)devices.add(ed.device_hash);
 }
 return {uid,accounts,devices:Array.from(devices)};
}
function bannedError(reason,terminated=false){const clean=String(reason||'').trim();const err=new ApiError(403,terminated?(clean?`Account permanently terminated: ${clean}`:'This account has been permanently terminated from PlazCode.'):(clean?`Account banned: ${clean}`:'This account has been banned from PlazCode.'));err.extra={code:terminated?'account_terminated':'account_banned',banned:true,terminated:Boolean(terminated),reason:clean};return err;}
function deviceHeader(request){const raw=String(request.headers.get('x-plazcode-device')||'').trim().toLowerCase();return /^[a-f0-9]{64}$/.test(raw)?raw:null;}
async function checkDeviceBan(db,deviceHash){if(!deviceHash)return null;return await first(db,'SELECT device_hash,account_id,username,permanent,reason,banned_at FROM banned_devices WHERE device_hash=?',deviceHash);}
async function recordDeviceBan(db,deviceHash,account,permanent,now){if(!deviceHash||!account?.id)return;await run(db,'INSERT INTO banned_devices (device_hash,account_id,username,permanent,reason,banned_at) VALUES (?,?,?,?,?,?) ON CONFLICT(device_hash) DO UPDATE SET account_id=excluded.account_id,username=excluded.username,permanent=MAX(banned_devices.permanent,excluded.permanent),reason=COALESCE(excluded.reason,banned_devices.reason),banned_at=excluded.banned_at',deviceHash,account.id,account.username||'',permanent?1:0,account.ban_reason||null,now);}
function bearerToken(request){return request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/)?.[1]||'';}
async function session(db,request,now,env){const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)throw new ApiError(401,'Please sign in again.');const hash=await sha(token);const row=await first(db,'SELECT accounts.id,accounts.username,accounts.username_key,accounts.user_id,accounts.last_device_hash,accounts.banned_at,accounts.terminated_at,accounts.ban_reason,sessions.expires_at FROM sessions JOIN accounts ON accounts.id=sessions.account_id WHERE sessions.hash=?',hash);if(!row)throw new ApiError(401,'Please sign in again.');const dev=deviceHeader(request);if(row.terminated_at||row.banned_at){const perm=Boolean(row.terminated_at);await recordDeviceBan(db,dev,row,perm,now);await run(db,'DELETE FROM sessions WHERE account_id=?',row.id);throw bannedError(row.ban_reason,perm);}const devBan=await checkDeviceBan(db,dev);if(devBan){throw bannedError(devBan.reason,Boolean(devBan.permanent));}const uid=await ensureAccountUserId(db,row,dev,now);const uidBan=await findUserIdBan(db,uid);if(uidBan){await recordDeviceBan(db,dev,{id:uidBan.id,username:uidBan.username,ban_reason:uidBan.reason},uidBan.permanent,now);await run(db,'DELETE FROM sessions WHERE account_id=?',row.id);throw bannedError(uidBan.reason,uidBan.permanent);}if(row.expires_at<=now)throw new ApiError(401,'Please sign in again.');if(dev)await run(db,'UPDATE accounts SET last_device_hash=? WHERE id=?',dev,row.id);return {...row,user_id:uid,hash,is_owner:await isOwnerAccount(db,{...row,user_id:uid},env)};}
async function issue(db,account,now,env){const token=randomHex(32),expires=now+SESSION_MS;await run(db,'INSERT INTO sessions (hash,account_id,expires_at,created_at) VALUES (?,?,?,?)',await sha(token),account.id,expires,now);await run(db,'UPDATE accounts SET last_seen_at=? WHERE id=?',now,account.id);const uid=normalizeUserId(account.user_id||'');const owner=await isOwnerAccount(db,{...account,user_id:uid},env);return {profile:{id:account.id,username:account.username,user_id:uid,is_owner:owner},token,expires_at:expires};}
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
  if(path==='/v1/ban-status'&&request.method==='GET'){
   const accountId=(url.searchParams.get('account_id')||'').trim();
   const dev=deviceHeader(request);
   if(accountId){
    const acct=await first(db,'SELECT id,username,user_id,banned_at,terminated_at,ban_reason FROM accounts WHERE id=?',accountId);
    if(acct){
     const terminated=Boolean(acct.terminated_at);
     const banned=Boolean(acct.banned_at)||terminated;
     if(banned){
      if(dev)await recordDeviceBan(db,dev,acct,terminated,now);
      return json({ok:true,banned:true,terminated,reason:acct.ban_reason||'',account_id:acct.id,username:acct.username||''});
     }
     if(acct.user_id){
      const uidBan=await findUserIdBan(db,acct.user_id);
      if(uidBan){
       if(dev)await recordDeviceBan(db,dev,{id:uidBan.id,username:uidBan.username,ban_reason:uidBan.reason},uidBan.permanent,now);
       return json({ok:true,banned:true,terminated:uidBan.permanent,reason:uidBan.reason,account_id:uidBan.id,username:uidBan.username||''});
      }
     }
    }
   }
   const devBan=await checkDeviceBan(db,dev);
   if(devBan)return json({ok:true,banned:true,terminated:Boolean(devBan.permanent),reason:devBan.reason||'',account_id:devBan.account_id||'',username:devBan.username||''});
   if(dev){
    const devUid=await resolveDeviceUserId(db,dev);
    const uidBan=devUid?await findUserIdBan(db,devUid):null;
    if(uidBan){
     await recordDeviceBan(db,dev,{id:uidBan.id,username:uidBan.username,ban_reason:uidBan.reason},uidBan.permanent,now);
     return json({ok:true,banned:true,terminated:uidBan.permanent,reason:uidBan.reason,account_id:uidBan.id,username:uidBan.username||''});
    }
   }
   return json({ok:true,banned:false,terminated:false,reason:''});
  }
  if(['/v1/register','/v1/login'].includes(path)&&request.method==='POST'){
   await clientBudget(request,db,'password',now,12);const body=strict(await boundedJson(request),['username','password','proof']);const name=path==='/v1/register'?validateRegistrationUsername(body.username):username(body.username);password(body.password);await proof(db,body.proof,now);await budget(db,'password-day:'+Math.floor(now/86400000),20000,now+86400000);await budget(db,'name:'+Math.floor(now/900000)+':'+await sha(name.key),12,now+900000);
   const dev=deviceHeader(request);
   const devBan=await checkDeviceBan(db,dev);
   if(path==='/v1/register'){
    if(devBan)throw bannedError(devBan.reason,Boolean(devBan.permanent));
    const existingUid=await resolveDeviceUserId(db,dev);
    if(existingUid){
     const uidBan=await findUserIdBan(db,existingUid);
     if(uidBan){
      await recordDeviceBan(db,dev,{id:uidBan.id,username:uidBan.username,ban_reason:uidBan.reason},uidBan.permanent,now);
      throw bannedError(uidBan.reason,uidBan.permanent);
     }
    }
    await clientBudget(request,db,'registration',now,4);
    const salt=randomHex(32),hash=await verifier(body.password,salt),id=crypto.randomUUID();
    const userId=existingUid||await generateUniqueUserId(db);
    try{await run(db,'INSERT INTO accounts (id,username,username_key,salt,verifier,created_at,last_seen_at,last_device_hash,user_id) VALUES (?,?,?,?,?,?,?,?,?)',id,name.display,name.key,salt,hash,now,now,dev,userId);}catch(error){if(/unique/i.test(String(error.message)))throw new ApiError(409,'That username is already taken.');throw error;}
    if(dev)await linkDeviceUser(db,dev,userId,now);
    return json(await issue(db,{id,username:name.display,username_key:name.key,user_id:userId},now,env),201);
   }
   const account=await first(db,'SELECT id,username,username_key,salt,verifier,user_id,last_device_hash,banned_at,terminated_at,ban_reason FROM accounts WHERE username_key=?',name.key);
   const hash=await verifier(body.password,account?.salt||'0000000000000000000000000000000000000000000000000000000000000000');
   if(!same(hash,account?.verifier||'f'.repeat(64)))throw new ApiError(401,'Incorrect username or password.');
   if(account.terminated_at){await recordDeviceBan(db,dev,account,true,now);throw bannedError(account.ban_reason,true);}
   if(account.banned_at){await recordDeviceBan(db,dev,account,false,now);throw bannedError(account.ban_reason,false);}
   if(devBan)throw bannedError(devBan.reason,Boolean(devBan.permanent));
   const uid=await ensureAccountUserId(db,account,dev,now);
   const uidBan=await findUserIdBan(db,uid);
   if(uidBan){await recordDeviceBan(db,dev,{id:uidBan.id,username:uidBan.username,ban_reason:uidBan.reason},uidBan.permanent,now);throw bannedError(uidBan.reason,uidBan.permanent);}
   if(dev)await run(db,'UPDATE accounts SET last_device_hash=? WHERE id=?',dev,account.id);
   return json(await issue(db,{...account,user_id:uid},now,env));
  }
  if(path==='/v1/session'&&request.method==='GET'){const auth=await session(db,request,now,env);const expires=now+SESSION_MS;await run(db,'UPDATE sessions SET expires_at=? WHERE hash=?',expires,auth.hash);await run(db,'UPDATE accounts SET last_seen_at=? WHERE id=?',now,auth.id);return json({profile:{id:auth.id,username:auth.username,user_id:auth.user_id,is_owner:auth.is_owner},expires_at:expires});}
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
   return json({ok:true,online:!closing,is_owner:auth.is_owner,user_id:auth.user_id,last_seen_at:seenAt});
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
   await ensureAllUserIds(db,now);
   const qRaw=(url.searchParams.get('q')||'').trim();
   const q=qRaw.toLowerCase();
   const qUid=normalizeUserId(qRaw);
   const uidFilter=normalizeUserId(url.searchParams.get('user_id')||'');
   const filter=(url.searchParams.get('filter')||'all').trim().toLowerCase();
   const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit')||100)||100));
   const offset=Math.max(0,Number(url.searchParams.get('offset')||0)||0);
   const grantRows=await all(db,'SELECT target_key FROM owner_grants');
   const grantSet=new Set((grantRows.results||[]).map(g=>g.target_key));
   // Strict non-leakage: never select salt/verifier, and expose only rsProfilePicture from synced documents.
   const rows=await all(db,'SELECT a.id,a.username,a.username_key,a.user_id,a.created_at,a.last_seen_at,a.app_version,a.banned_at,a.terminated_at,a.ban_reason,d.document FROM accounts a LEFT JOIN documents d ON d.account_id=a.id ORDER BY COALESCE(a.terminated_at,a.banned_at,a.created_at) DESC');
   const byUid=new Map();
   for(const r of (rows.results||[])){
    const uid=normalizeUserId(r.user_id||'');
    if(!uid)continue;
    if(!byUid.has(uid))byUid.set(uid,[]);
    byUid.get(uid).push(r.username);
   }
   const mapped=(rows.results||[]).map(r=>{
    const seen=typeof r.last_seen_at==='number'?r.last_seen_at:null;
    const terminated=Boolean(r.terminated_at);
    const banned=Boolean(r.banned_at)||terminated;
    const online=Boolean(seen&&!banned&&(now-seen)<=ONLINE_WINDOW_MS);
    const uid=normalizeUserId(r.user_id||'')||'';
    const linkedNames=uid&&byUid.has(uid)?byUid.get(uid):[r.username];
    const primaryOwner=isOwnerUsername(r.username_key,env);
    const isOwner=primaryOwner||(uid&&grantSet.has(`uid:${uid}`))||grantSet.has(`user:${r.username_key}`);
    return {id:r.id,username:r.username,user_id:uid,linked_profile_count:linkedNames.length,linked_usernames:linkedNames,created_at:r.created_at,last_seen_at:seen,online,app_version:r.app_version||'',banned,banned_at:r.banned_at||null,terminated,terminated_at:r.terminated_at||null,ban_reason:r.ban_reason||'',primary_owner:primaryOwner,is_owner:Boolean(isOwner),profile_picture:extractAvatar(r.document)};
   });
   const counts={total:mapped.length,online:mapped.filter(u=>u.online).length,banned:mapped.filter(u=>u.banned).length,terminated:mapped.filter(u=>u.terminated).length};
   const filtered=mapped.filter(u=>{
    if(uidFilter&&u.user_id!==uidFilter)return false;
    if(filter==='online'&&!u.online)return false;
    if(filter==='banned'&&!u.banned)return false;
    if(filter==='terminated'&&!u.terminated)return false;
    if(q&&!u.username.toLowerCase().includes(q)&&!(u.user_id&&u.user_id.toLowerCase().includes(q))&&!(qUid&&u.user_id===qUid))return false;
    return true;
   });
   return json({ok:true,online_window_ms:ONLINE_WINDOW_MS,counts,users:filtered.slice(offset,offset+limit)});
  }
  if(path==='/v1/owner/grants'&&request.method==='GET'){
   await requireOwner(db,request,env,now);
   await ensureAllUserIds(db,now);
   const rows=await all(db,'SELECT target_key,target_type,user_id,username,granted_by,granted_at FROM owner_grants ORDER BY granted_at DESC');
   const grants=[];
   for(const g of (rows.results||[])){
    let resolvedUid=g.user_id||'';
    let linkedUsernames=[];
    if(g.target_type==='user_id'&&resolvedUid){
     const accts=await all(db,'SELECT username FROM accounts WHERE user_id=? ORDER BY created_at ASC',resolvedUid);
     linkedUsernames=(accts.results||[]).map(a=>a.username);
    }else if(g.target_type==='username'){
     const key=g.target_key.replace(/^user:/,'');
     const acct=await first(db,'SELECT username,user_id FROM accounts WHERE username_key=?',key);
     if(acct){
      resolvedUid=acct.user_id||resolvedUid;
      linkedUsernames=[acct.username];
     }else if(g.username){
      linkedUsernames=[g.username];
     }
    }
    grants.push({target_key:g.target_key,target_type:g.target_type,user_id:resolvedUid,username:g.username||linkedUsernames[0]||'',linked_usernames:linkedUsernames,granted_by:g.granted_by||'',granted_at:g.granted_at});
   }
   return json({ok:true,primary_owners:Array.from(ownerSet(env)),grants});
  }
  if(path==='/v1/owner/grants'&&request.method==='POST'){
   const ownerCtx=await requireOwner(db,request,env,now);
   const body=strict(await boundedJson(request,2048),['target','user_id','username']);
   const raw=String(body.user_id||body.username||body.target||'').trim();
   if(!raw)throw new ApiError(400,'Enter a User ID or username to grant owner access.');
   const uid=normalizeUserId(raw);
   const grantedBy=ownerCtx.auth?.username||'owner-token';
   if(uid){
    const accts=await all(db,'SELECT id,username,user_id FROM accounts WHERE user_id=? ORDER BY created_at ASC',uid);
    const names=(accts.results||[]).map(a=>a.username);
    const key=`uid:${uid}`;
    await run(db,'INSERT INTO owner_grants (target_key,target_type,user_id,username,granted_by,granted_at) VALUES (?,?,?,?,?,?) ON CONFLICT(target_key) DO UPDATE SET username=excluded.username,granted_by=excluded.granted_by,granted_at=excluded.granted_at',key,'user_id',uid,names[0]||null,grantedBy,now);
    return json({ok:true,grant:{target_key:key,target_type:'user_id',user_id:uid,username:names[0]||'',linked_usernames:names,granted_by:grantedBy,granted_at:now}});
   }
   if(/^PC-/i.test(raw))throw new ApiError(400,'Invalid User ID format. Expected PC-XXXX-XXXX.');
   const parsed=username(raw);
   const acct=await first(db,'SELECT id,username,username_key,user_id,last_device_hash FROM accounts WHERE username_key=?',parsed.key);
   const resolvedUid=acct?await ensureAccountUserId(db,acct,acct.last_device_hash||null,now):null;
   const displayName=acct?.username||parsed.display;
   const key=`user:${parsed.key}`;
   await run(db,'INSERT INTO owner_grants (target_key,target_type,user_id,username,granted_by,granted_at) VALUES (?,?,?,?,?,?) ON CONFLICT(target_key) DO UPDATE SET user_id=excluded.user_id,username=excluded.username,granted_by=excluded.granted_by,granted_at=excluded.granted_at',key,'username',resolvedUid,displayName,grantedBy,now);
   return json({ok:true,grant:{target_key:key,target_type:'username',user_id:resolvedUid||'',username:displayName,linked_usernames:[displayName],granted_by:grantedBy,granted_at:now}});
  }
  if((path==='/v1/owner/grants/revoke'&&request.method==='POST')||(path==='/v1/owner/grants'&&request.method==='DELETE')){
   await requireOwner(db,request,env,now);
   const body=strict(await boundedJson(request,2048),['target_key','target','user_id','username']);
   const rawKey=String(body.target_key||'').trim();
   const raw=String(body.user_id||body.username||body.target||'').trim();
   let targetKey='';
   if(rawKey.startsWith('uid:')){
    const uid=normalizeUserId(rawKey.slice(4));
    if(!uid)throw new ApiError(400,'Invalid User ID grant key.');
    targetKey=`uid:${uid}`;
   }else if(rawKey.startsWith('user:')){
    const key=rawKey.slice(5).trim().toLowerCase();
    if(!key)throw new ApiError(400,'Invalid username grant key.');
    targetKey=`user:${key}`;
   }else if(raw){
    const uid=normalizeUserId(raw);
    targetKey=uid?`uid:${uid}`:`user:${raw.toLowerCase()}`;
   }
   if(!targetKey)throw new ApiError(400,'Specify a grant to revoke.');
   if(targetKey.startsWith('user:')&&isOwnerUsername(targetKey.slice(5),env))throw new ApiError(400,'Primary owners configured on the server cannot be revoked here.');
   await run(db,'DELETE FROM owner_grants WHERE target_key=?',targetKey);
   return json({ok:true,target_key:targetKey,revoked:true});
  }
  const banMatch=path.match(/^\/v1\/owner\/users\/([A-Za-z0-9-]{4,80})\/ban$/);
  if(banMatch&&request.method==='POST'){
   await requireOwner(db,request,env,now);
   const targetId=banMatch[1];
   const target=await first(db,'SELECT id,username,username_key,user_id,last_device_hash FROM accounts WHERE id=?',targetId);
   if(!target)throw new ApiError(404,'User not found.');
   const {uid,accounts,devices}=await collectLinkedAccountsAndDevices(db,target,now);
   for(const a of accounts){
    if(await isOwnerAccount(db,{...a,user_id:uid},env))throw new ApiError(400,'Owner accounts cannot be banned.');
   }
   let body={};
   try{body=await boundedJson(request,2048);}catch(error){if(!(error instanceof ApiError)||error.status!==400)throw error;}
   const reason=String(body?.reason||'Banned by owner.').trim().slice(0,300);
   const stmts=[
    db.prepare('UPDATE accounts SET banned_at=?,ban_reason=?,last_seen_at=0 WHERE user_id=?').bind(now,reason,uid),
   ];
   for(const a of accounts)stmts.push(db.prepare('UPDATE sessions SET expires_at=-1 WHERE account_id=?').bind(a.id));
   await db.batch(stmts);
   for(const dev of devices)await recordDeviceBan(db,dev,{id:target.id,username:target.username,ban_reason:reason},false,now);
   return json({ok:true,id:targetId,username:target.username,user_id:uid,affected_ids:accounts.map(a=>a.id),banned:true,banned_at:now,ban_reason:reason});
  }
  const unbanMatch=path.match(/^\/v1\/owner\/users\/([A-Za-z0-9-]{4,80})\/unban$/);
  if(unbanMatch&&request.method==='POST'){
   await requireOwner(db,request,env,now);
   const targetId=unbanMatch[1];
   const target=await first(db,'SELECT id,username,user_id,last_device_hash,terminated_at FROM accounts WHERE id=?',targetId);
   if(!target)throw new ApiError(404,'User not found.');
   if(target.terminated_at)throw new ApiError(400,'Permanently terminated profiles cannot be unbanned.');
   const {uid,accounts,devices}=await collectLinkedAccountsAndDevices(db,target,now);
   const stmts=[
    db.prepare('UPDATE accounts SET banned_at=NULL,ban_reason=NULL WHERE user_id=? AND terminated_at IS NULL').bind(uid),
   ];
   const anyTerminated=accounts.some(a=>Boolean(a.terminated_at));
   if(!anyTerminated){
    for(const a of accounts)stmts.push(db.prepare('DELETE FROM banned_devices WHERE account_id=? AND permanent=0').bind(a.id));
    for(const dev of devices)stmts.push(db.prepare('DELETE FROM banned_devices WHERE device_hash=? AND permanent=0').bind(dev));
   }
   await db.batch(stmts);
   const restoredIds=accounts.filter(a=>!a.terminated_at).map(a=>a.id);
   return json({ok:true,id:targetId,username:target.username,user_id:uid,affected_ids:restoredIds,banned:false});
  }
  const termMatch=path.match(/^\/v1\/owner\/users\/([A-Za-z0-9-]{4,80})\/terminate$/);
  if(termMatch&&request.method==='POST'){
   await requireOwner(db,request,env,now);
   const targetId=termMatch[1];
   const target=await first(db,'SELECT id,username,username_key,user_id,last_device_hash FROM accounts WHERE id=?',targetId);
   if(!target)throw new ApiError(404,'User not found.');
   const {uid,accounts,devices}=await collectLinkedAccountsAndDevices(db,target,now);
   for(const a of accounts){
    if(await isOwnerAccount(db,{...a,user_id:uid},env))throw new ApiError(400,'Owner accounts cannot be terminated.');
   }
   let body={};
   try{body=await boundedJson(request,2048);}catch(error){if(!(error instanceof ApiError)||error.status!==400)throw error;}
   const reason=String(body?.reason||'Permanently terminated by owner.').trim().slice(0,300);
   const stmts=[
    db.prepare('UPDATE accounts SET banned_at=COALESCE(banned_at,?),terminated_at=?,ban_reason=?,last_seen_at=0 WHERE user_id=?').bind(now,now,reason,uid),
   ];
   for(const a of accounts){
    stmts.push(db.prepare('DELETE FROM sessions WHERE account_id=?').bind(a.id));
    stmts.push(db.prepare('DELETE FROM documents WHERE account_id=?').bind(a.id));
   }
   await db.batch(stmts);
   for(const dev of devices)await recordDeviceBan(db,dev,{id:target.id,username:target.username,ban_reason:reason},true,now);
   return json({ok:true,id:targetId,username:target.username,user_id:uid,affected_ids:accounts.map(a=>a.id),banned:true,terminated:true,terminated_at:now,ban_reason:reason});
  }
  const removeMatch=path.match(/^\/v1\/owner\/users\/([A-Za-z0-9-]{4,80})(?:\/remove)?$/);
  if(removeMatch&&((path.endsWith('/remove')&&request.method==='POST')||(!path.endsWith('/remove')&&request.method==='DELETE'))){
   await requireOwner(db,request,env,now);
   const targetId=removeMatch[1];
   const target=await first(db,'SELECT id,username,username_key,user_id,last_device_hash FROM accounts WHERE id=?',targetId);
   if(!target)throw new ApiError(404,'User not found.');
   if(await isOwnerAccount(db,target,env))throw new ApiError(400,'Owner accounts cannot be removed.');
   await db.batch([
    db.prepare('DELETE FROM sessions WHERE account_id=?').bind(targetId),
    db.prepare('DELETE FROM documents WHERE account_id=?').bind(targetId),
    db.prepare('DELETE FROM banned_devices WHERE account_id=?').bind(targetId),
    db.prepare('DELETE FROM accounts WHERE id=?').bind(targetId),
   ]);
   return json({ok:true,id:targetId,username:target.username,removed:true});
  }
  throw new ApiError(404,'Not found.');
 }catch(error){if(error instanceof ApiError)return json({error:error.message,...(error.extra||{})},error.status);console.error('Account operation failed:',error?.name||'Error');return json({error:'The account service could not finish that request. Please try again.'},503);}
}};

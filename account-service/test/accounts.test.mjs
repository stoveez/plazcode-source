import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import worker from '../worker/index.js';
import {document,verifier,same} from '../lib/protocol.js';
const sql=fs.readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort().map(name=>fs.readFileSync('drizzle/'+name,'utf8')).join('\n');
function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(sql.replaceAll('--> statement-breakpoint',''));return {sqlite,prepare(query){let args=[];return {bind(...values){args=values;return this;},async first(){return sqlite.prepare(query).get(...args)||null;},async run(){return {success:true,meta:sqlite.prepare(query).run(...args)};},async all(){return {results:sqlite.prepare(query).all(...args)};},_query:query,_args:()=>args};},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const stmt of statements)results.push(await stmt.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};}
const ticket='0'.repeat(48);let nonce=0;while(!createHash('sha256').update(ticket+':'+nonce).digest('hex').startsWith('00000'))nonce++;
const fixtureProof=db=>{db.sqlite.prepare('INSERT OR REPLACE INTO challenges (id,expires_at) VALUES (?,?)').run(ticket,Date.now()+120000);return {id:ticket,nonce};};
async function call(db,path,method='GET',body,token,extra={},envExtra={}){const r=await worker.fetch(new Request('https://accounts.example'+path,{method,headers:{'Content-Type':'application/json','cf-connecting-ip':'192.0.2.1',...(token?{Authorization:'Bearer '+token}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})}),{DB:db,...envExtra});return {status:r.status,data:await r.json(),headers:r.headers};}
test('signup, durable password hashing, remembered sessions, isolation, conflict protection and revoke',async()=>{const db=database();const one=await call(db,'/v1/register','POST',{username:'BuilderOne',password:'test-only-password-01',proof:fixtureProof(db)});assert.equal(one.status,201);assert.match(one.data.token,/^[a-f0-9]{64}$/);const stored=db.sqlite.prepare('SELECT * FROM accounts').get();assert.notEqual(stored.verifier,'test-only-password-01');assert.equal(stored.verifier.length,64);assert(!JSON.stringify(db.sqlite.prepare('SELECT * FROM sessions').all()).includes(one.data.token));
const two=await call(db,'/v1/register','POST',{username:'BuilderTwo',password:'test-only-password-02',proof:fixtureProof(db)});assert.equal(two.status,201);assert.notEqual(one.data.profile.id,two.data.profile.id);
assert.equal((await call(db,'/v1/session','GET',undefined,one.data.token)).data.profile.username,'BuilderOne');assert.equal((await call(db,'/v1/sync')).status,401);
const uploaded=await call(db,'/v1/sync','PUT',{revision:0,document:{settings:{rsAppearance:{theme:'rose',glow:'strong',gradients:'on'}},skills:{sample:{id:'sample',name:'Private skill'}}}},one.data.token);assert.equal(uploaded.status,200);assert.equal(uploaded.data.revision,1);assert.deepEqual((await call(db,'/v1/sync','GET',undefined,two.data.token)).data.document,{settings:{},skills:{}});
assert.equal((await call(db,'/v1/sync','PUT',{revision:0,document:{settings:{},skills:{}}},one.data.token)).status,409);assert.equal((await call(db,'/v1/sync','GET',undefined,one.data.token)).data.document.skills.sample.name,'Private skill');
assert.equal((await call(db,'/v1/login','POST',{username:'builderone',password:'test-only-password-01',proof:fixtureProof(db)})).status,200);
assert.equal((await call(db,'/v1/login','POST',{username:'BuilderOne',password:'test-only-wrong-password',proof:fixtureProof(db)})).status,401);
assert.equal((await call(db,'/v1/login','POST',{username:'MissingUser',password:'test-only-wrong-password',proof:fixtureProof(db)})).status,401);
assert.equal((await call(db,'/v1/session','DELETE',undefined,one.data.token)).status,200);assert.equal((await call(db,'/v1/session','GET',undefined,one.data.token)).status,401);assert.equal((await call(db,'/v1/session','GET',undefined,two.data.token)).status,200);db.sqlite.close();});
test('single-use/expired challenge, bounded requests, origin and strict schemas',async()=>{const db=database();const publicChallenge=await call(db,'/v1/challenge','POST',{});assert.equal(publicChallenge.status,200);assert.equal(publicChallenge.data.bits,20);assert.equal(publicChallenge.headers.get('cache-control'),'no-store');const body={username:'ReplayUser',password:'test-only-password',proof:fixtureProof(db)};assert.equal((await call(db,'/v1/register','POST',body)).status,201);assert.equal((await call(db,'/v1/login','POST',body)).status,401);
fixtureProof(db);db.sqlite.prepare('UPDATE challenges SET expires_at=1').run();assert.equal((await call(db,'/v1/login','POST',body)).status,401);assert.equal((await call(db,'/v1/login','POST',{...body,extra:'forbidden'})).status,400);assert.equal((await call(db,'/v1/login','POST',body,null,{Origin:'https://attacker.example'})).status,403);assert.equal((await call(db,'/v1/login','POST',{username:'X'.repeat(5000)})).status,413);db.sqlite.close();});
test('portable sync rejects credentials, local paths and oversized/unrecognized data',()=>{assert.throws(()=>document({settings:{rsAllowedFolders:['/private']},skills:{}}));assert.throws(()=>document({settings:{rsPermMode:'full'},skills:{}}));assert.throws(()=>document({settings:{},skills:{bad:{password:'test-only-secret'}}}));assert.throws(()=>document({settings:{rsAppearance:{theme:'garbage',glow:'strong',gradients:'on'}},skills:{}}));assert.throws(()=>document({settings:{rsLanguage:{code:'en'}},skills:{}}));assert.throws(()=>document({settings:{},skills:{'../bad':{}}}));});
test('KDF is deterministic, salted and bounded to one operation per isolate',async()=>{const first=verifier('test-only-password','salt-one');await assert.rejects(verifier('test-only-password','salt-two'),e=>e.status===429);const value=await first;assert.equal(value,await verifier('test-only-password','salt-one'));assert.notEqual(value,await verifier('test-only-password','salt-two'));assert(same(value,value));assert(!same(value,'x'.repeat(value.length)));});

test('profile picture formats, private sync, older-client retention and explicit removal',async()=>{
 const db=database(),picture='data:image/gif;base64,'+Buffer.from('GIF89a preserved animation bytes').toString('base64');
 assert.throws(()=>document({settings:{rsProfilePicture:'data:image/svg+xml;base64,PHN2Zy8+'},skills:{}}));
 assert.throws(()=>document({settings:{rsProfilePicture:'data:image/png;base64,R0lGODlh'},skills:{}}));
 assert.throws(()=>document({settings:{rsProfilePicture:'data:image/gif;base64,'+Buffer.alloc(1048577).toString('base64')},skills:{}}));
 const registered=await call(db,'/v1/register','POST',{username:'AvatarOwner',password:'test-only-picture-password',proof:fixtureProof(db)});assert.equal(registered.status,201);const token=registered.data.token;
 let result=await call(db,'/v1/sync','PUT',{revision:0,document:{settings:{rsProfilePicture:picture},skills:{}}},token);assert.equal(result.status,200);assert.equal(result.data.document.settings.rsProfilePicture,picture);
 result=await call(db,'/v1/sync','PUT',{revision:1,document:{settings:{rsSounds:false},skills:{}}},token);assert.equal(result.status,200);assert.equal(result.data.document.settings.rsProfilePicture,picture,'old clients cannot erase a picture they do not understand');
 result=await call(db,'/v1/sync','PUT',{revision:2,document:{settings:{rsProfilePicture:null},skills:{}}},token);assert.equal(result.status,200);assert.equal(result.data.document.settings.rsProfilePicture,null);
 assert.equal((await call(db,'/v1/sync')).status,401);db.sqlite.close();
});

test('owner user directory, heartbeat presence, scrypt non-leakage, ban/unban and profile deletion',async()=>{
 const db=database();
 const env={OWNER_USERNAMES:'PlazOwner',OWNER_ADMIN_TOKEN:'owner-admin-secret-999'};
 const avatar='data:image/png;base64,'+Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.from('avatarbytes')]).toString('base64');

 const ownerReg=await call(db,'/v1/register','POST',{username:'PlazOwner',password:'owner-strong-password-1',proof:fixtureProof(db)},undefined,{},env);
 assert.equal(ownerReg.status,201);
 assert.equal(ownerReg.data.profile.is_owner,true);

 const userReg=await call(db,'/v1/register','POST',{username:'TestPlayer',password:'player-strong-password-1',proof:fixtureProof(db)},undefined,{},env);
 assert.equal(userReg.status,201);
 assert.equal(userReg.data.profile.is_owner,false);

 // Sync avatar + private skill for TestPlayer
 const synced=await call(db,'/v1/sync','PUT',{revision:0,document:{settings:{rsProfilePicture:avatar,rsSounds:false},skills:{secretSkill:{id:'secretSkill',name:'ShouldStayPrivate'}}}},userReg.data.token,{},env);
 assert.equal(synced.status,200);

 // Heartbeat active + closing
 const hb=await call(db,'/v1/heartbeat','POST',{status:'active',app_version:'1.24.36'},userReg.data.token,{},env);
 assert.equal(hb.status,200);
 assert.equal(hb.data.online,true);

 // Non-owner rejected from owner directory
 assert.equal((await call(db,'/v1/owner/users','GET',undefined,userReg.data.token,{},env)).status,403);

 // Owner views directory (search, avatar present, salt/verifier & private skills/settings strictly excluded)
 const dir=await call(db,'/v1/owner/users?q=player&filter=online','GET',undefined,ownerReg.data.token,{},env);
 assert.equal(dir.status,200);
 assert.equal(dir.data.users.length,1);
 const listed=dir.data.users[0];
 assert.equal(listed.username,'TestPlayer');
 assert.equal(listed.online,true);
 assert.equal(listed.app_version,'1.24.36');
 assert.equal(listed.profile_picture,avatar);
 assert(listed.created_at>0);
 const rawJson=JSON.stringify(dir.data);
 assert(!rawJson.includes('verifier')&&!rawJson.includes('salt')&&!rawJson.includes('ShouldStayPrivate')&&!rawJson.includes('rsSounds'));

 // Heartbeat closing marks offline immediately
 const hbClose=await call(db,'/v1/heartbeat','POST',{status:'closing'},userReg.data.token,{},env);
 assert.equal(hbClose.status,200);
 assert.equal(hbClose.data.online,false);

 // Owner cannot ban or remove own owner account
 assert.equal((await call(db,`/v1/owner/users/${ownerReg.data.profile.id}/ban`,'POST',{reason:'nope'},undefined,{'X-Owner-Token':env.OWNER_ADMIN_TOKEN},env)).status,400);
 assert.equal((await call(db,`/v1/owner/users/${ownerReg.data.profile.id}`,'DELETE',undefined,undefined,{'X-Owner-Token':env.OWNER_ADMIN_TOKEN},env)).status,400);

 // Ban TestPlayer -> revokes sessions & blocks login/session/sync/heartbeat with 403 account_banned
 const banned=await call(db,`/v1/owner/users/${userReg.data.profile.id}/ban`,'POST',{reason:'Abuse'},ownerReg.data.token,{},env);
 assert.equal(banned.status,200);
 assert.equal(banned.data.banned,true);
 const blockedSess=await call(db,'/v1/session','GET',undefined,userReg.data.token,{},env);
 assert.equal(blockedSess.status,403);
 assert.equal(blockedSess.data.code,'account_banned');
 const blockedLogin=await call(db,'/v1/login','POST',{username:'TestPlayer',password:'player-strong-password-1',proof:fixtureProof(db)},undefined,{},env);
 assert.equal(blockedLogin.status,403);
 assert.equal(blockedLogin.data.code,'account_banned');

 // Unban TestPlayer -> login works again
 const unbanned=await call(db,`/v1/owner/users/${userReg.data.profile.id}/unban`,'POST',{},ownerReg.data.token,{},env);
 assert.equal(unbanned.status,200);
 assert.equal(unbanned.data.banned,false);
 const relogin=await call(db,'/v1/login','POST',{username:'TestPlayer',password:'player-strong-password-1',proof:fixtureProof(db)},undefined,{},env);
 assert.equal(relogin.status,200);

 // Remove user profile completely (sessions + documents + account)
 const removed=await call(db,`/v1/owner/users/${userReg.data.profile.id}`,'DELETE',undefined,undefined,{'X-Owner-Token':env.OWNER_ADMIN_TOKEN},env);
 assert.equal(removed.status,200);
 assert.equal(removed.data.removed,true);
 assert.equal((await call(db,'/v1/session','GET',undefined,relogin.data.token,{},env)).status,401);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS c FROM documents WHERE account_id=?').get(userReg.data.profile.id).c,0);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS c FROM accounts WHERE id=?').get(userReg.data.profile.id).c,0);

 db.sqlite.close();
});

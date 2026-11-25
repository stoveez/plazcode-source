import {scryptAsync} from '@noble/hashes/scrypt.js';
export const SESSION_MS=90*24*60*60*1000;
export const BODY_LIMIT=2*1024*1024;
export const SETTINGS=new Set(['rsProfilePicture','rsLanguage','rsWorkMode','rsThinkingLevel','rsSounds','rsExtraThinking','rsShowApproach','rsPlanMode','rsAppearance','rsVisualCheck','rsContinuationOffer','rsInputLimitEnabled','rsInputCharLimit','rsOutputLimitEnabled','rsOutputCharLimit','rsForgeMode','rsAutoFix']);
export const USER_ID_ALPHABET='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const USER_ID_RE=/^PC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/;
export function normalizeUserId(value){if(typeof value!=='string')return null;const clean=value.trim().toUpperCase();if(USER_ID_RE.test(clean))return clean;const compact=clean.replace(/[^A-Z0-9]/g,'');if(compact.length===10&&compact.startsWith('PC')){const formatted=`PC-${compact.slice(2,6)}-${compact.slice(6,10)}`;if(USER_ID_RE.test(formatted))return formatted;}return null;}
export function generateUserId(){const raw=crypto.getRandomValues(new Uint8Array(8));let out='';for(let i=0;i<8;i++)out+=USER_ID_ALPHABET[raw[i]&31];return `PC-${out.slice(0,4)}-${out.slice(4,8)}`;}
export class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
export const bytes=text=>new TextEncoder().encode(text);
export const hex=value=>Array.from(value,b=>b.toString(16).padStart(2,'0')).join('');
export const randomHex=size=>hex(crypto.getRandomValues(new Uint8Array(size)));
export async function sha(text){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(text))));}
export function strict(value,fields){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!fields.includes(k)))throw new ApiError(400,'Invalid request.');return value;}
export function username(value){if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$/.test(value))throw new ApiError(400,'Use 3–32 letters, numbers, dots, underscores or hyphens for your username.');return {display:value,key:value.toLowerCase()};}
const SEVERE_SUBSTRINGS=[
 'nigger','nigga','faggot','fagget','tranny','retard',
 'wetback','raghead','towelhead','cameljockey',
 'porn','porno','hentai','blowjob','handjob','rimjob','footjob','boobjob','deepthroat','gangbang','bukkake','creampie','cunnilingus','fellatio','masturbat','jackoff','jerkoff',
 'dildo','fleshlight','orgasm','onlyfans','rule34',
 'pussy','vagina','clitoris','penis','scrotum','testicle','boobies','titties','whore','slut',
 'pedophil','paedophil','childporn','csam','lolicon','shotacon','bestiality','zoophil','incest','necrophil',
 'nazi','hitler','swastika','whitepower',
];
const SEVERE_WHOLE_TOKENS=new Set([
 'fag','fags','niga','nig','kike','chink','spic','gook','coon','dyke','paki','beaner','honky',
 'sex','sexy','cum','cums','jizz','splooge','anal','anus','tit','tits','boob','boobs','clit',
 'cock','cocks','dick','dicks','wang','dong','boner','fap','fapping','milf','dilf','bdsm','fetish','kink','kinky','erotic','nsfw','vibrator',
 'rape','raped','raping','rapist','pedo','loli','shota','kkk','isis','kys','suicide','selfharm','thot','skank','holocaust','genocide','lynch','r34',
]);
const SAFE_PREFIX_EXEMPT=new Set([
 'analysis','analytics','analytic','analog','analogue','titan','titanium','title','titled','peacock','cockpit','cocktail',
 'scunthorpe','classic','classes','document','documents','grape','drape','scrape','therapist','therapy','tycoon','spicy',
 'cumulus','accumulate','cucumber','circuit','circumstance','essex','sussex','middlesex','sextant','sexton',
 'lollipop','dickens','dictate','dickinson','hancock','babcock','woodcock',
]);
function normalizeNameForFilter(raw){
 const map={'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','@':'a','$':'s','!':'i'};
 let out='';let prev='';let run=0;
 for(const ch of String(raw||'').toLowerCase()){
  const mapped=map[ch]||ch;
  if(/[a-z]/.test(mapped)){
   if(mapped===prev){run++;if(run>=3)continue;}else{prev=mapped;run=1;}
   out+=mapped;
  }
 }
 return out;
}
function splitUsernameSegments(raw){
 return String(raw||'')
  .replace(/([a-z])([A-Z])/g,'$1 $2')
  .split(/[._\-\s0-9]+/)
  .map(s=>s.trim().toLowerCase())
  .filter(Boolean);
}
export function isAppropriateUsername(value){
 const raw=String(value||'').trim();
 if(!raw)return true;
 for(const tok of splitUsernameSegments(raw)){
  if(SAFE_PREFIX_EXEMPT.has(tok))continue;
  const normTok=normalizeNameForFilter(tok);
  if(SEVERE_WHOLE_TOKENS.has(tok)||SEVERE_WHOLE_TOKENS.has(normTok))return false;
 }
 for(const rawTok of raw.toLowerCase().split(/[._-]+/).filter(Boolean)){
  if(SAFE_PREFIX_EXEMPT.has(rawTok))continue;
  const normRawTok=normalizeNameForFilter(rawTok);
  if(SEVERE_WHOLE_TOKENS.has(rawTok)||SEVERE_WHOLE_TOKENS.has(normRawTok))return false;
 }
 const compact=normalizeNameForFilter(raw);
 for(const bad of SEVERE_SUBSTRINGS){
  if(raw.toLowerCase().includes(bad)||compact.includes(bad))return false;
 }
 return true;
}
export function validateRegistrationUsername(value){
 const parsed=username(value);
 if(!isAppropriateUsername(parsed.display)){
  throw new ApiError(400,'That profile name is not allowed. Choose a respectful name without slurs or explicit content.');
 }
 return parsed;
}
export function password(value){if(typeof value!=='string'||value.length<10||bytes(value).length>512)throw new ApiError(400,'Use a password of at least 10 characters (up to 512 bytes).');return value;}
export function same(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
let hashing=false;
export async function verifier(secret,salt){
 if(hashing)throw new ApiError(429,'Sign-in is busy. Please try again in a moment.');
 hashing=true;try{return hex(await scryptAsync(bytes(secret),bytes(salt),{N:32768,r:8,p:3,dkLen:32,maxmem:48*1024*1024,asyncTick:8}));}finally{hashing=false;}
}
export async function boundedJson(request,limit=4096){
 const reader=request.body?.getReader();let total=0;const chunks=[];
 if(!reader)throw new ApiError(400,'Invalid request.');
 try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit)throw new ApiError(413,'Request is too large.');chunks.push(value);}}
 finally{reader.releaseLock();}
 const raw=new Uint8Array(total);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw new ApiError(400,'Invalid JSON request.');}
}
function plain(value){return value&&typeof value==='object'&&!Array.isArray(value);}
export function profilePicture(value){
 if(value===null)return value;
 if(typeof value!=='string'||value.length>Math.ceil(1048576/3)*4+64)throw new ApiError(400,'Profile pictures must be 1 MB or smaller.');
 const match=/^data:image\/(png|jpeg|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);if(!match)throw new ApiError(400,'Choose a JPEG, PNG or GIF picture.');
 let raw;try{raw=atob(match[2]);}catch{throw new ApiError(400,'Invalid profile picture.');}
 if(raw.length>1048576||!(match[1]==='png'?raw.startsWith('\x89PNG\r\n\x1a\n'):match[1]==='gif'?raw.startsWith('GIF87a')||raw.startsWith('GIF89a'):raw.startsWith('\xff\xd8\xff')&&raw.endsWith('\xff\xd9')))throw new ApiError(400,'Choose a JPEG, PNG or GIF picture.');return value;
}
export function document(value){
 strict(value,['settings','skills']);const settings=value.settings||{},skills=value.skills||{};
 if(!plain(settings)||!plain(skills)||Object.keys(settings).some(k=>!SETTINGS.has(k)))throw new ApiError(400,'Only portable settings and skills can sync.');
 const out={settings:{},skills:{}};
 for(const [key,item]of Object.entries(settings)){
  if(key==='rsProfilePicture'){profilePicture(item);}
  else if(key==='rsAppearance'){strict(item,['theme','glow','gradients']);if(!['default','amethyst','cyan','rose','emerald','graphite','crimson','ocean','copper','aurora','orchid'].includes(item.theme)||!['off','subtle','strong'].includes(item.glow)||!['on','off'].includes(item.gradients))throw new ApiError(400,'Invalid appearance.');}
  else if(key==='rsLanguage'){if(typeof item!=='string'||item.length>10)throw new ApiError(400,'Invalid language.');}
  else if(['rsWorkMode','rsThinkingLevel'].includes(key)){if(typeof item!=='string'||item.length>24)throw new ApiError(400,'Invalid setting.');}
  else if(['rsInputCharLimit','rsOutputCharLimit'].includes(key)){if(!Number.isSafeInteger(item)||item<1000||item>2000000)throw new ApiError(400,'Invalid limit.');}
  else if(typeof item!=='boolean')throw new ApiError(400,'Invalid setting.');
  out.settings[key]=item;
 }
 const ids=Object.keys(skills);if(ids.length>500)throw new ApiError(400,'Too many synced skills.');
 for(const id of ids){if(['__proto__','prototype','constructor'].includes(id)||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(id))throw new ApiError(400,'Invalid skill ID.');const item=skills[id];if(item===null){out.skills[id]=null;continue;}if(!plain(item)||JSON.stringify(item).length>200000)throw new ApiError(400,'Invalid skill.');const serialized=JSON.stringify(item);if(/"(?:password|access_token|refresh_token|api_key|private_key|github_token)"\s*:/i.test(serialized))throw new ApiError(400,'Private credentials cannot be synced as skill fields.');out.skills[id]=item;}
 if(bytes(JSON.stringify(out)).length>BODY_LIMIT-4096)throw new ApiError(413,'Synced data is too large.');
 return out;
}

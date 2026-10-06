// Accounts for the self-hosted (Node) server: sign-up, sign-in, sessions.
//
// Each account owns a storage key. Watchlist, Dex and alert rows are filed under that key,
// exactly as they were under the single local user before, so the existing data moves into
// the admin account by giving admin the old key ('local-owner').
//
// Passwords are hashed with scrypt and a per-account salt. Session tokens are random,
// sent only in an HttpOnly cookie, and stored as SHA-256 hashes.
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';

export const ACCOUNT_SQL=`
CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, user_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, last_login_at TEXT);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY NOT NULL, account_id INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_account ON sessions (account_id);
CREATE TABLE IF NOT EXISTS invites (code_hash TEXT PRIMARY KEY NOT NULL, label TEXT, created_at TEXT NOT NULL, used_at TEXT, account_id INTEGER);`;

// Invite codes: people joining through the internet link need one, and each works once.
// Codes are shown once when made (node invite.mjs) and stored only as SHA-256 hashes.
const INVITE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function normalizeInvite(code){return typeof code==='string'?code.toUpperCase().replace(/[\s-]/g,''):'';}
export function newInviteCode(random=randomBytes){
 const bytes=random(10);let out='';for(const b of bytes)out+=INVITE_ALPHABET[b%INVITE_ALPHABET.length];
 return `FS-${out.slice(0,5)}-${out.slice(5)}`;
}

export const USERNAME_RULES={min:3,max:20};
export const PASSWORD_RULES={min:5,max:64};
// Characters a password may not contain: quotes, angle brackets, backtick, backslash,
// semicolon, ampersand, whitespace and control characters. Only printable ASCII is allowed.
export const BANNED_PASSWORD_CHARS=`< > " ' \` \\ ; &`;
const BANNED_PASSWORD=/[<>"'`\\;&]/;
export const SESSION_DAYS=30;
export const COOKIE='fs_session';

export function usernameProblem(name){
 if(typeof name!=='string'||!name)return 'Enter a username.';
 if(name.length<USERNAME_RULES.min||name.length>USERNAME_RULES.max)return `Usernames are ${USERNAME_RULES.min}–${USERNAME_RULES.max} characters.`;
 if(!/^[A-Za-z0-9._-]+$/.test(name))return 'Usernames can use letters, numbers, period, hyphen and underscore only.';
 if(!/^[A-Za-z0-9]/.test(name)||!/[A-Za-z0-9]$/.test(name))return 'Usernames start and end with a letter or number.';
 if(/[._-]{2}/.test(name))return 'Usernames cannot have two symbols in a row.';
 return null;
}
export function passwordProblem(password,repeat){
 if(typeof password!=='string'||!password)return 'Enter a password.';
 if(password.length<PASSWORD_RULES.min||password.length>PASSWORD_RULES.max)return `Passwords are ${PASSWORD_RULES.min}–${PASSWORD_RULES.max} characters.`;
 if(!/^[\x21-\x7e]+$/.test(password))return 'Passwords use standard keyboard characters, with no spaces.';
 if(BANNED_PASSWORD.test(password))return `Passwords cannot contain ${BANNED_PASSWORD_CHARS}`;
 if(repeat!==undefined&&repeat!==password)return 'The two passwords do not match.';
 return null;
}

const N=16384,R=8,P=1,KEYLEN=64;
export function hashPassword(password){
 const salt=randomBytes(16);
 return ['scrypt',N,R,P,salt.toString('base64url'),scryptSync(password,salt,KEYLEN,{N,r:R,p:P}).toString('base64url')].join('$');
}
// A fixed hash so unknown usernames take as long to reject as wrong passwords.
const DUMMY=hashPassword(randomBytes(12).toString('base64url'));
export function verifyPassword(password,stored){
 const [kind,n,r,p,salt,hash]=String(stored||DUMMY).split('$');
 if(kind!=='scrypt')return false;
 const expected=Buffer.from(hash,'base64url');
 const actual=scryptSync(String(password),Buffer.from(salt,'base64url'),expected.length,{N:Number(n),r:Number(r),p:Number(p)});
 return timingSafeEqual(actual,expected)&&stored!=null;
}
const tokenHash=token=>createHash('sha256').update(token).digest('hex');
const inviteHash=code=>tokenHash('invite:'+normalizeInvite(code));

export function accountStore(sqlite,now=()=>new Date()){
 sqlite.exec(ACCOUNT_SQL);
 const q={
  byKey:sqlite.prepare('SELECT * FROM accounts WHERE username_key = ?'),
  insert:sqlite.prepare('INSERT INTO accounts (username,username_key,password_hash,user_key,created_at) VALUES (?,?,?,?,?)'),
  setUserKey:sqlite.prepare('UPDATE accounts SET user_key = ? WHERE id = ?'),
  login:sqlite.prepare('UPDATE accounts SET last_login_at = ? WHERE id = ?'),
  session:sqlite.prepare('INSERT INTO sessions (token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)'),
  find:sqlite.prepare('SELECT a.id,a.username,a.user_key,s.expires_at FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ?'),
  drop:sqlite.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  expire:sqlite.prepare('DELETE FROM sessions WHERE expires_at < ?'),
  keys:sqlite.prepare('SELECT user_key FROM accounts'),
  count:sqlite.prepare('SELECT COUNT(*) AS n FROM accounts'),
  addInvite:sqlite.prepare('INSERT INTO invites (code_hash,label,created_at) VALUES (?,?,?)'),
  openInvite:sqlite.prepare('SELECT code_hash FROM invites WHERE code_hash = ? AND used_at IS NULL'),
  useInvite:sqlite.prepare('UPDATE invites SET used_at = ?, account_id = ? WHERE code_hash = ? AND used_at IS NULL'),
  invites:sqlite.prepare('SELECT i.label,i.created_at,i.used_at,a.username FROM invites i LEFT JOIN accounts a ON a.id = i.account_id ORDER BY i.created_at')
 };
 const BAD_INVITE={error:'That invite code is not valid or has already been used.',status:403};
 const store={
  // With an invite, the account and the used code are saved together or not at all.
  create(username,password,userKey,options={}){
   const problem=usernameProblem(username)||passwordProblem(password);if(problem)return {error:problem};
   if(!Object.hasOwn(options,'invite'))return store.createAccount(username,password,userKey);
   const {invite}=options;
   if(!normalizeInvite(invite))return {error:'Enter your invite code.',status:400};
   const hash=inviteHash(invite);
   sqlite.exec('BEGIN IMMEDIATE');
   try{
    if(!q.openInvite.get(hash)){sqlite.exec('ROLLBACK');return BAD_INVITE;}
    const r=store.createAccount(username,password,userKey);
    if(r.error||q.useInvite.run(now().toISOString(),r.account.id,hash).changes!==1){sqlite.exec('ROLLBACK');return r.error?r:BAD_INVITE;}
    sqlite.exec('COMMIT');return r;
   }catch(e){try{sqlite.exec('ROLLBACK');}catch{}throw e;}
  },
  createAccount(username,password,userKey){
   const key=username.toLowerCase();
   if(q.byKey.get(key))return {error:'That username is taken. Try another.',status:409};
   try{
    const r=q.insert.run(username,key,hashPassword(password),userKey||'pending-'+randomBytes(8).toString('hex'),now().toISOString());
    const id=Number(r.lastInsertRowid);if(!userKey)q.setUserKey.run('acct-'+id,id);
    return {account:{id,username,user_key:userKey||'acct-'+id}};
   }catch(e){if(/UNIQUE/.test(e.message))return {error:'That username is taken. Try another.',status:409};throw e;}
  },
  authenticate(username,password){
   const row=typeof username==='string'&&username.length<=USERNAME_RULES.max?q.byKey.get(username.toLowerCase()):null;
   const ok=verifyPassword(typeof password==='string'?password.slice(0,PASSWORD_RULES.max):'',row?.password_hash);
   if(!row||!ok)return null;
   q.login.run(now().toISOString(),row.id);return {id:row.id,username:row.username,user_key:row.user_key};
  },
  startSession(accountId){
   const token=randomBytes(32).toString('base64url'),t=now();
   q.expire.run(t.toISOString());
   q.session.run(tokenHash(token),accountId,t.toISOString(),new Date(t.getTime()+SESSION_DAYS*86400000).toISOString());
   return token;
  },
  sessionUser(token){
   if(typeof token!=='string'||!/^[A-Za-z0-9_-]{30,60}$/.test(token))return null;
   const row=q.find.get(tokenHash(token));if(!row)return null;
   if(row.expires_at<now().toISOString()){q.drop.run(tokenHash(token));return null;}
   return {id:row.id,username:row.username,user_key:row.user_key};
  },
  endSession(token){if(typeof token==='string')q.drop.run(tokenHash(token));},
  userKeys(){return q.keys.all().map(r=>r.user_key);},
  count(){return q.count.get().n;},
  exists(username){return !!q.byKey.get(String(username).toLowerCase());},
  createInvite(label=''){const code=newInviteCode();q.addInvite.run(inviteHash(code),String(label).slice(0,60)||null,now().toISOString());return code;},
  listInvites(){return q.invites.all();}
 };
 return store;
}

// The first admin account takes over the data saved before accounts existed.
export function seedAdmin(store,password,legacyKey){
 if(!password||store.exists('admin'))return null;
 const r=store.create('admin',password,legacyKey);
 if(r.error)throw new Error('Could not create the admin account: '+r.error);
 return r.account;
}

export function readCookie(header,name=COOKIE){
 for(const part of String(header||'').split(';')){const i=part.indexOf('=');if(i>0&&part.slice(0,i).trim()===name)return part.slice(i+1).trim();}
 return null;
}
// Tunnel visitors open shared links from other sites, so their cookie is Lax and Secure.
export const sessionCookie=(token,secure=false)=>`${COOKIE}=${token}; Path=/; HttpOnly; SameSite=${secure?'Lax':'Strict'}; Max-Age=${SESSION_DAYS*86400}${secure?'; Secure':''}`;
export const clearCookie=(secure=false)=>`${COOKIE}=; Path=/; HttpOnly; SameSite=${secure?'Lax':'Strict'}; Max-Age=0${secure?'; Secure':''}`;

// Failed sign-ins are limited per address: 8 tries per 10 minutes.
export function attemptLimiter({max=8,windowMs=600000,now=()=>Date.now()}={}){
 const hits=new Map();
 return {
  blocked(key){const h=hits.get(key);if(!h)return 0;const t=now();if(t-h.start>windowMs){hits.delete(key);return 0;}return h.count>=max?Math.ceil((h.start+windowMs-t)/1000):0;},
  fail(key){const t=now(),h=hits.get(key);if(!h||t-h.start>windowMs)hits.set(key,{start:t,count:1});else h.count++;if(hits.size>5000)hits.delete(hits.keys().next().value);},
  clear(key){hits.delete(key);}
 };
}

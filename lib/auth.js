import {randomBytes,scryptSync,timingSafeEqual,createHash,randomUUID} from 'node:crypto';

export const roles=['admin','manager','workshop','driver'];
export function hashPassword(password){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;}
export function verifyPassword(password,stored){try{const [salt,hash]=stored.split(':');const actual=scryptSync(password,salt,64),expected=Buffer.from(hash,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}catch{return false;}}
export function publicUser(user){const {passwordHash,...safe}=user;return safe;}
// Public demo credentials (local demo only; DEMO_MODE=0 bootstraps a real admin instead).
export const DEMO_PASSWORD='demo1234';
export const demoEmail=role=>`${role}@demo.id`;
export function demoUsers(trucks){return roles.map(role=>({id:randomUUID(),name:{admin:'Demo administrator',manager:'Fleet manager',workshop:'Workshop staff',driver:'Demo driver'}[role],email:demoEmail(role),role,active:true,assignedTruckIds:role==='driver'?trucks.slice(0,2).map(t=>t.id):[],passwordHash:hashPassword(DEMO_PASSWORD)}));}
// Databases created before 17 Oct 2026 use <role>@fleetwise.local / FleetwiseDemo!2026. Move only accounts still on that
// public password; an account whose password an admin changed is left alone. Returns how many changed.
export function migrateLegacyDemoAccounts(users){
 let changed=0;
 for(const u of users){
  if(u.email!==`${u.role}@fleetwise.local`||users.some(x=>x.email===demoEmail(u.role))||!verifyPassword('FleetwiseDemo!2026',u.passwordHash))continue;
  u.email=demoEmail(u.role);u.passwordHash=hashPassword(DEMO_PASSWORD);changed++;
 }
 return changed;
}
// Cookie for the web app; Authorization: Bearer <token> for the mobile app (same server-side session store).
const sessionToken=req=>{const auth=req.headers.authorization;if(typeof auth==='string'&&/^Bearer [a-f0-9]{64}$/.test(auth))return auth.slice(7);return (req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('fleetwise_session='))?.slice(18)||null;};
export function sessionManager(){
 const sessions=new Map(),attempts=new Map();
 const digest=token=>createHash('sha256').update(token).digest('hex');
 return {
  issue(userId){const token=randomBytes(32).toString('hex');sessions.set(digest(token),{userId,expires:Date.now()+12*60*60*1000});return token;},
  get(req,users){const token=sessionToken(req);if(!token)return null;const key=digest(token),session=sessions.get(key);if(!session||session.expires<Date.now()){sessions.delete(key);return null;}return users.find(u=>u.id===session.userId&&u.active)||null;},
  revoke(req){const token=sessionToken(req);if(token)sessions.delete(digest(token));},
  revokeUser(userId){for(const [key,session] of sessions)if(session.userId===userId)sessions.delete(key);},
  allowLogin(ip){const old=attempts.get(ip);if(!old||old.reset<Date.now()){attempts.set(ip,{count:1,reset:Date.now()+60000});return true;}return ++old.count<=15;}
 };
}
export function sessionCookie(token,secure=false){return `fleetwise_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token?43200:0}${secure?'; Secure':''}`;}
export function canManageFleet(user){return ['admin','manager','workshop'].includes(user.role);}
export function visibleData(db,user){
 const {users,orders=[],...data}=db;
 data.orders=user.role==='admin'?orders:user.role==='driver'?orders.filter(o=>o.driverId===user.id).map(({source,createdBy,reviewedBy,...o})=>o):[];
 if(user.role!=='driver')return {...data,trips:user.role==='workshop'?[]:data.trips,currentUser:publicUser(user)};
 const ids=new Set(user.assignedTruckIds);
 return {...data,trucks:db.trucks.filter(t=>ids.has(t.id)).map(({specReports,...t})=>t),parts:db.parts.filter(p=>db.trucks.some(t=>ids.has(t.id)&&p.models.includes(t.model))),maintenance:db.maintenance.filter(m=>ids.has(m.truckId)),trips:db.trips.filter(t=>t.driverId===user.id),ai:{status:'restricted',text:'',revision:null,updatedAt:null},currentUser:publicUser(user)};
}

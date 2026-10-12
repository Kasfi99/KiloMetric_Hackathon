import {randomBytes,scryptSync,timingSafeEqual,createHash,randomUUID} from 'node:crypto';

export const roles=['admin','manager','workshop','driver'];
export function hashPassword(password){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;}
export function verifyPassword(password,stored){try{const [salt,hash]=stored.split(':');const actual=scryptSync(password,salt,64),expected=Buffer.from(hash,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}catch{return false;}}
export function publicUser(user){const {passwordHash,...safe}=user;return safe;}
export function demoUsers(trucks){return roles.map(role=>({id:randomUUID(),name:{admin:'Demo administrator',manager:'Fleet manager',workshop:'Workshop staff',driver:'Demo driver'}[role],email:`${role}@fleetwise.local`,role,active:true,assignedTruckIds:role==='driver'?trucks.slice(0,2).map(t=>t.id):[],passwordHash:hashPassword('FleetwiseDemo!2026')}));}
export function sessionManager(){
 const sessions=new Map(),attempts=new Map();
 const digest=token=>createHash('sha256').update(token).digest('hex');
 return {
  issue(userId){const token=randomBytes(32).toString('hex');sessions.set(digest(token),{userId,expires:Date.now()+12*60*60*1000});return token;},
  get(req,users){const token=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('fleetwise_session='))?.slice(18);if(!token)return null;const key=digest(token),session=sessions.get(key);if(!session||session.expires<Date.now()){sessions.delete(key);return null;}return users.find(u=>u.id===session.userId&&u.active)||null;},
  revoke(req){const token=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('fleetwise_session='))?.slice(18);if(token)sessions.delete(digest(token));},
  revokeUser(userId){for(const [key,session] of sessions)if(session.userId===userId)sessions.delete(key);},
  allowLogin(ip){const old=attempts.get(ip);if(!old||old.reset<Date.now()){attempts.set(ip,{count:1,reset:Date.now()+60000});return true;}return ++old.count<=15;}
 };
}
export function sessionCookie(token,secure=false){return `fleetwise_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token?43200:0}${secure?'; Secure':''}`;}
export function canManageFleet(user){return ['admin','manager','workshop'].includes(user.role);}
export function visibleData(db,user){
 const {users,...data}=db;
 if(user.role!=='driver')return {...data,trips:user.role==='workshop'?[]:data.trips,currentUser:publicUser(user)};
 const ids=new Set(user.assignedTruckIds);
 return {...data,trucks:db.trucks.filter(t=>ids.has(t.id)),parts:db.parts.filter(p=>db.trucks.some(t=>ids.has(t.id)&&p.models.includes(t.model))),maintenance:db.maintenance.filter(m=>ids.has(m.truckId)),trips:db.trips.filter(t=>t.driverId===user.id),ai:{status:'restricted',text:'',revision:null,updatedAt:null},currentUser:publicUser(user)};
}

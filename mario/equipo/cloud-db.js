(() => {
"use strict";
/**
 * Sofia Equipo uses managed Postgres with Supabase Auth + RLS.
 * Publishable key is public by design. Never embed service_role or Meta tokens.
 */
const URL="https://ixgsjjpxkhiocuapzyby.supabase.co";
const KEY="sb_publishable_n9PeyN7EhO6C9JzNESzTvQ_kb1RtQ4U";
const SESSION_KEY="sofia-mario-team-session-v1";
const TABLES={clients:"sofia_mobile_clients",notes:"sofia_mobile_notes",appointments:"sofia_mobile_appointments",followups:"sofia_mobile_followups",events:"sofia_mobile_events"};
const inputMap={clients:{id:"id",name:"name",phone:"phone",model:"model",stage:"stage",source:"source",createdAt:"created_at",updatedAt:"updated_at"},notes:{id:"id",clientId:"client_id",body:"body",createdAt:"created_at"},appointments:{id:"id",clientId:"client_id",startsAt:"starts_at",kind:"kind",status:"status",detail:"detail",source:"source",createdAt:"created_at"},followups:{id:"id",clientId:"client_id",dueAt:"due_at",reason:"reason",status:"status",createdAt:"created_at"},events:{id:"id",clientId:"client_id",at:"at",type:"type",detail:"detail"}};
let session=null,teamId=null;
const enc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const localId=()=>crypto.randomUUID();
function loadSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||"null")}catch{return null}}
function saveSession(s){session=s;if(s)localStorage.setItem(SESSION_KEY,JSON.stringify(s));else localStorage.removeItem(SESSION_KEY)}
async function request(url,opts={},authenticated=true){
 const headers={"apikey":KEY,...opts.headers};
 if(authenticated){
  await ensureSession();
  if(!session?.access_token)throw Error("Tu sesión terminó. Entra de nuevo para sincronizar.");
  headers.Authorization="Bearer "+session.access_token;
 }
 const r=await fetch(url,{...opts,headers,cache:"no-store"});
 let json=null;try{json=await r.json()}catch{}
 if(!r.ok){let msg=json?.message||json?.msg||json?.error_description||json?.error||"Falló la conexión";
  if(r.status===401)msg="La sesión venció o no está autorizada. Inicia sesión otra vez.";
  if(r.status===409)msg="El registro ya existe; actualiza o revisa el teléfono duplicado.";
  throw Error(msg);
 }
 return json;
}
async function ensureSession(){
 if(!session?.access_token){session=loadSession()}
 if(!session?.access_token)throw Error("Inicia sesión para guardar.");
 if(Date.now()<((session.expires_at||0)-90)*1000)return;
 if(!session.refresh_token)throw Error("La sesión venció. Inicia sesión otra vez.");
 const next=await request(URL+"/auth/v1/token?grant_type=refresh_token",{
  method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refresh_token:session.refresh_token})
 },false);
 next.expires_at=Math.floor(Date.now()/1000)+(next.expires_in||3600);
 saveSession(next);
}
async function membership(){
 const rows=await request(URL+"/rest/v1/sofia_mobile_members?select=team_id,role&limit=5");
 teamId=rows?.[0]?.team_id||null;
 return rows;
}
const endpoints=store=>URL+"/rest/v1/"+TABLES[store];
const fromDb=(store,row)=>Object.fromEntries(Object.entries(inputMap[store]).filter(([k,v])=>Object.hasOwn(row,v)).map(([k,v])=>[k,row[v]]));
const toDb=(store,obj)=>Object.fromEntries(Object.entries(inputMap[store]).filter(([k,v])=>Object.hasOwn(obj,k)).map(([k,v])=>[v,obj[k]]));
async function all(store){
 if(store==="settings")return [];
 if(!TABLES[store])throw Error("Tabla desconocida");
 if(!teamId)throw Error("Falta la invitación del equipo");
 let rows=[];
 for(let offset=0;offset<10000;offset+=500){
  const part=await request(endpoints(store)+"?select=*&team_id=eq."+encodeURIComponent(teamId)+"&order="+(store==="clients"?"updated_at.desc":store==="appointments"?"starts_at.desc":store==="followups"?"due_at.desc":store==="notes"?"created_at.desc":"at.desc")+"&limit=500&offset="+offset);
  rows.push(...part.map(x=>fromDb(store,x)));
  if(part.length<500)break;
 }
 return rows;
}
async function get(store,id){
 if(store==="settings")return null;
 if(!teamId)throw Error("No tienes acceso al equipo");
 const found=await request(endpoints(store)+"?select=*&team_id=eq."+teamId+"&id=eq."+encodeURIComponent(id)+"&limit=1");
 return found?.length?fromDb(store,found[0]):null;
}
async function put(store,obj){
 if(!teamId)throw Error("Falta tu invitación");
 const payload={...toDb(store,obj),team_id:teamId};
 const r=await request(endpoints(store)+"?on_conflict=id",{
  method:"POST",headers:{"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=representation"},
  body:JSON.stringify(payload)
 });
 return r?.length?fromDb(store,r[0]):obj;
}
async function activity(type,detail,clientId=null){return put("events",{id:localId(),type:String(type).slice(0,120),detail:String(detail).slice(0,160),clientId,at:new Date().toISOString()})}
const canonicalPhone=raw=>{const d=String(raw||"").replace(/\D/g,"");return /^521\d{10}$/.test(d)?"52"+d.slice(3):/^\d{10}$/.test(d)?"52"+d:d};
async function saveClient(v,editing=null){
 const name=String(v.name||"").trim().slice(0,110),phone=canonicalPhone(v.phone);
 if(name.length<2)throw Error("Escribe un nombre válido");
 if(phone&&!/^\d{12,15}$/.test(phone))throw Error("El teléfono necesita diez dígitos de México o código de país");
 const existing=await all("clients");
 if(phone&&existing.some(x=>x.phone===phone&&x.id!==editing))throw Error("Este teléfono ya está registrado");
 const prior=editing?await get("clients",editing):null;
 if(editing&&!prior)throw Error("Este cliente no existe");
 const c={id:editing||localId(),name,phone,model:String(v.model||"").trim().slice(0,80),
 stage:["new","interested","hot","cold","sold"].includes(v.stage)?v.stage:"new",
 source:String(v.source||"manual").slice(0,70),createdAt:prior?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
 await put("clients",c);await activity(prior?"Cliente actualizado":"Cliente registrado",c.name,c.id);return c;
}
async function addNote(clientId,txt){if(!await get("clients",clientId))throw Error("Cliente no encontrado");
 const body=String(txt||"").trim().slice(0,1800);if(!body)throw Error("Escribe la nota");
 const n={id:localId(),clientId,body,createdAt:new Date().toISOString()};await put("notes",n);await activity("Nota",body.slice(0,80),clientId);return n;
}
async function saveAppointment(v){
 const cl=await get("clients",v.clientId);if(!cl)throw Error("Selecciona un cliente");
 const d=new Date(v.startsAt);if(!Number.isFinite(d.getTime())||d.getTime()<Date.now()-300000)throw Error("Fecha futura requerida");
 const a=await all("appointments");
 if(a.some(x=>x.status!=="cancelled"&&x.id!==v.id&&Math.abs(new Date(x.startsAt).getTime()-d.getTime())<45*60000))throw Error("Hay otra cita en ese horario");
 const data={id:v.id||localId(),clientId:v.clientId,startsAt:d.toISOString(),kind:["visit","test_drive","call","delivery"].includes(v.kind)?v.kind:"visit",status:["scheduled","confirmed"].includes(v.status)?v.status:"scheduled",detail:String(v.detail||"").trim().slice(0,340),source:"manual",createdAt:new Date().toISOString()};
 await put("appointments",data);await activity("Cita registrada",cl.name+" · "+d.toISOString(),cl.id);return data;
}
async function setAppointmentStatus(id,status){
 if(!["confirmed","completed","cancelled","no_show"].includes(status))throw Error("Estado inválido");
 const a=await get("appointments",id);if(!a)throw Error("Cita no encontrada");
 await put("appointments",{...a,status});await activity("Cita: "+status,(await get("clients",a.clientId))?.name||"Cliente",a.clientId);
}
async function addFollowup(v){
 if(!await get("clients",v.clientId))throw Error("Selecciona un cliente");
 const dueAt=new Date(v.dueAt);if(!Number.isFinite(dueAt.getTime())||dueAt.getTime()<Date.now()-300000)throw Error("Fecha de seguimiento inválida");
 const reason=String(v.reason||"").trim().slice(0,270);if(!reason)throw Error("Escribe un motivo");
 const f={id:localId(),clientId:v.clientId,dueAt:dueAt.toISOString(),reason,status:"pending",createdAt:new Date().toISOString()};
 await put("followups",f);await activity("Seguimiento registrado",f.reason.slice(0,85),f.clientId);return f;
}
async function setFollowupStatus(id,status){
 if(!["done","cancelled"].includes(status))throw Error("Estado inválido");
 const f=await get("followups",id);if(!f)throw Error("Seguimiento no encontrado");
 await put("followups",{...f,status});await activity("Seguimiento: "+status,f.reason,f.clientId);
}
async function snapshot(){const result={format:"sofia-mario-offline",version:1,exportedAt:new Date().toISOString()};for(const s of ["clients","notes","appointments","followups","events"])result[s]=await all(s);result.settings=[];return result}
async function restore(data){
 if(data?.format!=="sofia-mario-offline"||data?.version!==1)throw Error("El respaldo no es compatible");
 for(const store of ["clients","notes","appointments","followups","events"]){
  if(!Array.isArray(data[store])||data[store].length>10000)throw Error("Respaldo inválido");
 }
 // Merge into shared cloud; do not erase any colleague's records!
 const items={clients:data.clients,notes:data.notes,appointments:data.appointments,followups:data.followups,events:data.events};
 for(const store of ["clients","notes","appointments","followups","events"]){
  for(const item of items[store]){
   if(!item||typeof item!=="object"||typeof item.id!=="string"||!/^[-a-f0-9]{36}$/i.test(item.id))throw Error("Registro inválido; no se importa.");
   await put(store,item);
  }
 }
}
async function registerNewAccount(email,password,code){
 const response=await fetch(URL+"/functions/v1/sofia-mobile-register",{
  method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password,code}),
 });
 let data={};try{data=await response.json()}catch{}
 if(!response.ok)throw Error(data.error||"No se pudo crear la cuenta");
 return data;
}
async function login(email,password,signup){
 const endpoint=signup?"signup":"token?grant_type=password";
 const result=await request(URL+"/auth/v1/"+endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})},false);
 if(result?.access_token){result.expires_at=Math.floor(Date.now()/1000)+(result.expires_in||3600);saveSession(result);return true}
 if(signup&&result?.user)return false;
 throw Error("No fue posible iniciar sesión. Revisa tu correo y contraseña.");
}
function authHtml(message=""){
 document.querySelector(".tabbar").hidden=true;
 document.getElementById("openQuick").style.display="none";
 document.getElementById("offlineIndicator").textContent="Acceso privado";
 document.getElementById("view").innerHTML=`<div class="auth-container"><p class="eyebrow">ACCESO COMPARTIDO · MARIO</p><h1 class="title">Tu cartera, protegida.</h1><p class="sub">La información se sincroniza entre Mario y el equipo autorizado. Necesitas iniciar sesión y una invitación privada.</p>
 <form id="loginForm"><div class="field"><label>Correo personal autorizado</label><input name="email" type="email" autocomplete="email" class="input" required></div>
 <div class="field"><label>Contraseña</label><input name="password" type="password" autocomplete="current-password" minlength="8" class="input" required></div>
 <button class="btn primary" type="submit">Entrar a mi equipo</button></form>
 <div class="divider"></div><div class="field"><label>Invitación privada (solo para crear cuenta nueva)</label><input id="registrationCode" class="input" autocomplete="off" placeholder="Código de 32 caracteres" minlength="32" maxlength="32"></div><button class="btn full" id="signupBtn" type="button">Crear mi cuenta por primera vez</button>
 <p class="small" style="margin-top:15px">La primera cuenta se activa mediante tu invitación privada, sin depender de correo de confirmación. Usa una contraseña única de al menos 12 caracteres; no la envíes por chat.</p>
 <p id="authMessage" style="color:#ffb6aa;margin-top:15px">${enc(message)}</p>
 </div>`;
 document.getElementById("loginForm").addEventListener("submit",async ev=>{ev.preventDefault();await authSubmit(ev.target,false)});
 document.getElementById("signupBtn").addEventListener("click",async()=>{await authSubmit(document.getElementById("loginForm"),true)});
}
async function authSubmit(form,signup){
 const msg=document.getElementById("authMessage");
 const data=new FormData(form),email=String(data.get("email")||"").trim(),password=String(data.get("password")||"");
 if(!email||password.length<12){msg.textContent="Ingresa un correo y contraseña de mínimo 12 caracteres.";return}
 msg.textContent="Comprobando acceso privado…";
 try{
  if(signup){
   const code=document.getElementById("registrationCode").value.trim();
   const result=await registerNewAccount(email,password,code);
   msg.style.color="#66caaa";msg.textContent=result.message||"Cuenta creada. Ahora inicia sesión con tu correo y contraseña.";
   return;
  }
  const ready=await login(email,password,false);
  if(!ready)throw Error("No se recibió una sesión válida");
  await bootstrap();
 }catch(err){msg.style.color="#ffb6aa";msg.textContent=err.message}
}
async function claim(code){
 if(!/^[0-9a-f]{32}$/i.test(code))throw Error("La invitación tiene 32 caracteres");
 const result=await request(URL+"/rest/v1/rpc/sofia_mobile_claim_invite",{
  method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({invite_code:code})
 });
 if(!result)throw Error("No se pudo activar el equipo");
 return result;
}
function inviteHtml(message=""){
 document.querySelector(".tabbar").hidden=true;
 document.getElementById("view").innerHTML=`<div class="auth-container"><p class="eyebrow">ACCESO VALIDADO</p><h1 class="title">Une tu cuenta al equipo.</h1><p class="sub">La invitación distingue al propietario y al asesor. Cada código funciona una vez y caduca.</p>
 <form id="inviteForm"><div class="field"><label>Código personal de invitación</label><input name="code" class="input" minlength="32" maxlength="32" autocomplete="off" required></div>
 <button type="submit" class="btn primary">Unirme a Sofía</button></form>
 <button type="button" id="exitBtn" class="btn full" style="margin-top:15px">Cerrar sesión</button>
 <p id="authMessage" style="color:#ffb6aa">${enc(message)}</p></div>`;
 document.getElementById("inviteForm").addEventListener("submit",async e=>{
  e.preventDefault();let msg=document.getElementById("authMessage");msg.textContent="Validando invitación…";
  try{await claim(String(new FormData(e.target).get("code")).trim());await bootstrap()}catch(err){msg.textContent=err.message}
 });
 document.getElementById("exitBtn").addEventListener("click",()=>logout());
}
function logout(){saveSession(null);teamId=null;location.replace("./?logout=1")}
async function bootstrap(){
 try{
  await ensureSession();
  const user=await request(URL+"/auth/v1/user");
  if(!user?.id)throw Error("Cuenta no verificada");
  const list=await membership();
  if(!list.length){inviteHtml();return}
  window.SOFIA_CLOUD=true;
  window.SofiaStore={open:async()=>{},all,get,put,del:async()=>{throw Error("Eliminar datos compartidos no está habilitado.")},id:localId,activity,canonicalPhone,saveClient,addNote,saveAppointment,setAppointmentStatus,addFollowup,setFollowupStatus,snapshot,restore};
  document.querySelector(".tabbar").hidden=false;
  document.getElementById("openQuick").style.display="";
  document.getElementById("offlineIndicator").textContent="Equipo sincronizado";
  const sc=document.createElement("script");sc.src="../app.js?v=8";
  sc.onerror=()=>{document.getElementById("view").innerHTML='<div class="notice warn">No se cargó la interfaz. Abre Sofía en Safari o Chrome y actualiza.</div>'};
  document.body.appendChild(sc);
 }catch(err){authHtml(err.message)}
}
window.addEventListener("online",()=>{const e=document.getElementById("offlineIndicator");if(e&&window.SOFIA_CLOUD)e.textContent="Equipo sincronizado"});
window.addEventListener("offline",()=>{const e=document.getElementById("offlineIndicator");if(e&&window.SOFIA_CLOUD)e.textContent="Sin internet · no guardar"});
session=loadSession();
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{if(session)bootstrap();else authHtml()});else if(session)bootstrap();else authHtml();
})();
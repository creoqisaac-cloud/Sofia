/* Offline persistence: all customer data stays in this browser's IndexedDB. No remote API. */
(() => {
"use strict";
const NAME="sofia_mario_mobile_v1",VERSION=1;
const STORES=["clients","notes","appointments","followups","events","settings"];
let dbPromise;
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
function open(){
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
    if(!("indexedDB" in window)){reject(new Error("Este navegador no permite almacenamiento local IndexedDB."));return}
    const r=indexedDB.open(NAME,VERSION);
    r.onupgradeneeded=()=>{const d=r.result;for(const s of STORES){if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:s==="settings"?"key":"id"})}};
    r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result)};
    r.onerror=()=>reject(r.error||new Error("No se pudo abrir el registro local"));
    r.onblocked=()=>reject(new Error("Cierra las otras pestañas de Sofía y vuelve a abrirla"));
  });return dbPromise;
}
async function txOne(store,method,...args){
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,"readwrite"), r=tx.objectStore(store)[method](...args);
    let value;
    r.onsuccess=()=>{value=r.result};
    tx.oncomplete=()=>resolve(value);
    tx.onerror=()=>reject(tx.error||new Error("No se guardó el cambio."));
    tx.onabort=()=>reject(tx.error||new Error("Guardado cancelado."));
  });
}
async function all(store){const db=await open();return request(db.transaction(store,"readonly").objectStore(store).getAll())}
async function get(store,id){const db=await open();return request(db.transaction(store,"readonly").objectStore(store).get(id))}
const id=()=>globalThis.crypto&&typeof crypto.randomUUID==="function"?crypto.randomUUID():"s"+Date.now().toString(36)+Math.random().toString(36).slice(2);
async function put(store,object){return txOne(store,"put",typeof structuredClone==="function"?structuredClone(object):JSON.parse(JSON.stringify(object)))}
async function del(store,key){return txOne(store,"delete",key)}
async function activity(type,detail,clientId=null){return put("events",{id:id(),at:new Date().toISOString(),type,detail:String(detail).slice(0,160),clientId})}
function canonicalPhone(raw){const d=String(raw||"").replace(/\D/g,"");return /^521\d{10}$/.test(d)?"52"+d.slice(3):/^\d{10}$/.test(d)?"52"+d:d}
async function saveClient(values,editing=null){
  const name=String(values.name||"").trim().slice(0,110);
  const phone=canonicalPhone(values.phone);
  if(name.length<2)throw Error("Escribe el nombre del cliente.");
  if(phone&&!/^\d{12,15}$/.test(phone))throw Error("El teléfono debe tener diez dígitos de México o su código de país.");
  const others=await all("clients");if(phone&&others.some(c=>c.phone===phone&&c.id!==editing))throw Error("Ya existe un cliente registrado con este teléfono.");
  const previous=editing?await get("clients",editing):null;
  if(editing&&!previous)throw Error("No se encontró el cliente que deseas editar.");
  const c={id:editing||id(),name,phone,model:String(values.model||"").trim().slice(0,80),
    stage:["new","interested","hot","cold","sold"].includes(values.stage)?values.stage:"new",
    source:String(values.source||"manual").trim().slice(0,70),createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  await put("clients",c);await activity(previous?"Cliente actualizado":"Cliente registrado",c.name,c.id);return c;
}
async function addNote(clientId,text){if(!await get("clients",clientId))throw Error("Cliente no encontrado");const body=String(text||"").trim().slice(0,1800);if(!body)throw Error("Escribe una nota");const n={id:id(),clientId,body,createdAt:new Date().toISOString()};await put("notes",n);await activity("Nota",body.slice(0,80),clientId);return n}
async function saveAppointment(v){
  const c=await get("clients",v.clientId);if(!c)throw Error("Selecciona un cliente registrado.");
  const when=new Date(v.startsAt);if(!Number.isFinite(when.getTime())||when.getTime()<Date.now()-300000)throw Error("Elige una fecha y hora futuras.");
  const allAppts=await all("appointments");if(allAppts.some(a=>a.status!=="cancelled"&&a.id!==v.id&&Math.abs(new Date(a.startsAt).getTime()-when.getTime())<45*60000))
    throw Error("Ya tienes otra cita dentro de 45 minutos de ese horario. Revisa tu agenda.");
  const a={id:v.id||id(),clientId:v.clientId,startsAt:when.toISOString(),
    kind:["visit","test_drive","call","delivery"].includes(v.kind)?v.kind:"visit",
    status:["scheduled","confirmed"].includes(v.status)?v.status:"scheduled",
    detail:String(v.detail||"").trim().slice(0,340),createdAt:new Date().toISOString(),source:"manual"};
  await put("appointments",a);await activity("Cita registrada",c.name+" · "+when.toLocaleString("es-MX"),c.id);return a;
}
async function setAppointmentStatus(idValue,status){
 if(!["confirmed","completed","cancelled","no_show"].includes(status))throw Error("Estado inválido");
 const a=await get("appointments",idValue);if(!a)throw Error("Cita no encontrada");
 a.status=status;await put("appointments",a);await activity("Cita: "+status,await get("clients",a.clientId).then(c=>c?.name||"Cliente"),a.clientId);
}
async function addFollowup(v){
 if(!await get("clients",v.clientId))throw Error("Selecciona un cliente");
 const d=new Date(v.dueAt);if(!Number.isFinite(d.getTime()))throw Error("Fecha inválida");
 if(d.getTime()<Date.now()-300000)throw Error("El seguimiento debe tener una fecha futura.");
 const reason=String(v.reason||"").trim().slice(0,270);if(!reason)throw Error("Escribe el motivo");
 const f={id:id(),clientId:v.clientId,dueAt:d.toISOString(),reason,status:"pending",createdAt:new Date().toISOString()};
 await put("followups",f);await activity("Seguimiento registrado",reason.slice(0,85),v.clientId);return f;
}
async function setFollowupStatus(idValue,status){
 if(!["done","cancelled"].includes(status))throw Error("Estado inválido");
 const f=await get("followups",idValue);if(!f)throw Error("Seguimiento no encontrado");
 f.status=status;await put("followups",f);await activity("Seguimiento: "+status,f.reason.slice(0,85),f.clientId);
}
async function snapshot(){const data={format:"sofia-mario-offline",version:1,exportedAt:new Date().toISOString()};for(const s of STORES)data[s]=await all(s);return data}
async function restore(data){
 if(!data||data.format!=="sofia-mario-offline"||data.version!==1)throw Error("El archivo no es un respaldo compatible de Sofía.");
 const checked={};for(const s of STORES){const rows=data[s];if(!Array.isArray(rows)||rows.length>30000)throw Error("El respaldo tiene datos inválidos: "+s);
  const seen=new Set();checked[s]=rows.map(x=>{if(!x||typeof x!=="object"||Array.isArray(x))throw Error("Registro inválido en "+s);
    const key=s==="settings"?"key":"id";
    if(typeof x[key]!=="string"||x[key].length>120||!x[key]||seen.has(x[key]))throw Error("Identificador inválido en "+s);
    seen.add(x[key]);for(const [k,v] of Object.entries(x)){if(typeof v==="string"&&v.length>4000)throw Error("Dato excesivo en "+s+"."+k)}
    return x;
  });
 }
 const db=await open();await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORES,"readwrite");tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  for(const s of STORES){const store=tx.objectStore(s);store.clear();for(const row of checked[s])store.put(row)}
 });
}
window.SofiaStore={open,all,get,put,del,id,activity,canonicalPhone,saveClient,addNote,saveAppointment,setAppointmentStatus,addFollowup,setFollowupStatus,snapshot,restore};
})();
/* Sofía Mario PWA 1.0: offline-only client registry. No fake WhatsApp integration. */
(() => {
"use strict";
const D=window.SofiaStore,$=s=>document.querySelector(s),E=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const stages={new:"Nuevo",interested:"Interesado",hot:"Caliente",cold:"Frío",sold:"Venta cerrada"};
const kinds={visit:"Visita",test_drive:"Prueba de manejo",call:"Llamada",delivery:"Entrega"};
const apptStages={scheduled:"Por confirmar",confirmed:"Confirmada por Mario",completed:"Realizada",cancelled:"Cancelada",no_show:"No asistió"};
const timezone="America/Monterrey";
const dateFormat=new Intl.DateTimeFormat("es-MX",{timeZone:timezone,weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit",hour12:true});
const shortDay=new Intl.DateTimeFormat("es-MX",{timeZone:timezone,day:"numeric",month:"short"});
const app={tab:"inicio",clientId:null,filter:"all",month:new Date(),selectedDay:null,installPrompt:null};
const now=()=>new Date(),sortDates=(a,b)=>new Date(a).getTime()-new Date(b).getTime();
let cache={clients:[],notes:[],appointments:[],followups:[],events:[]};
let toastTimer;
const clientName=id=>cache.clients.find(c=>c.id===id)?.name||"Cliente no encontrado";
const client=id=>cache.clients.find(c=>c.id===id);
const badge=(status)=>`<span class="badge ${status==="hot"?"hot":status==="cold"?"cold":status==="sold"?"sold":""}">${E(stages[status]||status)}</span>`;
const time=iso=>{try{return dateFormat.format(new Date(iso))}catch{return "Fecha inválida"}};
const minToDate=iso=>{const parts=new Intl.DateTimeFormat("en-US",{year:"numeric",month:"2-digit",day:"2-digit",timeZone:timezone}).formatToParts(new Date(iso));const m=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${m.year}-${m.month}-${m.day}`};
const inputTime=d=>{const n=d||new Date(Date.now()+86400000);const parts=new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(n);const a=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${a.year}-${a.month}-${a.day}T${a.hour==="24"?"00":a.hour}:${a.minute}`};
const safePhone=phone=>String(phone||"").replace(/\D/g,"");
function wa(phone){const num=safePhone(phone);return num?/^\d{12,15}$/.test(num)?`https://wa.me/${num}`:null:null}
function toast(text){const e=$("#toast");e.textContent=text;e.style.display="block";clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.style.display="none",4200)}
function btn(text,action,extra="",attrs=""){return `<button type="button" class="btn ${extra}" data-action="${action}" ${attrs}>${E(text)}</button>`}
function empty(title,desc,action="",label=""){return `<div class="empty"><div class="empty-icon">◎</div><strong>${E(title)}</strong><p>${E(desc)}</p>${action?btn(label,action,"primary"):""}</div>`}
function top(title,sub,kicker="MARIO · OPERACIÓN"){return `<p class="eyebrow">${E(kicker)}</p><h1 class="title">${E(title)}</h1><p class="sub">${E(sub)}</p>`}
function renderHome(){
 const t=Date.now(),up=cache.appointments.filter(a=>["scheduled","confirmed"].includes(a.status)&&new Date(a.startsAt).getTime()>=t).sort((a,b)=>sortDates(a.startsAt,b.startsAt)).slice(0,4),
 pending=cache.followups.filter(f=>f.status==="pending").sort((a,b)=>sortDates(a.dueAt,b.dueAt)),
 overdue=pending.filter(f=>new Date(f.dueAt).getTime()<=t),due=pending.slice(0,5);
 return `${top("Tu operación, bajo control.","Clientes, citas y pendientes guardados en este dispositivo. Sin servidor y sin datos de demostración.")}
 <div class="metrics"><div class="metric first"><strong>${cache.clients.length}</strong><span>Clientes</span></div><div class="metric"><strong>${up.length}</strong><span>Próximas citas</span></div><div class="metric"><strong>${pending.length}</strong><span>Seguimientos</span></div></div>
 ${overdue.length?`<div class="notice warn section">Tienes <strong>${overdue.length} seguimiento(s) vencido(s)</strong>. Revísalos antes de contactar a tus clientes.</div>`:""}
 <section class="section"><div class="sectionhead"><h2 class="sectiontitle">Acceso rápido</h2></div><div class="two-actions">${btn("＋ Nuevo cliente","new-client","primary full")}${btn("▦ Agendar cita","new-appointment","full")}</div></section>
 <section class="section"><div class="sectionhead"><h2 class="sectiontitle">Próximas citas</h2><button class="sectionlink" data-tab="agenda">Ver agenda →</button></div>
 ${up.length?up.map(a=>`<div class="card"><div class="cardheader"><div><h3>${E(clientName(a.clientId))}</h3><div class="small">${E(time(a.startsAt))} · ${E(kinds[a.kind])}</div></div><span class="badge">${E(apptStages[a.status])}</span></div><div class="actions">${btn("Ver cliente","view-client","smallbtn",`data-id="${E(a.clientId)}"`)}${btn("Calendario ↗","ics-one","smallbtn",`data-type="appointment" data-id="${E(a.id)}"`)}</div></div>`).join(""):empty("Agenda despejada","Tus citas aparecerán aquí cuando las registres.","new-appointment","Registrar cita")}</section>
 <section class="section"><div class="sectionhead"><h2 class="sectiontitle">Seguimientos</h2><button class="sectionlink" data-tab="pendientes">Ver todos →</button></div>
 ${due.length?due.map(f=>`<div class="listrow"><div><h3>${E(clientName(f.clientId))}</h3><div class="small">${E(f.reason)} · ${E(time(f.dueAt))}</div></div>${btn("Ver","view-client","smallbtn",`data-id="${E(f.clientId)}"`)}</div>`).join(""):empty("Sin pendientes","Registra los compromisos para no perder ninguna oportunidad.","new-followup","Nuevo seguimiento")}</section>
 <section class="section notice"><strong>Privacidad local</strong><div class="small">Estos datos no se envían a GitHub ni a un servidor. Haz un respaldo en «Más» y guárdalo de forma privada.</div></section>`;
}
function renderClients(){
 const filtered=cache.clients.filter(c=>app.filter==="all"||c.stage===app.filter).sort((a,b)=>sortDates(b.updatedAt,a.updatedAt));
 return `${top("Clientes","Tu cartera de prospectos, organizada por interés y etapa.")}
 <div class="actions">${btn("＋ Registrar cliente","new-client","primary")}${btn("↓ Respaldo","export-backup")}</div>
 <section class="section"><input id="clientSearch" class="input" type="search" placeholder="Buscar nombre, teléfono o Honda…" aria-label="Buscar clientes">
 <div class="filterbar" aria-label="Filtrar etapa">${Object.entries({all:"Todos",new:"Nuevos",interested:"Interesados",hot:"Calientes",cold:"Fríos",sold:"Cerrados"}).map(([v,l])=>`<button class="chip ${v===app.filter?"selected":""}" data-filter="${v}">${l}</button>`).join("")}</div>
 <div id="clientRows">${filtered.length?filtered.map(c=>`<div class="card searchable" data-search="${E([c.name,c.phone,c.model].join(" ").toLowerCase())}"><div class="cardheader"><button class="row-main" data-action="view-client" data-id="${E(c.id)}"><h3>${E(c.name)}</h3><div class="small">${E(c.model||"Modelo pendiente")} ${c.phone?"· "+E(c.phone):""}</div></button>${badge(c.stage)}</div><div class="actions">${btn("Abrir ficha","view-client","smallbtn",`data-id="${E(c.id)}"`)}${c.phone?`<a class="btn smallbtn" target="_blank" rel="noopener noreferrer" href="${wa(c.phone)}">WhatsApp ↗</a>`:""}</div></div>`).join(""):empty("Aún no hay clientes","Registra tu primer prospecto para empezar tu control.","new-client","Registrar cliente")}</div></section>`;
}
function renderClientDetail(){
 const c=client(app.clientId);if(!c){app.clientId=null;app.tab="clientes";return renderClients()}
 const notes=cache.notes.filter(n=>n.clientId===c.id).sort((a,b)=>sortDates(b.createdAt,a.createdAt));
 const appts=cache.appointments.filter(a=>a.clientId===c.id).sort((a,b)=>sortDates(b.startsAt,a.startsAt));
 const followups=cache.followups.filter(f=>f.clientId===c.id&&f.status==="pending").sort((a,b)=>sortDates(a.dueAt,b.dueAt));
 return `<button class="sectionlink" data-action="back-clients">‹ Volver a clientes</button>
 <div class="card" style="margin-top:10px"><div class="cardheader"><div><p class="eyebrow">EXPEDIENTE DEL CLIENTE</p><h1 class="title" style="font-size:27px">${E(c.name)}</h1><p class="sub">${E(c.phone||"Sin teléfono")} · ${E(c.model||"Sin modelo asignado")}</p></div>${badge(c.stage)}</div>
 <div class="actions">${btn("Editar ficha","edit-client","smallbtn",`data-id="${E(c.id)}"`)}${wa(c.phone)?`<a class="btn smallbtn" href="${wa(c.phone)}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp ↗</a>`:""}</div><div class="divider"></div>
 <div class="small">Origen: ${E(c.source||"Manual")} · Registrado: ${E(shortDay.format(new Date(c.createdAt)))}</div></div>
 <section class="section"><div class="sectionhead"><h2 class="sectiontitle">Notas privadas · ${notes.length}</h2>${btn("＋ Nota","new-note","smallbtn",`data-id="${E(c.id)}"`)}</div>
 ${notes.length?notes.map(n=>`<div class="card"><div class="small tight">${E(time(n.createdAt))}</div><div style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.5">${E(n.body)}</div></div>`).join(""):empty("Sin notas","Registra datos que ayuden a continuar la atención.","new-note","Agregar nota")}</section>
 <section class="section"><div class="sectionhead"><h2 class="sectiontitle">Citas · ${appts.length}</h2>${btn("＋ Cita","new-appointment","smallbtn",`data-id="${E(c.id)}"`)}</div>${appts.map(a=>`<div class="listrow"><div><h3>${E(kinds[a.kind])} · ${E(apptStages[a.status])}</h3><div class="small">${E(time(a.startsAt))} ${a.detail?" · "+E(a.detail):""}</div></div>${btn("↗","ics-one","smallbtn",`data-type="appointment" data-id="${E(a.id)}"`)}</div>`).join("")||'<p class="sub">Sin citas registradas.</p>'}</section>
 <section class="section"><div class="sectionhead"><h2 class="sectiontitle">Seguimientos · ${followups.length}</h2>${btn("＋ Seguir","new-followup","smallbtn",`data-id="${E(c.id)}"`)}</div>${followups.map(f=>`<div class="listrow"><div><h3>${E(f.reason)}</h3><div class="small">${E(time(f.dueAt))}</div></div>${btn("✓","done-followup","smallbtn",`data-id="${E(f.id)}"`)}</div>`).join("")||'<p class="sub">Sin seguimientos pendientes.</p>'}</section>`;
}
function getDays(year,month){const first=new Date(year,month,1).getDay(),offset=(first+6)%7,num=new Date(year,month+1,0).getDate(),arr=[];for(let i=0;i<offset;i++)arr.push(null);for(let i=1;i<=num;i++)arr.push(i);return arr}
function renderAgenda(){
 const year=app.month.getFullYear(),month=app.month.getMonth(),label=new Intl.DateTimeFormat("es-MX",{month:"long",year:"numeric",timeZone:timezone}).format(new Date(year,month,3)),today=new Date(),isToday=d=>d===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
 const stamp=d=>`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
 const events=cache.appointments.filter(a=>a.status!=="cancelled").sort((a,b)=>sortDates(a.startsAt,b.startsAt));
 const chosen=app.selectedDay?events.filter(a=>minToDate(a.startsAt)===app.selectedDay):events.filter(a=>new Date(a.startsAt).getTime()>=Date.now()-86400000);
 return `${top("Agenda de Mario","Las citas manuales se guardan en este dispositivo. No son reservas de BIKY ni verificaciones de la agencia.")}
 <div class="actions">${btn("＋ Nueva cita","new-appointment","primary")}${btn("Exportar calendario","export-calendar")}</div>
 <section class="section"><div class="row-between" style="margin-bottom:12px">${btn("‹","month-prev","smallbtn")}<h2 class="sectiontitle" style="text-transform:capitalize">${E(label)}</h2>${btn("›","month-next","smallbtn")}</div><div class="calendar">
 ${["L","M","M","J","V","S","D"].map(x=>`<div class="calhead">${x}</div>`).join("")}
 ${getDays(year,month).map(d=>d===null?'<span class="calday muted"></span>':`<button data-action="select-day" data-day="${stamp(d)}" class="calday ${isToday(d)?"today":""} ${app.selectedDay===stamp(d)?"selected":""} ${events.some(a=>minToDate(a.startsAt)===stamp(d))?"has-event":""}">${d}</button>`).join("")}</div>
 <div class="sectionhead" style="margin-top:20px"><h2 class="sectiontitle">${app.selectedDay?"Citas del "+app.selectedDay:"Próximas citas"}</h2>${app.selectedDay?btn("Ver todas","clear-day","smallbtn"):""}</div>
 ${chosen.length?chosen.map(a=>`<div class="card"><div class="cardheader"><div><h3>${E(clientName(a.clientId))}</h3><div class="small">${E(time(a.startsAt))} · ${E(kinds[a.kind])}</div></div><span class="badge ${a.status==="scheduled"?"warn":""}">${E(apptStages[a.status])}</span></div>${a.detail?`<p class="sub" style="margin-top:7px">${E(a.detail)}</p>`:""}<div class="actions">${btn("Cliente","view-client","smallbtn",`data-id="${E(a.clientId)}"`)}${a.status==="scheduled"?btn("Confirmar","confirm-appointment","smallbtn",`data-id="${E(a.id)}"`):""}${["scheduled","confirmed"].includes(a.status)?btn("Realizada","complete-appointment","smallbtn",`data-id="${E(a.id)}"`):""}${["scheduled","confirmed"].includes(a.status)?btn("Cancelar","cancel-appointment","smallbtn",`data-id="${E(a.id)}"`):""}${btn(".ics","ics-one","smallbtn",`data-type="appointment" data-id="${E(a.id)}"`)}</div></div>`).join(""):empty("Sin citas en este periodo","Agrega una visita o prueba de manejo y aparecerá en tu calendario.","new-appointment","Agendar")}</section>`;
}
function renderPending(){
 const pending=cache.followups.filter(f=>f.status==="pending").sort((a,b)=>sortDates(a.dueAt,b.dueAt));
 const late=pending.filter(f=>new Date(f.dueAt).getTime()<=Date.now());
 return `${top("Seguimientos","Que ningún interesado se enfríe por falta de una llamada.")}
 <div class="metrics" style="grid-template-columns:repeat(2,1fr)"><div class="metric"><strong>${pending.length}</strong><span>Pendientes</span></div><div class="metric"><strong style="color:var(--red)">${late.length}</strong><span>Vencidos</span></div></div>
 <div class="actions">${btn("＋ Nuevo seguimiento","new-followup","primary")}${btn("Exportar recordatorios","export-calendar")}</div>
 <section class="section">${pending.length?pending.map(f=>`<div class="card"><div class="cardheader"><div><h3>${E(clientName(f.clientId))}</h3><p class="sub">${E(f.reason)}</p><div class="small" style="margin-top:8px">${E(time(f.dueAt))}</div></div><span class="badge ${new Date(f.dueAt)<new Date()?"warn":""}">${new Date(f.dueAt)<new Date()?"Vencido":"Pendiente"}</span></div><div class="actions">${btn("✓ Realizado","done-followup","smallbtn",`data-id="${E(f.id)}"`)}${btn("Ficha","view-client","smallbtn",`data-id="${E(f.clientId)}"`)}${btn("Calendario","ics-one","smallbtn",`data-type="followup" data-id="${E(f.id)}"`)}</div></div>`).join("") :empty("Todo al corriente","Registra seguimientos a tus clientes para tenerlos siempre a la vista.","new-followup","Registrar")}</section>
 <section class="section notice">Los avisos aparecen al abrir esta app. Para alarmas con la aplicación cerrada, exporta las fechas al Calendario de tu teléfono.</section>`;
}
function renderMore(){
 const total=cache.clients.length,by=Object.entries(stages).map(([k,v])=>({label:v,n:cache.clients.filter(c=>c.stage===k).length}));
 return `${top("Reportes y respaldo","Tus estadísticas salen únicamente de los registros guardados en este teléfono.")}
 <section class="section"><h2 class="sectiontitle" style="margin-bottom:13px">Pipeline de ventas</h2><div class="card">${by.map(x=>`<div class="report-stat"><span>${E(x.label)}</span><strong>${x.n}</strong></div><div class="progressbar"><span style="width:${total?100*x.n/total:0}%"></span></div>`).join("")}</div>
 <div class="two-actions">${btn("Exportar CSV","export-csv","full")}${btn("Calendario .ics","export-calendar","full")}</div></section>
 <section class="section"><h2 class="sectiontitle" style="margin-bottom:12px">Respaldo del teléfono</h2><div class="card"><p class="sub">Los datos están solo en este dispositivo. Si cambias de teléfono, lo pierdes o se borran los datos del navegador, necesitarás este archivo para recuperarlos.</p>
 <div class="two-actions" style="margin-top:15px">${btn("↓ Descargar copia","export-backup","primary full")}${btn("↑ Restaurar copia","import-backup","full")}</div></div></section>
 <section class="section"><h2 class="sectiontitle" style="margin-bottom:12px">WhatsApp empresarial</h2><div class="card"><div class="pill-line"><strong class="whatsapp-logo">WhatsApp Cloud API</strong><span class="badge warn">Sin conectar</span></div>
 <p class="sub" style="margin-top:10px">Esta versión móvil registra clientes manualmente y abre WhatsApp para contactarlos. No lee chats, no responde sola ni confirma citas por WhatsApp. Eso requiere autorización del número empresarial y un receptor HTTPS oficial.</p>
 <p class="small" style="margin-top:11px">Puedes usarla para Mario hoy sin habilitar esa integración. Nunca confundiremos un chat abierto con un mensaje sincronizado.</p></div></section>
 <section class="section"><h2 class="sectiontitle" style="margin-bottom:12px">Actividad reciente · ${cache.events.length}</h2>${cache.events.slice().sort((a,b)=>sortDates(b.at,a.at)).slice(0,25).map(ev=>`<div class="listrow"><div><h3>${E(ev.type)}</h3><div class="small">${E(ev.detail)} · ${E(time(ev.at))}</div></div></div>`).join("")||'<p class="sub">Aún no hay movimientos.</p>'}</section>
 <section class="section"><h2 class="sectiontitle" style="margin-bottom:12px">Instalar Sofía</h2><div class="card"><p class="sub"><strong>iPhone:</strong> abre el enlace en Safari, toca Compartir y después «Agregar a pantalla de inicio». <strong>Samsung:</strong> abre en Chrome y selecciona «Instalar aplicación» en el menú.</p>
 <div class="actions">${btn("Instalar si está disponible","install-pwa","primary")}</div>
 <p class="small" style="margin-top:10px">La instalación descarga la interfaz para que pueda abrir sin internet. Los datos se guardan en el teléfono, no se sincronizan con la PC. No guardes INE, RFC, documentos de identidad o datos bancarios.</p></div></section>`;
}
async function render(){
 try{
 const rows=await Promise.all(["clients","notes","appointments","followups","events"].map(s=>D.all(s)));
 cache=Object.fromEntries(["clients","notes","appointments","followups","events"].map((s,i)=>[s,rows[i]]));
 const root=$("#view");root.innerHTML=app.clientId?renderClientDetail():app.tab==="inicio"?renderHome():app.tab==="clientes"?renderClients():app.tab==="agenda"?renderAgenda():app.tab==="pendientes"?renderPending():renderMore();
 document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.tab===app.tab&&!app.clientId));
 $("#clientSearch")?.addEventListener("input",e=>{const v=e.target.value.trim().toLowerCase();document.querySelectorAll(".searchable").forEach(card=>card.hidden=!(card.dataset.search||"").includes(v))});
 }catch(err){$("#view").innerHTML=`<div class="notice warn"><strong>No se pudieron cargar los datos.</strong><p>${E(err.message)}</p><button data-action="reload" class="btn">Reintentar</button></div>`;console.error(err)}
}
function options(list,selected){return list.map(([v,l])=>`<option value="${E(v)}" ${v===selected?"selected":""}>${E(l)}</option>`).join("")}
function field(label,name,type="text",val="",attrs=""){return `<div class="field"><label for="fld-${name}">${E(label)}</label><input class="input" id="fld-${name}" name="${name}" type="${type}" value="${E(val)}" ${attrs}></div>`}
function select(label,name,entries,selected){return `<div class="field"><label for="fld-${name}">${E(label)}</label><select class="select" id="fld-${name}" name="${name}">${options(entries,selected)}</select></div>`}
function pickClients(chosen){if(!cache.clients.length)throw Error("Primero registra un cliente.");return select("Cliente","clientId",cache.clients.map(c=>[c.id,c.name]),chosen||cache.clients[0].id)}
function sheet(title,contents,idValue=""){
 $("#sheetBody").innerHTML=`<div class="sheet-top"><h2 class="sheet-title">${E(title)}</h2><button type="button" class="sheet-x" data-action="close-sheet" aria-label="Cerrar">×</button></div><form id="editForm" data-form="${idValue||""}">${contents}<div class="form-actions"><button type="button" class="btn" data-action="close-sheet">Cancelar</button><button type="submit" class="btn primary">Guardar</button></div></form>`;
 const dg=$("#sheet");if(!dg.open)dg.showModal();
}
function openForm(type,idValue){
 if(type==="client"){
 const c=idValue?client(idValue):null;sheet(c?"Editar cliente":"Nuevo cliente",`<input type="hidden" name="formType" value="client"><input type="hidden" name="id" value="${E(c?.id||"")}">
 ${field("Nombre completo *","name","text",c?.name||'','required maxlength="110" autocomplete="name"')}
 ${field("Celular (10 dígitos)","phone","tel",c?.phone||'','inputmode="tel" maxlength="17" autocomplete="tel"')}
 ${field("Honda de interés","model","text",c?.model||'','maxlength="80" placeholder="Ej. CR-V 2026"')}
 ${select("Clasificación","stage",Object.entries(stages),c?.stage||"new")}
 ${field("Origen / referencia","source","text",c?.source||"manual",'maxlength="70" placeholder="Facebook, agencia, referido…"')}`);return;
 }
 if(type==="note"){
 const cid=idValue||app.clientId;if(!cid)throw Error("Abre primero la ficha de un cliente.");
 sheet("Nota de "+clientName(cid),`<input type="hidden" name="formType" value="note"><input type="hidden" name="clientId" value="${E(cid)}">
 <div class="field"><label for="noteBody">Nota privada</label><textarea id="noteBody" class="textarea" name="body" maxlength="1800" required placeholder="Qué busca, qué acordaron, qué hay que consultar…"></textarea></div>`);return;
 }
 if(type==="appointment"){
 sheet("Registrar cita",`<input type="hidden" name="formType" value="appointment">
 ${pickClients(idValue||app.clientId)}
 ${field("Fecha y hora local (Monterrey) *","startsAt","datetime-local",inputTime(),'required')}
 ${select("Tipo","kind",Object.entries(kinds),"visit")}
 ${select("Estado","status",[["scheduled","Por confirmar"],["confirmed","Confirmada personalmente por Mario"]],"scheduled")}
 <div class="field"><label for="appointmentDetail">Comentarios</label><textarea class="textarea" id="appointmentDetail" name="detail" maxlength="340" placeholder="Qué van a ver o realizar"></textarea></div>
 <div class="notice">La confirmación manual significa que Mario ya acordó esa cita. No reserva horarios automáticamente en BIKY.</div>`);return;
 }
 if(type==="followup"){
 sheet("Nuevo seguimiento",`<input type="hidden" name="formType" value="followup">
 ${pickClients(idValue||app.clientId)}
 ${field("Fecha y hora del seguimiento *","dueAt","datetime-local",inputTime(),'required')}
 <div class="field"><label for="followupReason">Qué hay que hacer *</label><textarea class="textarea" id="followupReason" name="reason" maxlength="270" placeholder="Ej. Llamar para confirmar enganche" required></textarea></div>`);return;
 }
}
function closeSheet(){const d=$("#sheet");if(d.open)d.close()}
async function handleForm(event){
 event.preventDefault();const form=event.target,submit=form.querySelector("[type=submit]");if(submit.disabled)return;
 const data=Object.fromEntries(new FormData(form).entries());submit.disabled=true;
 try{
 if(data.formType==="client"){const c=await D.saveClient(data,data.id||null);app.clientId=c.id;app.tab="clientes";toast("Cliente guardado en este teléfono");}
 else if(data.formType==="note"){await D.addNote(data.clientId,data.body);toast("Nota guardada");}
 else if(data.formType==="appointment"){await D.saveAppointment(data);app.clientId=null;app.tab="agenda";app.selectedDay=null;toast("Cita guardada en tu agenda");}
 else if(data.formType==="followup"){await D.addFollowup(data);app.clientId=null;app.tab="pendientes";toast("Seguimiento guardado");}
 closeSheet();await render();
 }catch(err){toast(err.message);submit.disabled=false}
}
function download(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;a.rel="noopener";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
const todayTag=()=>new Date().toISOString().slice(0,10);
async function exportBackup(){const data=await D.snapshot();download(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),`Sofia_Mario_respaldo_${todayTag()}.json`);toast("Respaldo creado. Guárdalo de forma privada.")}
const csvText=v=>{let s=String(v??"").replaceAll('"','""');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s+'"'}
function exportCSV(){
 const rows=[["Cliente","Telefono","Honda","Clasificacion","Origen","Fecha de alta"],...cache.clients.map(c=>[c.name,c.phone,c.model,stages[c.stage],c.source,c.createdAt])];
 const data="\ufeff"+rows.map(r=>r.map(csvText).join(",")).join("\r\n");
 download(new Blob([data],{type:"text/csv;charset=utf-8"}),`Sofia_Mario_clientes_${todayTag()}.csv`);toast("Reporte CSV exportado");
}
const icsEsc=s=>String(s??"").replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");
const icsStamp=d=>new Date(d).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
function icsItems(only=null){
 const ap=cache.appointments.filter(a=>a.status!=="cancelled"&&(!only||(only.type==="appointment"&&a.id===only.id))).map(a=>({uid:a.id,title:`${kinds[a.kind]||"Cita"} · ${clientName(a.clientId)}`,start:a.startsAt,description:a.detail||"Registrada manualmente en Sofía Mario"}));
 const fu=cache.followups.filter(f=>f.status==="pending"&&(!only||(only.type==="followup"&&f.id===only.id))).map(f=>({uid:f.id,title:`Seguimiento · ${clientName(f.clientId)}`,start:f.dueAt,description:f.reason}));
 return [...ap,...fu]
}
function exportICS(only=null){
 const items=icsItems(only);if(!items.length){toast("No hay fechas para exportar");return}
 let text="BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//SOFIA MARIO//REGISTRO LOCAL//ES\r\nCALSCALE:GREGORIAN\r\n";
 for(const item of items){const start=new Date(item.start);if(Number.isNaN(start.getTime()))continue;const end=new Date(start.getTime()+30*60000);
 text+=`BEGIN:VEVENT\r\nUID:${icsEsc(item.uid)}@sofia-mario\r\nDTSTAMP:${icsStamp(new Date())}\r\nDTSTART:${icsStamp(start)}\r\nDTEND:${icsStamp(end)}\r\nSUMMARY:${icsEsc(item.title)}\r\nDESCRIPTION:${icsEsc(item.description)}\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Recordatorio de Sofía Mario\r\nTRIGGER:-PT15M\r\nEND:VALARM\r\nEND:VEVENT\r\n`;
 }
 text+="END:VCALENDAR\r\n";download(new Blob([text],{type:"text/calendar;charset=utf-8"}),"Sofia_Mario_calendario.ics");toast("Archivo de calendario generado; impórtalo en tu teléfono.");
}
async function restoreFile(file){
 if(!file||file.size>12*1024*1024)throw Error("Selecciona un respaldo JSON menor de 12 MB.");
 const raw=JSON.parse(await file.text());
 if(!confirm("ATENCIÓN: Restaurar reemplazará TODOS los clientes, notas, citas y seguimientos de ESTE dispositivo. ¿Deseas continuar?"))return;
 if(!confirm("Última confirmación: ¿ya respaldaste lo que hay ahora?"))return;
 await D.restore(raw);app.clientId=null;app.tab="inicio";await render();toast("Respaldo restaurado correctamente");
}
async function handleClick(target){
 const tab=target.closest("[data-tab]");if(tab){app.tab=tab.dataset.tab;app.clientId=null;await render();return}
 const f=target.closest("[data-filter]");if(f){app.filter=f.dataset.filter;await render();return}
 const el=target.closest("[data-action]");if(!el)return;const a=el.dataset.action,cid=el.dataset.id;
 try{
 if(a==="new-client")openForm("client");
 else if(a==="edit-client")openForm("client",cid);
 else if(a==="new-note")openForm("note",cid);
 else if(a==="new-appointment")openForm("appointment",cid);
 else if(a==="new-followup")openForm("followup",cid);
 else if(a==="view-client"){app.clientId=cid;app.tab="clientes";await render()}
 else if(a==="back-clients"){app.clientId=null;app.tab="clientes";await render()}
 else if(a==="close-sheet")closeSheet();
 else if(a==="month-prev"){app.month=new Date(app.month.getFullYear(),app.month.getMonth()-1,1);app.selectedDay=null;await render()}
 else if(a==="month-next"){app.month=new Date(app.month.getFullYear(),app.month.getMonth()+1,1);app.selectedDay=null;await render()}
 else if(a==="select-day"){app.selectedDay=app.selectedDay===el.dataset.day?null:el.dataset.day;await render()}
 else if(a==="clear-day"){app.selectedDay=null;await render()}
 else if(a==="confirm-appointment"){if(!confirm("¿Mario ya confirmó personalmente este horario con el cliente?"))return;await D.setAppointmentStatus(cid,"confirmed");await render();toast("Marcada como confirmada por Mario")}
 else if(a==="complete-appointment"){await D.setAppointmentStatus(cid,"completed");await render();toast("Cita marcada como realizada")}
 else if(a==="cancel-appointment"){if(!confirm("¿Cancelar esta cita?"))return;await D.setAppointmentStatus(cid,"cancelled");await render();toast("Cita cancelada")}
 else if(a==="done-followup"){await D.setFollowupStatus(cid,"done");await render();toast("Seguimiento completado")}
 else if(a==="ics-one")exportICS({type:el.dataset.type,id:cid});
 else if(a==="export-calendar")exportICS();
 else if(a==="export-backup")await exportBackup();
 else if(a==="export-csv")exportCSV();
 else if(a==="import-backup")$("#backupInput").click();
 else if(a==="install-pwa"){if(app.installPrompt){app.installPrompt.prompt();await app.installPrompt.userChoice;app.installPrompt=null}else toast("En iPhone: Safari → Compartir → Agregar a pantalla de inicio. En Samsung: Chrome → Menú → Instalar.")}
 else if(a==="reload")await render();
 }catch(err){console.error(err);toast(err.message||"No se pudo completar")}
}
function remind(){
 if(!cache.followups.length)return;const past=cache.followups.filter(f=>f.status==="pending"&&new Date(f.dueAt).getTime()<=Date.now());
 const marker="sofia-reminder-"+new Date().toISOString().slice(0,10);if(past.length&&!sessionStorage.getItem(marker)){sessionStorage.setItem(marker,"1");toast("Tienes "+past.length+" seguimiento(s) pendiente(s) o vencido(s).");}
}
function updateNetwork(){const e=$("#offlineIndicator");e.textContent=navigator.onLine?"Datos locales":"Sin red · local";e.style.color=navigator.onLine?"var(--green)":"var(--brand)"}
async function init(){
 try{await D.open();if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});await render();remind();updateNetwork()}
 catch(err){$("#view").innerHTML=`<div class="notice warn">No se pudo iniciar el guardado local: ${E(err.message)}. Abre desde Safari o Chrome normal, fuera del modo incógnito.</div>`;}
 document.addEventListener("click",ev=>{void handleClick(ev.target)});
 document.addEventListener("submit",ev=>{if(ev.target?.id==="editForm")void handleForm(ev)});
 $("#openQuick").addEventListener("click",()=>{try{openForm("client")}catch(e){toast(e.message)}});
 $("#backupInput").addEventListener("change",async e=>{const file=e.target.files?.[0];if(!file)return;try{await restoreFile(file)}catch(err){toast("Error al restaurar: "+err.message)}finally{e.target.value=""}});
 window.addEventListener("online",updateNetwork);window.addEventListener("offline",updateNetwork);
 window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();app.installPrompt=e});
 window.addEventListener("focus",async()=>{await render();remind()});
 document.addEventListener("visibilitychange",async()=>{if(!document.hidden){await render();remind()}});
 setInterval(()=>{void render().then(remind)},60000);
 if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js",{scope:"./"}).catch(err=>console.warn("Sin modo offline:",err));
}
document.addEventListener("DOMContentLoaded",()=>void init());
})();
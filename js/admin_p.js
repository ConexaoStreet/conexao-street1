(() => {"use strict";
function el(t,a={},c=[]){const n=document.createElement(t); for(const[k,v]of Object.entries(a)){if(v==null) continue; if(k==="class") n.className=v; else if(k==="html") n.innerHTML=v; else n.setAttribute(k,String(v));}
(Array.isArray(c)?c:[c]).forEach(x=>{if(x==null) return; n.appendChild(typeof x==="string"?document.createTextNode(x):x);}); return n;}
async function loadPending(){
const s=CS.client(); const {data,error}=await s.from("cs_orders").select("id,product_id,status,created_at,buyer_name,buyer_email").eq("status","pending").order("created_at",{ascending:false}).limit(80);
if(error){console.warn(error); return [];} return data||[];
}
async function render(){
const root=document.getElementById("adminContent"); if(!root) return; root.innerHTML="";
const card=el("div",{class:"card"},[el("div",{class:"cardInner"},[
el("div",{class:"sectionTitle"},[el("b",{},"Pendentes"),el("span",{class:"chip warn"},"aguardando")]),
el("div",{id:"box"})
])]);
root.appendChild(card);
const box=card.querySelector("#box");
const items=await loadPending();
if(!items.length){box.innerHTML=`<div class="row"><b style="font-size:14px">Nenhum pendente.</b></div>`; return;}
items.forEach(o=>box.appendChild(el("div",{class:"row"},[
el("div",{style:"display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"},[
el("div",{},[el("b",{},`${o.product_id} • ${o.buyer_name||"—"}`),el("div",{class:"sub",style:"margin-top:6px;font-size:12px;max-width:none"},`${o.buyer_email||"—"} • ${String(o.id).slice(0,8)}…`)]),
el("span",{class:"chip warn"},"pendente")
])
]))));
}
document.addEventListener("DOMContentLoaded", async ()=>{const ok=await CS.requireAdminOrRedirect("index.html"); if(!ok) return; render();});
})();
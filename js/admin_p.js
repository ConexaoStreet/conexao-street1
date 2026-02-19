(() => {
"use strict";

const $ = (id)=>document.getElementById(id);

function el(tag, attrs={}, children=[]){
  const n=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs||{})){
    if(v==null) continue;
    if(k==="class") n.className = v;
    else if(k==="html") n.innerHTML = v;
    else n.setAttribute(k, String(v));
  }
  (Array.isArray(children)?children:[children]).forEach(c=>{
    if(c==null) return;
    n.appendChild(typeof c==="string"?document.createTextNode(c):c);
  });
  return n;
}

async function loadPending(){
  const s=CS.client();
  // pendentes = tudo que ainda não foi aprovado
  const {data,error}=await s
    .from("cs_orders")
    .select("id,created_at,buyer_name,buyer_email,buyer_phone,product_id,product_name,amount_cents,currency,status,payment_status,order_status")
    .order("created_at",{ascending:false})
    .limit(100);
  if(error){ console.warn(error); return []; }
  const arr = data||[];
  return arr.filter(o => !/aprovado|approved/i.test(String(o.order_status||o.status||"")));
}

async function setOrder(id, patch){
  const s=CS.client();
  const {error}=await s.from("cs_orders").update(patch).eq("id", id);
  if(error) throw error;
}

async function render(){
  const root=$("adminContent");
  if(!root) return;
  root.innerHTML="";

  const box = el("div",{class:"card"},[
    el("div",{class:"cardInner"},[
      el("div",{class:"sectionTitle"},[
        el("b",{},"Pendentes"),
        el("span",{class:"chip warn"},"aguardando")
      ]),
      el("div",{id:"box"})
    ])
  ]);
  root.appendChild(box);

  const listEl = box.querySelector("#box");
  const items = await loadPending();
  if(!items.length){
    listEl.innerHTML = `<div class="row"><b style="font-size:14px">Nenhum pendente.</b></div>`;
    return;
  }

  items.forEach(o => {
    const title = `${(o.product_name||o.product_id||"—")} • ${(o.buyer_name||"—")}`;
    const sub = `${(o.buyer_email||"—")} • ${(String(o.id).slice(0,8))}…`;

    const btnA = el("button",{class:"btn",style:"width:auto"},"Aprovar");
    const btnR = el("button",{class:"btn alt",style:"width:auto"},"Revogar");

    btnA.addEventListener("click", async ()=>{
      try{
        btnA.disabled=true; btnR.disabled=true;
        await setOrder(o.id, {
          status: "approved",
          order_status: "APROVADO",
          payment_status: (o.payment_status||"PAGO"),
          approved_at: new Date().toISOString()
        });
        CS.toast("Aprovado ✅");
        render();
      }catch(e){
        console.warn(e);
        CS.toast("Erro ao aprovar");
      }finally{ btnA.disabled=false; btnR.disabled=false; }
    });

    btnR.addEventListener("click", async ()=>{
      try{
        btnA.disabled=true; btnR.disabled=true;
        await setOrder(o.id, {
          status: "revoked",
          order_status: "REVOGADO",
          approved_at: null
        });
        CS.toast("Revogado 🚫");
        render();
      }catch(e){
        console.warn(e);
        CS.toast("Erro ao revogar");
      }finally{ btnA.disabled=false; btnR.disabled=false; }
    });

    listEl.appendChild(
      el("div",{class:"row"},[
        el("div",{style:"display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"},[
          el("div",{},[
            el("b",{}, title),
            el("div",{class:"sub",style:"margin-top:6px;font-size:12px;max-width:none"}, sub)
          ]),
          el("div",{style:"display:flex;gap:8px;align-items:center"},[
            el("span",{class:"chip warn"},"pendente"),
            btnA,
            btnR
          ])
        ])
      ])
    );
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const ok = await CS.requireAdminOrRedirect("index.html");
  if(!ok) return;
  render();
});

})();

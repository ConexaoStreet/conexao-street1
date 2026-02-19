(() => {
"use strict";
const $=id=>document.getElementById(id);

function card(p){
  const el=document.createElement("div");
  el.className="provItem";
  const img = p.image_url ? `<img class="pimg" src="${p.image_url}" alt="">` : `<div class="pimg" style="background:rgba(255,255,255,.04)"></div>`;
  el.innerHTML = `
    ${img}
    <div class="pbody">
      <div class="ptitle">${p.name||"Fornecedor"}</div>
      <div class="psub">${p.subtitle||""}</div>
      <a class="pbtn" href="${p.link||"#"}" target="_blank" rel="noopener">Abrir</a>
    </div>
  `;
  return el;
}

async function myApprovedProducts(s, user){
  const {data,error}=await s.from("cs_orders")
    .select("product_id,product_name,order_status,status,payment_status")
    .eq("user_id", user.id)
    .limit(100);
  if(error) return [];
  const ok=(o)=>{
    const st=String(o.order_status||o.status||"").toLowerCase();
    return st==="aprovado"||st==="approved";
  };
  return (data||[]).filter(ok).map(o=>String(o.product_id||"").toLowerCase());
}

async function loadProviders(){
  const grid=$("providersGrid");
  if(!grid) return;
  grid.innerHTML="";
  const s=CS.client();
  const u=(await s.auth.getUser()).data?.user;
  if(!u){
    grid.innerHTML = `<div class="row"><b>Faça login</b><br/><small style="color:rgba(255,255,255,.70)">Entre na Área do Membro para ver seus acessos.</small></div>`;
    return;
  }
  const approved = await myApprovedProducts(s, u);
  const hasVip = approved.includes("vip");
  if(!hasVip){
    grid.innerHTML = `<div class="row"><b>Sem acesso</b><br/><small style="color:rgba(255,255,255,.70)">Seu VIP ainda não foi aprovado.</small></div>`;
    return;
  }

  const {data,error}=await s.from("cs_providers")
    .select("id,name,subtitle,link,image_url,is_active")
    .eq("is_active", true)
    .order("created_at",{ascending:false})
    .limit(500);
  if(error){
    grid.innerHTML = `<div class="row"><b>Sem fornecedores</b><br/><small style="color:rgba(255,255,255,.70)">Configure cs_providers no Supabase.</small></div>`;
    return;
  }
  (data||[]).forEach(p=>grid.appendChild(card(p)));
}

document.addEventListener("DOMContentLoaded", ()=>{loadProviders().catch(()=>{});});
})();
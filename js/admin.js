(() => {
"use strict";
const $=id=>document.getElementById(id);
const fmtDate=(d)=>{try{return new Date(d).toLocaleString("pt-BR");}catch{return String(d||"");}};
const fmtBRL=(cents,currency="BRL")=>{
  const v=Number(cents||0)/100;
  try{return v.toLocaleString("pt-BR",{style:"currency",currency});}catch{return "R$ "+v.toFixed(2).replace(".",",");}
};

function setTab(name){
  document.querySelectorAll(".csTab").forEach(b=>b.classList.toggle("on", b.dataset.tab===name));
  document.querySelectorAll(".csPane").forEach(p=>p.classList.remove("on"));
  const pane=document.getElementById("pane-"+name);
  pane && pane.classList.add("on");
}

function rowCard(title, sub, rightHtml, actionsHtml){
  const d=document.createElement("div");
  d.className="row";
  d.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <b>${title}</b><br/>
        <small style="color:rgba(255,255,255,.70)">${sub||""}</small>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${rightHtml||""}
      </div>
    </div>
    ${actionsHtml? `<div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">${actionsHtml}</div>`:""}
  `;
  return d;
}

async function ensure(){
  const s=CS.client();
  const u=(await s.auth.getUser()).data?.user;
  if(!u){ CS.go("./member.html"); return null; }
  $("meEmail") && ($("meEmail").textContent=u.email||"");
  const ok=await CS.isAdmin();
  if(!ok){ CS.go("./index.html"); return null; }
  return {s,u};
}

async function dash(){
  const s=CS.client();
  const since = new Date(Date.now()-24*60*60*1000).toISOString();

  const pend = await s.from("cs_orders").select("id", {count:"exact", head:true})
    .or("payment_status.eq.PENDENTE,order_status.eq.CRIADO,status.eq.pending");
  $("kPending") && ($("kPending").textContent=String(pend.count ?? "0"));

  const appr = await s.from("cs_orders").select("id", {count:"exact", head:true})
    .gte("approved_at", since);
  $("kApproved") && ($("kApproved").textContent=String(appr.count ?? "0"));

  await liveFeed();
}

function chipFor(ev){
  const t=String(ev||"").toLowerCase();
  if(t.includes("error")||t.includes("block")) return `<span class="badge bad">${ev}</span>`;
  if(t.includes("signup")||t.includes("login")||t.includes("approve")) return `<span class="badge ok">${ev}</span>`;
  return `<span class="badge">${ev}</span>`;
}

async function liveFeed(){
  const s=CS.client();
  const box=$("liveFeed");
  if(!box) return;
  const {data}=await s.from("cs_logs")
    .select("id,created_at,event_type,user_email,meta")
    .order("created_at",{ascending:false})
    .limit(12);
  box.innerHTML="";
  (data||[]).forEach(l=>{
    box.appendChild(rowCard(
      `${l.user_email||"—"}`,
      `${fmtDate(l.created_at)}`,
      chipFor(l.event_type),
      `<button class="btn2" data-copy="${encodeURIComponent(JSON.stringify(l.meta||{}))}" type="button">Meta</button>`
    ));
  });
  box.querySelectorAll("button[data-copy]").forEach(b=>{
    b.addEventListener("click", ()=>{
      const txt=decodeURIComponent(b.getAttribute("data-copy")||"{}");
      CS.showPopup({title:"Meta", msg:txt, actions:[{label:"Ok", primary:true}]});
    });
  });
}

async function loadOrders(){
  const s=CS.client();
  const qEmail=String($("qOrderEmail")?.value||"").trim();
  const qStatus=String($("qOrderStatus")?.value||"").trim();

  $("ordersChip") && ($("ordersChip").textContent="carregando");
  let q=s.from("cs_orders").select("id,created_at,buyer_email,buyer_name,product_id,product_name,amount_cents,amount,currency,payment_status,order_status,status,user_id");
  if(qEmail) q=q.ilike("buyer_email", `%${qEmail}%`);
  if(qStatus){
    if(qStatus==="APROVADO") q=q.or("order_status.eq.APROVADO,status.eq.approved");
    else if(qStatus==="PAGO") q=q.eq("payment_status","PAGO");
    else q=q.or("payment_status.eq.PENDENTE,order_status.eq.CRIADO,status.eq.pending");
  }
  q=q.order("created_at",{ascending:false}).limit(80);

  const {data,error}=await q;
  if(error){
    $("ordersChip") && ($("ordersChip").textContent="erro");
    CS.toast("Erro ao carregar pedidos", false);
    await CS.log("admin_orders_load_error",{code:error.code,message:error.message});
    return;
  }
  $("ordersChip") && ($("ordersChip").textContent=String(data?.length||0));

  const t=$("ordersTable");
  if(!t) return;
  t.innerHTML = `
    <tr>
      <th>ID</th><th>Data</th><th>Cliente</th><th>Produto</th><th>Valor</th><th>Status</th><th>Ações</th>
    </tr>
  `;
  (data||[]).forEach(o=>{
    const tr=document.createElement("tr");
    const val = (o.amount_cents!=null && Number(o.amount_cents)>0)
      ? fmtBRL(o.amount_cents, o.currency||"BRL")
      : (Number(o.amount||0)).toLocaleString("pt-BR",{style:"currency",currency:o.currency||"BRL"});
    const st1=String(o.payment_status||"PENDENTE");
    const st2=String(o.order_status||o.status||"CRIADO");
    tr.innerHTML = `
      <td><b>#${o.id}</b></td>
      <td>${fmtDate(o.created_at)}</td>
      <td>${(o.buyer_email||"—")}</td>
      <td>${(o.product_name||o.product_id||"")}</td>
      <td>${val}</td>
      <td><div style="display:flex;gap:8px;flex-wrap:wrap">
        <span class="badge ${st1==="PAGO"?"ok":"warn"}">${st1}</span>
        <span class="badge ${String(st2).toUpperCase()==="APROVADO"||String(st2).toLowerCase()==="approved"?"ok":"warn"}">${String(st2).toUpperCase()}</span>
      </div></td>
      <td>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn2" data-act="paid" data-id="${o.id}" type="button">Marcar PAGO</button>
          <button class="btn" data-act="approve" data-id="${o.id}" type="button">Aprovar</button>
          <button class="btn2" data-act="revoke" data-id="${o.id}" type="button">Reprovar</button>
        </div>
      </td>
    `;
    t.appendChild(tr);
  });

  t.querySelectorAll("button[data-act]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id=btn.getAttribute("data-id");
      const act=btn.getAttribute("data-act");
      btn.disabled=true;
      try{
        if(act==="paid"){
          await s.from("cs_orders").update({payment_status:"PAGO"}).eq("id", id);
          await CS.log("order_mark_paid",{order_id:id});
        }else if(act==="approve"){
          const u=(await s.auth.getUser()).data?.user;
          await s.from("cs_orders").update({
            payment_status:"PAGO",
            order_status:"APROVADO",
            status:"approved",
            approved_at:new Date().toISOString(),
            approved_by:u?.id||null
          }).eq("id", id);
          await CS.log("order_approve",{order_id:id});
        }else if(act==="revoke"){
          const u=(await s.auth.getUser()).data?.user;
          await s.from("cs_orders").update({
            order_status:"CRIADO",
            status:"pending",
            approved_at:null,
            approved_by:u?.id||null
          }).eq("id", id);
          await CS.log("order_revoke",{order_id:id});
        }
      }catch(e){}
      btn.disabled=false;
      await loadOrders();
      await dash();
    });
  });
}

async function loadAdmins(){
  const s=CS.client();
  const box=$("adminsList");
  const {data,error}=await s.from("cs_admins").select("user_id,created_at").order("created_at",{ascending:false}).limit(50);
  if(error){ $("adminsChip") && ($("adminsChip").textContent="erro"); return; }
  $("adminsChip") && ($("adminsChip").textContent=String(data?.length||0));
  box.innerHTML="";
  (data||[]).forEach(a=>{
    box.appendChild(rowCard(a.user_id, fmtDate(a.created_at), `<span class="badge ok">admin</span>`, ``));
  });
}

async function makeAdmin(email, on){
  const s=CS.client();
  const {data, error}=await s.rpc("cs_admin_set_by_email",{p_email:email, p_on:on});
  if(error){
    CS.toast("Falhou (ver SQL do Supabase)", false);
    await CS.log("admin_set_error",{email,on,code:error.code,message:error.message});
    return;
  }
  CS.toast(on?"Virou admin ✅":"Admin removido ✅");
  await loadAdmins();
}

async function unlockDevice(email){
  const s=CS.client();
  const {data, error}=await s.rpc("cs_device_unlock_by_email",{p_email:email});
  if(error){
    CS.toast("Falhou (ver SQL do Supabase)", false);
    await CS.log("device_unlock_error",{email,code:error.code,message:error.message});
    return;
  }
  CS.toast("Dispositivo liberado ✅");
  await CS.log("device_unlock",{email});
}

async function loadProviders(){
  const s=CS.client();
  const box=$("provList");
  $("provListChip") && ($("provListChip").textContent="carregando");
  const {data,error}=await s.from("cs_providers").select("id,created_at,name,subtitle,link,image_url,is_active").order("created_at",{ascending:false}).limit(200);
  if(error){
    $("provListChip") && ($("provListChip").textContent="erro");
    box.innerHTML=rowCard("Configure cs_providers no Supabase","Veja o SQL abaixo",`<span class="badge warn">faltando</span>`,``);
    return;
  }
  $("provListChip") && ($("provListChip").textContent=String(data?.length||0));
  box.innerHTML="";
  (data||[]).forEach(p=>{
    const right=`<span class="badge ${p.is_active?"ok":"warn"}">${p.is_active?"ativo":"off"}</span>`;
    const act=`<button class="btn2" data-del="${p.id}" type="button">Excluir</button>
               <button class="btn2" data-off="${p.id}" type="button">${p.is_active?"Desativar":"Ativar"}</button>`;
    box.appendChild(rowCard(p.name||"—", p.subtitle||"", right, act));
  });
  box.querySelectorAll("button[data-del]").forEach(b=>{
    b.addEventListener("click", async ()=>{
      b.disabled=true;
      await s.from("cs_providers").delete().eq("id", b.getAttribute("data-del"));
      await CS.log("provider_delete",{id:b.getAttribute("data-del")});
      await loadProviders();
    });
  });
  box.querySelectorAll("button[data-off]").forEach(b=>{
    b.addEventListener("click", async ()=>{
      b.disabled=true;
      const id=b.getAttribute("data-off");
      const cur=(data||[]).find(x=>x.id===id);
      await s.from("cs_providers").update({is_active:!(cur?.is_active)}).eq("id", id);
      await CS.log("provider_toggle",{id});
      await loadProviders();
    });
  });
}

async function addProvider(){
  const s=CS.client();
  const name=String($("provName")?.value||"").trim();
  const subtitle=String($("provSub")?.value||"").trim();
  const link=String($("provLink")?.value||"").trim();
  const image_url=String($("provImg")?.value||"").trim();
  if(!name || !link){CS.toast("Nome e link", false);return;}
  const {error}=await s.from("cs_providers").insert({name,subtitle,link,image_url,is_active:true});
  if(error){CS.toast("Erro ao adicionar", false); return;}
  CS.toast("Fornecedor adicionado ✅");
  await CS.log("provider_add",{name});
  $("provName").value=""; $("provSub").value=""; $("provLink").value=""; $("provImg").value="";
  await loadProviders();
}

async function loadProducts(){
  const s=CS.client();
  const box=$("prodList");
  $("prodListChip") && ($("prodListChip").textContent="carregando");
  const {data,error}=await s.from("cs_products").select("id,created_at,product_id,name,price_cents,image_url,is_active").order("created_at",{ascending:false}).limit(200);
  if(error){
    $("prodListChip") && ($("prodListChip").textContent="erro");
    box.innerHTML=rowCard("Configure cs_products no Supabase","Veja o SQL abaixo",`<span class="badge warn">faltando</span>`,``);
    return;
  }
  $("prodListChip") && ($("prodListChip").textContent=String(data?.length||0));
  box.innerHTML="";
  (data||[]).forEach(p=>{
    const right=`<span class="badge">${p.product_id}</span> <span class="badge ok">${fmtBRL(p.price_cents)}</span>`;
    const act=`<button class="btn2" data-del="${p.id}" type="button">Excluir</button>
               <button class="btn2" data-off="${p.id}" type="button">${p.is_active?"Desativar":"Ativar"}</button>`;
    box.appendChild(rowCard(p.name||"—", "", right, act));
  });
  box.querySelectorAll("button[data-del]").forEach(b=>{
    b.addEventListener("click", async ()=>{
      b.disabled=true;
      await s.from("cs_products").delete().eq("id", b.getAttribute("data-del"));
      await CS.log("product_delete",{id:b.getAttribute("data-del")});
      await loadProducts();
    });
  });
  box.querySelectorAll("button[data-off]").forEach(b=>{
    b.addEventListener("click", async ()=>{
      b.disabled=true;
      const id=b.getAttribute("data-off");
      const cur=(data||[]).find(x=>x.id===id);
      await s.from("cs_products").update({is_active:!(cur?.is_active)}).eq("id", id);
      await CS.log("product_toggle",{id});
      await loadProducts();
    });
  });
}

async function saveProduct(){
  const s=CS.client();
  const product_id=String($("prodId")?.value||"").trim();
  const name=String($("prodName")?.value||"").trim();
  const price_cents=Number(String($("prodPrice")?.value||"0").trim()||0);
  const image_url=String($("prodImg")?.value||"").trim();
  if(!product_id || !name || !price_cents){CS.toast("Preencha id/nome/preço", false);return;}
  const {error}=await s.from("cs_products").upsert({product_id,name,price_cents,image_url,is_active:true},{onConflict:"product_id"});
  if(error){CS.toast("Erro ao salvar", false); return;}
  CS.toast("Produto salvo ✅");
  await CS.log("product_save",{product_id});
  await loadProducts();
}

async function loadCms(){
  const s=CS.client();
  $("cmsChip") && ($("cmsChip").textContent="carregando");
  const {data,error}=await s.from("cs_site_settings").select("key,value").eq("key","texts").maybeSingle();
  if(error){ $("cmsChip") && ($("cmsChip").textContent="erro"); return; }
  $("cmsChip") && ($("cmsChip").textContent="ok");
  $("cmsJson").value = JSON.stringify(data?.value||{}, null, 2);
}

async function saveCms(){
  const s=CS.client();
  let v={};
  try{ v=JSON.parse(String($("cmsJson").value||"{}")); }catch{ CS.toast("JSON inválido", false); return; }
  const {error}=await s.from("cs_site_settings").upsert({key:"texts", value:v},{onConflict:"key"});
  if(error){ CS.toast("Erro ao salvar", false); return; }
  CS.toast("Salvo ✅");
  await CS.log("cms_save",{keys:Object.keys(v||{})});
}

async function loadLogs(){
  const s=CS.client();
  const type=String($("qLogType")?.value||"").trim();
  const email=String($("qLogEmail")?.value||"").trim();
  $("logsChip") && ($("logsChip").textContent="carregando");
  let q=s.from("cs_logs").select("id,created_at,event_type,user_email,page,meta").order("created_at",{ascending:false}).limit(80);
  if(type) q=q.ilike("event_type", `%${type}%`);
  if(email) q=q.ilike("user_email", `%${email}%`);
  const {data,error}=await q;
  if(error){ $("logsChip") && ($("logsChip").textContent="erro"); return; }
  $("logsChip") && ($("logsChip").textContent=String(data?.length||0));
  const box=$("logsList"); box.innerHTML="";
  (data||[]).forEach(l=>{
    const meta=JSON.stringify(l.meta||{});
    box.appendChild(rowCard(
      `${l.event_type} • ${l.user_email||"—"}`,
      `${fmtDate(l.created_at)} • ${l.page||""}`,
      `<button class="btn2" data-meta="${encodeURIComponent(meta)}" type="button">Meta</button>`,
      ``
    ));
  });
  box.querySelectorAll("button[data-meta]").forEach(b=>{
    b.addEventListener("click", ()=>{
      const txt=decodeURIComponent(b.getAttribute("data-meta")||"{}");
      CS.showPopup({title:"Meta", msg:txt, actions:[{label:"Ok", primary:true}]});
    });
  });
}

async function realtime(){
  const s=CS.client();
  try{
    const chan = s.channel("admin-live");
    chan.on("postgres_changes",{event:"INSERT",schema:"public",table:"cs_logs"}, payload=>{
      if(document.getElementById("pane-dash")?.classList.contains("on")){
        liveFeed();
      }
      if(Notification?.permission==="granted"){
        try{ new Notification("Conexão Street", {body:`Novo evento: ${payload.new.event_type}`}); }catch{}
      }
    });
    chan.subscribe();
  }catch{}
}

async function notifAsk(){
  if(!("Notification" in window)){CS.toast("Sem suporte", false);return;}
  if(Notification.permission==="granted"){CS.toast("Ativado ✅");return;}
  const p=await Notification.requestPermission();
  CS.toast(p==="granted"?"Ativado ✅":"Negado", p==="granted");
}

async function boot(){
  const ok=await ensure();
  if(!ok) return;

  document.querySelectorAll(".csTab").forEach(b=>b.addEventListener("click", ()=>setTab(b.dataset.tab)));

  $("btnOut")?.addEventListener("click", async ()=>{
    const s=CS.client();
    await CS.log("admin_logout");
    await s.auth.signOut();
    CS.go("./index.html");
  });

  $("btnNotif")?.addEventListener("click", notifAsk);

  $("btnReloadOrders")?.addEventListener("click", loadOrders);
  $("qOrderEmail")?.addEventListener("keydown",(e)=>{if(e.key==="Enter") loadOrders();});
  $("qOrderStatus")?.addEventListener("change", loadOrders);

  $("btnMakeAdmin")?.addEventListener("click", ()=>makeAdmin(String($("qUserEmail").value||"").trim(), true));
  $("btnRemoveAdmin")?.addEventListener("click", ()=>makeAdmin(String($("qUserEmail").value||"").trim(), false));
  $("btnUnlockDevice")?.addEventListener("click", ()=>unlockDevice(String($("qUserEmail").value||"").trim()));

  $("btnAddProv")?.addEventListener("click", addProvider);
  $("btnReloadProv")?.addEventListener("click", loadProviders);

  $("btnAddProd")?.addEventListener("click", saveProduct);
  $("btnReloadProd")?.addEventListener("click", loadProducts);

  $("btnReloadCms")?.addEventListener("click", loadCms);
  $("btnSaveCms")?.addEventListener("click", saveCms);

  $("btnReloadLogs")?.addEventListener("click", loadLogs);

  await loadAdmins();
  await dash();
  await loadOrders();
  await loadProviders();
  await loadProducts();
  await loadCms();
  await loadLogs();
  await realtime();

  setInterval(async ()=>{
    if(document.getElementById("pane-dash")?.classList.contains("on")) await dash();
  }, 12000);
}

document.addEventListener("DOMContentLoaded", ()=>{
  boot().catch(()=>CS.go("./index.html"));
});
})();
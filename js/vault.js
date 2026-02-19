(() => {
"use strict";

const $ = (id)=>document.getElementById(id);

function accessOkForKind(order, kind){
  const pid = String(order?.product_id||"").toLowerCase();
  const ord = String(order?.order_status||order?.status||"");
  const approved = /aprovado|approved/i.test(ord);
  if(!approved) return false;

  // VIP pode vir como 'vip' ou 'lojista'
  if(kind === "vip") return (pid === "vip" || pid === "lojista");
  if(kind === "final") return (pid === "final");
  return false;
}

async function ensureLogged(){
  const s = CS.client();
  const { data } = await s.auth.getSession();
  const sess = data?.session || null;
  if(!sess?.user){
    CS.go("./member.html#login");
    return null;
  }
  return { s, user:sess.user };
}

async function getLatestApprovedOrderForKind(s, user, kind){
  // tenta por user_id, depois por buyer_email
  const fields = "id,created_at,product_id,order_status,status";
  let rows = [];
  try{
    const r1 = await s.from("cs_orders").select(fields).eq("user_id", user.id)
      .order("created_at", { ascending:false }).limit(30);
    if(!r1.error) rows = r1.data || [];
  }catch{}

  if(!rows.length){
    try{
      const r2 = await s.from("cs_orders").select(fields).ilike("buyer_email", String(user.email||""))
        .order("created_at", { ascending:false }).limit(30);
      if(!r2.error) rows = r2.data || [];
    }catch{}
  }

  const ok = (rows||[]).find(o=>accessOkForKind(o, kind));
  return ok || null;
}

// =========================
// Providers (para member.html)
// =========================
function providerCard(p){
  const div=document.createElement("div");
  div.className="prov";
  div.innerHTML = `
    <div class="provImg" style="background-image:url('${p.image_url||""}')"></div>
    <div class="provBody">
      <b>${p.name||"—"}</b>
      <small>${p.subtitle||""}</small>
      <a class="btn" href="${p.link||"#"}" target="_blank" rel="noopener">Abrir</a>
    </div>
  `;
  return div;
}

async function loadProviders(){
  const s=CS.client();
  const grid=$("providersGrid");
  const chip=$("countChip");
  const card=$("providersCard");
  if(!grid) return;
  if(card) card.style.display = "block";

  chip && (chip.textContent = "carregando");
  const {data,error}=await s.from("cs_providers").select("id,name,subtitle,link,image_url,is_active").eq("is_active",true).order("created_at",{ascending:false}).limit(500);
  if(error){
    chip && (chip.textContent = "erro");
    grid.innerHTML = `<div class="row"><b>Sem fornecedores</b><br/><small class="sub">Configure cs_providers no Supabase.</small></div>`;
    await CS.log("providers_load_error",{code:error.code,message:error.message});
    return;
  }
  chip && (chip.textContent = String(data?.length||0));
  grid.innerHTML="";
  (data||[]).forEach(p=>grid.appendChild(providerCard(p)));
}

// =========================
// Links Vault (vip.html / final.html)
// =========================
function linkRow(l){
  const li=document.createElement("li");
  li.className="vaultRow";
  const title = l.title || l.name || "Link";
  const href  = l.url || l.link || "#";
  const cat   = l.category ? `<span class="badge">${l.category}</span>` : "";
  li.innerHTML = `
    <div class="vaultLine">
      <div>
        <b>${title}</b><br/>
        <small class="sub">${(l.subtitle||l.note||"")}</small>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${cat}
        <a class="btn" href="${href}" target="_blank" rel="noopener">Clique</a>
      </div>
    </div>
  `;
  return li;
}

async function loadLinks(kind){
  const s = CS.client();
  const list = $("vaultList");
  const chip = $("countChip");
  if(!list) return;
  chip && (chip.textContent = "carregando");

  // Tenta carregar do Supabase; se não existir, cai pro links.json
  let items=[];
  try{
    const r = await s
      .from("cs_links")
      .select("id,title,url,subtitle,category,is_active")
      .eq("is_active", true)
      .eq("kind", kind)
      .order("sort", { ascending:true })
      .limit(1000);
    if(!r.error) items = r.data || [];
  }catch{}

  if(!items.length){
    try{
      const res = await fetch("./links.json", { cache:"no-store" });
      if(res.ok){
        const arr = await res.json();
        if(Array.isArray(arr)) items = arr.filter(x => String(x.kind||"").toLowerCase() === kind);
      }
    }catch{}
  }

  list.innerHTML = "";
  chip && (chip.textContent = String(items.length||0));

  if(!items.length){
    list.innerHTML = `<li class="vaultRow"><div class="vaultLine"><b>Sem links</b><small class="sub">Ainda não cadastramos links aqui.</small></div></li>`;
    return;
  }
  items.forEach(l=>list.appendChild(linkRow(l)));
}

async function boot(){
  const ctx = await ensureLogged();
  if(!ctx) return;
  const { s, user } = ctx;

  // Define o "kind" pelo arquivo atual (vip.html/final.html) ou pela UI do member
  const path = (location.pathname||"").toLowerCase();
  const isVipPage   = path.endsWith("/vip.html") || path.endsWith("vip.html");
  const isFinalPage = path.endsWith("/final.html") || path.endsWith("final.html");
  const isVaultPage = isVipPage || isFinalPage;
  const kind = isVipPage ? "vip" : (isFinalPage ? "final" : "vip");

  $("backMember")?.addEventListener("click", (e)=>{ e.preventDefault(); CS.go("./member.html"); }, {passive:false});

  // Gate: precisa estar aprovado
  const order = await getLatestApprovedOrderForKind(s, user, kind);
  if(!order){
    await CS.log("vault_denied", { kind });
    // No member.html: não atrapalha a tela, só mantém o card escondido
    if(!isVaultPage && $("providersCard")){
      $("providersCard").style.display = "none";
      $("countChip") && ($("countChip").textContent = "0");
      return;
    }
    CS.showPopup({
      title:"Acesso bloqueado",
      msg:"Seu acesso ainda não foi aprovado. Finalize o pagamento e aguarde a liberação.",
      actions:[
        {label:"Voltar", primary:true, onClick: ()=>CS.go("./member.html")},
        {label:"Ver produtos", href:"./products.html", target:"_self"}
      ]
    });
    return;
  }

  // Se estiver no member.html, mostra fornecedores (VIP)
  if($("providersGrid")){
    $("listKindChip") && ($("listKindChip").textContent = "VIP");
    await loadProviders();
    return;
  }

  // Se estiver no vault (vip/final), carrega links
  if($("vaultList")){
    await loadLinks(kind);
    return;
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  boot().catch((e)=>{
    console.warn(e);
    CS.toast("Erro ao carregar", false);
  });
});

})();

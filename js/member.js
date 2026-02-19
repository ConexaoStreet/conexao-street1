(() => {
"use strict";

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function safeText(el, txt){ if(el) el.textContent = txt; }

function escHtml(v){
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getDeviceId(){
  try{
    const k="cs_device_id";
    let v=localStorage.getItem(k);
    if(v) return v;
    v=(crypto?.randomUUID ? crypto.randomUUID() : ("dev_"+Math.random().toString(16).slice(2)+Date.now()));
    localStorage.setItem(k, v);
    return v;
  }catch{
    return "dev_"+Math.random().toString(16).slice(2)+Date.now();
  }
}

function setLoggedUI(user){
  safeText($("whoChip"), user ? (user.email || "") : "—");
  safeText($("sessChip"), user ? "logado" : "deslogado");

  const authBox = $("authBox");
  const loggedBox = $("loggedBox");
  if(user){
    if(authBox) authBox.style.display="none";
    if(loggedBox) loggedBox.style.display="block";
    safeText($("sessionHint"), "Sessão ativa");
  }else{
    if(authBox) authBox.style.display="block";
    if(loggedBox) loggedBox.style.display="none";
    safeText($("sessionHint"), "Entre para continuar");
  }
}

function badge(txt, ok){
  const t = String(txt||"").trim();
  const cls = ok ? "badge ok" : "badge warn";
  return `<span class="${cls}">${escHtml(t)}</span>`;
}

function isApproved(order){
  const st = String(order?.order_status || order?.status || "").toLowerCase();
  return st === "aprovado" || st === "approved" || /aprovado|approved/.test(st);
}

function normalizeKind(productIdOrName){
  const s = String(productIdOrName||"").toLowerCase();

  // VIP
  if(s.includes("vip")) return "vip";

  // Consumidor final
  if(s.includes("final") || s.includes("consum")) return "final";

  // CSS Importados / Lista CSS -> tratamos como lojista (mesmo pack/lista)
  if(s.includes("css")) return "lojista";

  // Lojista (lista)
  if(s.includes("lojist") || s.includes("revend") || s.includes("lista")) return "lojista";

  // fallback
  return "lojista";
}

async function fetchJson(path){
  const res = await fetch(path, { cache:"no-store" });
  if(!res.ok) throw new Error("fetch_failed");
  return await res.json();
}

function renderProviders(items){
  const card = $("providersCard");
  const grid = $("providersGrid");
  if(!card || !grid) return;

  grid.innerHTML = "";
  if(!Array.isArray(items) || items.length===0){
    grid.innerHTML = `<div class="row"><b>Sem fornecedores</b><br/><small class="sub" style="max-width:none">Nada cadastrado nessa lista ainda.</small></div>`;
    card.style.display = "block";
    return;
  }

  const frag = document.createDocumentFragment();
  items.forEach(p => {
    const it = document.createElement("div");
    it.className = "provItem";

    let imgEl;
    if(p.image){
      imgEl = document.createElement("img");
      imgEl.className = "pimg";
      imgEl.alt = "";
      imgEl.src = String(p.image);
      imgEl.onerror = () => { imgEl.src = "./img/placeholder.svg"; };
    }else{
      imgEl = document.createElement("div");
      imgEl.className = "pimg";
      imgEl.style.background = "rgba(255,255,255,.04)";
    }

    const body = document.createElement("div");
    body.className = "pbody";

    const title = document.createElement("div");
    title.className = "ptitle";
    title.textContent = String(p.name || "Fornecedor");

    const sub = document.createElement("div");
    sub.className = "psub";
    sub.textContent = String(p.category || "");

    const a = document.createElement("a");
    a.className = "pbtn";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Abrir";
    a.href = String(p.url || "#");

    body.appendChild(title);
    body.appendChild(sub);
    body.appendChild(a);

    it.appendChild(imgEl);
    it.appendChild(body);
    frag.appendChild(it);
  });
  grid.appendChild(frag);

  card.style.display = "block";
  try{ card.scrollIntoView({behavior:"smooth", block:"start"}); }catch{}
}

async function openAccess(kind){
  const k = normalizeKind(kind);

  safeText($("listKindChip"), k.toUpperCase());

  // escolhe arquivo
  let file = "./data/providers_lojista.json";
  if(k === "vip") file = "./data/providers_vip.json";
  if(k === "final") file = "./data/providers_final.json";

  try{
    const data = await fetchJson(file);
    renderProviders(data);
  }catch(e){
    renderProviders([]);
  }
}

async function enforceDevice(s, user){
  // Binding suave: se tabela não existir, não quebra.
  try{
    const device_id = getDeviceId();
    const device_meta = { ua: navigator.userAgent };
    // tenta inserir/atualizar
    const up = await s.from("cs_user_devices").upsert(
      { user_id: user.id, device_id, updated_at: new Date().toISOString(), device_meta },
      { onConflict: "user_id" }
    );
    if(up.error){
      // se bloquear por RLS, só ignora (admin pode checar depois)
      return true;
    }

    // tenta ler o device gravado (pra garantir 1 device por pessoa)
    const r = await s.from("cs_user_devices").select("device_id").eq("user_id", user.id).maybeSingle();
    if(r.error || !r.data) return true;

    if(String(r.data.device_id) !== String(device_id)){
      alert("Este acesso já está vinculado a outro dispositivo. Se você trocou de celular, peça liberação ao admin.");
      return false;
    }
    return true;
  }catch{
    return true;
  }
}

async function loadInfo(s, user, deviceId){
  const box = $("infoBox");
  const chip = $("infoChip");
  if(!box) return;

  const u = user || (await s.auth.getUser().then(r => r?.data?.user).catch(() => null));
  if(!u){
    box.innerHTML = `<div class="muted">Entre na sua conta para ver suas informações.</div>`;
    chip && (chip.textContent = "—");
    return;
  }

  const created = u.created_at ? new Date(u.created_at).toLocaleString("pt-BR") : "—";
  const last = (u.last_sign_in_at || u.last_sign_in) ? new Date(u.last_sign_in_at || u.last_sign_in).toLocaleString("pt-BR") : "—";
  const prov = (u.app_metadata && u.app_metadata.provider) ? String(u.app_metadata.provider) : "—";

  box.innerHTML = `
    <div><b>Email:</b> <span class="muted">${escHtml(u.email || "—")}</span></div>
    <div style="margin-top:8px;"><b>User ID:</b> <span class="muted" style="word-break:break-all">${escHtml(u.id || "—")}</span></div>
    <div style="margin-top:8px;"><b>Cadastro:</b> <span class="muted">${escHtml(created)}</span></div>
    <div style="margin-top:8px;"><b>Último login:</b> <span class="muted">${escHtml(last)}</span></div>
    <div style="margin-top:8px;"><b>Provider:</b> <span class="muted">${escHtml(prov)}</span></div>
    <div style="margin-top:8px;"><b>Dispositivo:</b> <span class="muted" style="word-break:break-all">${escHtml(deviceId || "—")}</span></div>
    <div class="muted" style="margin-top:12px;">O acesso aparece em <b>Seus acessos</b> quando o pedido estiver <b>APROVADO</b>.</div>
  `;
  chip && (chip.textContent = "ok");
}

async function loadMyOrders(s, user){
  const list = $("list");
  if(!list) return;

  list.innerHTML = "";

// Card de acesso (somente quando houver pedido APROVADO)
try{
  const firstApproved = (data || []).find(o => String(o?.order_status||"").toUpperCase() === "APROVADO");
  if(firstApproved){
    const url = await CS.getAccessUrl(s, firstApproved);
    if(url){
      const card = document.createElement("div");
      card.className = "card";
      card.style.marginBottom = "12px";
      card.innerHTML = `
        <div class="h">Acesso</div>
        <div class="muted" style="margin-top:6px;">Aprovado. Clique e acesse.</div>
        <a class="btn primary" style="margin-top:10px; text-align:center;" href="${url}">Acessar agora</a>
      `;
      list.appendChild(card);
    }
  }
}catch(e){ /* noop */ }


  if(!user){
    safeText($("statusChip"), "faça login");
    return;
  }

  safeText($("statusChip"), "carregando");

  // tenta por user_id
  let data = [];
  try{
    const r1 = await s.from("cs_orders")
      .select("id,created_at,product_id,product_name,amount,amount_cents,currency,payment_status,order_status,status")
      .eq("user_id", user.id)
      .order("created_at", { ascending:false })
      .limit(50);
    if(!r1.error && Array.isArray(r1.data)) data = r1.data;
  }catch{}

  // fallback por email (caso algum pedido antigo esteja sem user_id)
  if(!data.length && user.email){
    try{
      const r2 = await s.from("cs_orders")
        .select("id,created_at,product_id,product_name,amount,amount_cents,currency,payment_status,order_status,status")
        .eq("buyer_email", user.email)
        .order("created_at", { ascending:false })
        .limit(50);
      if(!r2.error && Array.isArray(r2.data)) data = r2.data;
    }catch{}
  }

  safeText($("statusChip"), data.length ? "ok" : "vazio");

  data.forEach(o => {
    const pid = o.product_id || "";
    const pname = o.product_name || pid || "Produto";
    const stPay = String(o.payment_status || "PENDENTE");
    const stOrdRaw = String(o.order_status || o.status || "CRIADO");
    const approved = isApproved(o);

    const val = (o.amount_cents!=null && Number(o.amount_cents)>0)
      ? (Number(o.amount_cents)/100).toLocaleString("pt-BR",{style:"currency",currency:o.currency||"BRL"})
      : (Number(o.amount||0)).toLocaleString("pt-BR",{style:"currency",currency:o.currency||"BRL"});

    const row = document.createElement("div");
    row.className = "row";

    const bPay = badge(stPay, stPay.toUpperCase()==="PAGO");
    const bOrd = badge(stOrdRaw.toUpperCase(), approved);

    const btn = approved
      ? `<button class="btn" type="button" data-open="${encodeURIComponent(pid||pname)}">Entrar</button>`
      : `<button class="btn2" type="button" disabled>Aguardando</button>`;

    row.innerHTML = `
      <b>#${escHtml(o.id)}</b> — ${escHtml(pname)}<br/>
      <small class="sub" style="max-width:none">${escHtml(new Date(o.created_at).toLocaleString("pt-BR"))}</small>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        ${bPay} ${bOrd} <span class="badge">${escHtml(val)}</span>
      </div>
      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
        ${btn}
        <a class="btn2" href="./checkout.html?id=${encodeURIComponent(pid)}">Ver pagamento</a>
      </div>
    `;
    list.appendChild(row);
  });

  // wire buttons
  list.querySelectorAll("button[data-open]").forEach(b => {
    b.addEventListener("click", async () => {
      const raw = decodeURIComponent(b.getAttribute("data-open")||"");
      await openAccess(raw);
    });
  });
}

async function init(){
  const s = CS.client();

  // 1) mantém UI sincronizada com a sessão (corrige "deslogado" no mobile)
  try{
    s.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user || null;
      setLoggedUI(user);
      await loadInfo(s, user, deviceId);
await loadMyOrders(s, user);
    });
  }catch{}

  // 2) pega sessão inicial (getSession é mais confiável)
  let user = null;
  try{
    const sess = await s.auth.getSession();
    user = sess?.data?.session?.user || null;
  }catch{}

  if(!user){
    try{
      const gu = await s.auth.getUser();
      user = gu?.data?.user || null;
    }catch{}
  }

  setLoggedUI(user);
  await loadInfo(s, user, deviceId);
// retry de sessão (storage delay)
  if(!user){
    setTimeout(async ()=>{
      try{
        const sess2 = await s.auth.getSession();
        const u2 = sess2?.data?.session?.user || null;
        if(u2){
          setLoggedUI(u2);
          await loadInfo(s, u2, deviceId);
          await loadMyOrders(s, u2);
        }
      }catch{}
    }, 600);
  }

  if(user){
    const ok = await enforceDevice(s, user);
    if(ok) await loadMyOrders(s, user);
  }else{
    await loadMyOrders(s, null);
  }

  $("goShop")?.addEventListener("click", ()=>location.href="./products.html");

  $("btnLogout")?.addEventListener("click", async (e)=>{
    try{ e.preventDefault(); e.stopPropagation(); }catch{}
    try{
      await s.auth.signOut();
    }catch(err){
      console.warn("[logout] signOut falhou:", err);
    }

    // hard clean (evita “sessão fantasma” por storage/caches)
    try{
      Object.keys(localStorage || {}).forEach((k) => {
        if(String(k).startsWith("sb-") && String(k).endsWith("-auth-token")){
          localStorage.removeItem(k);
        }
      });
      localStorage.removeItem("cs_after_login");
    }catch{}

    setLoggedUI(null);
    safeText($("statusChip"), "faça login");
    const pc = $("providersCard"); if(pc) pc.style.display="none";
    const oc = $("ordersCard"); if(oc) oc.style.display="none";
    const list = $("ordersList"); if(list) list.innerHTML = "";
    const info = $("infoBox"); if(info) info.innerHTML = `<div class="muted">Você saiu da conta.</div>`;
    safeText($("infoChip"), "—");

    // volta pro login (e recarrega pra limpar qualquer state)
    setTimeout(() => {
      try{ CS.go("member.html#login"); }catch{ window.location.href = "member.html#login"; }
    }, 60);
  });


  $("btnLogin")?.addEventListener("click", async ()=>{
    const email = String($("email")?.value||"").trim();
    const password = String($("password")?.value||"").trim();
    if(!email || !password){ alert("Preencha e-mail e senha."); return; }

    const {data, error} = await s.auth.signInWithPassword({ email, password });
    if(error){ alert("Falha no login: "+(error.message||"")); return; }

    setLoggedUI(data.user);
    const ok = await enforceDevice(s, data.user);

    // se veio do checkout/pagamento, volta automaticamente após login
    try{
      const after = localStorage.getItem("cs_after_login");
      if(after){
        localStorage.removeItem("cs_after_login");
        window.location.href = new URL(after, window.location.href).toString();
        return;
      }
    }catch{}

    if(ok){
      await loadInfo(s, user, deviceId);
await loadMyOrders(s, data.user);
    }
  });

  $("btnSignup")?.addEventListener("click", async ()=>{
    const email = String($("email")?.value||"").trim();
    const password = String($("password")?.value||"").trim();
    if(!email || !password){ alert("Preencha e-mail e senha."); return; }

    const {data, error} = await s.auth.signUp({ email, password });
    if(error){ alert("Falha ao criar conta: "+(error.message||"")); return; }

    alert("Conta criada! Verifique seu e-mail para confirmar (se estiver habilitado).");
    await sleep(400);
  });
}

document.addEventListener("DOMContentLoaded", init);
})();
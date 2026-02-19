// js/member.js — Área do Membro (sessão, pedidos, acessos, infos, logout)
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function setText(id, v){
    const el = $(id);
    if(!el) return;
    el.textContent = v == null ? "" : String(v);
  }

  function renderInfoBox(el, rows){
    if(!el) return;
    el.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "list";
    (rows || []).forEach(({label, value}) => {
      if(value == null || value === "") return;
      const li = document.createElement("li");
      const b = document.createElement("b");
      b.textContent = `${label}: `;
      const span = document.createElement("span");
      span.textContent = String(value);
      li.appendChild(b);
      li.appendChild(span);
      ul.appendChild(li);
    });
    el.appendChild(ul);
  }


  function fmtDate(v){
    if(!v) return "";
    try{
      const d = new Date(v);
      if(Number.isNaN(d.getTime())) return String(v);
      return d.toLocaleString("pt-BR");
    }catch{
      return String(v);
    }
  }

  function normalizeStatus(v){
    const s = String(v || "").toLowerCase().trim();
    if(!s) return "";
    if(["aprovado","approved","ok","liberado"].includes(s)) return "APROVADO";
    if(["pago","paid"].includes(s)) return "PAGO";
    if(["pendente","pending","em_analise","em análise","analise","análise","criado"].includes(s)) return "PENDENTE";
    return String(v);
  }

  function isApproved(order){
    const o = normalizeStatus(order?.order_status);
    return o === "APROVADO" || !!order?.approved_at;
  }

  async function mustLogged(){
    const u = await CS.user().catch(() => null);
    if(!u?.id){
      try{ localStorage.setItem("cs_after_login", window.location.href); }catch{}
      CS.toast("Entre na sua conta para ver seus acessos.");
      CS.go("member.html#login");
      return null;
    }
    return u;
  }

  async function loadProductsIndex(){
    try{
      const res = await fetch("./products.json", { cache: "no-store" });
      if(!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }catch{
      return [];
    }
  }

  async function resolveAccessTarget(order, productsIndex){
    const pid = String(order?.product_id || "").toLowerCase();

    // páginas existentes no projeto atual
    if(pid === "final") return "final.html";
    if(pid === "lojista") return "vip.html"; // título do projeto: "VIP — Lojistas"
    if(pid === "vip"){
      const p = (productsIndex || []).find(x => String(x?.id || "").toLowerCase() === "vip");
      const invite = p?.whatsapp_invite;
      if(invite) return invite; // abre WhatsApp
      return "index.html#sec-suporte";
    }

    return "products.html";
  }

  function renderOrders(listEl, orders, productsIndex){
    listEl.innerHTML = "";

    if(!orders || orders.length === 0){
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.style.padding = "10px 2px";
      empty.textContent = "Nenhum pedido encontrado ainda. Vá em Produtos para comprar.";
      listEl.appendChild(empty);
      return;
    }

    orders.forEach((o) => {
      const approved = isApproved(o);

      const card = document.createElement("section");
      card.className = "card";

      const inner = document.createElement("div");
      inner.className = "cardInner";

      const top = document.createElement("div");
      top.style.display = "flex";
      top.style.alignItems = "center";
      top.style.justifyContent = "space-between";
      top.style.gap = "10px";

      const left = document.createElement("div");

      const title = document.createElement("b");
      title.textContent = o.product_name || o.product_id || "Produto";

      const sub = document.createElement("div");
      sub.className = "muted";
      const idShort = String(o.id || "").slice(0, 8);
      sub.textContent = `Pedido #${idShort} • ${fmtDate(o.created_at)}`;

      left.appendChild(title);
      left.appendChild(document.createElement("br"));
      left.appendChild(sub);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "8px";
      right.style.flexWrap = "wrap";
      right.style.justifyContent = "flex-end";

      const chipPay = document.createElement("span");
      chipPay.className = "chip";
      chipPay.textContent = normalizeStatus(o.payment_status) || "—";

      const chipOrd = document.createElement("span");
      chipOrd.className = "chip";
      chipOrd.textContent = normalizeStatus(o.order_status) || "—";

      right.appendChild(chipPay);
      right.appendChild(chipOrd);

      top.appendChild(left);
      top.appendChild(right);

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "10px";
      actions.style.marginTop = "12px";
      actions.style.flexWrap = "wrap";

      // Se não está aprovado ainda, um botão pra ir pro pagamento
      const pay = normalizeStatus(o.payment_status);
      if(!approved && pay !== "PAGO"){
        const btnPay = document.createElement("button");
        btnPay.type = "button";
        btnPay.className = "btn";
        btnPay.textContent = "Ir para pagamento";
        btnPay.addEventListener("click", () => {
          try{ localStorage.setItem("cs_last_order_id", String(o.id)); }catch{}
          CS.go(`pagamento.html?oid=${encodeURIComponent(String(o.id))}`);
        });
        actions.appendChild(btnPay);
      }

      // Acesso: somente aqui (Área do Membro), somente quando aprovado
      const btnAccess = document.createElement("button");
      btnAccess.type = "button";
      btnAccess.className = approved ? "btn primary" : "btn2";
      btnAccess.disabled = !approved;
      btnAccess.textContent = approved ? "Acessar agora" : "Aguardando aprovação";

      btnAccess.addEventListener("click", async () => {
        if(!approved) return;
        const target = await resolveAccessTarget(o, productsIndex);
        if(/^https?:\/\//i.test(target)){
          window.open(target, "_blank", "noopener,noreferrer");
        }else{
          CS.go(target);
        }
      });

      actions.appendChild(btnAccess);

      inner.appendChild(top);
      inner.appendChild(actions);
      card.appendChild(inner);

      listEl.appendChild(card);
    });
  }

  async function loadMyOrders(u){
    const client = CS.client();
    const { data, error } = await client
      .from("cs_orders")
      .select("id, created_at, product_id, product_name, amount_cents, amount, payment_status, order_status, approved_at, approved_by")
      .eq("user_id", u.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if(error){
      console.error("[member] cs_orders select error:", error);
      throw error;
    }
    return Array.isArray(data) ? data : [];
  }

  async function fillUserInfo(u){
    const infoBox = $("infoBox");
    const rows = [
      { label: "E-mail", value: u.email || "" },
      { label: "User ID", value: u.id || "" },
      { label: "Criado em", value: u.created_at ? fmtDate(u.created_at) : "" },
      { label: "Último login", value: u.last_sign_in_at ? fmtDate(u.last_sign_in_at) : "" },
      { label: "Provider", value: u.app_metadata?.provider || "" },
    ];

    const meta = u.user_metadata || {};
    if(meta.name)  rows.push({ label: "Nome", value: meta.name });
    if(meta.phone) rows.push({ label: "Telefone", value: meta.phone });

    renderInfoBox(infoBox, rows);
  }

  async function wireLogout(){
    const btn = $("btnLogout");
    if(!btn) return;

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try{
        const client = CS.client();
        await client.auth.signOut();
      }catch(err){
        console.warn("[member] signOut warn:", err);
      }

      try{ localStorage.removeItem("cs_last_order_id"); }catch{}
      try{ localStorage.removeItem("cs_after_login"); }catch{}

      CS.toast("Você saiu da conta.");
      setTimeout(() => CS.go("index.html"), 250);
    }, { passive:false });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const listEl = $("list");
    const statusChip = $("statusChip");

    try{
      if(statusChip) statusChip.textContent = "carregando";
      await wireLogout();

      const u = await mustLogged();
      if(!u) return;

      setText("whoChip", u.email || "");
      setText("sessionHint", "Sessão ativa");

      await fillUserInfo(u);

      const productsIndex = await loadProductsIndex();
      const orders = await loadMyOrders(u);

      if(listEl) renderOrders(listEl, orders, productsIndex);

      if(statusChip) statusChip.textContent = "ok";
    }catch(err){
      console.error("[member] fatal:", err);
      if(statusChip) statusChip.textContent = "erro";
      if(listEl){
        listEl.innerHTML = "";
        const div = document.createElement("div");
        div.className = "muted";
        div.textContent = "Erro ao carregar seus pedidos. Tente novamente.";
        listEl.appendChild(div);
      }
    }
  });
})();

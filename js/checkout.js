(() => {
  "use strict";

  // checkout.js — exibe produto, coleta dados e cria pedido no Supabase.

  function $(id){ return document.getElementById(id); }

  function setText(id, txt){
    const el = $(id);
    if(el) el.textContent = txt;
  }

  function setImg(src){
    const img = $("pimg");
    if(!img) return;
    img.src = src || "./img/placeholder.svg";
    img.onerror = () => { img.src = "./img/placeholder.svg"; };
  }

  function priceToCents(p){
    if(!p) return 0;
    if(p.price_cents != null) return Number(p.price_cents) || 0;
    return Math.round(Number(p.price || 0) * 100);
  }

  async function loadCatalog(){
    try{
      const r = await fetch("./products.json", { cache:"no-store" });
      if(!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    }catch{
      return [];
    }
  }

  function isApproved(order){
    const st = String(order?.order_status || order?.status || "").toLowerCase();
    return st === "aprovado" || st === "approved" || /aprovado|approved/.test(st);
  }

  function accessTarget(pid){
    const x = String(pid || "").toLowerCase();
    if(x === "final") return "final.html";
    // VIP / Lojista / CSS -> VIP
    if(x === "vip" || x === "lojista" || x === "css-importados") return "vip.html";
    return "member.html";
  }

  async function latestOrderForProduct(productId){
    try{
      const s = CS.client();
      const u = await CS.user();
      if(!u?.id) return null;

      const { data, error } = await s
        .from("cs_orders")
        .select("id, created_at, payment_status, order_status, status")
        .eq("user_id", u.id)
        .eq("product_id", String(productId || ""))
        .order("created_at", { ascending:false })
        .limit(1);

      if(error) return null;
      return data?.[0] || null;
    }catch{
      return null;
    }
  }

  async function insertOrder(product, buyer){
    const s = CS.client();
    const u = await CS.user().catch(() => null);

        // login obrigatório: com RLS, precisamos de sessão ativa para inserir
    if(!u?.id){
      CS.toast("Você precisa entrar na sua conta para comprar.");
      try{ localStorage.setItem("cs_after_login", window.location.href); }catch{}
      CS.go("member.html");
      throw new Error("NOT_LOGGED_IN");
    }

const payload = {
      product_id: String(product?.id || ""),
      product_name: String(product?.name || ""),
      amount_cents: priceToCents(product),
      currency: "BRL",
      buyer_name: buyer?.name || null,
      buyer_email: buyer?.email || null,
      buyer_phone: buyer?.phone || null,
      payment_status: "PENDENTE",
      order_status: "CRIADO",
      status: "pending",
      provider: "manual",
      user_id: u.id
    };

    const { data, error } = await s
      .from("cs_orders")
      .insert(payload)
      .select("id, payment_status, order_status")
      .single();

    if(error) throw error;

    try{ localStorage.setItem("cs_last_order_id", String(data?.id || "")); }catch{}
    try{ CS.log("order_created", { product_id: payload.product_id, order_id: data?.id }).catch(() => {}); }catch{}
    return data;
  }

  function saveDraft({ product, buyer, order_id }){
    const draft = {
      product: {
        id: String(product?.id || ""),
        name: String(product?.name || "Produto"),
        price: Number(product?.price || 0),
        currency: "BRL",
        cover: String(product?.image || product?.cover || "")
      },
      buyer: {
        name: String(buyer?.name || ""),
        email: String(buyer?.email || ""),
        phone: String(buyer?.phone || "")
      },
      order_id: order_id ? String(order_id) : "",
      ts: Date.now()
    };
    try{ localStorage.setItem("cs_checkout_draft", JSON.stringify(draft)); }catch{}
    return draft;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const loader = $("loader");
    if(loader) setTimeout(() => loader.classList.add("off"), 250);

    const pid = (CS.qs("id") || "").trim();
    const catalog = await loadCatalog();
    const product = catalog.find(x => (String(x.id || "") === pid) || (Array.isArray(x.aliases) && x.aliases.map(v => String(v)).includes(pid))) || catalog[0] || null;

    if(!product){
      setText("name", "Produto não encontrado");
      setText("desc", "Volta e escolha um produto.");
      setText("price", "—");
      return;
    }

    setText("name", product.name || "Produto");
    setText("desc", product.short || product.desc || "");
    setImg(product.image);

    const cents = priceToCents(product);
    setText("price", CS.moneyFromCents(cents));

    const payChip    = $("payChip");
    async function refresh(){
      const ord = await latestOrderForProduct(product.id);
      if(!ord) return;

      const approved = isApproved(ord);

      if(payChip){
        payChip.className = approved ? "chip ok" : "chip warn";
        payChip.textContent = approved ? "aprovado" : "pendente";
      }
    }
    }

    // Ir para pagamento: cria pedido + salva draft + abre pagamento.html
    const goPayBtn = $("goPay");
    if(goPayBtn){
      goPayBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const buyer = {
          name:  String($("buyerName")?.value || "").trim(),
          email: String($("buyerEmail")?.value || "").trim(),
          phone: String($("buyerPhone")?.value || "").trim()
        };

        if(!buyer.name || !buyer.email){
          CS.toast("Preenche nome e e-mail pra continuar.", false);
          return;
        }

        if(!CS.canDo("checkout_goPay", 3)){
          CS.toast("Aguarde um instante…", false);
          return;
        }

        goPayBtn.disabled = true;
        const oldLabel = goPayBtn.textContent;
        goPayBtn.textContent = "Criando pedido…";

        try{
          const created = await insertOrder(product, buyer);
          const draft = saveDraft({ product, buyer, order_id: created?.id });

          const u = new URL("pagamento.html", window.location.href);
          u.searchParams.set("pid", draft.product.id);
          u.searchParams.set("name", draft.buyer.name);
          u.searchParams.set("email", draft.buyer.email);
          if(draft.buyer.phone) u.searchParams.set("phone", draft.buyer.phone);
          if(draft.order_id) u.searchParams.set("oid", draft.order_id);

          window.location.href = u.toString();
        }catch(err){
          console.warn("[checkout] insertOrder", err);
          CS.toast("Erro ao criar pedido. Tenta de novo.", false);
          try{ CS.log("order_create_error", { message: String(err?.message || err) }).catch(() => {}); }catch{}
        }finally{
          goPayBtn.disabled = false;
          goPayBtn.textContent = oldLabel;
        }
      }, { passive:false });
    }

    // status do pedido (se o usuário estiver logado)
    refresh();
    setTimeout(refresh, 800);
    setInterval(refresh, 4500);
  });
})();

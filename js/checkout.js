(() => {
"use strict";

async function loadCatalog(){
  try{
    const r = await fetch("./products.json",{cache:"no-store"});
    if(!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  }catch{
    return [];
  }
}

function setText(id, txt){
  const el = document.getElementById(id);
  if(el) el.textContent = txt;
}

function setImg(src){
  const img = document.getElementById("pimg");
  if(!img) return;
  img.src = src || "./img/placeholder.svg";
  img.onerror = () => (img.src="./img/placeholder.svg");
}

function priceToCents(p){
  if(p==null) return 0;
  if(p.price_cents!=null) return Number(p.price_cents)||0;
  return Math.round(Number(p.price||0)*100);
}

async function insertOrder(product, buyer){
  const s = CS.client();
  const u = await CS.user();

  const payload = {
    product_id: String(product.id||""),
    product_name: String(product.name||""),
    amount_cents: priceToCents(product),
    currency: "BRL",
    buyer_name: buyer.name || null,
    buyer_email: buyer.email || null,
    buyer_phone: buyer.phone || null,
    payment_status: "PENDENTE",
    order_status: "CRIADO",
    status: "created",
    provider: "manual",
    user_id: u?.id || null
  };

  const {data, error} = await s
    .from("cs_orders")
    .insert(payload)
    .select("id, payment_status, order_status")
    .single();

  if(error) throw error;
  try{ localStorage.setItem("cs_last_order_id", String(data?.id||"")); }catch{}
  return data;
}

async function latestOrder(product_id){
  const s = CS.client();
  const u = await CS.user();
  if(!u?.id) return null;

  const {data, error} = await s
    .from("cs_orders")
    .select("id, created_at, payment_status, order_status, status")
    .eq("user_id", u.id)
    .eq("product_id", String(product_id||""))
    .order("created_at",{ascending:false})
    .limit(1);

  if(error) return null;
  return data?.[0] || null;
}

function accessTarget(pid){
  const x = String(pid||"").toLowerCase();
  if(x==="vip" || x==="lojista") return "vip.html";
  if(x==="final") return "final.html";
  return "member.html";
}

document.addEventListener("DOMContentLoaded", async () => {
  // popup curto avisando sobre pagamentos
  try{
    CS.showPopup({
      title:"Formas de pagamento",
      msg:"Jajá teremos novas formas de pagamento. Por enquanto, finalize normalmente e fale com o suporte se precisar.",
      actions:[
        {label:"Suporte", primary:true, href:(window.APP_CONFIG?.SUPPORT_WA||""), target:"_blank"},
        {label:"Ok"}
      ]
    });
    setTimeout(()=>{
      document.getElementById("csPopBack")?.classList.remove("on");
      document.getElementById("csPop")?.classList.remove("on");
    }, 2000);
  }catch{}

  const pid = (CS.qs("id")||"").trim();
  const catalog = await loadCatalog();
  const product = catalog.find(x=>String(x.id||"")===pid) || catalog[0] || null;

  if(!product){
    setText("name","Produto não encontrado");
    setText("desc","Volta e escolha um produto.");
    setText("price","—");
    return;
  }

  setText("name", product.name || "Produto");
  setText("desc", product.short || product.desc || "");
  setImg(product.image);

  const cents = priceToCents(product);
  setText("price", CS.moneyFromCents(cents));

  const pixKey = document.getElementById("pixKey");
  if(pixKey) pixKey.value = (window.APP_CONFIG?.PIX_KEY || "");

  const copyBtn = document.getElementById("copyPix");
  if(copyBtn) copyBtn.addEventListener("click", async ()=>{
    try{
      await navigator.clipboard.writeText(pixKey?.value||"");
      CS.toast("Copiado ✅");
    }catch{
      CS.toast("Não consegui copiar", false);
    }
  }, {passive:false});

  const confirmBtn = document.getElementById("confirmBtn");
  const goPayBtn  = document.getElementById("goPay");
  const payRow    = document.getElementById("payRow");
  const cardBtn   = document.getElementById("cardBtn");

  // Mostra a área de pagamento (PIX/WhatsApp) só depois de preencher os dados
  if(goPayBtn){
    goPayBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const buyer_name  = (nameInput?.value || "").trim();
      const buyer_email = (emailInput?.value || "").trim();

      if(!buyer_name || !buyer_email){
        showMsg("Preenche nome e e-mail.");
        return;
      }

      if(payRow){
        payRow.style.display = ""; // remove o display:none inline
        try{ payRow.scrollIntoView({ behavior:"smooth", block:"start" }); }
        catch{ payRow.scrollIntoView(); }
      }
    }, { passive:false });
  }

  // Cartão: abre WhatsApp do suporte com mensagem pronta
  if(cardBtn){
    cardBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const buyer_name  = (nameInput?.value || "").trim();
      const buyer_email = (emailInput?.value || "").trim();
      const buyer_phone = (phoneInput?.value || "").trim();

      if(!CS?.CONFIG?.SUPPORT_WA){
        showMsg("WhatsApp de suporte não configurado (config.js).");
        return;
      }

      const txt =
        `Olá! Quero pagar no cartão (InfinitePay/link).\n` +
        `Produto: ${product?.name || product?.id || ""}\n` +
        `Nome: ${buyer_name}\n` +
        `Email: ${buyer_email}\n` +
        (buyer_phone ? `Telefone: ${buyer_phone}\n` : "") +
        `Site: ${location.href}`;

      const url = CS.CONFIG.SUPPORT_WA + "?text=" + encodeURIComponent(txt);
      window.open(url, "_blank");
    }, { passive:false });
  }

  const payChip = document.getElementById("payChip");
  const accessBox = document.getElementById("accessBox");
  const accessBtn = document.getElementById("accessBtn");
  const accessHint = document.getElementById("accessHint");

  async function refresh(){
    const ord = await latestOrder(product.id);
    if(!ord) return;

    const st = String(ord.order_status || ord.status || "").toLowerCase();
    const approved = (st==="aprovado" || st==="approved");

    if(payChip){
      payChip.className = approved ? "chip ok" : "chip warn";
      payChip.textContent = approved ? "aprovado" : "pendente";
    }
    if(accessBox) accessBox.style.display = "block";
    if(accessHint) accessHint.textContent = approved ? "Aprovado. Clique e acesse." : "Pedido pendente. Aguarde aprovação.";
    if(accessBtn){
      accessBtn.disabled = !approved;
      accessBtn.className = approved ? "btn" : "btn2";
      accessBtn.textContent = approved ? "Acessar agora" : "Aguardando";
      if(approved) accessBtn.onclick = () => CS.go(accessTarget(product.id));
    }
  }

  if(confirmBtn) confirmBtn.addEventListener("click", async ()=>{
    const u = await CS.user();
    if(!u){
      CS.toast("Faça login para continuar.", false);
      CS.go("member.html#login");
      return;
    }

    const buyerName  = (document.getElementById("buyerName")?.value||"").trim();
    const buyerEmail = (document.getElementById("buyerEmail")?.value||"").trim();
    const buyerPhone = (document.getElementById("buyerPhone")?.value||"").trim();

    if(!buyerName || !buyerEmail){
      CS.toast("Preenche nome e e-mail", false);
      return;
    }

    try{
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Enviando…";
      await insertOrder(product, {name:buyerName, email:buyerEmail, phone:buyerPhone});
      CS.toast("Pedido criado ✅");
      await CS.log("order_created", {product_id:product.id});
      setTimeout(refresh, 800);
    }catch(e){
      console.warn(e);
      CS.toast("Falhou ao criar pedido", false);
      await CS.log("order_create_error", {message:String(e?.message||e)});
    }finally{
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Já paguei";
    }
  }, {passive:false});

  setInterval(refresh, 4500);
  setTimeout(refresh, 800);
});
})();
(() => {
"use strict";

// =============================
// PIX (BR Code) generator (static)
// - Works with a PIX key + amount
// - Generates EMV string + CRC16
// =============================

function pad2(n){ return String(n).padStart(2,"0"); }

function emv(id, value){
  const v = String(value ?? "");
  return String(id) + pad2(v.length) + v;
}

function crc16CCITT(str){
  // CRC16/CCITT-FALSE
  let crc = 0xFFFF;
  for(let i=0;i<str.length;i++){
    crc ^= (str.charCodeAt(i) << 8);
    for(let j=0;j<8;j++){
      if(crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      else crc = (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4,"0");
}

function makePixBRCode({key, amount, name, city, txid, message}){
  const k = String(key||"").trim();
  if(!k) return "";

  const merchantName = String(name||"CONEXAO STREET").toUpperCase().slice(0,25);
  const merchantCity = String(city||"BRASIL").toUpperCase().slice(0,15);
  const tid = String(txid||"CS").slice(0,25);

  const gui = emv("00","br.gov.bcb.pix");
  const kf  = emv("01", k);
  const mf  = message ? emv("02", String(message).slice(0,72)) : "";
  const mai = emv("26", gui + kf + mf);

  const amt = (Number(amount||0) > 0)
    ? emv("54", Number(amount).toFixed(2))
    : "";

  const base =
    emv("00","01") +
    emv("01","12") +
    mai +
    emv("52","0000") +
    emv("53","986") +
    amt +
    emv("58","BR") +
    emv("59", merchantName) +
    emv("60", merchantCity) +
    emv("62", emv("05", tid));

  const withCrcId = base + "6304";
  const crc = crc16CCITT(withCrcId);
  return withCrcId + crc;
}

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
  if(x==="vip") return "vip.html";
  if(x==="final") return "final.html";
  return "member.html";
}

document.addEventListener("DOMContentLoaded", async () => {
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

  // Prefill buyer email from auth
  try{
    const u = await CS.user();
    const em = u?.email || u?.user_metadata?.email;
    const emailInput = document.getElementById("buyerEmail");
    if(em && emailInput && !emailInput.value) emailInput.value = em;
  // Step: show payment section only after user fills data
  const paySection = document.getElementById("paySection");
  const btnGoPay = document.getElementById("btnGoPay");
  const formMsg = document.getElementById("formMsg");
  const buyerNameEl = document.getElementById("buyerName");
  const buyerEmailEl = document.getElementById("buyerEmail");

  // Prefill from localStorage (if user came back)
  try{
    const bn = localStorage.getItem("cs_buyer_name") || "";
    const be = localStorage.getItem("cs_buyer_email") || "";
    if(bn && buyerNameEl && !buyerNameEl.value) buyerNameEl.value = bn;
    if(be && buyerEmailEl && !buyerEmailEl.value) buyerEmailEl.value = be;
  }catch{}

  if(paySection) paySection.style.display = "none";

  function showFormMsg(t){
    if(formMsg) formMsg.textContent = t || "";
  }

  if(btnGoPay){
    btnGoPay.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const buyer_name = (buyerNameEl?.value || "").trim();
      const buyer_email = (buyerEmailEl?.value || "").trim();

      if(!buyer_name || !buyer_email){
        showFormMsg("Preenche nome e e-mail para continuar.");
        return;
      }

      // Save for later steps
      try{
        localStorage.setItem("cs_buyer_name", buyer_name);
        localStorage.setItem("cs_buyer_email", buyer_email);
      }catch{}

      showFormMsg("");
      if(paySection){
        paySection.style.display = "";
        try{ paySection.scrollIntoView({ behavior:"smooth", block:"start" }); }
        catch{ paySection.scrollIntoView(); }
      }
    }, { passive:false });
  }

  const pixKey = document.getElementById("pixKey");
  const pixKeyValue = (window.APP_CONFIG?.PIX_KEY || "").trim();
  if(pixKey) pixKey.value = pixKeyValue;

  // Generate BR Code + QR
  const brEl = document.getElementById("pixBrcode");
  const qrImg = document.getElementById("pixQrImg");
  const amount = (Number(cents||0) / 100);

  const br = makePixBRCode({
    key: pixKeyValue,
    amount,
    name: (window.APP_CONFIG?.BRAND_NAME || "CONEXAO STREET"),
    city: "BRASIL",
    txid: ("CS" + Math.random().toString(36).slice(2,10)).toUpperCase(),
    message: (product?.name || "Conexão Street").slice(0, 40)
  });

  if(brEl) brEl.value = br;

  // QRCode library (cdnjs) -> dataURL
  try{
    if(window.QRCode && qrImg && br){
      const url = await window.QRCode.toDataURL(br, { margin: 1, width: 420 });
      qrImg.src = url;
    }
  }catch(e){
    console.warn("[pix qr]", e);
  }

  const copyBtn = document.getElementById("copyPix");
  if(copyBtn) copyBtn.addEventListener("click", async ()=>{
    try{
      await navigator.clipboard.writeText(pixKey?.value||"");
      CS.toast("Copiado ✅");
    }catch{
      CS.toast("Não consegui copiar", false);
    }
  }, {passive:false});

  const copyBrcode = document.getElementById("copyBrcode");
  if(copyBrcode) copyBrcode.addEventListener("click", async ()=>{
    try{
      await navigator.clipboard.writeText(brEl?.value||"");
      CS.toast("Pix copiado ✅");
    }catch{
      CS.toast("Não consegui copiar", false);
    }
  }, {passive:false});

  const confirmBtn = document.getElementById("confirmBtn");
  const payChip = document.getElementById("payChip");
  const accessBox = document.getElementById("accessBox");
  const accessBtn = document.getElementById("accessBtn");
  const accessHint = document.getElementById("accessHint");
  const cardBtn = document.getElementById("cardBtn");

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

  // Cartão via WhatsApp (InfinitePay/link)
  if(cardBtn) cardBtn.addEventListener("click", async (e)=>{
    e.preventDefault();
    e.stopPropagation();
    const support = (window.APP_CONFIG?.SUPPORT_WA || "").trim();
    if(!support){
      CS.toast("Suporte não configurado", false);
      return;
    }

    const u = await CS.user();
    const buyerName  = (document.getElementById("buyerName")?.value||"").trim();
    const buyerEmail = (document.getElementById("buyerEmail")?.value||u?.email||"").trim();
    const msg = [
      "Olá! Quero pagar no CARTÃO.",
      `Produto: ${product?.name||product?.id||""}`,
      `Valor: ${CS.moneyFromCents(cents)}`,
      buyerName ? `Nome: ${buyerName}` : "",
      buyerEmail ? `Email: ${buyerEmail}` : "",
      u?.id ? `UID: ${u.id}` : "",
      "Pode me mandar o link/checkout (InfinitePay)?"
    ].filter(Boolean).join("\n");

    const url = new URL(support);
    url.searchParams.set("text", msg);
    window.open(url.toString(), "_blank", "noopener");
  }, {passive:false});

  setInterval(refresh, 4500);
  setTimeout(refresh, 800);
});
})();
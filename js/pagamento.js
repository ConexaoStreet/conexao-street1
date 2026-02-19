// js/pagamento.js — pagamento (Pix) + marcação "Já paguei"
(() => {
  "use strict";

  function $(id){ return document.getElementById(id); }

  function moneyBRL(v){
    try{ return Number(v).toLocaleString("pt-BR", { style:"currency", currency:"BRL" }); }
    catch{ return `R$ ${v}`; }
  }

  function getDraft(){
    try{
      const raw = localStorage.getItem("cs_checkout_draft");
      if(raw) return JSON.parse(raw);
    }catch{}
    return null;
  }

  function qs(name){
    try{ return new URL(window.location.href).searchParams.get(name); }
    catch{ return null; }
  }

  function buildSupportLink(extraMsg){
    const wa = String(window.APP_CONFIG?.SUPPORT_WA || "").trim();
    if(!wa) return "#";
    try{
      const u = new URL(wa);
      const msg = String(extraMsg || "").trim();
      if(msg) u.searchParams.set("text", msg);
      return u.toString();
    }catch{
      return wa;
    }
  }

  async function copyText(t){
    try{
      await navigator.clipboard.writeText(t);
      return true;
    }catch{
      const ta = document.createElement("textarea");
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try{ ok = document.execCommand("copy"); }catch{}
      ta.remove();
      return ok;
    }
  }

  function getFallbackDraft(){
    return {
      product: {
        id: qs("pid") || "",
        name: "Produto",
        price: 0,
        currency: "BRL",
        cover: ""
      },
      buyer: {
        name: qs("name") || "",
        email: qs("email") || "",
        phone: qs("phone") || ""
      },
      order_id: qs("oid") || ""
    };
  }

  async function markPaid(orderId){
    if(!orderId) return false;
    try{
      const s = CS.client();
      const u = await CS.user().catch(() => null);

      // Se o usuário estiver deslogado, não conseguimos atualizar no backend.
      if(!u?.id) return false;

      const patch = {
        payment_status: "PAGO",
        paid_at: new Date().toISOString(),
        status: "pending",
        order_status: "CRIADO"
      };

      const { error } = await s.from("cs_orders").update(patch).eq("id", orderId);
      if(error) return false;

      try{ CS.log("order_paid", { order_id: orderId }).catch(() => {}); }catch{}
      return true;
    }catch{
      return false;
    }
  }

  function fillUI(draft){
    const loader = $("loader");
    if (loader) setTimeout(() => loader.classList.add("off"), 250);

    const p = draft.product || {};
    const b = draft.buyer || {};

    $("pName") && ($("pName").textContent = p.name || "Produto");
    $("pPrice") && ($("pPrice").textContent = moneyBRL(p.price || 0));
    $("buyerNameOut") && ($("buyerNameOut").textContent = b.name || "—");
    $("buyerEmailOut") && ($("buyerEmailOut").textContent = b.email || "—");

    const phoneOut = $("buyerPhoneOut");
    if(phoneOut){
      if(b.phone){
        phoneOut.style.display = "";
        phoneOut.textContent = b.phone;
      }else{
        phoneOut.style.display = "none";
      }
    }

    const cover = $("pCover");
    if(cover && p.cover){
      cover.src = p.cover;
      cover.onerror = () => { cover.src = "./img/placeholder.jpg"; };
    }

    const pixKey = String(window.APP_CONFIG?.PIX_KEY || "").trim();
    $("pixKey") && ($("pixKey").textContent = pixKey || "—");

    const msgBase =
      `Oi! Quero pagar no cartão o produto: ${p.name || p.id || "Conexão Street"}\n` +
      `Nome: ${b.name || "-"}\nEmail: ${b.email || "-"}\n` +
      (b.phone ? `Telefone: ${b.phone}\n` : "") +
      `Obs: estou na página de pagamento.`;

    $("btnCardWA") && ($("btnCardWA").href = buildSupportLink(msgBase + "\nPagamento no cartão (crédito/débito)."));
    $("btnSupportWA") && ($("btnSupportWA").href = buildSupportLink("Oi! Preciso de ajuda com o pagamento."));

    const btnCopy = $("btnCopyPix");
    if(btnCopy){
      btnCopy.addEventListener("click", async () => {
        if(!pixKey) return;
        btnCopy.disabled = true;
        const ok = await copyText(pixKey);
        btnCopy.textContent = ok ? "Copiado ✅" : "Não deu pra copiar";
        setTimeout(() => {
          btnCopy.textContent = "Copiar chave Pix";
          btnCopy.disabled = false;
        }, 1200);
      }, { passive:false });
    }

    const btnPaid = $("btnJaPaguei");
    if(btnPaid){
      btnPaid.addEventListener("click", async () => {
        btnPaid.disabled = true;
        const orderId = String(draft.order_id || qs("oid") || "").trim();
        const ok = await markPaid(orderId);

        // estado local (pra UX)
        try{
          localStorage.setItem("cs_last_payment", JSON.stringify({ ...draft, status:"PENDENTE", ts: Date.now() }));
        }catch{}

        // manda pra área do membro
        if(ok) CS.toast("Pedido marcado como pago ✅");
        else CS.toast("Ok! Agora aguarde a aprovação ✅");
        window.location.href = new URL("member.html", window.location.href).toString();
      }, { passive:false });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const draft = getDraft() || getFallbackDraft();
    fillUI(draft);
  });
})();

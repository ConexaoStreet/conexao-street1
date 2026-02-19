// js/pagamento.js — confirma pagamento (manual) e manda o usuário ver o acesso na Área do Membro
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function getOID(){
    const u = new URL(window.location.href);
    const q = u.searchParams.get("oid") || u.searchParams.get("id");
    if(q) return q;
    try{ return localStorage.getItem("cs_last_order_id"); }catch{ return null; }
  }

  function fmtMoneyBRL(v){
    const n = Number(v);
    if(Number.isNaN(n)) return "";
    try{ return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
    catch{ return `R$ ${n}`; }
  }

  function setText(id, v){
    const el = $(id);
    if(!el) return;
    el.textContent = v == null ? "" : String(v);
  }

  function setStatus(msg, tone){
    const el = $("statusMsg");
    if(!el) return;
    el.textContent = msg || "";
    // tone: "ok" | "warn" | "err"
    el.dataset.tone = tone || "";
  }

  async function mustLogged(){
    const u = await CS.user().catch(() => null);
    if(!u?.id){
      try{ localStorage.setItem("cs_after_login", window.location.href); }catch{}
      CS.toast("Você precisa entrar para confirmar pagamento.");
      CS.go("member.html#login");
      return null;
    }
    return u;
  }

  async function loadOrder(oid, uid){
    const client = CS.client();
    const { data, error } = await client
      .from("cs_orders")
      .select("id, created_at, product_id, product_name, amount, amount_cents, currency, buyer_name, buyer_email, buyer_phone, payment_status, order_status")
      .eq("id", oid)
      .eq("user_id", uid)
      .maybeSingle();

    if(error) throw error;
    return data || null;
  }

  async function markPaid(oid, uid){
    const client = CS.client();
    const now = new Date().toISOString();

    const { error } = await client
      .from("cs_orders")
      .update({
        payment_status: "PAGO",
        paid_at: now,
        order_status: "PENDENTE"
      })
      .eq("id", oid)
      .eq("user_id", uid);

    if(error) throw error;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const oid = getOID();
    const btn = $("btnJaPaguei");

    if(!oid){
      setStatus("Pedido não encontrado. Volte e gere um novo pedido.", "err");
      if(btn) btn.disabled = true;
      return;
    }

    try{
      const u = await mustLogged();
      if(!u) return;

      setText("orderId", String(oid).slice(0, 8));
      setStatus("Carregando pedido...", "");

      const order = await loadOrder(oid, u.id);

      if(!order){
        setStatus("Pedido não encontrado (ou não pertence a esta conta).", "err");
        if(btn) btn.disabled = true;
        return;
      }

      // Produto
      setText("pName", order.product_name || order.product_id || "Produto");
      setText("pDesc", "Confirme o Pix e aguarde a aprovação para liberar o acesso.");
      const amount = order.amount_cents != null
        ? fmtMoneyBRL(Number(order.amount_cents) / 100)
        : (order.amount != null ? fmtMoneyBRL(order.amount) : "");
      setText("pPrice", amount || "");

      // Status chips/text
      setText("payStatusChip", String(order.payment_status || "PENDENTE").toLowerCase());
      setText("payStatus", order.payment_status || "PENDENTE");

      // Dados do comprador
      setText("buyerNameOut", order.buyer_name || u.user_metadata?.name || "");
      setText("buyerEmailOut", order.buyer_email || u.email || "");
      setText("buyerPhoneOut", order.buyer_phone || u.user_metadata?.phone || "");

      setStatus("Faça o Pix e depois clique em “Já paguei”. Seu pedido fica em análise até aprovação.", "warn");

      if(btn){
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();

          btn.disabled = true;
          setStatus("Confirmando pagamento...", "");

          try{
            await markPaid(oid, u.id);
            setText("payStatusChip", "pago");
            setText("payStatus", "PAGO");

            setStatus("Pagamento marcado como PAGO ✅ Agora aguarde a aprovação. Seu acesso aparecerá em “Seus acessos” na Área do Membro.", "ok");

            setTimeout(() => CS.go("member.html"), 900);
          }catch(err){
            console.error("[pagamento] markPaid error:", err);
            btn.disabled = false;
            setStatus("Erro ao confirmar pagamento. Tente novamente.", "err");
          }
        }, { passive:false });
      }
    }catch(err){
      console.error("[pagamento] fatal:", err);
      setStatus("Erro ao preparar pagamento. Tente novamente.", "err");
      if(btn) btn.disabled = true;
    }
  });
})();

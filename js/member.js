// member.js — Área do Membro (auth + acessos)
(() => {
  "use strict";

  const DEBUG = true;
  const log = (...a) => DEBUG && console.log("[member]", ...a);
  const warn = (...a) => DEBUG && console.warn("[member]", ...a);

  const $ = (id) => document.getElementById(id);

  function setText(el, text) {
    if (!el) return;
    el.textContent = text == null ? "" : String(text);
  }

  function show(el, on) {
    if (!el) return;
    el.hidden = !on;
    el.setAttribute("aria-hidden", on ? "false" : "true");
    el.style.display = on ? "" : "none";
  }

  function moneyBRL(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "R$ 0,00";
    try {
      return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    } catch {
      return `R$ ${n}`;
    }
  }

  function fmtDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString("pt-BR");
    } catch {
      return String(iso || "");
    }
  }

  function pageForProductId(pid) {
    const p = String(pid || "").toLowerCase();
    if (p === "final") return "final.html";
    if (p === "lojista") return "lojista.html";
    // vip (ou qualquer coisa) cai no VIP
    return "vip.html";
  }

  async function safeUser() {
    // Em alguns navegadores, a sessão pode chegar “um tiquinho” depois.
    // Faz 2 tentativas curtinhas antes de declarar deslogado.
    try {
      let u = await CS.user();
      if (u) return u;
      await new Promise((r) => setTimeout(r, 120));
      u = await CS.user();
      return u;
    } catch (e) {
      warn("CS.user falhou", e);
      return null;
    }
  }

  function toggleAuth(logged) {
    const authBox = $("authBox");
    const loggedBox = $("loggedBox");
    show(authBox, !logged);
    show(loggedBox, !!logged);
  }

  async function renderInfo(user) {
    const infoBox = $("infoBox");
    if (!infoBox) return;
    infoBox.innerHTML = "";

    if (!user) {
      const p = document.createElement("div");
      p.className = "muted";
      p.textContent = "Entre para ver suas informações.";
      infoBox.appendChild(p);
      return;
    }

    const deviceId = (typeof CS.getUserDeviceId === "function") ? (CS.getUserDeviceId() || "—") : "—";
    const rows = [
      ["E-mail", user.email || "—"],
      ["User ID", user.id || "—"],
      ["Provider", (user.app_metadata && user.app_metadata.provider) || "—"],
      ["Criado em", user.created_at ? fmtDate(user.created_at) : "—"],
      ["Dispositivo", deviceId],
      ["Navegador", navigator.userAgent],
    ];

    rows.forEach(([k, v]) => {
      const line = document.createElement("div");
      line.style.display = "flex";
      line.style.gap = "10px";
      line.style.justifyContent = "space-between";
      line.style.padding = "8px 0";
      line.style.borderBottom = "1px solid rgba(255,255,255,.08)";

      const a = document.createElement("b");
      a.textContent = k;
      const b = document.createElement("span");
      b.className = "muted";
      b.style.textAlign = "right";
      b.style.wordBreak = "break-word";
      b.textContent = String(v);

      line.appendChild(a);
      line.appendChild(b);
      infoBox.appendChild(line);
    });
  }

  function mountOrderCard(order) {
    const card = document.createElement("div");
    card.className = "miniCard";

    const top = document.createElement("div");
    top.className = "row";
    top.style.alignItems = "flex-start";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.style.fontWeight = "700";
    title.textContent = order.product_name || order.product_id || "Produto";

    const meta = document.createElement("div");
    meta.className = "muted";
    meta.textContent = `Pedido #${String(order.id).slice(0, 8)} • ${fmtDate(order.created_at)}`;

    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.flexDirection = "column";
    right.style.gap = "6px";
    right.style.alignItems = "flex-end";

    const chipPay = document.createElement("span");
    chipPay.className = "chip";
    chipPay.textContent = (order.payment_status || "—").toUpperCase();

    const chipOrd = document.createElement("span");
    chipOrd.className = "chip";
    chipOrd.textContent = (order.order_status || "—").toUpperCase();

    right.appendChild(chipPay);
    right.appendChild(chipOrd);

    top.appendChild(left);
    top.appendChild(right);
    card.appendChild(top);

    const amount = document.createElement("div");
    amount.className = "muted";
    amount.style.marginTop = "10px";
    amount.textContent = `Valor: ${moneyBRL(order.amount ?? order.amount_cents ? (Number(order.amount_cents) / 100) : order.amount)}`;
    card.appendChild(amount);

    const actions = document.createElement("div");
    actions.style.marginTop = "10px";
    actions.style.display = "grid";
    actions.style.gap = "10px";

    const paid = String(order.payment_status || "").toUpperCase() === "PAGO";
    const approved = String(order.order_status || "").toUpperCase() === "APROVADO";

    const btn1 = document.createElement("button");
    btn1.className = "btn primary";
    btn1.type = "button";

    if (approved) {
      btn1.textContent = "Acessar agora";
      btn1.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        CS.go(pageForProductId(order.product_id));
      }, { passive: false });
    } else {
      btn1.textContent = "Ir para pagamento";
      btn1.disabled = paid;
      btn1.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        CS.go(`pagamento.html?oid=${encodeURIComponent(String(order.id))}`);
      }, { passive: false });
    }

    const btn2 = document.createElement("button");
    btn2.className = "btn";
    btn2.type = "button";
    btn2.disabled = !paid || approved;
    btn2.textContent = approved ? "Acesso liberado" : (paid ? "Aguardando aprovação" : "Aguardando pagamento");

    actions.appendChild(btn1);
    actions.appendChild(btn2);
    card.appendChild(actions);

    return card;
  }

  async function renderOrders(user) {
    const list = $("ordersList");
    const chip = $("ordersChip");
    if (!list) return;

    list.innerHTML = "";
    setText(chip, "carregando");

    if (!user) {
      setText(chip, "deslogado");
      const p = document.createElement("div");
      p.className = "muted";
      p.textContent = "Entre para ver seus acessos.";
      list.appendChild(p);
      return;
    }

    const client = CS.client();
    if (!client) {
      setText(chip, "erro");
      const p = document.createElement("div");
      p.className = "muted";
      p.textContent = "Erro ao iniciar Supabase. Confira config.js.";
      list.appendChild(p);
      return;
    }

    try {
      const { data, error } = await client
        .from("cs_orders")
        .select("id, created_at, product_id, product_name, amount, amount_cents, currency, payment_status, order_status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const arr = Array.isArray(data) ? data : [];
      setText(chip, arr.length ? "ok" : "vazio");

      if (!arr.length) {
        const empty = document.createElement("div");
        empty.className = "muted";
        empty.textContent = "Nenhum pedido encontrado ainda.";
        list.appendChild(empty);
        return;
      }

      arr.forEach((o) => list.appendChild(mountOrderCard(o)));
    } catch (e) {
      console.error("[member] erro ao carregar pedidos", e);
      setText(chip, "erro");
      const p = document.createElement("div");
      p.className = "muted";
      p.textContent = "Falha ao carregar seus acessos. Tenta atualizar a página.";
      list.appendChild(p);
    }
  }

  async function setAdminPill(user) {
    const pill = $("adminPill");
    if (!pill) return;
    pill.style.display = "none";
    if (!user) return;

    const client = CS.client();
    if (!client) return;

    try {
      const { data, error } = await client
        .from("cs_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) return;
      if (data) pill.style.display = "inline-flex";
    } catch {
      // silencioso
    }
  }

  async function boot() {
    const whoChip = $("emailChip");
    const sessionChip = $("sessionChip");
    const btnLogout = $("btnLogout");
    const btnBackProducts = $("btnBackProducts");

    // Voltar
    if (btnBackProducts) {
      btnBackProducts.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        CS.go("products.html");
      }, { passive: false });
    }

    // Logout (click + touch)
    if (btnLogout) {
      const handler = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        btnLogout.disabled = true;
        setText(sessionChip, "saindo...");
        try {
          await CS.logout();
        } catch (err) {
          console.error("[member] logout falhou", err);
        }
        // força UI reset
        window.location.href = new URL("member.html", window.location.href).toString();
      };
      btnLogout.addEventListener("click", handler, { passive: false });
      btnLogout.addEventListener("touchstart", handler, { passive: false });
    }

    // Login / Signup
    const emailInput = $("loginEmail");
    const passInput = $("loginPass");
    const btnLogin = $("btnLogin");
    const btnSignup = $("btnSignup");
    const authMsg = $("authMsg");

    const setAuthMsg = (t) => setText(authMsg, t);

    const getCreds = () => {
      const email = (emailInput?.value || "").trim();
      const pass = (passInput?.value || "").trim();
      return { email, pass };
    };

    const client = CS.client();

    const doLogin = async (create) => {
      const { email, pass } = getCreds();
      if (!email || !pass) {
        setAuthMsg("Preenche e-mail e senha.");
        return;
      }
      if (!client) {
        setAuthMsg("Erro no Supabase (config.js). ");
        return;
      }
      try {
        setAuthMsg(create ? "Criando conta..." : "Entrando...");
        const res = create
          ? await client.auth.signUp({ email, password: pass })
          : await client.auth.signInWithPassword({ email, password: pass });

        if (res.error) throw res.error;
        setAuthMsg("OK!");
      } catch (e) {
        console.error("[member] auth erro", e);
        setAuthMsg("Falha no login. Confere e-mail/senha.");
      }
    };

    if (btnLogin) btnLogin.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      doLogin(false);
    }, { passive: false });

    if (btnSignup) btnSignup.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      doLogin(true);
    }, { passive: false });

    // Estado inicial
    const user = await safeUser();
    log("user inicial", user ? { id: user.id, email: user.email } : null);
    setText(whoChip, user?.email || "—");
    setText(sessionChip, user ? "ativa" : "desligada");
    toggleAuth(!!user);
    await setAdminPill(user);
    await renderInfo(user);
    await renderOrders(user);

    // Redirect pós-login (checkout/pagamento)
    const after = localStorage.getItem("cs_after_login");
    if (after && user) {
      localStorage.removeItem("cs_after_login");
      CS.go(after);
      return;
    }

    // Listener global
    CS.onAuthChange(async (u) => {
      log("auth change", u ? { id: u.id, email: u.email } : null);
      setText(whoChip, u?.email || "—");
      setText(sessionChip, u ? "ativa" : "desligada");
      toggleAuth(!!u);
      await setAdminPill(u);
      await renderInfo(u);
      await renderOrders(u);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    try {
      boot();
    } catch (e) {
      console.error("[member] boot crash", e);
    }
  });
})();

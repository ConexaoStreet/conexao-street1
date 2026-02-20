// vault.js — páginas protegidas de fornecedores (vip/final/lojista)
// Regras:
// - precisa estar logado (Supabase Auth)
// - precisa ter pedido APROVADO para o produto correspondente
// - lista vem de data/providers_<kind>.json (fallback: links.json)
(() => {
  "use strict";

  const DEBUG = true;
  const log = (...a) => DEBUG && console.log("[vault]", ...a);
  const warn = (...a) => DEBUG && console.warn("[vault]", ...a);

  const $ = (id) => document.getElementById(id);

  const KIND_MAP = {
    vip: { title: "Grupo VIP", file: "data/providers_vip.json", product_id: "vip" },
    lojista: { title: "Fornecedores Lojistas", file: "data/providers_lojista.json", product_id: "lojista" },
    final: { title: "Fornecedores Consumidor Final", file: "data/providers_final.json", product_id: "final" },
  };

  function safeGo(path) {
    try {
      const url = new URL(path, window.location.href);
      window.location.href = url.toString();
    } catch {
      window.location.href = path;
    }
  }

  function setChip(id, text) {
    const el = $(id);
    if (el) el.textContent = String(text ?? "");
  }

  function showMsg(title, desc, primaryText, primaryHref) {
    const box = $("vaultMsg");
    if (!box) return;
    box.innerHTML = "";

    const h = document.createElement("b");
    h.textContent = title;
    const p = document.createElement("div");
    p.className = "muted";
    p.style.marginTop = "6px";
    p.textContent = desc;

    box.appendChild(h);
    box.appendChild(p);

    if (primaryText && primaryHref) {
      const a = document.createElement("a");
      a.className = "btn primary";
      a.style.marginTop = "12px";
      a.href = primaryHref;
      a.textContent = primaryText;
      a.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          safeGo(primaryHref);
        },
        { passive: false }
      );
      box.appendChild(a);
    }
  }

  async function getUserOrWait() {
    // Em alguns celulares o getSession pode demorar alguns ms para hidratar.
    // Faz 2 tentativas rápidas antes de desistir.
    for (let i = 0; i < 2; i++) {
      const u = await CS.user();
      if (u) return u;
      await new Promise((r) => setTimeout(r, 120));
    }
    return null;
  }

  async function hasApprovedAccess(client, userId, productId) {
    const { data, error } = await client
      .from("cs_orders")
      .select("id, product_id, payment_status, order_status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    return rows.some((o) => {
      const pid = String(o.product_id || "");
      const paid = String(o.payment_status || "").toUpperCase() === "PAGO";
      const ok = String(o.order_status || "").toUpperCase() === "APROVADO";
      return pid === productId && paid && ok;
    });
  }

  async function loadProvidersJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Falha ao carregar ${path} (${res.status})`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error(`${path} inválido (esperado array)`);
    return data;
  }

  function normalizeLinks(data) {
    // suporta:
    // - array de {name, url}
    // - array de {title, href}
    // - array de strings
    return (Array.isArray(data) ? data : []).map((x, idx) => {
      if (typeof x === "string") return { name: `Link ${idx + 1}`, url: x };
      const name = String(x?.name || x?.title || x?.label || `Link ${idx + 1}`);
      const url = String(x?.url || x?.href || x?.link || "");
      return { name, url };
    });
  }

  function renderGrid(items) {
    const grid = $("providersGrid");
    if (!grid) return;
    grid.innerHTML = "";

    const safe = normalizeLinks(items).filter((x) => x.url && /^https?:\/\//i.test(x.url));

    if (safe.length === 0) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "Nenhum fornecedor encontrado ainda.";
      grid.appendChild(empty);
      return;
    }

    safe.forEach((it) => {
      const a = document.createElement("a");
      a.className = "linkRow";
      a.href = it.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = it.name;
      grid.appendChild(a);
    });
  }

  async function boot() {
    const kind = String(window.__VAULT_KIND__ || "").toLowerCase();
    const meta = KIND_MAP[kind];
    if (!meta) return; // não é página de vault

    log("boot", { kind });

    // labels
    const title = $("vaultTitle");
    if (title) title.textContent = meta.title;
    setChip("vaultKindChip", kind.toUpperCase());
    setChip("vaultStatusChip", "carregando");

    // precisa de CS
    if (!window.CS || !CS.client) {
      setChip("vaultStatusChip", "erro");
      showMsg("Erro", "CS/ui.js não carregou. Verifique a ordem dos scripts.", "Voltar", "index.html");
      return;
    }

    const client = CS.client();
    if (!client) {
      setChip("vaultStatusChip", "erro");
      showMsg("Erro", "Supabase não configurado (config.js).", "Ir para Área do Membro", "member.html");
      return;
    }

    // auth
    const user = await getUserOrWait();
    if (!user) {
      setChip("vaultStatusChip", "deslogado");
      showMsg(
        "Você precisa entrar",
        "Faça login na Área do Membro para acessar esta lista.",
        "Ir para Área do Membro",
        "member.html#login"
      );
      return;
    }

    // permissão (orders)
    try {
      const ok = await hasApprovedAccess(client, user.id, meta.product_id);
      if (!ok) {
        setChip("vaultStatusChip", "sem acesso");
        showMsg(
          "Acesso não liberado",
          "Seu pedido ainda não foi aprovado para esta lista. Confira em “Seus acessos”.",
          "Ver meus acessos",
          "member.html"
        );
        return;
      }
    } catch (e) {
      warn("RLS/SELECT cs_orders falhou", e);
      setChip("vaultStatusChip", "erro");
      showMsg(
        "Erro ao verificar acesso",
        "Não foi possível ler seus pedidos. Verifique as policies (RLS) do Supabase para cs_orders (SELECT do próprio usuário).",
        "Voltar",
        "member.html"
      );
      return;
    }

    // carrega lista
    try {
      let items = await loadProvidersJson(meta.file);
      setChip("vaultStatusChip", "ok");
      renderGrid(items);
      const msg = $("vaultMsg");
      if (msg) msg.innerHTML = "";
    } catch (e1) {
      warn("providers json falhou, tentando links.json", e1);
      try {
        const fallback = await loadProvidersJson("links.json");
        setChip("vaultStatusChip", "ok");
        renderGrid(fallback);
        const msg = $("vaultMsg");
        if (msg) {
          msg.innerHTML = "";
          const small = document.createElement("div");
          small.className = "muted";
          small.style.marginTop = "10px";
          small.textContent = "(Fallback: links.json)";
          msg.appendChild(small);
        }
      } catch (e2) {
        warn("fallback links.json falhou", e2);
        setChip("vaultStatusChip", "erro");
        showMsg(
          "Erro ao carregar a lista",
          "Não achei o arquivo da lista. Confirme se data/providers_*.json existe no repo.",
          "Voltar",
          "member.html"
        );
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    boot().catch((e) => warn("boot crashed", e));
  });
})();

// script.js — UI-only (menu mobile, toasts, ripple, scroll suave, enrich cards)
// Regras: não altera rotas nem lógica do sistema; apenas melhora UI/UX.
(() => {
  "use strict";

  const $ = (q, root=document) => root.querySelector(q);
  const $$ = (q, root=document) => Array.from(root.querySelectorAll(q));

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg){
    const el = document.getElementById("toast");
    if(!el) return;
    el.textContent = String(msg || "");
    el.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("on"), 1600);
  }

  // ---------- Smooth scroll ----------
  function wireSmoothScroll(){
    $$('a[data-scroll], a[href^="#"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        const href = a.getAttribute("href") || "";
        if(!href.startsWith("#")) return;
        const id = href.slice(1);
        const target = document.getElementById(id);
        if(!target) return;
        e.preventDefault();
        try{ target.scrollIntoView({ behavior:"smooth", block:"start" }); }
        catch{ target.scrollIntoView(); }
      }, { passive:false });
    });
  }

  // ---------- Ripple (subtle) ----------
  function wireRipples(){
    const add = (el) => {
      el.addEventListener("pointerdown", (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left);
        const y = (e.clientY - r.top);

        const s = document.createElement("span");
        s.className = "ripple";
        s.style.left = x + "px";
        s.style.top = y + "px";
        el.appendChild(s);

        setTimeout(() => s.remove(), 650);
      }, { passive:true });
    };

    $$("[data-ripple], .hasRipple").forEach(add);
    // também para botões de compra gerados pelo products.js
    const grid = document.getElementById("productsGrid");
    if(grid){
      const mo = new MutationObserver(() => {
        $$(".pbtn", grid).forEach((b) => {
          if(b.dataset.rippleWired) return;
          b.dataset.rippleWired = "1";
          b.classList.add("hasRipple");
          add(b);
        });
      });
      mo.observe(grid, { childList:true, subtree:true });
    }
  }

  // ---------- Mobile menu ----------
  function wireMobileMenu(){
    const btn = document.getElementById("menuBtn");
    const back = document.getElementById("mobileMenuBack");
    const menu = document.getElementById("mobileMenu");
    const close = document.getElementById("menuClose");

    if(!btn || !back || !menu || !close) return;

    const open = () => {
      menu.hidden = false;
      back.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => {
        menu.classList.add("on");
        back.classList.add("on");
      });
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      close.focus({ preventScroll:true });
    };

    const shut = () => {
      menu.classList.remove("on");
      back.classList.remove("on");
      btn.setAttribute("aria-expanded", "false");
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      setTimeout(() => {
        menu.hidden = true;
        back.hidden = true;
        btn.focus({ preventScroll:true });
      }, 180);
    };

    btn.addEventListener("click", (e) => { e.preventDefault(); open(); }, { passive:false });
    close.addEventListener("click", (e) => { e.preventDefault(); shut(); }, { passive:false });
    back.addEventListener("click", shut);

    document.addEventListener("keydown", (e) => {
      if(e.key === "Escape" && !menu.hidden) shut();
    });
  }

  // ---------- Enrich product cards (pure UI) ----------
  async function enrichCards(){
    const grid = document.getElementById("productsGrid");
    if(!grid) return;

    let catalog = null;
    try{
      const r = await fetch("./products.json", { cache:"no-store" });
      if(r.ok){
        const d = await r.json();
        if(Array.isArray(d)) catalog = d;
      }
    }catch{}

    const META = {
      "vip-lojista": {
        badge: "Curadoria • Atualizações • VIP",
        micro: "Acesso após aprovação • Pagamento Pix seguro"
      },
      "consumidor-final": {
        badge: "Padrão acima do comum",
        micro: "Acesso após aprovação • Pagamento Pix seguro"
      },
      "grupo-vip": {
        badge: "Networking • Prioridade",
        micro: "Liberação após confirmação • Pix seguro"
      },
      "css-importados": {
        badge: "Importados premium",
        micro: "Acesso após aprovação • Pix seguro"
      }
    };

    const doEnhance = () => {
      const cards = $$(".provItem", grid);
      if(!cards.length) return;

      cards.forEach((card) => {
        if(card.dataset.enriched) return;
        card.dataset.enriched = "1";

        const title = $(".ptitle", card);
        const price = $(".psub", card);
        const btn = $(".pbtn", card);

        // cria wrapper
        const body = $(".pbody", card);
        if(!body || !title || !btn) return;

        // tenta identificar pelo catálogo (match por nome)
        let key = null;
        if(catalog){
          const name = (title.textContent || "").trim();
          const item = catalog.find(x => String(x.name||"").trim() === name) || null;
          if(item && item.id) key = String(item.id);
        }

        const meta = META[key] || { badge:"Acesso premium", micro:"Acesso após aprovação • Pix seguro" };

        // Badge
        const badge = document.createElement("div");
        badge.className = "badgeLux" + (key === "vip-lojista" ? " badgeVip" : "");
        badge.textContent = meta.badge;

        // Desc
        const desc = document.createElement("div");
        desc.className = "descLux";
        if(catalog && key){
          const item = catalog.find(x => String(x.id||"") === key);
          desc.textContent = (item && item.description) ? String(item.description) : "";
        }

        // Micro trust
        const micro = document.createElement("div");
        micro.className = "microLux";
        micro.textContent = meta.micro;

        // Icon chip
        const icon = document.createElement("div");
        icon.className = "iconLux";
        icon.setAttribute("aria-hidden", "true");

        // Reorder content: icon + badge before title
        body.insertBefore(icon, title);
        body.insertBefore(badge, title);

        if(desc.textContent) body.insertBefore(desc, btn);
        body.insertBefore(micro, btn);

        // Price accent
        if(price) price.classList.add("priceLux");

        // button styling hook
        btn.classList.add("btnBuyLux");
        btn.setAttribute("aria-label", "Comprar " + (title.textContent || "produto"));

        // toast on click (capture so we don't touch existing handler)
        btn.addEventListener("click", () => showToast("Redirecionando pro checkout…"), { capture:true });
      });
    };

    // Observe dynamic rendering
    const mo = new MutationObserver(() => doEnhance());
    mo.observe(grid, { childList:true, subtree:true });

    // run once (in case already rendered)
    doEnhance();
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireSmoothScroll();
    wireMobileMenu();
    wireRipples();
    enrichCards().catch(() => {});
  });
})();

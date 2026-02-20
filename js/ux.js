// js/ux.js — UI/UX enhancements (NO backend/auth/data changes)
// - ripple on primary buttons
// - mobile menu overlay (clones existing .pills)
// - skeleton loaders for grids
// - smooth scroll for internal links
(() => {
  "use strict";

  const $ = (q, root=document) => root.querySelector(q);

  function on(el, ev, fn, opts){ if(el) el.addEventListener(ev, fn, opts||false); }

  // ---------- Ripple ----------
  function addRipple(el){
    if(!el || el.__hasRipple) return;
    el.__hasRipple = true;

    on(el, "pointerdown", (e) => {
      if(el.disabled) return;
      // ignore right-click / secondary buttons
      if(e.button != null && e.button !== 0) return;

      const r = el.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 1.2;
      const x = (e.clientX || (r.left + r.width/2)) - r.left - size/2;
      const y = (e.clientY || (r.top + r.height/2)) - r.top - size/2;

      const s = document.createElement("span");
      s.className = "csRipple";
      s.style.width = s.style.height = size + "px";
      s.style.left = x + "px";
      s.style.top  = y + "px";

      // remove old ripples quickly
      const olds = el.querySelectorAll(".csRipple");
      if(olds.length > 2) olds.forEach(o => o.remove());

      el.appendChild(s);
      s.addEventListener("animationend", () => s.remove(), { once:true });
    }, { passive:true });
  }

  function wireRipples(){
    const sel = [
      "button.btn","button.btn2","button.pbtn","button.csTab","button.adminMiniBtn",
      "a.btn","a.btn2","a.pill","a.pbtn",".pill[role='button']"
    ].join(",");
    document.querySelectorAll(sel).forEach(addRipple);
  }

  // ---------- Smooth scroll (safe) ----------
  function wireSmoothScroll(){
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      on(a, "click", (e) => {
        const href = a.getAttribute("href") || "";
        if(href.length < 2) return;
        const id = href.slice(1);
        const target = document.getElementById(id);
        if(!target) return;
        e.preventDefault();
        try{
          target.scrollIntoView({ behavior:"smooth", block:"start" });
        }catch{
          target.scrollIntoView();
        }
      }, { passive:false });
    });
  }

  // ---------- Mobile menu overlay ----------
  function ensureNavForBar(bar){
    if(!bar) return;
    if(bar.querySelector(".navToggle")) return;

    const pills = bar.querySelector(".pills");
    const btn = document.createElement("button");
    btn.className = "navToggle";
    btn.type = "button";
    btn.setAttribute("aria-label", "Menu");
    btn.innerHTML = "☰";
    bar.appendChild(btn);

    // Overlay elements (singletons)
    let back = document.getElementById("csNavBack");
    let panel = document.getElementById("csNavPanel");
    if(!back){
      back = document.createElement("div");
      back.id = "csNavBack";
      back.className = "csNavBack";
      document.body.appendChild(back);
    }
    if(!panel){
      panel = document.createElement("div");
      panel.id = "csNavPanel";
      panel.className = "csNavPanel";
      panel.innerHTML = `
        <div class="csNavHead">
          <b>Menu</b>
          <button class="csNavClose" id="csNavClose" type="button" aria-label="Fechar">✕</button>
        </div>
        <div class="csNavList" id="csNavList"></div>
      `;
      document.body.appendChild(panel);
    }

    const list = document.getElementById("csNavList");
    const closeBtn = document.getElementById("csNavClose");

    const close = () => {
      back.classList.remove("on");
      panel.classList.remove("on");
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };

    const open = () => {
      if(!list) return;
      list.innerHTML = "";

      // Clone pills
      if(pills){
        pills.querySelectorAll("a,button").forEach((node) => {
          const clone = node.cloneNode(true);
          // normalize to pill style
          if(clone.classList) clone.classList.add("pill");
          clone.style.display = "inline-flex";
          clone.style.width = "100%";
          clone.style.justifyContent = "space-between";
          list.appendChild(clone);
          addRipple(clone);
        });
      }

      back.classList.add("on");
      panel.classList.add("on");
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    };

    on(btn, "click", open);
    on(back, "click", close);
    on(closeBtn, "click", close);
    on(document, "keydown", (e) => { if(e.key === "Escape") close(); });

    // Close if user clicks a link inside the panel
    on(panel, "click", (e) => {
      const t = e.target;
      if(t && (t.tagName === "A" || t.closest("a"))) close();
    });
  }

  function wireMobileNav(){
    document.querySelectorAll(".bar").forEach(ensureNavForBar);
  }

  // ---------- Skeletons ----------
  function makeSkelCard(){
    const c = document.createElement("div");
    c.className = "csSkel";
    c.innerHTML = `
      <div class="csSkelTop"></div>
      <div class="csSkelBody">
        <div class="csSkelLine w60"></div>
        <div class="csSkelLine w40"></div>
        <div class="csSkelLine"></div>
        <div class="csSkelBtn"></div>
      </div>
    `;
    return c;
  }

  function wireSkeletonGrid(gridId, count=6){
    const grid = document.getElementById(gridId);
    if(!grid) return;

    const add = () => {
      if(grid.__skelOn) return;
      if(grid.children && grid.children.length) return;
      grid.__skelOn = true;
      for(let i=0;i<count;i++) grid.appendChild(makeSkelCard());
    };

    const clear = () => {
      if(!grid.__skelOn) return;
      // remove only skeletons
      const skels = Array.from(grid.querySelectorAll(".csSkel"));
      if(!skels.length) return;
      skels.forEach(s => s.remove());
      grid.__skelOn = false;
    };

    // initial
    add();

    // observe for real content
    const obs = new MutationObserver(() => {
      // if any non-skeleton child exists, clear
      const non = Array.from(grid.children).find(n => !n.classList || !n.classList.contains("csSkel"));
      if(non){
        clear();
        obs.disconnect();
      }
    });
    obs.observe(grid, { childList:true });
  }

  // ---------- Boot ----------
  function boot(){
    wireRipples();
    wireSmoothScroll();
    wireMobileNav();

    // common grids
    wireSkeletonGrid("productsGrid", 6);
    wireSkeletonGrid("providersGrid", 6);

    // in case elements are rendered later
    const mo = new MutationObserver(() => wireRipples());
    mo.observe(document.body, { childList:true, subtree:true });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
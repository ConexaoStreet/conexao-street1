// app.js — menu do avatar (overlay) + loader + rotas (GitHub Pages safe)
(() => {
  "use strict";

  function $(id){ return document.getElementById(id); }

  // navegação segura no GitHub Pages (resolve subpath)
  function go(path){
    const url = new URL(path, window.location.href);
    window.location.href = url.toString();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const loader = $("loader");
    if(loader) setTimeout(() => loader.classList.add("off"), 250);

    const avatarBtn = $("avatarBtn");
    const menuOverlay = $("menuOverlay");
    if(!avatarBtn || !menuOverlay) return;

    function openMenu(){
      menuOverlay.classList.add("on");
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    }

    function closeMenu(){
      menuOverlay.classList.remove("on");
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }

    function toggleMenu(){
      if(menuOverlay.classList.contains("on")) closeMenu();
      else openMenu();
    }

    avatarBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    }, { passive:false });

    menuOverlay.addEventListener("click", (e) => {
      if(e.target === menuOverlay) closeMenu();
    });

    document.addEventListener("keydown", (e) => {
      if(e.key === "Escape") closeMenu();
    });

    const routes = {
      miAdmin:  "admin.html",
      miAdminP: "admin-p.html",
      miMember: "member.html",
      miLogout: "index.html"
    };

    Object.keys(routes).forEach((id) => {
      const el = $(id);
      if(!el) return;
      el.addEventListener("click", (e) => {
        e.preventDefault();
        closeMenu();
        setTimeout(() => go(routes[id]), 60);
      }, { passive:false });
    });
  });
})();

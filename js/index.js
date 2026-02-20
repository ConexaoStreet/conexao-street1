(() => {
"use strict";

function $(id){ return document.getElementById(id); }

document.addEventListener("DOMContentLoaded", async () => {
  // Admin pill toggle
  try{
    const pill = $("adminPill");
    if(pill){
      const ok = await CS.isAdmin();
      pill.style.display = ok ? "inline-flex" : "none";
    }
  }catch{}

  // Home buttons
  const goProducts = $("goProducts");
  const goMember   = $("goMember");
  const goSecurity = $("goSecurity");
  const secBox     = $("securityBox");

  if(goProducts) goProducts.addEventListener("click", (e)=>{
    e.preventDefault();
    CS.go("products.html");
  }, {passive:false});

  if(goMember) goMember.addEventListener("click", (e)=>{
    e.preventDefault();
    CS.go("member.html#login");
  }, {passive:false});

  if(goSecurity) goSecurity.addEventListener("click", (e)=>{
    e.preventDefault();
    if(!secBox) return;
    const on = secBox.style.display !== "none";
    secBox.style.display = on ? "none" : "block";
  }, {passive:false});
});
})();
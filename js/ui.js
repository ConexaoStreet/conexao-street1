(() => {
"use strict";
const cfg=window.APP_CONFIG||{};
const SUPABASE_URL=cfg.SUPABASE_URL;
const SUPABASE_ANON_KEY=cfg.SUPABASE_ANON_KEY;

// Singleton do cliente (evita criar vários clients e ajuda a manter estado da sessão)
let _sb=null;
let _session=null;
let _authWired=false;
const _authListeners=new Set();

function $(id){return document.getElementById(id);}
function toast(msg, ok=true){
  const el=$("toast");
  if(!el) return;
  el.textContent=msg;
  el.style.borderColor= ok ? "rgba(36,209,141,.40)" : "rgba(255,59,92,.40)";
  el.style.background= ok ? "rgba(36,209,141,.10)" : "rgba(255,59,92,.10)";
  el.classList.add("on");
  clearTimeout(toast._t);
  toast._t=setTimeout(()=>el.classList.remove("on"),2400);
}

function go(path){
  const url=new URL(path, window.location.href);
  window.location.href=url.toString();
}

function moneyBRL(v){
  const n = Number(v||0);
  try{ return n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
  catch{ return ("R$ "+n.toFixed(2)).replace(".",","); }
}
function moneyFromCents(cents){
  return moneyBRL(Number(cents||0)/100);
}
function qs(name){return new URL(window.location.href).searchParams.get(name);}

function popEnsure(){
  if($("csPopBack")) return;
  const back=document.createElement("div");
  back.id="csPopBack";
  back.className="csPopBack";
  const pop=document.createElement("div");
  pop.id="csPop";
  pop.className="csPop";
  pop.innerHTML = `
    <div class="csPopHead">
      <b id="csPopTitle">Aviso</b>
      <button class="csPopX" id="csPopClose" type="button">✕</button>
    </div>
    <div class="csPopBody">
      <p id="csPopMsg"></p>
      <div class="csPopActions" id="csPopActions"></div>
    </div>
  `;
  document.body.appendChild(back);
  document.body.appendChild(pop);
  const close=()=>{back.classList.remove("on"); pop.classList.remove("on");};
  back.addEventListener("click", close);
  pop.querySelector("#csPopClose").addEventListener("click", close);
  document.addEventListener("keydown",(e)=>{if(e.key==="Escape") close();});
}

function showPopup({title="Aviso", msg="", actions=[]}){
  popEnsure();
  const back=$("csPopBack");
  const pop=$("csPop");
  $("csPopTitle").textContent=title;
  $("csPopMsg").textContent=msg;
  const box=$("csPopActions");
  box.innerHTML="";
  actions.forEach(a=>{
    const el=a.href?document.createElement("a"):document.createElement("button");
    if(a.href){el.href=a.href; el.target=a.target||"_blank"; el.rel="noopener";}
    el.className=a.primary?"btn":"btn2";
    el.textContent=a.label||"Ok";
    if(!a.href) el.type="button";
    if(a.onClick && !a.href) el.addEventListener("click", a.onClick);
    box.appendChild(el);
  });
  back.classList.add("on");
  pop.classList.add("on");
}

function canDo(key, seconds){
  try{
    const now=Date.now();
    const k="cs_cd_"+key;
    const last=Number(localStorage.getItem(k)||"0");
    if(now-last < seconds*1000) return false;
    localStorage.setItem(k,String(now));
    return true;
  }catch{return true;}
}

function client(){
  if(!window.supabase) throw new Error("SDK do Supabase não carregou");
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Faltou configurar SUPABASE_URL/ANON_KEY");

  if(_sb) return _sb;
  _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Mantém uma cópia local da sessão + dispara listeners
  if(!_authWired){
    _authWired=true;
    try{
      _sb.auth.getSession().then(({data})=>{ _session=data?.session||null; _authListeners.forEach(fn=>{try{fn(_session);}catch{}}); });
    }catch{}
    try{
      _sb.auth.onAuthStateChange((_evt, session)=>{
        _session=session||null;
        _authListeners.forEach(fn=>{try{fn(_session);}catch{}});
      });
    }catch{}
  }

  return _sb;
}

async function me(){
  try{
    const s=client();

    // caminho rápido
    if(_session?.user) return _session.user;

    const {data}=await s.auth.getUser();
    return data?.user||null;
  }catch{
    return null;
  }
}

async function session(){
  try{
    const s=client();
    if(_session) return _session;
    const {data}=await s.auth.getSession();
    _session=data?.session||null;
    return _session;
  }catch{
    return null;
  }
}

function onAuth(fn){
  if(typeof fn!=="function") return ()=>{};
  _authListeners.add(fn);
  // dispara imediatamente (se já tiver sessão)
  try{ fn(_session); }catch{}
  return ()=>_authListeners.delete(fn);
}

async function isAdmin(){
  try{
    const s=client();

    // Prefer RPC (works better with RLS)
    try{
      const r=await s.rpc("cs_is_admin");
      if(!r.error && typeof r.data === "boolean") return r.data;
    }catch{}

    const u=await me();
    if(!u) return false;

    const {data,error}=await s.from("cs_admins").select("user_id").eq("user_id",u.id).maybeSingle();
    if(error) return false;
    return !!data;
  }catch{return false;}
}

async function log(event_type, meta={}){
  try{
    const s=client();
    const u=await me();
    const payload={
      event_type:String(event_type||"event"),
      meta:meta||{},
      user_id:u?u.id:null,
      user_email:u?u.email:null,
      page:location.pathname+location.search,
      ua:navigator.userAgent
    };
    await s.from("cs_logs").insert(payload);
  }catch{}
}

async function requireAdminOrRedirect(redirectTo){
  const ok = await isAdmin();
  if(ok) return true;
  toast("Acesso negado");
  setTimeout(()=>go(redirectTo||"index.html"), 120);
  return false;
}

function openGmail(){
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  const href=isIOS ? "googlegmail://": "intent://gmail/#Intent;scheme=googlegmail;package=com.google.android.gm;end";
  try{ window.location.href=href; }catch{}
}

window.CS = {
  // sessão/usuário
  user: me,
  me,
  session,
  onAuth,
  go,
  cfg:{SUPABASE_URL, SUPABASE_ANON_KEY},
  client, qs, toast, showPopup, canDo, me, isAdmin, requireAdminOrRedirect, log, openGmail,
  moneyBRL,
  moneyFromCents
};



document.addEventListener("DOMContentLoaded", async () => {
  const loader = document.getElementById("loader");
  if (loader) setTimeout(() => loader.classList.add("off"), 250);

  // toggle Admin button (if present in header)
  try{
    const pill = document.getElementById("adminPill");
    if(pill){
      const ok = await isAdmin();
      pill.style.display = ok ? "inline-flex" : "none";
    }
  }catch{}
});
})();
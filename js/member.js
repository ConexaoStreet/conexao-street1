(() => {
"use strict";
const $=id=>document.getElementById(id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function deviceId(){
  try{
    let v=localStorage.getItem("cs_device_id");
    if(!v){
      v = (crypto?.randomUUID ? crypto.randomUUID() : ("dev_"+Math.random().toString(16).slice(2)+Date.now()));
      localStorage.setItem("cs_device_id", v);
    }
    return v;
  }catch{
    return "dev_"+Math.random().toString(16).slice(2)+Date.now();
  }
}

function setLoggedUI(user){
  const chip=$("sessChip");
  const email=$("accEmail");
  const boxIn=$("boxIn");
  const boxOut=$("boxOut");
  if(user){
    chip && (chip.textContent="logado");
    email && (email.textContent=user.email||"");
    boxIn && (boxIn.style.display="none");
    boxOut && (boxOut.style.display="block");
  }else{
    chip && (chip.textContent="deslogado");
    email && (email.textContent="");
    boxIn && (boxIn.style.display="block");
    boxOut && (boxOut.style.display="none");
  }
}

function badge(st){
  const s=String(st||"").toLowerCase();
  if(s==="aprovado"||s==="approved") return `<span class="badge ok">APROVADO</span>`;
  if(s==="pago"||s==="paid") return `<span class="badge ok">PAGO</span>`;
  if(s==="pendente"||s==="criado") return `<span class="badge warn">${String(st||"").toUpperCase()}</span>`;
  return `<span class="badge">${String(st||"").toUpperCase()}</span>`;
}

async function enforceDevice(s, user){
  const did=deviceId();
  const {data, error}=await s.from("cs_user_devices").select("device_id").eq("user_id", user.id).maybeSingle();
  if(error) return true;
  if(!data){
    const {error:insErr}=await s.from("cs_user_devices").insert({user_id:user.id, device_id:did});
    if(insErr) return true;
    await CS.log("device_bind", {device_id:did});
    return true;
  }
  if(String(data.device_id||"")!==String(did)){
    CS.toast("Conta vinculada a outro dispositivo. Peça liberação ao admin.", false);
    await CS.log("device_block", {device_id:did, bound_device_id:data.device_id});
    await s.auth.signOut();
    return false;
  }
  return true;
}

async function loadInfo(){
  const s=CS.client();
  const u=(await s.auth.getUser()).data?.user;
  const box=$("infoBox");
  const chip=$("infoChip");
  if(!box) return;
  if(!u){ box.innerHTML=""; chip && (chip.textContent="—"); return; }
  chip && (chip.textContent="ok");
  const did=deviceId();
  const parts=[
    ["Email", u.email||""],
    ["User ID", u.id||""],
    ["Criado em", u.created_at? new Date(u.created_at).toLocaleString("pt-BR") : ""],
    ["Dispositivo", did],
    ["Provider", (u.app_metadata && u.app_metadata.provider) ? u.app_metadata.provider : ""]
  ];
  box.innerHTML = parts.map(([k,v])=>`<div class="row"><b>${k}</b><br/><small style="color:rgba(255,255,255,.70)">${String(v||"")}</small></div>`).join("");
}

async function loadMyOrders(){
  const s=CS.client();
  const u=(await s.auth.getUser()).data?.user;
  const list=$("list");
  if(!list) return;
  list.innerHTML="";
  if(!u){
    $("statusChip") && ($("statusChip").textContent="faça login");
    return;
  }
  $("statusChip") && ($("statusChip").textContent="carregando");
  const {data, error}=await s.from("cs_orders")
    .select("id,created_at,product_id,product_name,amount,amount_cents,currency,payment_status,order_status,status")
    .eq("user_id", u.id)
    .order("created_at",{ascending:false})
    .limit(50);
  if(error){
    $("statusChip") && ($("statusChip").textContent="erro");
    CS.toast("Erro ao carregar pedidos", false);
    await CS.log("orders_load_error", {code:error.code, message:error.message});
    return;
  }
  $("statusChip") && ($("statusChip").textContent=(data?.length? "ok":"vazio"));
  (data||[]).forEach(o=>{
    const pid=o.product_name||o.product_id||"";
    const st=o.order_status||o.status||"";
    const pay=o.payment_status||"";
    const row=document.createElement("div");
    row.className="row";
    const val = (o.amount_cents!=null && Number(o.amount_cents)>0)
      ? (Number(o.amount_cents)/100).toLocaleString("pt-BR",{style:"currency",currency:o.currency||"BRL"})
      : (Number(o.amount||0)).toLocaleString("pt-BR",{style:"currency",currency:o.currency||"BRL"});
    row.innerHTML = `<b>#${o.id}</b> — ${pid}<br/><small style="color:rgba(255,255,255,.70)">${new Date(o.created_at).toLocaleString("pt-BR")}</small>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      ${badge(pay||"PENDENTE")} ${badge(st||"CRIADO")} <span class="badge">${val}</span>
    </div>`;
    list.appendChild(row);
  });
}

async function init(){
  const s=CS.client();
  const {data:auth}=await s.auth.getUser();
  const user=auth?.user||null;
  setLoggedUI(user);
  await loadInfo();
  if(user){
    const ok=await enforceDevice(s, user);
    if(ok){ await loadInfo(); await loadMyOrders(); }
  }

  $("goShop")?.addEventListener("click", ()=>location.href="./products.html");

  $("btnLogout")?.addEventListener("click", async ()=>{
    await CS.log("logout");
    await s.auth.signOut();
    setLoggedUI(null);
    await loadInfo();
    await loadMyOrders();
    CS.toast("Saiu");
  });

  $("btnLogin")?.addEventListener("click", async ()=>{
    const email=String($("email")?.value||"").trim();
    const password=String($("password")?.value||"").trim();
    if(!email || !password){CS.toast("Preencha e-mail e senha", false);return;}
    if(!CS.canDo("login", 2)){CS.toast("Aguarde um pouco…", false);return;}
    const {data, error}=await s.auth.signInWithPassword({email,password});
    if(error){
      const msg=String(error.message||"");
      if(msg.toLowerCase().includes("invalid login credentials") || error.code==="invalid_credentials"){
        CS.toast("E-mail ou senha incorretos.", false);
      }else{
        CS.toast("Falha no login.", false);
      }
      await CS.log("login_error", {code:error.code, message:error.message});
      return;
    }
    setLoggedUI(data.user);
    const ok=await enforceDevice(s, data.user);
    if(ok){
      CS.toast("Logado ✅");
      await CS.log("login");
      await loadInfo();
      await loadMyOrders();
    }
  });

  $("btnSignup")?.addEventListener("click", async ()=>{
    const email=String($("email")?.value||"").trim();
    const password=String($("password")?.value||"").trim();
    if(!email || !password){CS.toast("Preencha e-mail e senha", false);return;}
    if(!CS.canDo("signup", 5)){CS.toast("Aguarde 5s para tentar de novo…", false);return;}
    const {data, error}=await s.auth.signUp({email,password});
    if(error){
      const m=String(error.message||"");
      if(m.toLowerCase().includes("rate limit") || error.code==="over_email_send_rate_limit"){
        CS.showPopup({
          title:"Limite de tentativas",
          msg:"Você tentou criar/confirmar muitas vezes. Aguarde alguns minutos e tente novamente.",
          actions:[
            {label:"Abrir Gmail", primary:true, onClick:()=>CS.openGmail()},
            {label:"Ok"}
          ]
        });
      }else{
        CS.toast("Falha ao criar conta.", false);
      }
      await CS.log("signup_error", {code:error.code, message:error.message});
      return;
    }
    await CS.log("signup", {email});
    CS.showPopup({
      title:"Confirme no seu e-mail",
      msg:"Enviamos um link de confirmação. Abra o Gmail e confirme sua conta para conseguir entrar.",
      actions:[
        {label:"Abrir Gmail", primary:true, onClick:()=>CS.openGmail()},
        {label:"Fechar"}
      ]
    });
    await sleep(800);
  });
}

document.addEventListener("DOMContentLoaded", ()=>{
  try{ init(); }catch(e){ console.warn(e); }
});
})();
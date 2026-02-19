(() => {
"use strict";
const $=q=>document.querySelector(q);

function money(cents){
  const v=Number(cents||0)/100;
  try{return v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}catch{return "R$ "+v.toFixed(2).replace(".",",");}
}

function card(p){
  const el=document.createElement("div");
  el.className="provItem";
  const img = p.image_url ? `<img class="pimg" src="${p.image_url}" alt="">` : `<div class="pimg" style="background:rgba(255,255,255,.04)"></div>`;
  el.innerHTML = `
    ${img}
    <div class="pbody">
      <div class="ptitle">${p.name||"Produto"}</div>
      <div class="psub">${money(p.price_cents||0)}</div>
      <button class="pbtn" type="button">Comprar</button>
    </div>
  `;
  el.querySelector("button").addEventListener("click", ()=>{
    try{ CS.log("product_click", {product_id:p.product_id}); }catch{} CS.go(`checkout.html?id=${encodeURIComponent(p.product_id)}`);
  });
  return el;
}

async function loadFromSupabase(){
  try{
    const s=CS.client();
    const {data,error}=await s.from("cs_products")
      .select("product_id,name,price_cents,image_url,is_active")
      .eq("is_active", true)
      .order("created_at",{ascending:true})
      .limit(60);
    if(error) return null;
    if(!data || !data.length) return [];
    return data;
  }catch{
    return null;
  }
}

async function loadFromJson(){
  const res=await fetch("./products.json",{cache:"no-store"});
  if(!res.ok) return [];
  const arr=await res.json();
  if(!Array.isArray(arr)) return [];
  return arr.map(x=>({
    product_id:String(x.id||""),
    name:String(x.name||"Produto"),
    price_cents: Number(x.price_cents ?? (Number(x.price||0)*100)),
    image_url: x.image_url || x.image || ""
  }));
}

async function init(){
  const grid=$("#productsGrid");
  if(!grid) return;
  grid.innerHTML="";
  let items = await loadFromSupabase();
  // Se Supabase falhar (null) OU vier vazio, usa o catálogo local.
  if(items===null || (Array.isArray(items) && items.length===0)) items = await loadFromJson();
  items.forEach(p=>grid.appendChild(card(p)));
}

document.addEventListener("DOMContentLoaded", ()=>{init().catch(()=>{});});
})();
(() => {
  "use strict";

  const $ = (q) => document.querySelector(q);

  function money(cents){
    const v = Number(cents || 0) / 100;
    try{ return v.toLocaleString("pt-BR", { style:"currency", currency:"BRL" }); }
    catch{ return "R$ " + v.toFixed(2).replace(".", ","); }
  }

  function card(p){
    const root = document.createElement("div");
    root.className = "provItem";

    let imgEl;
    if(p.image_url){
      imgEl = document.createElement("img");
      imgEl.className = "pimg";
      imgEl.alt = "";
      imgEl.src = p.image_url;
      imgEl.onerror = () => { imgEl.src = "./img/placeholder.svg"; };
    }else{
      imgEl = document.createElement("div");
      imgEl.className = "pimg";
      imgEl.style.background = "rgba(255,255,255,.04)";
    }

    const body = document.createElement("div");
    body.className = "pbody";

    const title = document.createElement("div");
    title.className = "ptitle";
    title.textContent = p.name || "Produto";

    const sub = document.createElement("div");
    sub.className = "psub";
    sub.textContent = money(p.price_cents || 0);

    const btn = document.createElement("button");
    btn.className = "pbtn";
    btn.type = "button";
    btn.textContent = "Comprar";
    btn.addEventListener("click", () => {
      try{ CS.log("product_click", { product_id: p.product_id }).catch(() => {}); }catch{}
      CS.go(`checkout.html?id=${encodeURIComponent(p.product_id)}`);
    });

    body.appendChild(title);
    body.appendChild(sub);
    body.appendChild(btn);

    root.appendChild(imgEl);
    root.appendChild(body);

    return root;
  }

  async function loadFromSupabase(){
    try{
      const s = CS.client();
      const { data, error } = await s
        .from("cs_products")
        .select("product_id,name,price_cents,image_url,is_active")
        .eq("is_active", true)
        .order("created_at", { ascending:true })
        .limit(60);
      if(error) return null;
      if(!data || !data.length) return [];
      return data;
    }catch{
      return null;
    }
  }

  async function loadFromJson(){
    const res = await fetch("./products.json", { cache:"no-store" });
    if(!res.ok) return [];
    const arr = await res.json();
    if(!Array.isArray(arr)) return [];
    return arr.map(x => ({
      product_id: String(x.id || ""),
      name: String(x.name || "Produto"),
      price_cents: Number(x.price_cents ?? Math.round(Number(x.price || 0) * 100)),
      image_url: String(x.image_url || x.image || "")
    }));
  }

  async function init(){
    const grid = $("#productsGrid");
    if(!grid) return;
    grid.innerHTML = "";

    let items = await loadFromSupabase();
    // Se Supabase falhar (null) OU vier vazio, usa o catálogo local.
    if(items === null || (Array.isArray(items) && items.length === 0)) items = await loadFromJson();

    const frag = document.createDocumentFragment();
    items.forEach(p => frag.appendChild(card(p)));
    grid.appendChild(frag);
  }

  document.addEventListener("DOMContentLoaded", () => { init().catch(() => {}); });
})();

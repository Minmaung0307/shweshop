// === Part 0: Firebase & libs ===
// Use your config.js that exports { auth, db } (already in your project)
import { auth, db } from "./config.js";

import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithRedirect,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  getIdTokenResult,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// === Part 0b: State & utils ===
const state = window.state || (window.state = {
  user: null,
  isAdmin: false,
  cart: [],
  itemPromos: {},
  membership: null,
});
const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const h = (t)=>document.createElement(t);
const fmt = (n)=>"$" + Number(n||0).toFixed(2);
const toast = (m)=>console.log("TOAST:", m);

// === Part 1: Theme & Font-size ===
const themeKey = "theme";
const fsKey = "fs";
function applyTheme(t){ document.documentElement.setAttribute("data-theme", t); localStorage.setItem(themeKey, t); }
function cycleTheme(){
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  const next = cur==="dark" ? "light" : cur==="light" ? "neon" : "dark";
  applyTheme(next);
}
function applyFs(v){ document.documentElement.style.setProperty("--fs", String(v)); localStorage.setItem(fsKey, String(v)); }
function initThemeFs(){
  applyTheme(localStorage.getItem(themeKey) || "dark");
  applyFs(Number(localStorage.getItem(fsKey) || 1));
  $("#btnTheme")?.addEventListener("click", cycleTheme);
  $("#fsMinus")?.addEventListener("click", ()=>{ const v=Math.max(.85, Number(getComputedStyle(document.documentElement).getPropertyValue("--fs"))-.05); applyFs(v); });
  $("#fsPlus")?.addEventListener("click", ()=>{ const v=Math.min(1.25, Number(getComputedStyle(document.documentElement).getPropertyValue("--fs"))+.05); applyFs(v); });
}

// === Part 2: Demo Products (images are placeholders if missing) ===
const DEMO_PRODUCTS = [
  // Men
  { id:"m101", title:"Men Running Shorts", price:18, cat:"Fashion", aud:"men", img:"images/products/men/m101/thumb.jpg",
    images:["images/products/men/m101/main.jpg","images/products/men/m101/1.jpg","images/products/men/m101/2.jpg"], desc:"Lightweight quick-dry shorts", specs:["100% polyester","Drawstring","2 pockets"], new:true },
  { id:"m102", title:"Men Graphic Tee", price:14.5, cat:"Fashion", aud:"men", img:"images/products/men/m102/thumb.jpg", images:["images/products/men/m102/main.jpg","images/products/men/m102/1.jpg"], desc:"Soft cotton tee", specs:["100% cotton","Regular fit"] },

  // Women
  { id:"w201", title:"Women Yoga Mat", price:22, cat:"Beauty", aud:"women", img:"images/products/women/w201/thumb.jpg", images:["images/products/women/w201/main.jpg","images/products/women/w201/1.jpg"], desc:"Non-slip TPE yoga mat", specs:["183×61cm","6mm thick"], new:true },
  { id:"w202", title:"Women Tote Bag", price:19, cat:"Fashion", aud:"women", img:"images/products/women/w202/thumb.jpg", images:["images/products/women/w202/main.jpg"], desc:"Everyday canvas tote", specs:["Canvas","Inner pocket"] },

  // Kids
  { id:"k301", title:"Kids Story Book", price:6, cat:"Baby", aud:"kids", img:"images/products/kids/k301/thumb.jpg", images:["images/products/kids/k301/main.jpg"], desc:"Colorful bedtime tales", specs:["Hardcover","Ages 4–8"] },
  { id:"k302", title:"Kids Water Bottle", price:9, cat:"Baby", aud:"kids", img:"images/products/kids/k302/thumb.jpg", images:["images/products/kids/k302/main.jpg"], desc:"Leak-proof bottle", specs:["BPA-free","350ml"] },

  // Pets
  { id:"p401", title:"Pet Chew Toy", price:7, cat:"Pets", aud:"pets", img:"images/products/pets/p401/thumb.jpg", images:["images/products/pets/p401/main.jpg"], desc:"Durable rubber toy", specs:["Teething safe","Dishwasher safe"] },
  { id:"p402", title:"Pet Bed (S)", price:24, cat:"Pets", aud:"pets", img:"images/products/pets/p402/thumb.jpg", images:["images/products/pets/p402/main.jpg"], desc:"Cozy plush bed", specs:["50×40cm","Anti-slip bottom"] },

  // Auto
  { id:"a501", title:"Car Phone Mount", price:9, cat:"Auto", aud:"all", img:"images/products/auto/a501/thumb.jpg", images:["images/products/auto/a501/main.jpg"], desc:"360° rotation mount", specs:["Vent-clip","One-click lock"] },
  { id:"a502", title:"Microfiber Wash Mitt", price:5.5, cat:"Auto", aud:"all", img:"images/products/auto/a502/thumb.jpg", images:["images/products/auto/a502/main.jpg"], desc:"Scratch-free wash", specs:["Microfiber","Elastic cuff"] },

  // Home
  { id:"h601", title:"Home LED Strip 5m", price:12, cat:"Home", aud:"all", img:"images/products/home/h601/thumb.jpg", images:["images/products/home/h601/main.jpg"], desc:"RGB with remote", specs:["5m","USB powered"], new:true },
  { id:"h602", title:"Aroma Diffuser", price:16, cat:"Home", aud:"all", img:"images/products/home/h602/thumb.jpg", images:["images/products/home/h602/main.jpg"], desc:"Ultrasonic diffuser", specs:["300ml","Auto-off"] },

  // Beauty
  { id:"b701", title:"Face Sheet Mask (5)", price:8, cat:"Beauty", aud:"women", img:"images/products/beauty/b701/thumb.jpg", images:["images/products/beauty/b701/main.jpg"], desc:"Hydrating masks", specs:["Hyaluronic","5 sheets"] },
  { id:"b702", title:"Men Face Wash", price:7.5, cat:"Beauty", aud:"men", img:"images/products/beauty/b702/thumb.jpg", images:["images/products/beauty/b702/main.jpg"], desc:"Oil-control cleanser", specs:["150ml","Daily use"] },

  // Electronics
  { id:"e801", title:"Wireless Earbuds", price:25, cat:"Electronics", aud:"all", img:"images/products/all/e801/thumb.jpg", images:["images/products/all/e801/main.jpg","images/products/all/e801/1.jpg"], desc:"ENC mic + 20h battery", specs:["BT 5.3","USB-C"], new:true },
  { id:"e802", title:"Power Bank 10,000mAh", price:15, cat:"Electronics", aud:"all", img:"images/products/all/e802/thumb.jpg", images:["images/products/all/e802/main.jpg"], desc:"Slim + fast charge", specs:["10Ah","Type-C in/out"] },
];

const PROMO_MAP = { WELCOME10:{type:"percent", value:10}, FLAT5:{type:"amount", value:5} };
const ADS = [
  { img:"images/ads/sale-fashion.jpg", text:"Mid-season Sale • Fashion up to 40%", href:"#"},
  { img:"images/ads/new-arrivals.jpg", text:"New Arrivals • Fresh picks today", href:"#"},
  { img:"images/ads/home-deals.jpg", text:"Home Deals • Lights & Decor", href:"#"},
  { img:"images/ads/pets-care.jpg", text:"Pets Care • Toys & Beds", href:"#"},
];

// === Part 3: Nav Items ===
const NAV_ITEMS = [
  { key:"aud_all", label:"For All", type:"aud", value:"all" },
  { key:"aud_men", label:"Men", type:"aud", value:"men" },
  { key:"aud_women", label:"Women", type:"aud", value:"women" },
  { key:"aud_kids", label:"Kids", type:"aud", value:"kids" },
  { key:"aud_pets", label:"Pets", type:"aud", value:"pets" },
  { key:"new", label:"New Arrivals", type:"tag" },
  { key:"cat_baby", label:"Baby", type:"cat", value:"Baby" },
  { key:"cat_home", label:"Home", type:"cat", value:"Home" },
  { key:"cat_auto", label:"Auto", type:"cat", value:"Auto" },
  { key:"cat_beauty", label:"Beauty", type:"cat", value:"Beauty" },
  { key:"orders", label:"Orders", type:"view", value:"orders" },
  { key:"member", label:"Membership", type:"view", value:"member" },
  { key:"analytics", label:"Analytics (Admin)", type:"view", value:"analytics" },
];
let currentCategory = "";
let currentAudience = "all";

// === Part 4: Refs ===
const greet = $("#greet");
const navScroll = $("#navScroll");
const homeSections = $("#homeSections");
const viewShop = $("#view-shop");
const shopTitle = $("#shopTitle");
const grid = $("#productGrid");

// Product modal
const productModal = $("#productModal");
const pdImg = $("#pdImg"), pdThumbs = $("#pdThumbs");
const pdTitle = $("#pdTitle"), pdPrice = $("#pdPrice"), pdDesc = $("#pdDesc"), pdSpecs = $("#pdSpecs");

// === Part 5: Helpers ===
function ph(size, seed){ return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${size}/${size}`; }
function withImgFallback(imgEl, src, isThumb=false, seed="default"){
  const fallback = ph(isThumb ? 160 : 600, seed);
  if(!imgEl) return;
  imgEl.src = src || fallback;
  imgEl.onerror = ()=>{ imgEl.onerror=null; imgEl.src = fallback; };
}

function switchView(name){
  $$(".view").forEach(v=>v.classList.remove("active"));
  $("#view-"+name)?.classList.add("active");
}

function buildNavChips(){
  if(!navScroll) return;
  navScroll.innerHTML = "";
  NAV_ITEMS.forEach(item=>{
    const b = h("button");
    b.className = "nav-chip";
    b.textContent = item.label;
    b.dataset.key = item.key;
    b.addEventListener("click", ()=>onNavClick(item, b));
    navScroll.appendChild(b);
  });
  updateAdminUI();
}

// admin chip & orders chip visibility
function updateAdminUI(){
  const adminChip = [...(navScroll?.children||[])].find(b=>(b.textContent||"").includes("Analytics"));
  if(adminChip) adminChip.style.display = state.isAdmin ? "" : "none";
  const ordersChip = [...(navScroll?.children||[])].find(b=>(b.textContent||"").includes("Orders"));
  if(ordersChip) ordersChip.style.display = state.user ? "" : "none";
}

function onNavClick(item, btn){
  $$(".nav-chip").forEach(c=>c.classList.remove("active"));
  btn?.classList.add("active");

  if(item.type==="aud"){
    currentAudience = item.value;
    currentCategory = "";
    showShopGrid(item.label || "Shop");
    return;
  }
  if(item.type==="cat"){
    currentAudience = "all";
    currentCategory = item.value;
    showShopGrid(item.label || item.value);
    return;
  }
  if(item.type==="tag" && item.key==="new"){
    currentAudience = "all";
    currentCategory = "";
    showShopGrid("New Arrivals", { tag:"new" });
    return;
  }
  if(item.key==="orders"){ switchView("orders"); renderOrders(); return; }
  if(item.key==="member"){ $("#memberModal")?.showModal(); return; }
  if(item.key==="analytics"){ switchView("analytics"); renderAnalytics(); return; }
  showShopGrid(item.label || "Shop");
}

// === Part 6: Search — results show at top (Shop view) ===
function getSearchQuery(){
  const d = $("#searchInput"), m = $("#searchInputMobile");
  return ((d?.value||"") + " " + (m?.value||"")).trim().toLowerCase();
}
function wireSearchInputs(){
  const run = ()=>{
    currentCategory = "";
    showShopGrid(getSearchQuery()? "Results":"Shop");
    window.scrollTo({ top: 0, behavior:"smooth" });
  };
  ["searchInput","searchInputMobile"].forEach(id=>{
    const el = document.getElementById(id);
    el?.addEventListener("input", run);
    el?.addEventListener("keydown", e=>{ if(e.key==="Enter") run(); });
  });
}

// === Part 7: Home sections (carousels + ads) ===
function makeDragScroll(container){
  if(!container) return;
  let isDown=false, sx=0, sy=0, sl=0;
  const onDown = (e)=>{ isDown=true; container.classList.add("dragging");
    sx = "touches" in e ? e.touches[0].pageX : e.pageX;
    sy = "touches" in e ? e.touches[0].pageY : e.pageY;
    sl = container.scrollLeft; };
  const onMove = (e)=>{ if(!isDown) return;
    const x = "touches" in e ? e.touches[0].pageX : e.pageX;
    const y = "touches" in e ? e.touches[0].pageY : e.pageY;
    const dx = x - sx, dy = y - sy;
    if(Math.abs(dx) > Math.abs(dy)){ e.preventDefault(); container.scrollLeft = sl - dx; }
  };
  const onUp = ()=>{ isDown=false; container.classList.remove("dragging"); };
  container.addEventListener("mousedown", onDown);
  container.addEventListener("mousemove", onMove);
  container.addEventListener("mouseup", onUp);
  container.addEventListener("mouseleave", onUp);
  container.addEventListener("touchstart", onDown, { passive:false });
  container.addEventListener("touchmove", onMove, { passive:false });
  container.addEventListener("touchend", onUp);
}
function attachCarouselControls(sec){
  const cont = sec.querySelector(".hlist"); if(!cont) return;
  if(!sec.querySelector(".sec-nav.prev")){
    const prev=h("button"); prev.className="sec-nav prev"; prev.setAttribute("aria-label","Previous"); prev.textContent="‹";
    const next=h("button"); next.className="sec-nav next"; next.setAttribute("aria-label","Next"); next.textContent="›";
    sec.appendChild(prev); sec.appendChild(next);
    const step = ()=>Math.max(160, Math.round(cont.clientWidth*0.9));
    prev.addEventListener("click", ()=>cont.scrollBy({left:-step(),behavior:"smooth"}));
    next.addEventListener("click", ()=>cont.scrollBy({left: step(),behavior:"smooth"}));
  }
  makeDragScroll(cont);
}
function renderHomeSections(){
  const catsAll = Array.from(new Set((DEMO_PRODUCTS||[]).map(p=>p.cat))).filter(Boolean);
  if(!homeSections) return;
  homeSections.innerHTML = "";
  catsAll.forEach((cat, idx)=>{
    const list = (DEMO_PRODUCTS||[]).filter(p=>{
      const okAud = currentAudience==="all" ? true : (p.aud||"all")===currentAudience;
      return okAud && p.cat===cat;
    });
    if(!list.length) return;

    const sec = document.createElement("div");
    sec.className = "section";
    sec.innerHTML = `
      <div class="section-head">
        <div class="strong">${cat}</div>
        <button class="btn btn-soft btn-mini" data-see="${cat}">See all</button>
      </div>
      <div class="hlist"></div>
      <div class="ad-slot">
        <a class="ad-link" target="_blank" rel="noopener">
          <img class="ad-img" alt="">
          <span class="ad-text"></span>
        </a>
      </div>
    `;
    const cont = sec.querySelector(".hlist");
    list.slice(0,12).forEach(p=>{
      const item = document.createElement("div");
      item.className = "hitem";
      item.innerHTML = `
        <img class="thumb" alt="${p.title}" loading="lazy" decoding="async">
        <div class="small strong" style="margin-top:.4rem">${p.title}</div>
        <div class="small">${fmt(p.price)}</div>`;
      const im = item.querySelector("img.thumb");
      withImgFallback(im, p.img, true, p.id);
      im?.addEventListener("click", ()=>openProduct(p));
      cont?.appendChild(item);
    });

    if(ADS.length){
      const ad = ADS[idx % ADS.length];
      const a = sec.querySelector(".ad-link"), ai = sec.querySelector(".ad-img"), at = sec.querySelector(".ad-text");
      if(a && ai && at){
        a.href = ad.href || "#"; at.textContent = " " + (ad.text||"");
        withImgFallback(ai, ad.img, true);
        a.style.display = "inline-flex"; a.style.alignItems="center"; a.style.gap=".6rem";
      }
    }

    sec.querySelector("[data-see]")?.addEventListener("click", ()=>{ currentCategory = cat; showShopGrid(cat); });
    homeSections.appendChild(sec);
    attachCarouselControls(sec);
  });
}

// === Part 8: Shop grid (search results top) ===
function renderGrid(opts={}){
  const q = getSearchQuery();
  const cat = (currentCategory||"").trim().toLowerCase();
  const aud = currentAudience || "all";
  if(!grid) return; grid.innerHTML = "";

  const filtered = (DEMO_PRODUCTS||[]).filter(p=>{
    const okCat = !cat || (p.cat||"").toLowerCase()===cat;
    const hay = ((p.title||"")+" "+(p.desc||"")).toLowerCase();
    const okQ = !q || hay.includes(q);
    const okAud = aud==="all" || (p.aud||"all")===aud;
    const okTag = !opts.tag || opts.tag!=="new" || p.new===true;
    return okCat && okQ && okAud && okTag;
  });

  if(!filtered.length){
    grid.innerHTML = `<div class="card"><div class="pad"><div class="card-title">No results</div><p class="small">We couldn't find items for "<b>${q}</b>".</p></div></div>`;
    return;
  }

  filtered.forEach(p=>{
    const card = h("div"); card.className="card";
    card.innerHTML = `
      <img class="thumb" alt="${p.title}" width="600" height="600" loading="lazy" decoding="async">
      <div class="pad">
        <div class="card-title">${p.title}</div>
        <div class="row between">
          <div class="price">${fmt(p.price)}</div>
          <div class="row">
            <button class="btn btn-soft btn-view">View</button>
            <button class="btn btn-mini btn-add" data-id="${p.id}">Add to Cart</button>
          </div>
        </div>
        <div class="promo-inline">
          <input placeholder="Promo code" aria-label="promo for ${p.title}">
          <button class="btn-mini">Apply</button>
        </div>
      </div>`;
    const imc = card.querySelector("img.thumb");
    withImgFallback(imc, p.img, true, p.id);
    card.querySelector(".btn-view")?.addEventListener("click", ()=>openProduct(p));
    imc?.addEventListener("click", ()=>openProduct(p));
    card.querySelector(".btn-add")?.addEventListener("click", ()=>{ addToCart(p,1); toast(`${p.title} added to cart`); updateCartCount(); renderCartPage(); });
    const [promoInput,promoBtn] = card.querySelectorAll(".promo-inline > *");
    promoBtn?.addEventListener("click", ()=>{
      const code = (promoInput?.value||"").trim().toUpperCase();
      const rule = PROMO_MAP[code] || null;
      if(!code){ delete state.itemPromos?.[p.id]; toast("Promo cleared"); renderCartPage(); return; }
      if(!rule){ toast("Invalid code"); return; }
      if (!state.itemPromos) state.itemPromos = {};
state.itemPromos[p.id] = { code, ...rule };
      toast(`Promo ${code} applied to ${p.title}`); renderCartPage();
    });
    grid.appendChild(card);
  });
}
function showShopGrid(title="Shop", opts={}){
  if(shopTitle) shopTitle.textContent = title;
  switchView("shop");
  renderGrid(opts);
}

// === Part 9: Product Detail Modal ===
function openProduct(p){
  if(!p) return;
  const imgs = (p.images && p.images.length) ? p.images : [p.img];
  pdThumbs.innerHTML = "";
  let cur = 0;
  function show(i){ cur = (i + imgs.length) % imgs.length; withImgFallback(pdImg, imgs[cur], false, p.id); $$("#pdThumbs img").forEach((x,idx)=>x.classList.toggle("active", idx===cur)); }
  $("#pdPrev")?.addEventListener("click", ()=>show(cur-1), { once:true });
  $("#pdNext")?.addEventListener("click", ()=>show(cur+1), { once:true });

  if(pdImg){ withImgFallback(pdImg, imgs[0], false, p.id); pdImg.alt = p.title; }
  imgs.forEach((src,i)=>{
    const im = h("img");
    withImgFallback(im, src, true, p.id+"-"+i);
    im.alt = `${p.title} ${i+1}`; im.width=120; im.height=120; im.loading="lazy";
    if(i===0) im.classList.add("active");
    im.addEventListener("click", ()=>{ $$("#pdThumbs img").forEach(x=>x.classList.remove("active")); im.classList.add("active"); withImgFallback(pdImg, src, false, p.id+"-"+i); });
    pdThumbs.appendChild(im);
  });
  pdTitle.textContent = p.title; pdPrice.textContent = fmt(p.price); pdDesc.textContent = p.desc||""; pdSpecs.innerHTML = (p.specs||[]).map(s=>`<li>${s}</li>`).join("");

  $("#pdAdd")?.onclick = ()=>{ const q = Math.max(1, Number($("#pdQty")?.value||1)); addToCart(p, q); toast(`${p.title} ×${q} added to cart`); updateCartCount(); };
  productModal?.showModal();
}

// === Part 10: Cart (Page) ===
function restoreCart(){ try{ const raw = localStorage.getItem("cart"); if(raw) state.cart = JSON.parse(raw); }catch{} }
function saveCart(){ try{ localStorage.setItem("cart", JSON.stringify(state.cart||[])); }catch{} }
function updateCartCount(){ const n = (state.cart||[]).reduce((s,x)=>s+x.qty,0); const el=$("#cartCount"); if(el) el.textContent = n ? String(n) : ""; }
function addToCart(p, qty=1){ if(!state.cart) state.cart=[]; const i = state.cart.findIndex(x=>x.id===p.id); if(i>=0) state.cart[i].qty += qty; else state.cart.push({ id:p.id, title:p.title, price:p.price, img:p.img, qty }); saveCart(); updateCartCount(); }
function renderCartPage(){
  const wrap=$("#cartPageList"), sub=$("#cartSubtotal"), ship=$("#cartShip"), tot=$("#cartTotal");
  if(!wrap) return; const items = state.cart||[]; wrap.innerHTML="";
  if(!items.length){ wrap.innerHTML=`<p class="small">Your cart is empty.</p>`; sub.textContent='$0.00'; ship.textContent='$0.00'; tot.textContent='$0.00'; return; }
  let subtotal=0;
  items.forEach(it=>{
    const line = it.price * it.qty; subtotal+=line;
    const row = document.createElement("div");
    row.className="row between item-line";
    row.innerHTML=`
      <div class="row" style="gap:.7rem;align-items:center">
        <img class="thumb" alt="${it.title}">
        <div><div class="strong">${it.title}</div><div class="small">${fmt(it.price)} each</div></div>
      </div>
      <div class="row" style="gap:.6rem;align-items:center">
        <div class="row qty-box" style="gap:.25rem;">
          <button class="btn-mini" data-dec="${it.id}">−</button>
          <span class="strong">${it.qty}</span>
          <button class="btn-mini" data-inc="${it.id}">＋</button>
        </div>
        <div class="price">${fmt(line)}</div>
        <button class="btn-mini btn-outline" data-remove="${it.id}">Remove</button>
      </div>`;
    withImgFallback(row.querySelector("img.thumb"), it.img, true, it.id);
    wrap.appendChild(row);
  });
  const shipping = subtotal>0 ? 3.99 : 0; sub.textContent=fmt(subtotal); ship.textContent=fmt(shipping); tot.textContent=fmt(subtotal+shipping);
}
$("#cartPageList")?.addEventListener("click", (e)=>{
  const inc=e.target.closest("[data-inc]"), dec=e.target.closest("[data-dec]"), rem=e.target.closest("[data-remove]");
  const id = inc?.dataset.inc || dec?.dataset.dec || rem?.dataset.remove; if(!id) return;
  const i=(state.cart||[]).findIndex(x=>x.id===id); if(i<0) return;
  if(inc) state.cart[i].qty += 1; if(dec) state.cart[i].qty = Math.max(0, state.cart[i].qty-1);
  if(rem || state.cart[i].qty===0) state.cart.splice(i,1); saveCart(); updateCartCount(); renderCartPage();
});
$("#btnCart")?.addEventListener("click", ()=>{ restoreCart(); updateCartCount(); switchView("cart"); renderCartPage(); window.scrollTo({top:0,behavior:"smooth"}); });

// === Part 11: Checkout (PayPal demo) ===
$("#btnCheckout")?.addEventListener("click", ()=>{
  const container = document.getElementById("paypal-button-container");
  if(!container) return;
  container.innerHTML = "";
  // Simple demo; in prod, create order on server
  if(window.paypal?.Buttons){
    window.paypal.Buttons({
      createOrder: (_, actions)=>{
        const total = (state.cart||[]).reduce((s,x)=>s+x.price*x.qty,0) + 3.99;
        return actions.order.create({ purchase_units:[{ amount:{ value: total.toFixed(2) } }] });
      },
      onApprove: async (_, actions)=>{ await actions.order.capture(); toast("Payment captured. Thank you!"); state.cart = []; saveCart(); updateCartCount(); renderCartPage(); }
    }).render("#paypal-button-container");
  } else {
    toast("PayPal SDK not loaded");
  }
});

// Delivery/pickup toggle
$$("input[name='dopt']").forEach(r=>r.addEventListener("change", ()=>{
  const val = document.querySelector("input[name='dopt']:checked")?.value;
  $("#deliveryFields").style.display = val==="delivery" ? "" : "none";
  $("#pickupFields").style.display   = val==="pickup" ? "" : "none";
}));

// === Part 12: Orders (placeholder for demo) ===
function renderOrders(){
  const wrap = $("#ordersList"); if(!wrap) return;
  if(!state.user){
    wrap.innerHTML = `<div class="card"><div class="pad"><div class="card-title">Sign in to see orders</div><div class="small">No orders yet. Add to cart and checkout to create an order.</div></div></div>`;
    return;
  }
  wrap.innerHTML = `<div class="card"><div class="pad"><div class="row between"><div class="card-title">Order #DEMO01</div><div class="small">2025-09-01</div></div><div class="small">Channel: Web — Status: Paid</div><ul class="disc small"><li>LED Strip × 1 — ${fmt(12)}</li><li>Women Tote Bag × 1 — ${fmt(19)}</li></ul><div class="row between"><div>Total</div><div class="price">${fmt(31)}</div></div></div></div>`;
}

// === Part 13: Analytics (admin → full, user → my-orders or demo) ===
async function renderAnalytics(){
  // If not admin → show demo charts (or realtime of own orders if integrated)
  if(!state.isAdmin){
    // demo empty charts
    new Chart($("#revChart"), { type:"line", data:{ labels:[], datasets:[{data:[]}]} , options:{plugins:{legend:{display:false}}}});
    new Chart($("#topChart"), { type:"bar" , data:{ labels:[], datasets:[{data:[]}]} , options:{plugins:{legend:{display:false}}}});
    toast("Analytics: admin only (showing demo placeholders)");
    return;
  }
  // Admin: demo data generator
  const days = Array.from({length:30},(_,i)=>({ d: new Date(Date.now()-(29-i)*86400000).toISOString().slice(5,10), v: Math.round(200+Math.random()*400) }));
  const tally = { "Wireless Earbuds":30, "LED Strip":22, "Power Bank":18, "Yoga Mat":15, "Tote Bag":10, "Kids Book":8, "Pet Chew":7 };
  new Chart($("#revChart"), { type:"line", data:{ labels:days.map(x=>x.d), datasets:[{ label:"Revenue", data:days.map(x=>x.v)}]}, options:{responsive:true, plugins:{legend:{display:false}}}});
  const top = Object.entries(tally).sort((a,b)=>b[1]-a[1]).slice(0,7);
  new Chart($("#topChart"), { type:"bar", data:{ labels:top.map(([k])=>k), datasets:[{ label:"Qty", data:top.map(([,v])=>v)}] }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{ x:{ ticks:{ maxRotation:45 }}} }});
}

// === Part 14: Membership ===
$("#btnMembership")?.addEventListener("click", (e)=>{ e.preventDefault(); $("#memberModal")?.showModal(); });
$("[data-close='memberModal']")?.addEventListener("click", ()=>$("#memberModal")?.close());
$("#buyMembership")?.addEventListener("click", async ()=>{
  if(!state.user){ $("#authModal")?.showModal(); toast("Please sign in to continue"); return; }
  const plan = (document.querySelector('input[name="mplan"]:checked')?.value)||"basic";
  const fees = { basic:9, plus:19, pro:39 }, rates = { basic:.02, plus:.03, pro:.05 };
  const method = $("#payMethod")?.value || "paypal";
  const auto = $("#autoRenew")?.checked || false;
  const now=Date.now(), year=365*86400000;
  state.membership = { plan, rate:rates[plan], fee:fees[plan], method, autoRenew:auto, startTs:now, expiresTs:now+year };
  try{ await setDoc(doc(db,"users",state.user.uid), { member: state.membership }, { merge:true }); toast(`Membership ${plan.toUpperCase()} - $${fees[plan]}/yr activated`); }catch(e){ console.warn("membership save failed", e); }
  $("#memberModal")?.close();
});

// === Part 15: Auth (Email + Google) ===
function uiSignedIn(u){
  if(!u){ greet.textContent=""; $("#btnAuth").textContent="👤"; return; }
  const name = u.displayName || (u.email||"").split("@")[0];
  greet.textContent = "Hi, " + name;
  $("#btnAuth").textContent = "🚪"; // logout icon
}
$("#btnAuth")?.addEventListener("click", async ()=>{
  if(!state.user){ $("#authModal")?.showModal(); return; }
  await signOut(auth);
});
$("#btnGoogle")?.addEventListener("click", async ()=>{
  try{ await signInWithRedirect(auth, new GoogleAuthProvider()); }catch(e){ console.warn(e); toast("Google sign-in failed"); }
});
$("#btnEmailSignIn")?.addEventListener("click", async ()=>{
  const email=$("#email")?.value||"", pass=$("#password")?.value||"";
  if(!email || !pass){ toast("Enter email & password"); return; }
  try{ await signInWithEmailAndPassword(auth, email, pass); $("#authModal")?.close(); }catch(e){ toast("Sign-in failed: " + (e?.code||"")); }
});
$("#btnCreate")?.addEventListener("click", async ()=>{
  const email=$("#email")?.value||"", pass=$("#password")?.value||"";
  if(!email || !pass){ toast("Enter email & password"); return; }
  try{ await createUserWithEmailAndPassword(auth, email, pass); $("#authModal")?.close(); }catch(e){ toast("Sign-up failed: " + (e?.code||"")); }
});
$("#btnForgot")?.addEventListener("click", async ()=>{
  const email=$("#email")?.value||"";
  if(!email){ toast("Enter your email"); return; }
  try{ await sendPasswordResetEmail(auth, email); toast("Reset email sent"); }catch(e){ toast("Failed: "+(e?.code||"")); }
});

async function checkAdmin(user){
  if(!user){ state.isAdmin=false; return false; }
  try{
    const tok = await getIdTokenResult(user, true);
    if(tok?.claims?.admin===true){ state.isAdmin=true; return true; }
  }catch(e){ console.warn("token check failed", e); }
  try{
    const snap = await getDoc(doc(db,"users",user.uid));
    const role = snap.exists() ? snap.data().role : null;
    state.isAdmin = role==="admin" || role==="owner";
    return state.isAdmin;
  }catch(e){ console.warn("users doc check failed", e); state.isAdmin=false; return false; }
}

// === Part 16: Init ===
function init(){
  initThemeFs();
  buildNavChips();
  wireSearchInputs();
  renderHomeSections();
  showShopGrid("Shop");

  // Close buttons for all dialogs
  $$("[data-close]").forEach(btn=>btn.addEventListener("click", ()=>{
    const id = btn.getAttribute("data-close"); document.getElementById(id)?.close();
  }));

  // greet + toggle admin chip after auth
  onAuthStateChanged(auth, async (user)=>{
    state.user = user || null;
    uiSignedIn(user);
    await checkAdmin(user);
    updateAdminUI();
  });

  // open product modal close with backdrop ESC default works
}
document.addEventListener("DOMContentLoaded", init);

// expose for inline handlers (if any)
window.switchView = switchView;
window.openProduct = openProduct;
// === Part 0: Firebase & libs (top of file) ===
// already imported at top:
const provider = new GoogleAuthProvider();
await signInWithRedirect(auth, provider);

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithRedirect,
  getIdTokenResult,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
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

// Open auth mini modal
document.getElementById('btnUser')?.addEventListener('click', ()=>{
  if(state.user){ return toast('Already signed in'); }
  document.getElementById('authModal')?.showModal();
});

// Google sign-in (redirect ကို သုံး—popup warn မတက်)
document.getElementById('btnGoogle')?.addEventListener('click', async ()=>{
  const provider = new GoogleAuthProvider();
  try {
    await signInWithRedirect(auth, provider);
  } catch (e) {
    console.warn('sign-in failed', e);
    toast('Sign-in failed. Check API keys / authorized domains.');
  }
});

// TODO: replace with your own config
export const firebaseConfig = {
  apiKey: "AIzaSyADRM_83skeLeGK4Mf67rzCRTcdDjOptY0",
  authDomain: "shweshop-mm.firebaseapp.com",
  projectId: "shweshop-mm",
  storageBucket: "shweshop-mm.firebasestorage.app",
  messagingSenderId: "361216212375",
  appId: "1:361216212375:web:fed19b7fe4072000c298d2",
  measurementId: "G-WBJJZZNLX6",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Chart.js is loaded via <script> in HTML

// === Part 1: State & Utils ===
const state = {
  user: null,
  isAdmin: false,
  membership: null,
  cart: [], // assume you already manage elsewhere
  itemPromos: {}, // per-item promo map
  globalPromo: null, // whole-cart promo
  categories: [],
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const h = (tag) => document.createElement(tag);

const fmt = (n) => "$" + Number(n || 0).toFixed(2);
const toast = (msg) => {
  console.log("TOAST:", msg);
  // optional: replace with your snackbar/toast UI
};

function updateCartCount() {
  const el = $("#cartCount");
  if (el)
    el.textContent = String(state.cart.reduce((a, c) => a + c.qty, 0) || 0);
}

// === Part 2: DEMO PRODUCTS (sample) ===
const DEMO_PRODUCTS = [
  {
    id: "n1",
    title: "Men Running Shorts",
    price: 18,
    cat: "Fashion",
    aud: "men",
    img: "images/products/men/n1/thumb.jpg",
    images: ["images/products/men/n1/main.jpg"],
    desc: "Lightweight",
    specs: ["Quick-dry", "Elastic waist"],
    new: true,
  },
  {
    id: "n2",
    title: "Women Yoga Mat",
    price: 22,
    cat: "Beauty",
    aud: "women",
    img: "images/products/women/n2/thumb.jpg",
    images: ["images/products/women/n2/main.jpg"],
    desc: "Non-slip",
    specs: ["183×61cm", "6mm"],
    new: true,
  },
  {
    id: "n3",
    title: "Kids Story Book",
    price: 6,
    cat: "Baby",
    aud: "kids",
    img: "images/products/kids/n3/thumb.jpg",
    images: ["images/products/kids/n3/main.jpg"],
    desc: "Colorful tales",
  },
  {
    id: "n4",
    title: "Pet Chew Toy",
    price: 7,
    cat: "Pets",
    aud: "pets",
    img: "images/products/pets/n4/thumb.jpg",
    images: ["images/products/pets/n4/main.jpg"],
    desc: "Durable rubber",
  },
  {
    id: "n5",
    title: "Car Phone Mount",
    price: 9,
    cat: "Auto",
    aud: "all",
    img: "images/products/all/n5/thumb.jpg",
    images: ["images/products/all/n5/main.jpg"],
    desc: "360° rotation",
  },
  {
    id: "n6",
    title: "Home LED Strip",
    price: 12,
    cat: "Home",
    aud: "all",
    img: "images/products/all/n6/thumb.jpg",
    images: ["images/products/all/n6/main.jpg"],
    desc: "5m RGB",
  },
  // Fashion (Men)
  { id:'m101', title:'Men Running Shorts', price:18, cat:'Fashion', aud:'men',
    img:'images/products/men/m101/thumb.jpg',
    images:['images/products/men/m101/main.jpg','images/products/men/m101/1.jpg','images/products/men/m101/2.jpg'],
    desc:'Lightweight quick-dry shorts', specs:['100% polyester','Drawstring','2 pockets'], new:true },
  { id:'m102', title:'Men Graphic Tee', price:14.5, cat:'Fashion', aud:'men',
    img:'images/products/men/m102/thumb.jpg',
    images:['images/products/men/m102/main.jpg','images/products/men/m102/1.jpg'],
    desc:'Soft cotton tee', specs:['100% cotton','Regular fit','Machine washable'] },

  // Fashion (Women)
  { id:'w201', title:'Women Yoga Mat', price:22, cat:'Beauty', aud:'women',
    img:'images/products/women/w201/thumb.jpg',
    images:['images/products/women/w201/main.jpg','images/products/women/w201/1.jpg'],
    desc:'Non-slip TPE yoga mat', specs:['183×61cm','6mm thick'], new:true },
  { id:'w202', title:'Women Tote Bag', price:19, cat:'Fashion', aud:'women',
    img:'images/products/women/w202/thumb.jpg',
    images:['images/products/women/w202/main.jpg'],
    desc:'Everyday canvas tote', specs:['Canvas','Inner pocket'] },

  // Kids / Baby
  { id:'k301', title:'Kids Story Book', price:6, cat:'Baby', aud:'kids',
    img:'images/products/kids/k301/thumb.jpg',
    images:['images/products/kids/k301/main.jpg'],
    desc:'Colorful bedtime tales', specs:['Hardcover','Ages 4-8'] },
  { id:'k302', title:'Kids Water Bottle', price:9, cat:'Baby', aud:'kids',
    img:'images/products/kids/k302/thumb.jpg',
    images:['images/products/kids/k302/main.jpg'],
    desc:'Leak-proof bottle', specs:['BPA-free','350ml'] },

  // Pets
  { id:'p401', title:'Pet Chew Toy', price:7, cat:'Pets', aud:'pets',
    img:'images/products/pets/p401/thumb.jpg',
    images:['images/products/pets/p401/main.jpg'],
    desc:'Durable rubber toy', specs:['Teething safe','Dishwasher safe'] },
  { id:'p402', title:'Pet Bed (S)', price:24, cat:'Pets', aud:'pets',
    img:'images/products/pets/p402/thumb.jpg',
    images:['images/products/pets/p402/main.jpg'],
    desc:'Cozy plush bed', specs:['50×40cm','Anti-slip bottom'] },

  // Auto
  { id:'a501', title:'Car Phone Mount', price:9, cat:'Auto', aud:'all',
    img:'images/products/auto/a501/thumb.jpg',
    images:['images/products/auto/a501/main.jpg'],
    desc:'360° rotation mount', specs:['Vent-clip','One-click lock'] },
  { id:'a502', title:'Microfiber Wash Mitt', price:5.5, cat:'Auto', aud:'all',
    img:'images/products/auto/a502/thumb.jpg',
    images:['images/products/auto/a502/main.jpg'],
    desc:'Scratch-free wash', specs:['Microfiber','Elastic cuff'] },

  // Home
  { id:'h601', title:'Home LED Strip 5m', price:12, cat:'Home', aud:'all',
    img:'images/products/home/h601/thumb.jpg',
    images:['images/products/home/h601/main.jpg'],
    desc:'RGB with remote', specs:['5m','USB powered'], new:true },
  { id:'h602', title:'Aroma Diffuser', price:16, cat:'Home', aud:'all',
    img:'images/products/home/h602/thumb.jpg',
    images:['images/products/home/h602/main.jpg'],
    desc:'Ultrasonic diffuser', specs:['300ml','Auto-off'] },

  // Beauty
  { id:'b701', title:'Face Sheet Mask (5)', price:8, cat:'Beauty', aud:'women',
    img:'images/products/beauty/b701/thumb.jpg',
    images:['images/products/beauty/b701/main.jpg'],
    desc:'Hydrating masks', specs:['Hyaluronic','5 sheets'] },
  { id:'b702', title:'Men Face Wash', price:7.5, cat:'Beauty', aud:'men',
    img:'images/products/beauty/b702/thumb.jpg',
    images:['images/products/beauty/b702/main.jpg'],
    desc:'Oil-control cleanser', specs:['150ml','Daily use'] },

  // Electronics (New Arrivals tag demo)
  { id:'e801', title:'Wireless Earbuds', price:25, cat:'Electronics', aud:'all',
    img:'images/products/all/e801/thumb.jpg',
    images:['images/products/all/e801/main.jpg','images/products/all/e801/1.jpg'],
    desc:'ENC mic + 20h battery', specs:['BT 5.3','USB-C'], new:true },
  { id:'e802', title:'Power Bank 10,000mAh', price:15, cat:'Electronics', aud:'all',
    img:'images/products/all/e802/thumb.jpg',
    images:['images/products/all/e802/main.jpg'],
    desc:'Slim + fast charge', specs:['10Ah','Type-C in/out'] },

  // Fashion (Kids Men Women extra)
  { id:'m103', title:'Men Hoodie', price:28, cat:'Fashion', aud:'men',
    img:'images/products/men/m103/thumb.jpg',
    images:['images/products/men/m103/main.jpg'],
    desc:'Fleece lined', specs:['Poly-cotton','Front pocket'] },
  { id:'w203', title:'Women Leggings', price:17, cat:'Fashion', aud:'women',
    img:'images/products/women/w203/thumb.jpg',
    images:['images/products/women/w203/main.jpg'],
    desc:'High-waist stretch', specs:['Nylon/Spandex'] },
  { id:'k303', title:'Kids Sneakers', price:21, cat:'Fashion', aud:'kids',
    img:'images/products/kids/k303/thumb.jpg',
    images:['images/products/kids/k303/main.jpg'],
    desc:'Lightweight runners', specs:['Sizes 28–34'] }
  // Add more as needed...
];

// simple promo map demo
const PROMO_MAP = {
  WELCOME10: { type: "percent", value: 10 },
  FLAT5: { type: "amount", value: 5 },
};

// === Part 3: Nav items & element refs ===
const NAV_ITEMS = [
  { key: "allCategories", label: "All Categories", type: "nav" },
  { key: "aud_all", label: "For All", type: "aud", value: "all" },
  { key: "aud_men", label: "Men", type: "aud", value: "men" },
  { key: "aud_women", label: "Women", type: "aud", value: "women" },
  { key: "aud_kids", label: "Kids", type: "aud", value: "kids" },
  { key: "aud_pets", label: "Pets", type: "aud", value: "pets" },
  { key: "new", label: "New Arrivals", type: "tag" },
  { key: "cat_baby", label: "Baby", type: "cat", value: "Baby" },
  { key: "cat_home", label: "Home", type: "cat", value: "Home" },
  { key: "cat_auto", label: "Auto", type: "cat", value: "Auto" },
  { key: "cat_beauty", label: "Beauty", type: "cat", value: "Beauty" },
  { key: "orders", label: "Orders", type: "view", value: "orders" },
  { key: "member", label: "Membership", type: "view", value: "member" },
  {
    key: "analytics",
    label: "Analytics (Admin)",
    type: "view",
    value: "analytics",
  },
];

let currentCategory = "";
let currentAudience = "all";

const greet = $("#greet");
const navScroll = $("#navScroll");
const searchInputDesktop = $("#searchInput");
const searchInputMobile = $("#searchInputMobile");

const homeSections = $("#homeSections");
const viewShop = $("#view-shop");
const shopTitle = $("#shopTitle");
const grid = $("#productGrid");

// Product modal elements (assumes exist in HTML)
const productModal = $("#productModal");
const pdImg = $("#pdImg");
const pdThumbs = $("#pdThumbs");
const pdTitle = $("#pdTitle");
const pdPrice = $("#pdPrice");
const pdDesc = $("#pdDesc");
const pdSpecs = $("#pdSpecs");

// === Part 4: Nav chips & admin UI toggle ===
function buildNavChips() {
  if (!navScroll) return;
  navScroll.innerHTML = "";
  NAV_ITEMS.forEach((item) => {
    const b = h("button");
    b.className = "nav-chip";
    b.textContent = item.label;
    b.dataset.key = item.key;
    b.addEventListener("click", () => onNavClick(item, b));
    navScroll.appendChild(b);
  });
  updateAdminUI();
}

function updateAdminUI() {
  const adminChip = [...(navScroll?.children || [])].find((b) =>
    (b.textContent || "").includes("Analytics")
  );
  if (adminChip) adminChip.style.display = state.isAdmin ? "" : "none";

  const ordersChip = [...(navScroll?.children || [])].find((b) =>
    (b.textContent || "").includes("Orders")
  );
  if (ordersChip) ordersChip.style.display = state.user ? "" : "none";
}

// === Part 5: Nav actions ===
function onNavClick(item, btn) {
  // active visual
  $$(".nav-chip").forEach((x) => x.classList.remove("active"));
  btn.classList.add("active");

  if (item.type === "nav" && item.key === "allCategories") {
    currentCategory = "";
    showShopGrid("All Categories");
    return;
  }
  if (item.type === "aud") {
    currentAudience = item.value;
    renderHomeSections();
    // if already in shop view, refresh grid
    if ($("#view-shop")?.classList.contains("active")) {
      showShopGrid(currentCategory || "All Categories");
    }
    return;
  }
  if (item.type === "cat") {
    currentCategory = item.value;
    showShopGrid(currentCategory);
    return;
  }
  if (item.type === "tag" && item.key === "new") {
    currentCategory = "";
    showShopGrid("New Arrivals", { tag: "new" });
    return;
  }
  if (item.type === "view") {
    if (item.value === "orders") {
      switchView("orders");
      loadOrders();
      return;
    }
    if (item.value === "member") {
      $("#memberModal")?.showModal();
      return;
    }
    if (item.value === "analytics") {
      if (!state.isAdmin) {
        toast("Admins only");
        return;
      }
      switchView("analytics");
      renderAnalytics();
      return;
    }
  }
}

function switchView(name) {
  $$(".view").forEach((v) => v.classList.remove("active"));
  $("#view-" + name)?.classList.add("active");
}

// === Part 6: Search sync ===
function getSearchQuery() {
  return (searchInputDesktop?.value || searchInputMobile?.value || "")
    .trim()
    .toLowerCase();
}
function wireSearchInputs() {
  const handler = () => {
    showShopGrid(currentCategory || "All Categories");
  };
  searchInputDesktop?.addEventListener("input", handler);
  searchInputMobile?.addEventListener("input", () => {
    if (searchInputDesktop) searchInputDesktop.value = searchInputMobile.value;
    handler();
  });
}

// === Part 7A: Home sections ===
// --- Ad inventory demo ---
const ADS = [
  { img:'images/ads/sale-fashion.jpg',  text:'Mid-season Sale • Fashion up to 40%', href:'#' },
  { img:'images/ads/new-arrivals.jpg',  text:'New Arrivals • Fresh picks today',    href:'#' },
  { img:'images/ads/home-deals.jpg',    text:'Home Deals • Lights & Decor',        href:'#' },
  { img:'images/ads/pets-care.jpg',     text:'Pets Care • Toys & Beds',            href:'#' }
];

function renderHomeSections(){
  const catsAll = Array.from(new Set((DEMO_PRODUCTS||[]).map(p=>p.cat))).filter(Boolean);
  if(!homeSections) return;
  homeSections.innerHTML = '';

  catsAll.forEach((cat, idx)=>{
    const list = (DEMO_PRODUCTS||[]).filter(p=>{
      const okAud = currentAudience==='all' ? true : (p.aud||'all')===currentAudience;
      return okAud && p.cat===cat;
    });
    if(!list.length) return;

    const sec = document.createElement('div'); sec.className='section';
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
    const cont = sec.querySelector('.hlist');
    list.slice(0,12).forEach(p=>{
      const item = document.createElement('div'); item.className='hitem';
      item.innerHTML = `
        <img class="thumb" src="${p.img}" alt="${p.title}" loading="lazy" decoding="async">
        <div class="small strong" style="margin-top:.4rem">${p.title}</div>
        <div class="small">${fmt(p.price)}</div>
      `;
      item.querySelector('img')?.addEventListener('click', ()=>openProduct(p));
      cont?.appendChild(item);
    });

    // fill ad
    const ad = ADS[idx % ADS.length];
    const a  = sec.querySelector('.ad-link');
    const ai = sec.querySelector('.ad-img');
    const at = sec.querySelector('.ad-text');
    if(a && ai && at){
      a.href = ad.href || '#';
      ai.src = ad.img; ai.alt = ad.text; ai.style.maxHeight = '68px';
      at.textContent = ' ' + ad.text;
      a.style.display = 'inline-flex'; a.style.alignItems = 'center'; a.style.gap = '.6rem';
    }

    sec.querySelector('[data-see]')?.addEventListener('click', ()=>{
      currentCategory = cat;
      showShopGrid(cat);
    });
    homeSections.appendChild(sec);
  });
}

// === Part 7B: Shop grid ===
function showShopGrid(title, opts = {}) {
  shopTitle && (shopTitle.textContent = title || "Shop");
  switchView("shop");
  renderGrid(opts);
}

function renderGrid(opts = {}) {
  const q = getSearchQuery();
  const cat = currentCategory.trim().toLowerCase();
  const aud = currentAudience;

  if (!grid) {
    return;
  }
  grid.innerHTML = "";
  const filtered = (DEMO_PRODUCTS || []).filter((p) => {
    const okCat = !cat || p.cat.toLowerCase() === cat;
    const hay = (p.title + " " + (p.desc || "")).toLowerCase();
    const okQ = !q || hay.includes(q);
    const okAud = aud === "all" || (p.aud || "all") === aud;
    const okTag = !opts.tag || opts.tag !== "new" || p.new === true;
    return okCat && okQ && okAud && okTag;
  });

  filtered.forEach((p) => {
    const card = h("div");
    card.className = "card";
    card.innerHTML = `
      <img class="thumb" src="${p.img}" alt="${
      p.title
    }" width="600" height="600" loading="lazy" decoding="async">
      <div class="pad">
        <div class="card-title">${p.title}</div>
        <div class="row between">
          <div class="price">${fmt(p.price)}</div>
          <button class="btn btn-soft">View</button>
        </div>
        <div class="promo-inline">
          <input placeholder="Promo code" aria-label="promo for ${p.title}">
          <button class="btn-mini">Apply</button>
        </div>
      </div>
    `;
    $(".btn", card)?.addEventListener("click", () => openProduct(p));
    $("img", card)?.addEventListener("click", () => openProduct(p));
    const [promoInput, promoBtn] = card.querySelectorAll(".promo-inline > *");
    promoBtn?.addEventListener("click", () => {
      const code = (promoInput?.value || "").trim().toUpperCase();
      const rule = PROMO_MAP[code] || null;
      if (!code) {
        delete state.itemPromos[p.id];
        toast("Promo cleared");
        renderCart?.();
        return;
      }
      if (!rule) {
        toast("Invalid code");
        return;
      }
      state.itemPromos[p.id] = { code, ...rule };
      toast(`Promo ${code} applied to ${p.title}`);
      renderCart?.();
    });
    grid.appendChild(card);
  });

  if (!filtered.length) {
    grid.innerHTML = `<p class="small">No products found.</p>`;
  }
}

// === Part 8: Product Modal ===
function openProduct(p) {
  const imgs = p.images && p.images.length ? p.images : [p.img];

  if (pdImg) {
    pdImg.src = imgs[0];
    pdImg.alt = p.title;
  }
  if (pdTitle) pdTitle.textContent = p.title;
  if (pdPrice) pdPrice.textContent = fmt(p.price);
  if (pdDesc) pdDesc.textContent = p.desc || "";
  if (pdSpecs)
    pdSpecs.innerHTML = (p.specs || []).map((s) => `<li>${s}</li>`).join("");

  if (pdThumbs) {
    pdThumbs.innerHTML = "";
    imgs.forEach((src, i) => {
      const im = h("img");
      im.src = src;
      im.alt = `${p.title} ${i + 1}`;
      im.width = 120;
      im.height = 120;
      im.loading = "lazy";
      if (i === 0) im.classList.add("active");
      im.addEventListener("click", () => {
        $$("#pdThumbs img").forEach((x) => x.classList.remove("active"));
        im.classList.add("active");
        if (pdImg) {
          pdImg.src = src;
          pdImg.alt = `${p.title} ${i + 1}`;
        }
      });
      pdThumbs.appendChild(im);
    });
  }
  productModal?.showModal();
}

// universal close buttons
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-close]");
  if (!btn) return;
  const id = btn.getAttribute("data-close");
  const dlg = document.getElementById(id);
  if (dlg && typeof dlg.close === "function") dlg.close();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape")
    $$("dialog[open]").forEach((d) => {
      try {
        d.close();
      } catch {}
    });
});

// === Part 9: Promos banner + global promo ===
async function fetchPromos() {
  try {
    const snap = await getDocs(collection(db, "promos"));
    const now = Date.now();
    const getMs = (v) => {
      if (!v) return null;
      if (typeof v === "object" && typeof v.toDate === "function")
        return v.toDate().getTime();
      const t = new Date(v).getTime();
      return Number.isFinite(t) ? t : null;
    };
    const active = [];
    snap.forEach((d) => {
      const p = d.data();
      const s = getMs(p.startsAt) ?? now - 1;
      const e = getMs(p.expiresAt) ?? now + 1;
      if (now >= s && now <= e) active.push({ id: d.id, ...p });
    });

    const old = homeSections?.querySelector(".promo-banner");
    if (old) old.remove();

    if (active.length) {
      const banner = h("div");
      banner.className = "ad-slot promo-banner";
      banner.innerHTML = active
        .map(
          (a) =>
            `<button class="btn-mini" data-apply-promo="${a.code}">
           ${a.message} (code: ${a.code})
         </button>`
        )
        .join(" ");
      homeSections?.prepend(banner);
    }
  } catch (e) {
    console.warn("promos fetch failed", e);
  }
}

// event delegation for banner buttons
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-apply-promo]");
  if (!btn) return;
  const code = btn.getAttribute("data-apply-promo");
  const rule = PROMO_MAP[code] || null;
  if (!rule) {
    toast("Invalid code");
    return;
  }
  state.globalPromo = { code, ...rule };
  try {
    localStorage.setItem("globalPromo", JSON.stringify(state.globalPromo));
  } catch {}
  toast(`Promo ${code} applied to your cart`);
  renderCart?.();
});

// helper to clear global promo (optional)
window.clearGlobalPromo = function () {
  state.globalPromo = null;
  try {
    localStorage.removeItem("globalPromo");
  } catch {}
  toast("Promo removed");
  renderCart?.();
};

// restore saved
try {
  const gp = JSON.parse(localStorage.getItem("globalPromo") || "null");
  if (gp && gp.code) state.globalPromo = gp;
} catch {}

// === Part 10: Orders & Analytics ===
async function loadOrders() {
  const wrap = $("#ordersList");
  if (!wrap) return;
  if (!state.user) {
    wrap.innerHTML = '<p class="small">Sign in to see orders.</p>';
    return;
  }

  try {
    const qref = query(
      collection(db, "orders"),
      where("userId", "==", state.user.uid),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const snap = await getDocs(qref);
    wrap.innerHTML = "";
    snap.forEach((docu) => {
      const o = docu.data();
      const card = h("div");
      card.className = "card";
      card.innerHTML = `
        <div class="pad">
          <div class="row between">
            <div class="card-title">Order #${docu.id
              .slice(-6)
              .toUpperCase()}</div>
            <div class="small">${o.orderDate || ""}</div>
          </div>
          <div class="small">Channel: ${o.channel || "online"} — Status: ${
        o.status || "paid"
      }</div>
          <ul class="disc small">
            ${(o.items || [])
              .map(
                (it) =>
                  `<li>${it.title} × ${it.qty} — ${fmt(
                    (it.price || 0) * (it.qty || 0)
                  )}</li>`
              )
              .join("")}
          </ul>
          <div class="row between">
            <div>Total</div><div class="price">${fmt(
              o.pricing?.total || 0
            )}</div>
          </div>
        </div>
      `;
      wrap.appendChild(card);
    });
    if (!wrap.children.length) {
      wrap.innerHTML = '<p class="small">No orders yet.</p>';
    }
  } catch (e) {
    console.warn("orders load blocked", e);
    wrap.innerHTML = '<p class="small">Unable to load orders.</p>';
  }
}

async function renderAnalytics() {
  // if not signed in → show empty charts
  if (!state.user) {
    new Chart($("#revChart"), {
      type: "line",
      data: { labels: [], datasets: [{ data: [] }] },
      options: { plugins: { legend: { display: false } } },
    });
    new Chart($("#topChart"), {
      type: "bar",
      data: { labels: [], datasets: [{ data: [] }] },
      options: { plugins: { legend: { display: false } } },
    });
    return;
  }
  try {
    const since = new Date(Date.now() - 30 * 86400000)
      .toISOString()
      .slice(0, 10);
    const qref = query(
      collection(db, "orders"),
      where("orderDate", ">=", since),
      limit(500)
    );
    const snap = await getDocs(qref);
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.now() - (29 - i) * 86400000)
        .toISOString()
        .slice(0, 10);
      return { d, v: 0 };
    });
    const tally = {};
    snap.forEach((docu) => {
      const o = docu.data();
      const day = days.find((x) => x.d === o.orderDate);
      if (day) day.v += Number(o.pricing?.total || 0);
      (o.items || []).forEach((it) => {
        tally[it.title] = (tally[it.title] || 0) + (it.qty || 0);
      });
    });
    new Chart($("#revChart"), {
      type: "line",
      data: {
        labels: days.map((x) => x.d.slice(5)),
        datasets: [{ label: "Revenue", data: days.map((x) => x.v) }],
      },
      options: { responsive: true, plugins: { legend: { display: false } } },
    });
    const top = Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7);
    new Chart($("#topChart"), {
      type: "bar",
      data: {
        labels: top.map(([k]) => k),
        datasets: [{ label: "Qty", data: top.map(([, v]) => v) }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { maxRotation: 45 } } },
      },
    });
  } catch (e) {
    console.warn("analytics blocked", e);
  }
}

// === Part 11: Membership (demo activate) ===
$("#btnMembership")?.addEventListener("click", () =>
  $("#memberModal")?.showModal()
);
$("#buyMembership")?.addEventListener("click", async () => {
  if (!state.user) {
    $("#authModal")?.showModal();
    return;
  }
  const plan =
    document.querySelector('input[name="mplan"]:checked')?.value || "basic";
  const rate = plan === "plus" ? 0.03 : 0.02;
  const now = Date.now(),
    year = 365 * 86400000;
  state.membership = { plan, rate, startTs: now, expiresTs: now + year };
  try {
    await setDoc(
      doc(db, "users", state.user.uid),
      { member: state.membership },
      { merge: true }
    );
  } catch (e) {
    console.warn("member update fail", e);
  }
  $("#memberModal")?.close();
  renderMember();
  toast("Membership activated");
});

function renderMember() {
  const el = $("#memberBadge");
  if (!el) return;
  if (state.membership) {
    el.textContent = `Member: ${state.membership.plan.toUpperCase()} (${Math.round(
      state.membership.rate * 100
    )}% cashback)`;
    el.style.display = "";
  } else {
    el.textContent = "";
    el.style.display = "none";
  }
}

// === Part 12: Auth & Admin ===
async function ensureUser(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(
      ref,
      {
        email: user.email || "",
        displayName: user.displayName || "",
        role: "user",
        createdAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }
}

async function checkAdmin(user) {
  if (!user) {
    state.isAdmin = false;
    return false;
  }
  const tok = await getIdTokenResult(user, true);
  if (tok.claims && tok.claims.admin === true) {
    state.isAdmin = true;
    return true;
  }
  // fallback by users doc (not secure alone)
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    state.isAdmin = snap.exists() && snap.data().role === "admin";
  } catch {
    state.isAdmin = false;
  }
  return state.isAdmin;
}

function updateGreet() {
  if (greet) {
    greet.textContent = state.user
      ? `Hi, ${state.user.displayName || state.user.email || "there"}`
      : "";
  }
}

// sign-in button (if any)
$("#btnUser")?.addEventListener("click", async () => {
  if (state.user) {
    toast("Already signed in");
    return;
  }
  const provider = new GoogleAuthProvider();
  await signInWithRedirect(auth, provider); // avoids popup COOP warnings
});

onAuthStateChanged(auth, async (user) => {
  state.user = user || null;
  if (user) {
    await ensureUser(user);
    await checkAdmin(user);
  } else {
    state.isAdmin = false;
  }
  updateGreet();
  renderMember();
  updateAdminUI();
});

// Cart open/close
const cartDrawer = document.getElementById('cartDrawer');
document.getElementById('btnCart')?.addEventListener('click', ()=> cartDrawer?.classList.add('open'));
document.getElementById('closeCart')?.addEventListener('click', ()=> cartDrawer?.classList.remove('open'));

// Click outside main → close cart (optional)
document.addEventListener('click', (e)=>{
  const inside = e.target.closest('#cartDrawer, #btnCart');
  if(!inside) cartDrawer?.classList.remove('open');
});

// === Part 13: Init ===
function fillCategoriesOnce() {
  const cats = Array.from(new Set((DEMO_PRODUCTS || []).map((p) => p.cat)))
    .filter(Boolean)
    .sort();
  state.categories = cats;

  const sel = $("#categorySelect");
  if (!sel) return; // layout without select → skip
  sel.innerHTML = '<option value="">All categories</option>';
  cats.forEach((c) => {
    const opt = h("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
}

function init() {
  buildNavChips();
  wireSearchInputs();
  // products first
  fillCategoriesOnce();
  // home & shop
  renderHomeSections();
  showShopGrid("All Categories");
  // misc
  updateCartCount();
  fetchPromos();

  // [data-close] already handled globally above; keep this if you want explicit
  $$("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-close");
      document.getElementById(id)?.close();
    });
  });
}

document.addEventListener("DOMContentLoaded", init);

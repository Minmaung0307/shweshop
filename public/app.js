import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// NAV CHIPS (order matters)
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

let currentCategory = ""; // for shop grid “See all”
let currentAudience = "all";

const greet = document.getElementById("greet");
const navScroll = document.getElementById("navScroll");
const searchInputDesktop = document.getElementById("searchInput");
const searchInputMobile = document.getElementById("searchInputMobile");

const homeSections = document.getElementById("homeSections");
const viewShop = document.getElementById("view-shop");
const shopTitle = document.getElementById("shopTitle");
const grid = document.getElementById("productGrid");

// === Replace with your own config (or import from config.js if you already use it) ===
const firebaseConfig = {
  apiKey: "AIzaSyADRM_83skeLeGK4Mf67rzCRTcdDjOptY0",
  authDomain: "shweshop-mm.firebaseapp.com",
  projectId: "shweshop-mm",
  storageBucket: "shweshop-mm.firebasestorage.app",
  messagingSenderId: "361216212375",
  appId: "1:361216212375:web:fed19b7fe4072000c298d2",
  measurementId: "G-WBJJZZNLX6",
};

// EmailJS init
window.addEventListener("load", () => {
  if (window.emailjs) emailjs.init({ publicKey: "WT0GOYrL9HnDKvLUf" });
});

// App
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// State
const state = {
  user: null,
  products: [],
  categories: [],
  page: 0,
  pageSize: 20,
  audience: "all", // 'all' | 'men' | 'women' | 'kids' | 'pets'
  cart: loadJSON("cart", []),
  itemPromos: {}, // { [productId]: { code, type, value } }
  membership: null,
};

// Utils
function $(s) {
  return document.querySelector(s);
}
function h(t) {
  return document.createElement(t);
}
function fmt(n) {
  return "$" + Number(n || 0).toFixed(2);
}
function loadJSON(k, d) {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? d;
  } catch {
    return d;
  }
}
function saveJSON(k, v) {
  localStorage.setItem(k, JSON.stringify(v));
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Delivery/pickup refs
const deliveryFields = document.getElementById("deliveryFields");
const pickupFields = document.getElementById("pickupFields");
document.querySelectorAll('input[name="dopt"]').forEach((r) => {
  r.addEventListener("change", () => {
    const v = document.querySelector('input[name="dopt"]:checked').value;
    deliveryFields.style.display = v === "delivery" ? "grid" : "none";
    pickupFields.style.display = v === "pickup" ? "grid" : "none";
  });
});

function buildNavChips() {
  navScroll.innerHTML = "";
  NAV_ITEMS.forEach((item) => {
    const b = document.createElement("button");
    b.className = "nav-chip";
    b.textContent = item.label;
    b.dataset.key = item.key;
    if (
      (item.type === "aud" && item.value === currentAudience) ||
      (item.type === "cat" && item.value === currentCategory) ||
      (item.type === "nav" && !currentCategory)
    ) {
      // mark defaults active for first paint
    }
    b.addEventListener("click", () => onNavClick(item, b));
    navScroll.appendChild(b);
  });
}
function onNavClick(item, btn) {
  // set active visual
  navScroll
    .querySelectorAll(".nav-chip")
    .forEach((x) => x.classList.remove("active"));
  btn.classList.add("active");

  // switch by type
  if (item.type === "nav" && item.key === "allCategories") {
    currentCategory = "";
    showShopGrid("All Categories");
    return;
  }
  if (item.type === "aud") {
    currentAudience = item.value;
    // keep home view; re-render sections and grid if visible
    renderHomeSections();
    if (
      !viewShop.classList.contains("view") ||
      viewShop.classList.contains("active")
    ) {
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
    currentCategory = ""; // tag view → show grid filtered by "new"
    showShopGrid("New Arrivals", { tag: "new" });
    return;
  }
  if (item.type === "view") {
    if (item.value === "orders") {
      switchView("orders");
      return;
    }
    if (item.value === "member") {
      document.getElementById("btnMembership")?.click();
      return;
    }
    if (item.value === "analytics") {
      switchView("analytics");
      return;
    }
  }
}
function switchView(name) {
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.remove("active"));
  document.getElementById("view-" + name)?.classList.add("active");
}

function getSearchQuery() {
  return (searchInputDesktop?.value || searchInputMobile?.value || "")
    .trim()
    .toLowerCase();
}
function wireSearchInputs() {
  const handler = () => {
    // when searching, show grid view to see results; keep app layout stable
    showShopGrid(currentCategory || "All Categories");
  };
  searchInputDesktop?.addEventListener("input", handler);
  searchInputMobile?.addEventListener("input", () => {
    searchInputDesktop.value = searchInputMobile.value;
    handler();
  });
}

function updateGreet() {
  if (state.user) {
    greet.textContent = `Hi, ${
      state.user.displayName || state.user.email || "there"
    }`;
  } else {
    greet.textContent = "";
  }
}
onAuthStateChanged(auth, async (user) => {
  state.user = user || null;
  if (user) await ensureUser(user);
  updateGreet();
  renderMember();
});

function renderHomeSections() {
  // pick some categories present in products
  const cats = Array.from(new Set(DEMO_PRODUCTS.map((p) => p.cat))).slice(0, 6);
  homeSections.innerHTML = "";
  cats.forEach((cat, idx) => {
    const sec = document.createElement("div");
    sec.className = "section";
    sec.innerHTML = `
      <div class="section-head">
        <div class="strong">${cat}</div>
        <button class="btn btn-soft btn-mini" data-see="${cat}">See all</button>
      </div>
      <div class="hlist" id="hlist-${cat.replace(/\s+/g, "-")}"></div>
      ${
        idx % 2 === 1
          ? `<div class="ad-slot">Ad space — your brand here</div>`
          : ``
      }
    `;
    homeSections.appendChild(sec);
    const cont = sec.querySelector(".hlist");
    DEMO_PRODUCTS.filter(
      (p) =>
        (!currentAudience ||
          currentAudience === "all" ||
          (p.aud || "all") === currentAudience) &&
        p.cat === cat
    )
      .slice(0, 12)
      .forEach((p) => {
        const item = document.createElement("div");
        item.className = "hitem";
        item.innerHTML = `
          <img class="thumb" src="${p.img}" alt="${
          p.title
        }" loading="lazy" decoding="async">
          <div class="small strong" style="margin-top:.4rem">${p.title}</div>
          <div class="small">${fmt(p.price)}</div>
        `;
        item
          .querySelector("img")
          .addEventListener("click", () => openProduct(p));
        cont.appendChild(item);
      });
    sec.querySelector("[data-see]")?.addEventListener("click", () => {
      currentCategory = cat;
      showShopGrid(cat);
    });
  });
}

function showShopGrid(title, opts = {}) {
  shopTitle.textContent = title || "Shop";
  switchView("shop");
  renderGrid(opts);
}

// Demo products with multiple images + audience + specs
const DEMO_PRODUCTS = [
  {
    id: "p1",
    title: "Classic Sushi Set",
    price: 19.9,
    cat: "Food",
    aud: "all",
    img: "https://images.unsplash.com/photo-1553621042-f6e147245754?q=80&w=800&auto=format&fit=crop",
    images: [
      "https://images.unsplash.com/photo-1553621042-f6e147245754?q=80&w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1562158070-0bdc6aab9476?q=80&w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1559305616-3f99cd43e353?q=80&w=800&auto=format&fit=crop",
    ],
    desc: "Fresh nigiri & rolls.",
    specs: [
      "12 pcs set",
      "Wasabi & ginger included",
      "Soy sauce sachet",
      "Keep refrigerated",
    ],

    // နမူနာကြည့်ရန် လေ့လာရန်
    //     img: 'images/products/men/p100-shirt/thumb.jpg',
    //   images: [
    //     'images/products/men/p100-shirt/main.jpg',
    //     'images/products/men/p100-shirt/1.jpg',
    //     'images/products/men/p100-shirt/2.jpg'
    //   ],
    //   desc: 'Soft cotton tee.',
    //   specs: ['100% cotton', 'Regular fit', 'Machine washable']
  },
  {
    id: "p3",
    title: "Bluetooth Earbuds",
    price: 39.0,
    cat: "Electronics",
    aud: "all",
    img: "https://images.unsplash.com/photo-1518442072051-99d3c131e1c1?q=80&w=800&auto=format&fit=crop",
    images: [
      "https://images.unsplash.com/photo-1518442072051-99d3c131e1c1?q=80&w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?q=80&w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1498049794561-7780e7231661?q=80&w=800&auto=format&fit=crop",
    ],
    desc: "Clear sound, long battery.",
    specs: [
      "BT 5.3",
      "24h battery with case",
      "USB-C charging",
      "IPX4 splash resistant",
    ],
  },
  {
    id: "p13",
    title: "Graphic T-shirt",
    price: 14.5,
    cat: "Fashion",
    aud: "men",
    img: "https://images.unsplash.com/photo-1520975916090-3105956dac38?q=80&w=800&auto=format&fit=crop",
    images: [
      "https://images.unsplash.com/photo-1520975916090-3105956dac38?q=80&w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=800&auto=format&fit=crop",
    ],
    desc: "Soft cotton tee.",
    specs: ["100% cotton", "Regular fit", "Machine washable"],
  },
  {
    id: "p14",
    title: "Cozy Hoodie",
    price: 29.0,
    cat: "Fashion",
    aud: "women",
    img: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=800&auto=format&fit=crop",
    images: [
      "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=800&auto=format&fit=crop",
    ],
    desc: "Warm & soft.",
    specs: ["Blend fleece", "Kangaroo pocket", "Relaxed fit"],
  },
  {
    id: "p25",
    title: "Kids Bottle 300ml",
    price: 9.5,
    cat: "Kids",
    aud: "kids",
    img: "https://images.unsplash.com/photo-1512428559087-560fa5ceab42?q=80&w=800&auto=format&fit=crop",
    images: [
      "https://images.unsplash.com/photo-1512428559087-560fa5ceab42?q=80&w=800&auto=format&fit=crop",
    ],
    desc: "Leak-proof bottle for kids.",
    specs: ["BPA-free", "Dishwasher safe", "Lightweight"],
  },
  {
    id: "p26",
    title: "Pet Treats Pack",
    price: 6.5,
    cat: "Pets",
    aud: "pets",
    img: "https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=800&auto=format&fit=crop",
    images: [
      "https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=800&auto=format&fit=crop",
    ],
    desc: "Crunchy treats for dogs.",
    specs: ["Chicken flavor", "No artificial colors", "Resealable bag"],
  },
  // More simple items
  {
    id: "p2",
    title: "Matcha Latte",
    price: 4.9,
    cat: "Drinks",
    aud: "all",
    img: "https://images.unsplash.com/photo-1498804103079-a6351b050096?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "Creamy, earthy, energizing.",
  },
  {
    id: "p4",
    title: "Handmade Tote",
    price: 24.5,
    cat: "Fashion",
    aud: "women",
    img: "https://images.unsplash.com/photo-1547949003-9792a18a2601?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "Durable canvas everyday bag.",
  },
  {
    id: "p5",
    title: "AyaPay Gift Card",
    price: 25.0,
    cat: "Gift",
    aud: "all",
    img: "https://images.unsplash.com/photo-1557426272-fc759fdf7a8d?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "Send love instantly.",
  },
  {
    id: "p6",
    title: "KBZPay Top-Up",
    price: 10.0,
    cat: "Topup",
    aud: "all",
    img: "https://images.unsplash.com/photo-1535223289827-42f1e9919769?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "Digital wallet recharge.",
  },
  {
    id: "p7",
    title: "Salmon Sashimi",
    price: 12.9,
    cat: "Food",
    aud: "all",
    img: "https://images.unsplash.com/photo-1559305616-3f99cd43e353?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "Premium cut, melt-in-mouth.",
  },
  {
    id: "p8",
    title: "Tuna Roll",
    price: 7.9,
    cat: "Food",
    aud: "all",
    img: "https://images.unsplash.com/photo-1562158070-0bdc6aab9476?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "Light and tasty roll.",
  },
  {
    id: "p9",
    title: "Iced Americano",
    price: 3.5,
    cat: "Drinks",
    aud: "all",
    img: "https://images.unsplash.com/photo-1498804103079-a6351b050096?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "Bold & refreshing.",
  },
  {
    id: "p10",
    title: "Green Tea",
    price: 2.2,
    cat: "Drinks",
    aud: "all",
    img: "https://images.unsplash.com/photo-1442512595331-e89e73853f31?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "Healthy classic brew.",
  },
  {
    id: "p11",
    title: "USB-C Cable",
    price: 6.9,
    cat: "Electronics",
    aud: "all",
    img: "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "Fast charging, durable.",
  },
  {
    id: "p12",
    title: "Phone Stand",
    price: 8.0,
    cat: "Electronics",
    aud: "all",
    img: "https://images.unsplash.com/photo-1498049794561-7780e7231661?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "Adjustable, sturdy.",
  },
  {
    id: "p15",
    title: "Gift Box S",
    price: 9.9,
    cat: "Gift",
    aud: "all",
    img: "https://images.unsplash.com/photo-1487700160041-babef9c3cb55?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "For small surprises.",
  },
  {
    id: "p16",
    title: "Gift Box L",
    price: 19.9,
    cat: "Gift",
    aud: "all",
    img: "https://images.unsplash.com/photo-1487700160041-babef9c3cb55?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "For big surprises.",
  },
  {
    id: "p17",
    title: "Jasmine Tea",
    price: 3.0,
    cat: "Drinks",
    aud: "all",
    img: "https://images.unsplash.com/photo-1451748266019-3c100abf4f68?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "Floral aroma.",
  },
  {
    id: "p18",
    title: "Nigiri Mix",
    price: 16.9,
    cat: "Food",
    aud: "all",
    img: "https://images.unsplash.com/photo-1553621042-f6e147245754?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "Chef selection.",
  },
  {
    id: "p19",
    title: "Chopsticks Set",
    price: 5.9,
    cat: "Food",
    aud: "all",
    img: "https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "Reusable bamboo.",
  },
  {
    id: "p20",
    title: "Thermal Bottle",
    price: 18.0,
    cat: "Electronics",
    aud: "all",
    img: "https://images.unsplash.com/photo-1512428559087-560fa5ceab42?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "Hot or cold all day.",
  },
  {
    id: "p21",
    title: "Sushi Knife",
    price: 44.0,
    cat: "Food",
    aud: "men",
    img: "https://images.unsplash.com/photo-1604907053170-1c812f3b5481?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "Sharp & precise.",
  },
  {
    id: "p22",
    title: "Cordless Trimmer",
    price: 25.0,
    cat: "Electronics",
    aud: "men",
    img: "https://images.unsplash.com/photo-1560393464-5c69a73c5770?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "Portable grooming.",
  },
  {
    id: "p23",
    title: "Canvas Cap",
    price: 11.0,
    cat: "Fashion",
    aud: "all",
    img: "https://images.unsplash.com/photo-1520975916090-3105956dac38?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "Daily essential.",
  },
  {
    id: "p24",
    title: "Sticker Pack",
    price: 3.2,
    cat: "Gift",
    aud: "kids",
    img: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?q=80&w=800&auto=format&fit=crop",
    images: null,
    desc: "Fun & colorful.",
  },
];

// Promo map (per-item)
const PROMO_MAP = {
  BUYMORE10: { type: "percent", value: 10 },
  WELCOME5: { type: "amount", value: 5 },
};

// Elements
const sidebar   = document.getElementById("sidebar");
const btnMenu   = document.getElementById("btnMenu");
const closeSidebar = document.getElementById("closeSidebar");
const btnSearch = $("#btnSearch");
const main = $("#main");
// const grid = $("#productGrid");
const categorySelect = $("#categorySelect");
const searchInput = $("#searchInput");
const audienceChips = $("#audienceChips");
const loadMoreBtn = $("#loadMore");

const cartDrawer = $("#cartDrawer");
const cartItems = $("#cartItems");
const cartCount = $("#cartCount");
const subtotalEl = $("#subtotal");
const promoAmountEl = $("#promoAmount");
const memberDiscEl = $("#memberDisc");
const grandTotalEl = $("#grandTotal");

const productModal = $("#productModal");
const pdImg = $("#pdImg");
const pdThumbs = $("#pdThumbs");
const pdTitle = $("#pdTitle");
const pdPrice = $("#pdPrice");
const pdDesc = $("#pdDesc");
const pdSpecs = $("#pdSpecs");
const pdQty = $("#pdQty");
const pdAdd = $("#pdAdd");
const relatedGrid = $("#relatedGrid");

const payTabs = document.querySelectorAll(".pay-tabs .chip");
const payPanels = document.querySelectorAll(".pay-panel");
const kbzPaid = $("#kbzPaid");
const cbPaid = $("#cbPaid");
const ayaPaid = $("#ayaPaid");

const btnCart = $("#btnCart");
const btnUser = $("#btnUser");
const closeCart = $("#closeCart");

const memberModal = $("#memberModal");
const btnMembership = $("#btnMembership");
const buyMembership = $("#buyMembership");
const memberStatus = $("#memberStatus");

const authModal = $("#authModal");
const btnGoogle = $("#btnGoogle");

const navLinks = document.querySelectorAll(".nav-links .link");

// Sidebar
btnMenu?.addEventListener("click", () => sidebar?.classList.add("open"));
closeSidebar?.addEventListener("click", () => sidebar?.classList.remove("open"));

// Search button – scroll to filters (no DB call)
btnSearch.addEventListener("click", () => {
  document
    .getElementById("filters")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
  searchInput?.focus();
});

// Views
navLinks.forEach((b) => {
  b.addEventListener("click", () => {
    navLinks.forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    document
      .querySelectorAll(".view")
      .forEach((v) => v.classList.remove("active"));
    $("#view-" + b.dataset.view).classList.add("active");
    sidebar?.classList.remove("open");
    if (b.dataset.view === "analytics") renderAnalytics();
    if (b.dataset.view === "orders") loadOrders();
  });
});

// Auth
btnUser.addEventListener("click", () => {
  if (state.user) {
    alert(`Logged in as: ${state.user.displayName || state.user.email}`);
  } else {
    authModal.showModal();
  }
});
btnGoogle.addEventListener("click", async () => {
  try {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    await ensureUser(cred.user);
    authModal.close();
    toast("Signed in ✔");
  } catch (e) {
    console.error(e);
    alert("Sign-in failed");
  }
});

async function ensureUser(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email || null,
      name: user.displayName || "",
      createdAt: serverTimestamp(),
      member: null,
      totalSpent: 0,
      firstOrderAt: null,
    });
  } else {
    state.membership = snap.data().member || null;
  }
}

// Filters
function fillCategoriesOnce() {
  const cats = Array.from(new Set(DEMO_PRODUCTS.map((p) => p.cat))).sort();
  state.categories = cats;
  cats.forEach((c) => {
    const opt = h("option");
    opt.value = c;
    opt.textContent = c;
    categorySelect.appendChild(opt);
  });
}
categorySelect?.addEventListener("change", renderGrid);
searchInput?.addEventListener("input", renderGrid);
(audienceChips?.querySelectorAll("button") || []).forEach((btn) => {
  btn.addEventListener("click", () => {
    (audienceChips?.querySelectorAll("button") || [])
      .forEach((x) => x.classList.remove("active"));
    btn.classList.add("active");
    state.audience = btn.dataset.aud;
    renderGrid();
  });
});

// (optional) If you had a "Load more" button:
loadMoreBtn?.addEventListener("click", loadProductsPage);

// Products paging
function loadProductsPage() {
  if (state.page === 0 && state.products.length === 0) {
    state.products = DEMO_PRODUCTS.slice(); // in real app: fetch/paginate
    fillCategoriesOnce();
  }
  state.page++;
  renderGrid();
}

// Render grid with per-card promo & quick view
function renderGrid(opts = {}) {
  const q = getSearchQuery();
  const cat = currentCategory.trim().toLowerCase();
  const aud = currentAudience;

  grid.innerHTML = "";
  const filtered = DEMO_PRODUCTS.filter((p) => {
    const okCat = !cat || p.cat.toLowerCase() === cat;
    const hay = (p.title + " " + (p.desc || "")).toLowerCase();
    const okQ = !q || hay.includes(q);
    const okAud = aud === "all" || (p.aud || "all") === aud;
    const okTag = !opts.tag || opts.tag !== "new" || p.new === true; // add p.new flag to your new arrivals items
    return okCat && okQ && okAud && okTag;
  });

  filtered.forEach((p) => {
    const card = document.createElement("div");
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
    card.querySelector(".btn").addEventListener("click", () => openProduct(p));
    card.querySelector("img").addEventListener("click", () => openProduct(p));
    const [promoInput, promoBtn] = card.querySelectorAll(".promo-inline > *");
    promoBtn.addEventListener("click", () => {
      const code = (promoInput.value || "").trim().toUpperCase();
      const rule = PROMO_MAP[code] || null;
      if (!code) {
        delete state.itemPromos[p.id];
        toast("Promo cleared");
        renderCart();
        return;
      }
      if (!rule) {
        toast("Invalid code");
        return;
      }
      state.itemPromos[p.id] = { code, ...rule };
      toast(`Promo ${code} applied to ${p.title}`);
      renderCart();
    });
    grid.appendChild(card);
  });

  // If no results
  if (!filtered.length) {
    grid.innerHTML = `<p class="small">No products found.</p>`;
  }
}

// Product modal (gallery, specs, related)
let currentProduct = null;
function openProduct(p) {
  currentProduct = p;
  const imgs = p.images && p.images.length ? p.images : [p.img];

  //   // inside openProduct(p) after you set const imgs = ...
  // const main = imgs[0]; // e.g. images/products/men/p100-shirt/main.jpg
  // const base = main.replace(/(\.avif|\.webp|\.jpe?g)$/i, ''); // strip ext
  // const jpg = base + '.jpg';
  // const jpg800 = base + '-800.jpg';
  // const webp = base + '.webp';
  // const webp800 = base + '-800.webp';
  // const avif = base + '.avif';
  // const avif800 = base + '-800.avif';

  // pdMedia.innerHTML = `
  //   <picture>
  //     <source type="image/avif"
  //             srcset="${avif800} 800w, ${avif} 1200w"
  //             sizes="(max-width: 768px) 100vw, 50vw">
  //     <source type="image/webp"
  //             srcset="${webp800} 800w, ${webp} 1200w"
  //             sizes="(max-width: 768px) 100vw, 50vw">
  //     <img id="pdImg"
  //          src="${jpg}"
  //          srcset="${jpg800} 800w, ${jpg} 1200w"
  //          sizes="(max-width: 768px) 100vw, 50vw"
  //          alt="${p.title}"
  //          width="1200" height="1200"
  //          loading="eager" decoding="async">
  //   </picture>
  // `;

  //   const pdMedia = document.querySelector('.pd-media'); // main big image container

  pdImg.src = imgs[0];
  pdImg.alt = p.title;
  pdTitle.textContent = p.title;
  pdPrice.textContent = fmt(p.price);
  pdDesc.textContent = p.desc || "";

  // specs
  pdSpecs.innerHTML = (p.specs || []).map((s) => `<li>${s}</li>`).join("");

  // thumbs
  pdThumbs.innerHTML = "";
  imgs.forEach((src, i) => {
    const im = h("img");
    im.src = src;
    im.alt = p.title + " " + (i + 1);
    if (i === 0) im.classList.add("active");
    im.addEventListener("click", () => {
      pdThumbs
        .querySelectorAll("img")
        .forEach((x) => x.classList.remove("active"));
      im.classList.add("active");
      pdImg.src = src;
    });
    pdThumbs.appendChild(im);
  });
  //   နမူနာလေ့လာရန်ဖြစ်သည်
  // pdThumbs.innerHTML = '';
  //   imgs.forEach((src, i)=>{
  //     const im = document.createElement('img');
  //     im.src = src;
  //     im.alt = `${p.title} ${i+1}`;
  //     im.width = 120; im.height = 120;
  //     im.loading = 'lazy';
  //     if(i===0) im.classList.add('active');
  //     im.addEventListener('click', ()=>{
  //       pdThumbs.querySelectorAll('img').forEach(x=>x.classList.remove('active'));
  //       im.classList.add('active');
  //       // If you used <picture>, also rebuild picture here (4B)
  //       pdImg.src = src;
  //       pdImg.alt = `${p.title} ${i+1}`;
  //     });
  //     pdThumbs.appendChild(im);
  //   });

  // related (same cat OR same audience)
  const related = state.products
    .filter(
      (x) =>
        x.id !== p.id &&
        (x.cat === p.cat || (x.aud || "all") === (p.aud || "all"))
    )
    .slice(0, 6);
  relatedGrid.innerHTML = related
    .map((r) => `<img src="${r.img}" alt="${r.title}" data-id="${r.id}">`)
    .join("");
  relatedGrid.querySelectorAll("img").forEach((img) => {
    img.addEventListener("click", () => {
      const r = state.products.find((z) => z.id === img.dataset.id);
      if (r) openProduct(r);
    });
  });

  pdQty.value = 1;
  productModal.showModal();
}
pdAdd.addEventListener("click", () => {
  const qty = clamp(parseInt(pdQty.value || "1", 10), 1, 999);
  addToCart(currentProduct, qty);
  productModal.close();
  openCart();
});

// Cart
btnCart.addEventListener("click", openCart);
closeCart.addEventListener("click", () => cartDrawer.classList.remove("open"));
main.addEventListener("click", (e) => {
  if (
    cartDrawer.classList.contains("open") &&
    !cartDrawer.contains(e.target) &&
    !btnCart.contains(e.target)
  ) {
    cartDrawer.classList.remove("open");
  }
});

function openCart() {
  cartDrawer.classList.add("open");
  renderCart();
  setupPayPalButtons();
  drawWalletQRs();
}
function addToCart(p, qty = 1) {
  const i = state.cart.findIndex((x) => x.id === p.id);
  if (i > -1) state.cart[i].qty += qty;
  else
    state.cart.push({
      id: p.id,
      title: p.title,
      price: p.price,
      img: p.img,
      qty,
    });
  saveJSON("cart", state.cart);
  updateCartCount();
  toast("Added to cart");
}
function removeFromCart(pid) {
  state.cart = state.cart.filter((x) => x.id !== pid);
  saveJSON("cart", state.cart);
  renderCart();
  updateCartCount();
}
function updateQty(pid, qty) {
  const i = state.cart.findIndex((x) => x.id === pid);
  if (i > -1) {
    state.cart[i].qty = clamp(qty, 1, 999);
    saveJSON("cart", state.cart);
    renderCart();
  }
}
function updateCartCount() {
  const n = state.cart.reduce((a, b) => a + b.qty, 0);
  cartCount.textContent = n;
}
function renderCart() {
  cartItems.innerHTML = "";
  if (state.cart.length === 0) {
    cartItems.innerHTML = `<p class="small">Your cart is empty.</p>`;
  } else {
    state.cart.forEach((item) => {
      const row = h("div");
      row.className = "cart-row";
      row.innerHTML = `
        <img src="${item.img}" alt="${item.title}">
        <div>
          <div class="strong">${item.title}</div>
          <div class="small">${fmt(item.price)}</div>
          <div class="qty">
            <button class="icon-btn" aria-label="dec">−</button>
            <input type="number" value="${item.qty}" min="1">
            <button class="icon-btn" aria-label="inc">+</button>
          </div>
          ${
            state.itemPromos[item.id]
              ? `<div class="small">Promo: ${
                  state.itemPromos[item.id].code
                }</div>`
              : ""
          }
        </div>
        <button class="icon-btn" aria-label="remove">✕</button>
      `;
      const [dec, input, inc] = row.querySelectorAll(".qty > *");
      dec.addEventListener("click", () => updateQty(item.id, item.qty - 1));
      inc.addEventListener("click", () => updateQty(item.id, item.qty + 1));
      input.addEventListener("input", () =>
        updateQty(item.id, parseInt(input.value || "1", 10))
      );
      row
        .querySelector('[aria-label="remove"]')
        .addEventListener("click", () => removeFromCart(item.id));
      cartItems.appendChild(row);
    });
  }
  if(state.globalPromo){
  const info = h('div');
  info.className = 'small';
  info.innerHTML = `Global promo applied: <b>${state.globalPromo.code}</b>
    <button class="btn-mini btn-outline" style="margin-left:.4rem" onclick="clearGlobalPromo()">Remove</button>`;
  cartItems.prepend(info);
}
  computeTotals();
}

// Totals (with per-item promos + threshold + membership)
function computeTotals(){
  let subtotal = 0;
  let itemPromoCut = 0;

  state.cart.forEach(ci=>{
    const rowSub = ci.price * ci.qty;
    subtotal += rowSub;
    const promo = state.itemPromos[ci.id];
    if(promo){
      if(promo.type==='percent') itemPromoCut += (promo.value/100)*rowSub;
      if(promo.type==='amount')  itemPromoCut += promo.value * ci.qty; // per item
    }
  });

  // auto threshold promo (example)
  const thresholdCut = subtotal > 100 ? 0.05 * subtotal : 0;

  // ✅ Global promo (banner/applyGlobalPromo) — subtotal အပေါ် တွက်
  let globalCut = 0;
  if(state.globalPromo){
    if(state.globalPromo.type === 'percent') globalCut = (state.globalPromo.value/100)*subtotal;
    if(state.globalPromo.type === 'amount')  globalCut = state.globalPromo.value; // per order
  }

  // membership (cashback-like) — subtotal အပေါ်
  const memberRate = state.membership?.rate || 0;
  const memberCut  = memberRate * subtotal;

  const promoCut = itemPromoCut + thresholdCut + globalCut;
  const total = Math.max(0, subtotal - promoCut - memberCut);

  subtotalEl.textContent   = fmt(subtotal);
  // promoAmount includes item + threshold + global
  promoAmountEl.textContent = '-'+fmt(promoCut);
  memberDiscEl.textContent  = '-'+fmt(memberCut);
  grandTotalEl.textContent  = fmt(total);

  return { subtotal, promoCut, memberCut, total };
}

// Pay tabs
payTabs.forEach((t) => {
  t.addEventListener("click", () => {
    payTabs.forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    payPanels.forEach((p) => p.classList.remove("active"));
    $("#payPanel-" + t.dataset.paytab).classList.add("active");
    if (t.dataset.paytab === "paypal") setupPayPalButtons();
    else drawWalletQRs();
  });
});

// Wallet “QR” demo
function drawQR(canvas, text) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0d1624";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#7dd3fc";
  for (let y = 0; y < canvas.height; y += 12) {
    for (let x = 0; x < canvas.width; x += 12) {
      const v = (x * 7 + y * 13 + text.length * 31) % 97 > 48 ? 1 : 0;
      if (v) ctx.fillRect(x + 2, y + 2, 8, 8);
    }
  }
  ctx.fillStyle = "#e7edf3";
  ctx.fillRect(10, canvas.height - 22, canvas.width - 20, 16);
  ctx.fillStyle = "#0b0f14";
  ctx.font = "12px Inter";
  ctx.fillText("Demo QR", 14, canvas.height - 10);
}
function drawWalletQRs() {
  const { total } = computeTotals();
  const orderId = currentOrderId() || uid();
  const amt = total.toFixed(2);
  const kbzCanvas = $("#kbzQR"),
    cbCanvas = $("#cbQR"),
    ayaCanvas = $("#ayaQR");
  if (kbzCanvas)
    drawQR(kbzCanvas, `kbzpay://pay?order=${orderId}&amount=${amt}`);
  if (cbCanvas) drawQR(cbCanvas, `cbpay://pay?order=${orderId}&amount=${amt}`);
  if (ayaCanvas)
    drawQR(ayaCanvas, `ayapay://pay?order=${orderId}&amount=${amt}`);
}
kbzPaid.addEventListener("click", () => walletPaid("KBZPay"));
cbPaid.addEventListener("click", () => walletPaid("CBPay"));
ayaPaid.addEventListener("click", () => walletPaid("AyaPay"));
async function walletPaid(channel) {
  const order = await placeOrder({ channel, status: "paid" });
  await sendEmail(order);
  toast(`Payment confirmed via ${channel}`);
  afterOrderClear(order);
}

// PayPal
function setupPayPalButtons() {
  if (!window.paypal) return;
  const container = document.getElementById("paypal-button-container");
  container.innerHTML = "";
  const { total } = computeTotals();
  window.paypal
    .Buttons({
      style: { layout: "horizontal" },
      createOrder: async (data, actions) =>
        actions.order.create({
          purchase_units: [{ amount: { value: total.toFixed(2) } }],
        }),
      onApprove: async (data, actions) => {
        const details = await actions.order.capture();
        const order = await placeOrder({
          channel: "PayPal",
          status: "paid",
          paypal: details,
        });
        await sendEmail(order);
        toast("Payment successful with PayPal");
        afterOrderClear(order);
      },
      onError: (err) => {
        console.error(err);
        alert("PayPal error");
      },
    })
    .render("#paypal-button-container");
}

// Orders + Checkout
function currentOrderId() {
  return sessionStorage.getItem("currentOrderId");
}
function setCurrentOrderId(id) {
  sessionStorage.setItem("currentOrderId", id);
}

async function placeOrder(extra = {}) {
  if (state.cart.length === 0) {
    alert("Cart is empty");
    throw new Error("empty");
  }
  if (!state.user) {
    authModal.showModal();
    throw new Error("signin required");
  }
  const sums = computeTotals();
  const dopt =
    document.querySelector('input[name="dopt"]:checked')?.value || "delivery";
  const delivery =
    dopt === "delivery"
      ? {
          address: document.getElementById("addrLine")?.value || "",
          city: document.getElementById("addrCity")?.value || "",
          phone: document.getElementById("addrPhone")?.value || "",
          note: document.getElementById("addrNote")?.value || "",
        }
      : null;
  const pickup =
    dopt === "pickup"
      ? {
          store: document.getElementById("pickupStore")?.value || "",
          time: document.getElementById("pickupTime")?.value || "",
        }
      : null;
  const order = {
    userId: state.user.uid,
    items: state.cart.map((i) => ({
      id: i.id,
      title: i.title,
      price: i.price,
      qty: i.qty,
    })),
    pricing: sums,
    promos: state.itemPromos,
    membership: state.membership,
    channel: extra.channel || "",
    status: extra.status || "pending",
    createdAt: serverTimestamp(),
    orderDate: todayISO(),
    deliveryOption: dopt,
    deliveryInfo: delivery,
    pickupInfo: pickup,
  };
  const ref = await addDoc(collection(db, "orders"), order);
  order.id = ref.id;
  trackSale(order);
  const uref = doc(db, "users", state.user.uid);
  const usnap = await getDoc(uref);
  if (usnap.exists()) {
    const prev = usnap.data();
    await updateDoc(uref, {
      totalSpent: (prev.totalSpent || 0) + order.pricing.total,
      firstOrderAt: prev.firstOrderAt || serverTimestamp(),
    });
  }
  setCurrentOrderId(order.id);
  return order;
}
async function afterOrderClear(order) {
  state.cart = [];
  saveJSON("cart", state.cart);
  renderCart();
  updateCartCount();
  await loadOrders();
}

// EmailJS
async function sendEmail(order) {
  try {
    if (!window.emailjs) return;
    await emailjs.send("YOUR_EMAILJS_SERVICE_ID", "YOUR_EMAILJS_TEMPLATE_ID", {
      to_email: state.user.email,
      to_name: state.user.displayName || state.user.email,
      order_id: order.id,
      amount: order.pricing.total.toFixed(2),
      date: order.orderDate,
    });
  } catch (e) {
    console.warn("EmailJS failed", e);
  }
}

// Orders (syntactically fixed)
async function loadOrders() {
  const wrap = $("#ordersList");
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
    if (snap.empty) {
      wrap.innerHTML = '<p class="small">No orders yet.</p>';
      return;
    }
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
          <div class="small">Channel: ${o.channel || "-"} — Status: ${
        o.status || "-"
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
  } catch (e) {
    console.warn("orders load blocked", e);
    wrap.innerHTML = '<p class="small">Unable to load orders.</p>';
  }
}

// Membership
btnMembership?.addEventListener("click", () => memberModal.showModal());
buyMembership?.addEventListener("click", async () => {
  if (!state.user) {
    authModal.showModal();
    return;
  }
  const plan =
    document.querySelector('input[name="mplan"]:checked')?.value || "basic";
  const rate = plan === "plus" ? 0.03 : 0.02;
  const now = Date.now(),
    year = 365 * 86400000;
  state.membership = { plan, rate, startTs: now, expiresTs: now + year };
  try {
    await updateDoc(doc(db, "users", state.user.uid), {
      member: state.membership,
    });
  } catch {
    await setDoc(
      doc(db, "users", state.user.uid),
      {
        email: state.user.email || null,
        name: state.user.displayName || "",
        createdAt: serverTimestamp(),
        member: state.membership,
        totalSpent: 0,
        firstOrderAt: null,
      },
      { merge: true }
    );
  }
  memberModal.close();
  renderMember();
  toast("Membership activated");
});
function renderMember() {
  const m = state.membership;
  if (!state.user) {
    memberStatus.textContent = "Sign in to see status";
    return;
  }
  if (!m) {
    memberStatus.textContent = "Not a member yet";
    return;
  }
  const daysLeft = Math.max(
    0,
    Math.round((m.expiresTs - Date.now()) / 86400000)
  );
  memberStatus.textContent = `Active: ${m.plan} (${Math.round(
    m.rate * 100
  )}% cashback). ${daysLeft} days left.`;
}

// Analytics with guard + empty charts
let revChartInst = null,
  topChartInst = null;
async function renderAnalytics() {
  const revEl = document.getElementById("revChart");
  const topEl = document.getElementById("topChart");
  if (!revEl || !topEl) return;
  const destroyCharts = () => {
    try {
      revChartInst?.destroy();
    } catch {}
    try {
      topChartInst?.destroy();
    } catch {}
    revChartInst = null;
    topChartInst = null;
  };
  const drawEmptyCharts = () => {
    destroyCharts();
    revChartInst = new Chart(revEl, {
      type: "line",
      data: { labels: [], datasets: [{ label: "Revenue", data: [] }] },
      options: { plugins: { legend: { display: false } } },
    });
    topChartInst = new Chart(topEl, {
      type: "bar",
      data: { labels: [], datasets: [{ label: "Qty", data: [] }] },
      options: { plugins: { legend: { display: false } } },
    });
  };
  if (!state.user) {
    drawEmptyCharts();
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
    destroyCharts();
    revChartInst = new Chart(revEl, {
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
    topChartInst = new Chart(topEl, {
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
    drawEmptyCharts();
  }
}

// Init
// ✅ Ready-to-paste: improved init()
function init() {
  buildNavChips();
  wireSearchInputs();

  // Products first (this fills categories via loadProductsPage)
  loadProductsPage();

  // Home sections rely on products/audience
  renderHomeSections();

  updateCartCount();
  fetchPromos(); // banner injects into homeSections

  // close buttons for dialogs
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-close");
      document.getElementById(id)?.close();
    });
  });
}
init();

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-apply-promo]');
  if(!btn) return;
  const code = btn.getAttribute('data-apply-promo');
  const rule = PROMO_MAP[code] || null;
  if(!rule){ toast('Invalid code'); return; }
  state.globalPromo = { code, ...rule };
  try { localStorage.setItem('globalPromo', JSON.stringify(state.globalPromo)); } catch {}
  toast(`Promo ${code} applied to your cart`);
  renderCart();
});

// ✅ Ready-to-paste: robust fetchPromos() with Timestamp support + dedupe
async function fetchPromos() {
  try {
    const snap = await getDocs(collection(db, "promos"));
    const now = Date.now();
    const getMs = (v) => {
      if (!v) return null;
      // Firestore Timestamp?
      if (typeof v === "object" && typeof v.toDate === "function")
        return v.toDate().getTime();
      // string or number
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

    // remove previous banner to avoid duplicates
    const old = homeSections.querySelector(".promo-banner");
    if (old) old.remove();

    if (active.length) {
      const banner = document.createElement("div");
      banner.className = "ad-slot promo-banner";

      // Optionally filter by audience / members
      // const aud = state.membership ? 'members' : currentAudience;
      // const visible = active.filter(a => !a.audiences || a.audiences.includes('all') || a.audiences.includes(aud));
      // const list = visible.length ? visible : active;

      const list = active; // simple: show all active

      // ✅ Use buttons with onclick apply
      banner.innerHTML = list
        .map(
          (a) =>
            `<button class="btn-mini" onclick="applyGlobalPromo('${a.code}')">
       ${a.message} (code: ${a.code})
     </button>`
        )
        .join(" ");

      homeSections.prepend(banner);
    }
  } catch (e) {
    console.warn("promos fetch failed", e);
  }
}

// --- Global Promo (expose for inline onclick) ---
if (!state.globalPromo) state.globalPromo = null;

window.applyGlobalPromo = function(code){
  const rule = PROMO_MAP[code] || null;
  if(!rule){ toast('Invalid code'); return; }
  state.globalPromo = { code, ...rule };
  try { localStorage.setItem('globalPromo', JSON.stringify(state.globalPromo)); } catch {}
  toast(`Promo ${code} applied to your cart`);
  renderCart();
};

window.clearGlobalPromo = function(){
  state.globalPromo = null;
  try { localStorage.removeItem('globalPromo'); } catch {}
  toast('Promo removed');
  renderCart();
};

// boot: load saved global promo (optional)
try {
  const gp = JSON.parse(localStorage.getItem('globalPromo') || 'null');
  if (gp && gp.code) state.globalPromo = gp;
} catch {}

// Toast
function toast(msg) {
  const t = h("div");
  t.textContent = msg;
  t.style.cssText = `
    position:fixed; left:50%; bottom:24px; transform:translateX(-50%);
    background:#0f1724; border:1px solid #243149; padding:.55rem .85rem; border-radius:.7rem; z-index:50;
    font-weight:700;
  `;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

// Analytics navigation helper (optional)
// window.renderAnalytics = renderAnalytics;
document.getElementById("searchInput")?.addEventListener("input", renderGrid);
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", renderGrid);
  }
});

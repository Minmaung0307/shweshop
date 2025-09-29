// ===== Firebase v10 Modular (CDN imports) =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  GithubAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ===== EmailJS init (replace with your keys) =====
const EMAILJS_PUBLIC_KEY = "WT0GOYrL9HnDKvLUf";
const EMAILJS_SERVICE_ID = "service_z9tkmvr";
const EMAILJS_TEMPLATE_ID = "template_q5q471f";
// emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
try { emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY }); } catch {}

/* ==== Email helpers ==== */
async function sendEmail({ to, subject, html, fromName = 'MegaShop' }) {
  if (!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID) {
    console.warn('EmailJS not configured'); 
    return;
  }
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: to,
      subject,
      message_html: html,
      from_name: fromName,
    });
  } catch (e) {
    console.error('EmailJS send failed', e);
  }
}

function orderHtml({ items = [], amount = 0, method = 'PayPal', orderId = '' }) {
  const rows = items.map(i => `
    <tr>
      <td style="padding:6px 8px;border:1px solid #eee">${i.title}</td>
      <td style="padding:6px 8px;border:1px solid #eee">${i.qty}</td>
      <td style="padding:6px 8px;border:1px solid #eee">${(i.price||0).toFixed(2)}</td>
    </tr>`).join('');
  return `
    <div style="font-family:Inter,Arial,sans-serif">
      <h2 style="margin:0 0 8px">Thanks for your purchase!</h2>
      <p><b>Order ID:</b> ${orderId || ('ORD-'+Date.now())}</p>
      <p><b>Payment Method:</b> ${method}</p>
      <table style="border-collapse:collapse;margin:8px 0">
        <thead>
          <tr>
            <th style="padding:6px 8px;border:1px solid #eee;text-align:left">Item</th>
            <th style="padding:6px 8px;border:1px solid #eee;text-align:left">Qty</th>
            <th style="padding:6px 8px;border:1px solid #eee;text-align:left">Price</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p><b>Total:</b> $${Number(amount).toFixed(2)}</p>
    </div>`;
}

/* ==== Membership Apply → email user ==== */
$('#btnApplyMembership')?.addEventListener('click', async () => {
  const level = $('#membershipLevel')?.value || 'free';
  const user  = (window.firebaseAuth && firebaseAuth.currentUser) || null;
  const email = user?.email || $('#accEmail')?.textContent || '';

  // (optional) save to Firestore users/{uid} if you already wired it
  try {
    if (window.db && user?.uid) {
      const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
      await setDoc(doc(db, 'users', user.uid), { membership: level }, { merge: true });
    }
    $('#accMember') && ($('#accMember').textContent = level);
  } catch (e) {
    console.warn('Membership save skipped (Firestore not available)', e);
  }

  // send confirmation email
  if (email) {
    await sendEmail({
      to: email,
      subject: `Your MegaShop membership is now ${level.toUpperCase()}`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif">
          <h3 style="margin:0 0 6px">Membership Updated</h3>
          <p>Hi, your membership level is now <b>${level.toUpperCase()}</b>.</p>
          <p>Enjoy exclusive coupons and faster checkout!</p>
        </div>`
    });
    alert('Membership applied and email sent.');
  } else {
    alert('Membership applied. (Email not sent: no email found)');
  }
});

// inside your existing PayPal Buttons config:
onApprove: async (_d, actions)=>{
  const details = await actions.order.capture();
  const amount  = (STATE.cart||[]).reduce((s,c)=> s + (c.price||0)*(c.qty||1), 0);
  const user    = (window.firebaseAuth && firebaseAuth.currentUser) || null;
  const email   = user?.email || $('#accEmail')?.textContent || '';

  // send order email
  if (email) {
    await sendEmail({
      to: email,
      subject: `MegaShop receipt – $${amount.toFixed(2)}`,
      html: orderHtml({ items: STATE.cart||[], amount, method: 'PayPal', orderId: details?.id || '' })
    });
  }

  alert('Payment success!');
  STATE.cart = []; persistCart?.(); renderCart?.(); updateCartCount?.();
  resetCheckoutUI(); $('#cartDrawer')?.close();
},

// where you add: $('#qrDone')?.addEventListener('click', ()=> { ... });
$('#qrDone')?.addEventListener('click', async ()=>{
  const user  = (window.firebaseAuth && firebaseAuth.currentUser) || null;
  const email = user?.email || $('#accEmail')?.textContent || '';
  const amount= (STATE.cart||[]).reduce((s,c)=> s + (c.price||0)*(c.qty||1), 0);

  if (email) {
    await sendEmail({
      to: email,
      subject: `MegaShop receipt – $${amount.toFixed(2)}`,
      html: orderHtml({ items: STATE.cart||[], amount, method: 'Wallet (QR)' })
    });
  }
  // clear cart & close like PayPal success
  STATE.cart = []; persistCart?.(); renderCart?.(); updateCartCount?.();
  resetCheckoutUI(); $('#cartDrawer')?.close();
}, { once:true });

/* ==== Unified logout ==== */
async function doLogout(){
  try {
    if (window.firebaseAuth) {
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
      await signOut(firebaseAuth);
    }
  } catch (e) {
    console.warn('signOut failed/skip', e);
  }
  // UI refresh
  hide($('#btnLogoutHeader')); show($('#btnLogin')); show($('#btnSignup'));
  $('#btnAccount')?.classList.add('hidden');
  alert('Logged out.');
}

$('#btnLogoutHeader')?.addEventListener('click', doLogout);
$('#btnLogout')?.addEventListener('click', doLogout);

// ===== Firebase Config (replace with your project keys) =====
const firebaseConfig = {
  apiKey: "AIzaSyADRM_83skeLeGK4Mf67rzCRTcdDjOptY0",
  authDomain: "shweshop-mm.firebaseapp.com",
  projectId: "shweshop-mm",
  storageBucket: "shweshop-mm.firebasestorage.app",
  messagingSenderId: "361216212375",
  appId: "1:361216212375:web:fed19b7fe4072000c298d2",
  measurementId: "G-WBJJZZNLX6",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ==== GLOBAL STATE (unify) ====
window.STATE = window.STATE ||
  window.state || {
    user: null,
    items: [],
    cart: [],
    ads: [],
    membership: "free",
    promo: null,
  };
window.state = window.STATE; // alias to avoid old references

// -------- helpers (ensure $ exists) ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const money = (n) => `$${Number(n || 0).toFixed(2)}`;

const raf2 = () => new Promise(r => requestAnimationFrame(()=>requestAnimationFrame(r)));
const show = el => el && el.classList.remove('hidden');
const hide = el => el && el.classList.add('hidden');

// const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
const today = () => Timestamp.now();
const asDate = (ts) => (ts?.toDate ? ts.toDate() : new Date(ts));
// NOTE: Admin custom claims must be set on a secure server (do not use require() in browser).
// Remove server-side code from client. Proceed without here.

// ===== State =====
let state = {
  user: null,
  items: [],
  cart: [],
  ads: [],
  membership: "free",
  promo: null,
};

// === Simple Router ===
const PAGES = {
  home: "#page-home",
  orders: "#page-orders",
  account: "#page-account",
  admin: "#page-admin",
};
function route() {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  const key = (location.hash.replace("#", "") || "home").split("/")[0];
  const sel = PAGES[key] || PAGES.home;
  const el = document.querySelector(sel);
  if (el) el.classList.add("active");
}
window.addEventListener("hashchange", route);
document.addEventListener("DOMContentLoaded", route);

// ----- Auth modal open/close + switch -----
document.querySelectorAll("[data-close]")?.forEach((btn) => {
  btn.addEventListener("click", (e) => e.target.closest("dialog")?.close());
});

const loginModal = document.getElementById("loginModal");
const signupModal = document.getElementById("signupModal");
const forgotModal = document.getElementById("forgotModal");

document
  .getElementById("btnLogin")
  ?.addEventListener("click", () => loginModal.showModal());
document
  .getElementById("btnSignup")
  ?.addEventListener("click", () => signupModal.showModal());

document.getElementById("openSignup")?.addEventListener("click", () => {
  loginModal.close();
  signupModal.showModal();
});
document.getElementById("openForgot")?.addEventListener("click", () => {
  loginModal.close();
  forgotModal.showModal();
});
document
  .getElementById("openLoginFromSignup")
  ?.addEventListener("click", () => {
    signupModal.close();
    loginModal.showModal();
  });

// ===== UI Bindings =====
$("#year").textContent = new Date().getFullYear();
$('#btnCart')?.addEventListener('click', ()=> $('#cartDrawer')?.showModal());
$('#cartDrawer')?.addEventListener('close', resetCheckoutUI);
$$("[data-close]").forEach((b) =>
  b.addEventListener("click", (e) => e.target.closest("dialog").close())
);

$("#btnLogin").addEventListener("click", () => $("#loginModal").showModal());
$("#btnSignup").addEventListener("click", () => $("#signupModal").showModal());
const forgotBtn = $("#openForgot");
if (forgotBtn)
  forgotBtn.addEventListener("click", () => {
    $("#loginModal").close();
    $("#forgotModal").showModal();
  });

$("#doLogin").addEventListener("click", async () => {
  const email = $("#loginEmail").value.trim();
  const pass = $("#loginPass").value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    $("#loginModal").close();
  } catch (e) {
    alert(e.message);
  }
});
const ghBtn = $("#doGitHub");
if (ghBtn)
  ghBtn.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, new GithubAuthProvider());
      $("#loginModal").close();
    } catch (e) {
      alert(e.message);
    }
  });
$("#doSignup").addEventListener("click", async () => {
  const email = $("#signupEmail").value.trim();
  const pass = $("#signupPass").value;
  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    $("#signupModal").close();
  } catch (e) {
    alert(e.message);
  }
});
$("#doForgot").addEventListener("click", async () => {
  const email = $("#forgotEmail").value.trim();
  try {
    await sendPasswordResetEmail(auth, email);
    alert("Reset email sent");
    $("#forgotModal").close();
  } catch (e) {
    alert(e.message);
  }
});
$("#btnLogout").addEventListener("click", () => signOut(auth));
// Header logout (visible only when signed in)
const hdrLogout = $("#btnLogoutHeader");
if (hdrLogout) hdrLogout.addEventListener("click", () => signOut(auth));

$("#btnAccount").addEventListener("click", () => {
  if (location.hash !== "#account") {
    location.hash = "account";
  } else {
    route();
  } // already on #account? force rerender
});

// Membership
$("#btnApplyMembership").addEventListener("click", async () => {
  if (!auth.currentUser) return alert("Login required");
  const level = $("#membershipLevel").value;
  try {
    await setDoc(
      doc(db, "users", auth.currentUser.uid),
      {
        membership: level,
        emailOptIn: $("#emailOptIn").checked,
      },
      { merge: true }
    );
    alert("Membership applied");
  } catch (e) {
    alert(e.message);
  }
});
$("#btnSaveOpt").addEventListener("click", async () => {
  if (!auth.currentUser) return alert("Login required");
  try {
    await setDoc(
      doc(db, "users", auth.currentUser.uid),
      {
        emailOptIn: $("#emailOptIn").checked,
      },
      { merge: true }
    );
    alert("Saved");
  } catch (e) {
    alert(e.message);
  }
});

// Search & filters
$("#searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  renderItems();
});
$("#filterCategory").addEventListener("change", renderItems);
$("#sortBy").addEventListener("change", renderItems);

// Alt payments stubs
// ["kbzPay", "cbPay", "ayaPay"].forEach((id) => {
//   const el = $("#" + id);
//   if (el)
//     el.addEventListener("click", () => {
//       alert(`${id} stub: integrate provider SDK or QR flow here.`);
//     });
// });

// Login
document.getElementById("doLogin")?.addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPass").value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    loginModal.close();
  } catch (e) {
    alert(e.message);
  }
});

// Signup
document.getElementById("doSignup")?.addEventListener("click", async () => {
  const email = document.getElementById("signupEmail").value.trim();
  const pass = document.getElementById("signupPass").value;
  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    signupModal.close();
  } catch (e) {
    alert(e.message);
  }
});

// Forgot
document.getElementById("doForgot")?.addEventListener("click", async () => {
  const email = document.getElementById("forgotEmail").value.trim();
  try {
    await sendPasswordResetEmail(auth, email);
    alert("Reset email sent");
    forgotModal.close();
  } catch (e) {
    alert(e.message);
  }
});

// Header logout button (and account page logout)
document
  .getElementById("btnLogoutHeader")
  ?.addEventListener("click", () => signOut(auth));
document
  .getElementById("btnLogout")
  ?.addEventListener("click", () => signOut(auth));

// ===== Auth State =====
onAuthStateChanged(auth, async (user) => {
  // detect admin custom claim (if you set it via server/Functions)
  let isAdmin = false;
  if (user) {
    try {
      const tok = await user.getIdTokenResult(true);
      isAdmin = tok.claims?.admin === true;
    } catch {}
  }
  document.body.dataset.isAdmin = String(isAdmin);
  state.user = user;

  const show = (sel, yes) =>
    document.querySelector(sel)?.classList.toggle("hidden", !yes);
  show("#btnAccount", !!user);
  show("#btnLogoutHeader", !!user);
  show("#btnLogin", !user);
  show("#btnSignup", !user);

  document.getElementById("accEmail").textContent = user?.email || "—";
  document.getElementById("accMember").textContent = user ? "free" : "free";

  // Admin page/link ကို non-admin မှာ ဖျောက်
  const adminLink = document.querySelector('a[href="#admin"]');
  if (adminLink) adminLink.style.display = isAdmin ? "" : "none";
  const adminPage = document.querySelector("#page-admin");
  if (adminPage) adminPage.style.display = isAdmin ? "" : "none";

  if (user) {
    $("#accEmail").textContent = user.email || user.displayName || user.uid;

    const uref = doc(db, "users", user.uid);
    const snap = await getDoc(uref);
    const data = snap.exists()
      ? snap.data()
      : { membership: "free", emailOptIn: false };

    state.membership = data.membership || "free";
    $("#accMember").textContent = state.membership;

    const ml = $("#membershipLevel");
    if (ml) ml.value = state.membership;
    const eo = $("#emailOptIn");
    if (eo) eo.checked = !!data.emailOptIn;

    loadOrders();
  } else {
    $("#accEmail").textContent = "—";
    $("#accMember").textContent = "free";
    const eo = $("#emailOptIn");
    if (eo) eo.checked = false;
    $("#ordersList").innerHTML = "";
  }
});

// ===== Load Promotions Banner and Ads =====
async function loadPromo() {
  const snaps = await getDocs(collection(db, "promotions"));
  const active = [];
  snaps.forEach((s) => {
    const d = s.data();
    if (d.active) active.push(d);
  });
  if (active.length) {
    const p = active[0];
    state.promo = p;
    const bar = $("#promoBar");
    bar.innerHTML = `<b>${p.title}</b> — ${p.message}`;
    bar.classList.remove("hidden");
  }
}
async function loadAds() {
  const snaps = await getDocs(collection(db, "ads"));
  state.ads = snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
  const wrap = $("#adsPreview");
  if (wrap) {
    wrap.innerHTML = state.ads
      .map(
        (a) => `<a class="ad" href="${a.href || "#"}" target="_blank">
      <img src="${a.imageUrl || ""}" alt="${a.title || ""}">
      <div style="padding:6px">${a.title || ""}</div>
    </a>`
      )
      .join("");
  }
}

// ===== Items (Catalog) =====
// async function loadItems() {
//   const snaps = await getDocs(collection(db, "items"));
//   state.items = snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
//   renderItems();
// }

// function renderItems() {
//   const q = $("#searchInput").value.trim().toLowerCase();
//   const cat = $("#filterCategory").value;
//   const sort = $("#sortBy").value;
//   let rows = [...state.items];
//   if (cat && cat !== "all")
//     rows = rows.filter(
//       (r) => (r.category || "").toLowerCase() === cat.toLowerCase()
//     );
//   if (q)
//     rows = rows.filter((r) =>
//       (r.title + " " + (r.description || ""))?.toLowerCase().includes(q)
//     );
//   switch (sort) {
//     case "price_asc":
//       rows.sort((a, b) => (a.price || 0) - (b.price || 0));
//       break;
//     case "price_desc":
//       rows.sort((a, b) => (b.price || 0) - (a.price || 0));
//       break;
//     case "newest":
//       rows.sort((a, b) => asDate(b.createdAt) - asDate(a.createdAt));
//       break;
//     case "rating":
//       rows.sort((a, b) => (b.rating || 0) - (a.rating || 0));
//       break;
//     default:
//       break;
//   }
//   const grid = $("#grid");
//   grid.innerHTML = rows
//     .map(
//       (p) => `
//     <div class="card product">
//       <img src="${
//         p.imageUrl || "https://picsum.photos/seed/" + p.id + "/600/400"
//       }" alt="${p.title}">
//       <div class="pbody">
//         <div class="row" style="justify-content:space-between">
//           <b>${p.title}</b><span class="rating">★ ${p.rating || "—"}</span>
//         </div>
//         <div class="row" style="justify-content:space-between">
//           <span class="muted">${
//             p.category || ""
//           }</span><span class="price">${fmt(p.price)}</span>
//         </div>
//         <button class="btn" data-open-product="${p.id}">View</button>
//       </div>
//     </div>`
//     )
//     .join("");
//   $$("[data-open-product]").forEach((b) =>
//     b.addEventListener("click", () => openProduct(b.dataset.openProduct))
//   );
// }

// Open modal
document.getElementById("btnGoAdmin")?.addEventListener("click", () => {
  document.getElementById("itemModal").showModal();
});

// open from Admin card button
document
  .getElementById("btnOpenItemModalAdmin")
  ?.addEventListener("click", () => {
    document.getElementById("itemModal").showModal();
  });

// universal close for dialogs with [data-close]
document.querySelectorAll("[data-close]").forEach((b) => {
  b.addEventListener("click", (e) => e.target.closest("dialog")?.close());
});

// ====== ADMIN VISIBILITY (toggle .admin-only controls) ======
async function setAdminVisibility() {
  const u = auth.currentUser;
  let isAdmin = false;
  if (u) {
    try {
      const t = await u.getIdTokenResult(true);
      isAdmin = t.claims?.admin === true;
    } catch {}
  }
  // Show/hide elements with .admin-only
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.style.display = isAdmin ? "" : "none";
  });
  // Admin link/page can also be hidden if you want:
  // document.getElementById('navAdmin').style.display = isAdmin ? '' : 'none';
}
onAuthStateChanged(auth, () => setAdminVisibility());

// ====== ITEMS: LOAD + RENDER + EDIT ======
let ITEM_CACHE = [];

// ===== LOAD + RENDER ITEMS =====
async function loadItems() {
  try {
    // Try Firestore first
    const snaps = await getDocs(collection(db, "items"));
    if (snaps.size) {
      STATE.items = snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
    } else {
      // If empty, keep local demo (until you seed)
      STATE.items = DEMO_ITEMS.map((x, i) => ({ id: `demo-${i}`, ...x }));
    }
  } catch (e) {
    // If Firestore blocked, fallback to DEMO
    STATE.items = DEMO_ITEMS.map((x, i) => ({ id: `demo-${i}`, ...x }));
  }
  renderItems();
}

function renderItems() {
  const q = ($("#searchInput")?.value || "").toLowerCase().trim();
  const cat = ($("#filterCategory")?.value || "all").toLowerCase();
  const sort = $("#sortBy")?.value || "featured";

  let rows = [...STATE.items];
  if (cat !== "all")
    rows = rows.filter((r) => (r.category || "").toLowerCase() === cat);
  if (q)
    rows = rows.filter((r) =>
      (r.title + " " + (r.description || "")).toLowerCase().includes(q)
    );

  switch (sort) {
    case "price_asc":
      rows.sort((a, b) => (a.price || 0) - (b.price || 0));
      break;
    case "price_desc":
      rows.sort((a, b) => (b.price || 0) - (a.price || 0));
      break;
    case "rating":
      rows.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
    case "newest":
      rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      break;
    default:
      break;
  }

  const grid = $("#grid");
  grid.innerHTML = rows
    .map(
      (p) => `
    <div class="card product">
      <img src="${
        p.imageUrl ||
        p.gallery?.[0] ||
        `https://picsum.photos/seed/${p.id}/600/400`
      }" alt="${
        p.title
      }" style="width:100%;height:180px;object-fit:cover;border-radius:12px 12px 0 0">
      <div class="pbody" style="padding:10px">
        <div class="row" style="justify-content:space-between"><b>${
          p.title
        }</b><span class="muted">${p.category || ""}</span></div>
        <div class="row" style="justify-content:space-between;margin-top:4px">
          <span class="rating">★ ${p.rating ?? "—"}</span>
          <span class="price">${money(p.price)}</span>
        </div>
        <div class="row" style="gap:6px;margin-top:8px">
          <button class="btn" data-open="${p.id}">View</button>
          <button class="btn outline" data-add="${p.id}">Add</button>
        </div>
      </div>
    </div>
  `
    )
    .join("");

  // bind
  document
    .querySelectorAll("[data-open]")
    ?.forEach((b) =>
      b.addEventListener("click", () => openProduct(b.dataset.open))
    );
  document
    .querySelectorAll("[data-add]")
    ?.forEach((b) =>
      b.addEventListener("click", () => addToCartId(b.dataset.add, 1))
    );
}

// ===== SUBNAV (hash like #category/men) =====
window.addEventListener("hashchange", () => {
  const m = location.hash.match(/^#category\/(.+)$/i);
  if (m && $("#filterCategory")) {
    $("#filterCategory").value = m[1].toLowerCase();
    renderItems();
  }
});

// Home toolbar bindings
$("#filterCategory")?.addEventListener("change", renderItems);
$("#sortBy")?.addEventListener("change", renderItems);
$("#searchForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  renderItems();
});

function loadIntoEditor(id) {
  const p = ITEM_CACHE.find((x) => x.id === id);
  if (!p) return alert("Item not found");

  document.getElementById("itemId").value = p.id;
  document.getElementById("itemTitle").value = p.title || "";
  document.getElementById("itemCategory").value = p.category || "";
  document.getElementById("itemPrice").value = p.price || 0;
  document.getElementById("itemRating").value = p.rating || 0;
  document.getElementById("itemDesc").value = p.description || "";
  document.getElementById("itemProCode").value = p.proCode || "";
  document.getElementById("itemMemberCoupon").value = p.memberCoupon || "";

  // go admin page
  location.hash = "admin";
}

// ===== DEMO ITEMS (all categories) =====
const DEMO_ITEMS = [
  // men
  {
    title: "Men T-Shirt Classic",
    category: "men",
    price: 14.99,
    rating: 4.2,
    description: "Soft cotton tee for everyday wear.",
    imageUrl:
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop",
    proCode: "PRO10",
    memberCoupon: "GOLD5",
  },
  {
    title: "Men Sneakers Runner",
    category: "men",
    price: 59.0,
    rating: 4.5,
    description: "Lightweight running shoes.",
    imageUrl:
      "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?q=80&w=800&auto=format&fit=crop",
    proCode: "PRO10",
    memberCoupon: "GOLD5",
  },

  // women
  {
    title: "Women Summer Dress",
    category: "women",
    price: 29.9,
    rating: 4.6,
    description: "Breezy floral dress.",
    imageUrl:
      "https://images.unsplash.com/photo-1515378960530-7c0da6231fb1?q=80&w=800&auto=format&fit=crop",
    proCode: "PRO10",
    memberCoupon: "GOLD5",
  },
  {
    title: "Women Handbag",
    category: "women",
    price: 48.5,
    rating: 4.4,
    description: "Compact crossbody bag.",
    imageUrl:
      "https://images.unsplash.com/photo-1520975916090-3105956dac38?q=80&w=800&auto=format&fit=crop",
    proCode: "PRO10",
    memberCoupon: "GOLD5",
  },

  // kids
  {
    title: "Kids Hoodie",
    category: "kids",
    price: 19.9,
    rating: 4.3,
    description: "Cozy hoodie for kids.",
    imageUrl:
      "https://images.unsplash.com/photo-1589308078059-be1415eab4c3?q=80&w=800&auto=format&fit=crop",
    proCode: "PRO10",
    memberCoupon: "GOLD5",
  },
  {
    title: "Kids Sneakers",
    category: "kids",
    price: 24.5,
    rating: 4.4,
    description: "Durable kids shoes.",
    imageUrl:
      "https://images.unsplash.com/photo-1603808033192-7f21ad1d8a08?q=80&w=800&auto=format&fit=crop",
    proCode: "PRO10",
    memberCoupon: "GOLD5",
  },

  // electronics  (➡️ သင်ပြောတဲ့ ၂ခု)
  {
    title: "Wireless Headphones",
    category: "electronics",
    price: 89.0,
    rating: 4.5,
    description: "Noise-isolating, long battery life.",
    imageUrl:
      "https://images.unsplash.com/photo-1518444028785-8c8240b2f3d8?q=80&w=800&auto=format&fit=crop",
    proCode: "PRO10",
    memberCoupon: "GOLD5",
    gallery: [
      "https://images.unsplash.com/photo-1518444028785-8c8240b2f3d8?q=80&w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1517423440428-a5a00ad493e8?q=80&w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1484704849700-f032a568e944?q=80&w=800&auto=format&fit=crop",
    ],
  },
  {
    title: "Smartwatch S2",
    category: "electronics",
    price: 129.0,
    rating: 4.4,
    description: "Fitness + notifications.",
    imageUrl:
      "https://images.unsplash.com/photo-1518441902110-923202b1c4f7?q=80&w=800&auto=format&fit=crop",
    proCode: "PRO10",
    memberCoupon: "GOLD5",
    gallery: [
      "https://images.unsplash.com/photo-1518441902110-923202b1c4f7?q=80&w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1516570161787-2fd917215a3d?q=80&w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1485727749690-d091e8284ef2?q=80&w=800&auto=format&fit=crop",
    ],
  },

  // home
  {
    title: "Ceramic Mug Set",
    category: "home",
    price: 15.99,
    rating: 4.2,
    description: "Set of 4, dishwasher safe.",
    imageUrl:
      "https://images.unsplash.com/photo-1481349518771-20055b2a7b24?q=80&w=800&auto=format&fit=crop",
    proCode: "PRO10",
    memberCoupon: "GOLD5",
  },
  {
    title: "Throw Pillow Cover",
    category: "home",
    price: 9.99,
    rating: 4.1,
    description: "18x18 inch cover.",
    imageUrl:
      "https://images.unsplash.com/photo-1501045661006-fcebe0257c3f?q=80&w=800&auto=format&fit=crop",
    proCode: "PRO10",
    memberCoupon: "GOLD5",
  },
];

document.getElementById("btnSeedDemo")?.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) {
    alert("Please login first.");
    return;
  }
  try {
    for (const it of DEMO_ITEMS) {
      await addDoc(collection(db, "items"), it);
    }
    alert("Seeded demo items!");
  } catch (e) {
    alert(e.message || e);
  }
});

// open product modal (ensure single impl)
function openProduct(id) {
  const p = STATE.items.find((x) => x.id === id);
  if (!p) return;
  $("#pdImg").src =
    p.imageUrl ||
    p.gallery?.[0] ||
    `https://picsum.photos/seed/${p.id}/800/600`;
  $("#pdTitle").textContent = p.title || "";
  $("#pdDesc").textContent = p.description || "";
  $("#pdPrice").textContent = money(p.price);
  $("#pdRating").textContent = `★ ${p.rating ?? "—"}`;
  $("#pdProCode").textContent = p.proCode || "—";
  $("#pdMemberCoupon").textContent = p.memberCoupon || "—";
  $("#pdQty").value = 1;

  const thumbs = p.gallery?.length ? p.gallery : [p.imageUrl].filter(Boolean);
  const wrap = $("#pdThumbs");
  wrap.innerHTML = (thumbs || [])
    .map(
      (src, i) =>
        `<img src="${src}" class="${
          i === 0 ? "active" : ""
        }" data-src="${src}">`
    )
    .join("");
  wrap.querySelectorAll("img").forEach((img) => {
    img.addEventListener("click", () => {
      wrap.querySelectorAll("img").forEach((x) => x.classList.remove("active"));
      img.classList.add("active");
      $("#pdImg").src = img.dataset.src;
    });
  });

  $("#qtyMinus").onclick = () =>
    ($("#pdQty").value = Math.max(1, (+$("#pdQty").value || 1) - 1));
  $("#qtyPlus").onclick = () =>
    ($("#pdQty").value = (+$("#pdQty").value || 1) + 1);

  // ✅ Add to cart ⇒ add & close modal (do NOT open cart here)
  $("#pdAdd").onclick = () => {
    addToCartId(id, +$("#pdQty").value || 1);
    $("#productModal")?.close(); // close after adding
    resetCheckoutUI(); // hide payment options until user clicks Checkout
  };

  $("#productModal").showModal();
}

// ===== Cart =====

// ================= CART CORE =================
function persistCart() {
  localStorage.setItem("cart", JSON.stringify(STATE.cart || []));
}
function restoreCart() {
  try {
    STATE.cart = JSON.parse(localStorage.getItem("cart") || "[]");
  } catch {}
}
function updateCartCount() {
  const cnt = (STATE.cart || []).reduce((s, x) => s + (x.qty || 0), 0);
  const el = $("#cartCount");
  if (el) el.textContent = cnt;
}

// Add by product object (from product modal)
function addToCart(p, qty = 1) {
  if (!p) return;
  const ex = (STATE.cart || []).find((x) => x.id === p.id);
  if (ex) ex.qty += qty;
  else
    STATE.cart.push({
      id: p.id,
      title: p.title,
      price: p.price,
      imageUrl: p.imageUrl || p.gallery?.[0],
      qty,
    });
  persistCart();
  updateCartCount();
  renderCart();
  // close product modal after adding
  $("#productModal")?.close();
  resetCheckoutUI(); // hide payment options until checkout click
}

// Add by id (from grid “Add” buttons)
function addToCartId(id, qty = 1) {
  const p = (STATE.items || []).find((x) => x.id === id);
  if (!p) return;
  addToCart(p, qty);
}

function changeQty(id, d) {
  const it = (STATE.cart || []).find((x) => x.id === id);
  if (!it) return;
  it.qty = Math.max(1, (it.qty || 1) + d);
  persistCart();
  updateCartCount();
  renderCart();
}
function removeItem(id) {
  STATE.cart = (STATE.cart || []).filter((x) => x.id !== id);
  persistCart();
  updateCartCount();
  renderCart();
}
window.changeQty = changeQty;
window.removeItem = removeItem;

// Render cart list + subtotal
function renderCart() {
  const list = $("#cartItems");
  if (!list) return;
  list.innerHTML = (STATE.cart || [])
    .map(
      (c) => `
      <div class="cart-item" style="display:grid;grid-template-columns:70px 1fr auto auto;gap:10px;align-items:center;margin:8px 0">
        <img src="${c.imageUrl || `https://picsum.photos/seed/${c.id}/100/100`}" style="width:70px;height:70px;object-fit:cover;border-radius:8px">
        <div><b>${c.title}</b><div class="muted">${money(c.price)} × ${c.qty}</div></div>
        <div class="qty">
          <button class="btn" onclick="changeQty('${c.id}',-1)">−</button>
          <span>${c.qty}</span>
          <button class="btn" onclick="changeQty('${c.id}',1)">+</button>
        </div>
        <button class="btn" onclick="removeItem('${c.id}')">Remove</button>
      </div>`
    )
    .join("");
  const sub = (STATE.cart || []).reduce(
    (s, c) => s + (c.price || 0) * (c.qty || 1),
    0
  );
  $("#cartSubtotal").textContent = money(sub);
}

// ================= LOCAL WALLETS (QR) =================
const WALLET_QR = {
  kbz:
    "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=KBZPay%20Invoice%20" +
    Date.now(),
  cb:
    "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=CBPay%20Invoice%20" +
    Date.now(),
  aya:
    "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=AYAPay%20Invoice%20" +
    Date.now(),
};

// ================= PAYPAL =================
// Put your real client id here
const PAYPAL_CLIENT_ID =
  "AVpfmQ8DyyatFaAGQ3Jg58XtUt_2cJDr1leqcc_JI8LvKIR2N5WB_yljqCOTTCtvK1hFJ7Q9X0ojXsEC";

// ==== HELPERS ====
function resetCheckoutUI(){
  const slot = $('#paypalSlot');
  const pc   = $('#paypalContainer');
  const qr   = $('#walletQR');
  const area = $('#paymentArea');

  if ($('#btnCheckout')) $('#btnCheckout').style.display = '';
  if (slot) slot.replaceChildren();

  paypalRendered = false; paypalRendering = false;

  pc?.classList.remove('active');      // PayPal overlay hide (opacity)
  qr?.classList.remove('active');      // QR overlay hide (opacity)
  hide(area);                          // whole payment block hide
}
// resetCheckoutUI();

// main render (slot မဟုတ်ဘဲ parent ပြောင်းမလုပ်!)
async function renderPayPalButtons(){
  if (paypalRendering || paypalRendered) return;
  const ok = await ensureStableSlot();
  if (!ok || !window.paypal) return;

  const slot = $('#paypalSlot');
  slot.replaceChildren();
  paypalRendering = true;

  try{
    const amount = (STATE.cart||[]).reduce((s,c)=> s + (c.price||0)*(c.qty||1), 0).toFixed(2);
    await window.paypal.Buttons({
      createOrder: (_d, actions)=> actions.order.create({
        purchase_units: [{ amount: { value: amount } }]
      }),
      onApprove: async (_d, actions)=>{
        await actions.order.capture();
        alert('Payment success!');
        STATE.cart = []; persistCart?.(); renderCart?.(); updateCartCount?.();
        resetCheckoutUI();
        $('#cartDrawer')?.close();
      },
      onError: (err)=>{
        console.error('PayPal error', err);
        alert('PayPal error. Try again or choose a wallet.');
      }
    }).render('#paypalSlot');
    paypalRendered = true;
  }catch(e){
    console.error('PayPal render error', e);
  }finally{
    paypalRendering = false;
  }
}

// Checkout click → options show → load SDK → render
$('#btnCheckout')?.addEventListener('click', ()=>{
  if (!(STATE.cart && STATE.cart.length)){ alert('Your cart is empty.'); return; }
  $('#btnCheckout').style.display = 'none';
  show($('#paymentArea'));
});

// Radio change → render PayPal or show QR
$$('input[name="payMethod"]').forEach(r=>{
  r.addEventListener('change', async (e)=>{
    const v = e.target.value;
    const pc = $('#paypalContainer');
    const qr = $('#walletQR');

    if (v === 'paypal'){
      qr?.classList.remove('active');     // hide QR
      pc?.classList.add('active');        // show PayPal layer
      try{
        await loadPayPalSdk(PAYPAL_CLIENT_ID);
        await renderPayPal();
      }catch(err){
        console.warn('PayPal SDK problem', err);
        alert('PayPal unavailable. Choose a wallet.');
      }
    }else{
      showWalletQR(v);
    }
  });
});

function waitNextFrame() {
  return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}

// ---------- flags ----------
let paypalRendering = false;
let paypalRendered  = false;

// Helper: show/hide utilities
// function show(el){ if (el) el.classList.remove('hidden'); }
// function hide(el){ if (el) el.classList.add('hidden'); }

// ---------- tiny helpers ----------
const isVisible = (el)=>{
  if (!el) return false;
  const st = getComputedStyle(el);
  if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) return false;
  if (el.offsetParent === null && st.position !== 'fixed') return false;
  let p = el.parentElement;
  while (p) {
    const ps = getComputedStyle(p);
    if (ps.display === 'none' || ps.visibility === 'hidden') return false;
    p = p.parentElement;
  }
  return true;
};

// ---------- SDK loader ----------
function loadPayPalSdk(id){
  return new Promise((resolve,reject)=>{
    if (window.paypal) return resolve();
    if (!id){ console.warn('Missing PayPal client id'); return resolve(); }
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(id)}&currency=USD&components=buttons`;
    s.onload = resolve;
    s.onerror = ()=> reject(new Error('PayPal SDK load failed'));
    document.body.appendChild(s);
  });
}

// Ensure the dialog + containers are visible enough for zoid
async function ensureStable(){
  const drawer = $('#cartDrawer');
  const area   = $('#paymentArea');
  const pc     = $('#paypalContainer');
  const slot   = $('#paypalSlot');
  if (!drawer || !area || !pc || !slot) return false;
  if (!drawer.open) drawer.showModal();

  // show block + show paypal layer (for rendering)
  show(area);
  pc.classList.add('active');

  await raf2();
  const visible = el => {
    const st = getComputedStyle(el);
    return el.isConnected && st.display !== 'none' && st.visibility !== 'hidden';
  };
  return !!(drawer.open && visible(area) && visible(pc) && slot.isConnected);
}

async function renderPayPal(){
  if (paypalRendering || paypalRendered) return;
  const ok = await ensureStable();
  if (!ok || !window.paypal) return;

  const slot = $('#paypalSlot');
  slot.replaceChildren();
  paypalRendering = true;

  try{
    const amount = (STATE.cart||[]).reduce((s,c)=> s + (c.price||0)*(c.qty||1), 0).toFixed(2);
    await window.paypal.Buttons({
      createOrder: (_d, actions)=> actions.order.create({
        purchase_units: [{ amount: { value: amount } }]
      }),
      onApprove: async (_d, actions)=>{
        await actions.order.capture();
        alert('Payment success!');
        STATE.cart = []; persistCart?.(); renderCart?.(); updateCartCount?.();
        resetCheckoutUI(); $('#cartDrawer')?.close();
      },
      onError: (err)=> {
        console.error('PayPal error', err);
        alert('PayPal error. Try again or choose a wallet.');
      }
    }).render('#paypalSlot');

    paypalRendered = true;
  }catch(e){
    console.error('PayPal render error', e);
  }finally{
    paypalRendering = false;
  }
}

// ==== RENDER BUTTONS (guarded) ====
async function renderPayPalButton() {
  const wrap = document.querySelector('#paypalContainer');
  if (!wrap) return;
  if (paypalRendered || paypalRendering) return;       // avoid double render
  // ensure container and dialog are visible before render
  wrap.style.display = 'block';
  wrap.style.minHeight = '48px'; // give space so zoid doesn't kill itself
  await waitNextFrame();
  if (!isVisible(wrap)) return;                        // still hidden? skip

  if (!window.paypal) return;
  paypalRendering = true;
  wrap.innerHTML = '';

  try {
    const amount = (STATE.cart || [])
      .reduce((s, c) => s + (c.price || 0) * (c.qty || 1), 0)
      .toFixed(2);

    await window.paypal.Buttons({
      createOrder: (_d, actions) =>
        actions.order.create({ purchase_units: [{ amount: { value: amount } }] }),
      onApprove: async (_d, actions) => {
        await actions.order.capture();
        alert('Payment success!');
        STATE.cart = []; persistCart?.(); renderCart?.(); updateCartCount?.();
        resetCheckoutUI(); document.querySelector('#cartDrawer')?.close();
      },
      onError: (err) => {
        console.error('PayPal error', err);
        alert('PayPal error. Try again or use a local wallet.');
      }
    }).render('#paypalContainer');

    paypalRendered = true;
  } catch (e) {
    console.error('PayPal render error', e);
  } finally {
    paypalRendering = false;
  }
}

// ==== LOCAL WALLETS (QR) ====
// keep your existing QR helpers, but when showing QR hide PayPal using visibility
function showWalletQR(kind){
  const map = { kbz:'KBZPay', cb:'CBPay', aya:'AYAPay' };
  const name = map[kind] || 'Wallet';

  // Hide PayPal layer visually (keep DOM alive)
  $('#paypalContainer')?.classList.remove('active');

  const qr = $('#walletQR');
  if (!qr) return;

  const src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(name+' Invoice '+Date.now())}`;
  qr.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
      <div style="font-weight:600">${name} — Scan to pay</div>
      <img src="${src}" alt="${name} QR" style="width:220px;height:220px;border-radius:12px;box-shadow:0 2px 6px rgba(0,0,0,.15);background:#fff"/>
      <button class="btn" id="qrDone" style="margin-top:8px">Done</button>
    </div>`;
  qr.classList.add('active');

  $('#qrDone')?.addEventListener('click', ()=>{
    qr.innerHTML=''; qr.classList.remove('active');
  }, { once:true });
}

// $('#ayaPay')?.addEventListener('click', ()=> showWalletQR('aya'));

function hideWalletQR() {
  const wrap = document.querySelector('#walletQR'); if (wrap){ wrap.style.display='none'; wrap.innerHTML=''; }
  const pc = document.querySelector('#paypalContainer'); if (pc) pc.style.visibility = '';
}
document.querySelector('#kbzPay')?.addEventListener('click', () => showWalletQR('kbz'));
document.querySelector('#cbPay')?.addEventListener('click',  () => showWalletQR('cb'));
document.querySelector('#ayaPay')?.addEventListener('click', () => showWalletQR('aya'));

// ===== ADD ITEM MODAL (button) =====
$("#btnGoAdmin")?.addEventListener("click", () => {
  $("#addItemModal").showModal();
});

// ===== Checkout (PayPal) =====
async function startCheckout() {
  const amount = state.cart.reduce((s, c) => s + c.price * c.qty, 0).toFixed(2);
  // if (amount <= 0) {
  //   alert("Cart empty");
  //   return;
  // }
  await loadPayPal();
  if (window.paypal) {
    $("#paypalContainer").innerHTML = "";
    window.paypal
      .Buttons({
        createOrder: (data, actions) =>
          actions.order.create({
            purchase_units: [{ amount: { value: amount } }],
          }),
        onApprove: (data, actions) =>
          actions.order.capture().then(async (details) => {
            await placeOrder("paypal", details.id, amount);
            alert("Payment successful!");
            $("#cartDrawer").close();
          }),
        onError: (err) => alert("PayPal error: " + err),
      })
      .render("#paypalContainer");
  }
}
function loadPayPal() {
  return new Promise((res) => {
    if (window.paypal) return res();
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=AVpfmQ8DyyatFaAGQ3Jg58XtUt_2cJDr1leqcc_JI8LvKIR2N5WB_yljqCOTTCtvK1hFJ7Q9X0ojXsEC&currency=USD`;
    s.onload = res;
    document.body.appendChild(s);
  });
}

async function placeOrder(method, txnId, amount) {
  if (!auth.currentUser) {
    alert("Login required");
    return;
  }
  const items = state.cart.map((c) => ({
    id: c.id,
    title: c.title,
    price: c.price,
    qty: c.qty,
  }));
  const order = {
    userId: auth.currentUser.uid,
    items,
    amount: Number(amount),
    method,
    txnId,
    status: "paid",
    createdAt: today(),
  };
  await addDoc(collection(db, "orders"), order);
  state.cart = [];
  persistCart();
  renderCart();
  loadOrders();
}

// ===== Orders =====
async function loadOrders() {
  if (!auth.currentUser) return;

  // No-index version
  const qref = query(
    collection(db, "orders"),
    where("userId", "==", auth.currentUser.uid),
    limit(50)
  );
  const snaps = await getDocs(qref);
  const orders = snaps.docs.map((d) => ({ id: d.id, ...d.data() }));

  // optional: client-side sort by createdAt desc
  orders.sort(
    (a, b) =>
      (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
  );

  const list = $("#ordersList");
  list.innerHTML = orders
    .map((o) => {
      const date = (o.createdAt?.toDate?.() ?? new Date()).toLocaleString();
      const lines = (o.items || [])
        .map((i) => `${i.title} × ${i.qty} — $${(i.price * i.qty).toFixed(2)}`)
        .join("<br/>");
      return `<div class="order">
      <div class="line"><b>Order #${o.id
        .slice(-6)
        .toUpperCase()}</b><span>${date}</span></div>
      <div>${lines}</div>
      <div class="line"><span class="muted">${o.method} • ${
        o.txnId || ""
      }</span><b>$${Number(o.amount || 0).toFixed(2)}</b></div>
      <div class="row" style="margin-top:6px">
        ${(o.items || [])
          .map(
            (i) =>
              `<button class='btn' onclick="reorder('${i.id}')">Re-order ${i.title}</button>`
          )
          .join("")}
      </div>
    </div>`;
    })
    .join("");
}
window.reorder = async function (id) {
  const p = state.items.find((x) => x.id === id);
  if (!p) return alert("Item no longer available");
  addToCart(p, 1);
  $("#cartDrawer").showModal();
};

// ===== Admin: Save Item, Promo, Ad, Analytics, Feedback list, Email blast =====
$("#btnSaveItem").addEventListener("click", saveItem);
$("#btnDeleteItem").addEventListener("click", deleteItem);
$("#btnSavePromo").addEventListener("click", savePromo);
$("#btnSaveAd").addEventListener("click", saveAd);
$$("#page-admin [data-range]").forEach((b) =>
  b.addEventListener("click", () =>
    loadAnalytics(parseInt(b.dataset.range, 10))
  )
);
$("#btnSendBlast").addEventListener("click", sendEmailBlast);

async function requireAdmin() {
  const u = auth.currentUser;
  if (!u) throw new Error("Sign in required");
  const t = await u.getIdTokenResult(true);
  if (!t.claims?.admin) throw new Error("Admin only");
}

// ===== SAVE / DELETE ITEM (modal) =====
$("#btnSaveItem")?.addEventListener("click", saveItem);
$("#btnDeleteItem")?.addEventListener("click", deleteItem);

async function saveItem() {
  try {
    const id = $("#itemId").value.trim();
    const title = $("#itemTitle").value.trim();
    const category = $("#itemCategory").value.trim().toLowerCase();
    const price = Number($("#itemPrice").value || 0);
    const rating = Number($("#itemRating").value || 0);
    const description = $("#itemDesc").value.trim();
    const proCode = $("#itemProCode").value.trim();
    const memberCoupon = $("#itemMemberCoupon").value.trim();
    const file = $("#itemImage").files[0];

    if (!title) {
      alert("Title required");
      return;
    }

    const payload = {
      title,
      category,
      price,
      rating,
      description,
      proCode,
      memberCoupon,
      createdAt: Date.now(),
    };

    if (file) {
      const rid = id || crypto.randomUUID();
      const r = ref(storage, `items/${rid}/${file.name}`);
      await uploadBytes(r, file);
      payload.imageUrl = await getDownloadURL(r);
      if (!id) $("#itemId").value = rid;
    }

    if (id) {
      await setDoc(doc(db, "items", id), payload, { merge: true });
    } else {
      const refDoc = await addDoc(collection(db, "items"), payload);
      $("#itemId").value = refDoc.id;
    }

    alert("Saved item");
    $("#addItemModal").close();
    await loadItems();
  } catch (e) {
    alert(e.message || e);
  }
}
async function deleteItem() {
  try {
    const id = $("#itemId").value.trim();
    if (!id) {
      alert("No ID");
      return;
    }
    await deleteDoc(doc(db, "items", id));
    alert("Deleted");
    $("#addItemModal").close();
    await loadItems();
  } catch (e) {
    alert(e.message || e);
  }
}

// ===== SEED DEMO =====
$("#btnSeedDemo")?.addEventListener("click", async () => {
  try {
    // login required if your rules need it; otherwise remove this check
    // if (!auth.currentUser) { alert('Please login first.'); return; }
    for (const it of DEMO_ITEMS) await addDoc(collection(db, "items"), it);
    alert("Seeded demo items!");
    await loadItems();
  } catch (e) {
    alert(e.message || e);
  }
});

// Save item
document.getElementById("btnSaveItem")?.addEventListener("click", async () => {
  try {
    const title = document.getElementById("itemTitle").value.trim();
    const category = document.getElementById("itemCategory").value.trim();
    const price = parseFloat(document.getElementById("itemPrice").value);
    const desc = document.getElementById("itemDesc").value.trim();
    const proCode = document.getElementById("itemProCode").value.trim();
    const memberCoupon = document
      .getElementById("itemMemberCoupon")
      .value.trim();
    const thumb = document.getElementById("itemThumb").value.trim();

    if (!title || !category || isNaN(price)) {
      alert("Please fill required fields");
      return;
    }

    await addDoc(collection(db, "items"), {
      title,
      category,
      price,
      desc,
      proCode,
      memberCoupon,
      thumb,
      createdAt: serverTimestamp(),
    });
    alert("Item saved!");
    document.getElementById("itemModal").close();
    await loadItems(); // refresh
  } catch (e) {
    console.error("Save item error:", e);
    alert(e.message || e);
  }
});

document.getElementById("btnDeleteItem")?.addEventListener("click", deleteItem);

async function savePromo() {
  await requireAdmin();
  await requireAdmin(); // add this guard
  const p = {
    title: $("#promoTitle").value.trim(),
    message: $("#promoMessage").value.trim(),
    active: $("#promoActive").checked,
  };
  await setDoc(doc(db, "promotions", "main"), p);
  alert("Promotion saved");
  await loadPromo();
}
async function saveAd() {
  await requireAdmin();
  await requireAdmin(); // add this guard
  const a = {
    title: $("#adTitle").value.trim(),
    imageUrl: $("#adImageUrl").value.trim(),
    href: $("#adHref").value.trim(),
    createdAt: today(),
  };
  await addDoc(collection(db, "ads"), a);
  alert("Ad saved");
  await loadAds();
}

async function loadAnalytics(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const u = auth.currentUser;
  let snaps;
  try {
    const isAdmin = !!(u && (await u.getIdTokenResult(true)).claims?.admin);
    if (isAdmin) {
      // Admin: read all orders (requires security rules to allow admin reads)
      snaps = await getDocs(
        query(
          collection(db, "orders"),
          orderBy("createdAt", "desc"),
          limit(500)
        )
      );
    } else if (u) {
      // Non-admin: only your orders; no orderBy (avoid composite index)
      snaps = await getDocs(
        query(
          collection(db, "orders"),
          where("userId", "==", u.uid),
          limit(500)
        )
      );
    } else {
      return; // not signed in
    }
  } catch (e) {
    console.error("Analytics read error", e);
    return;
  }
  const buckets = new Map();
  snaps.forEach((d) => {
    const o = d.data();
    const dt = asDate(o.createdAt);
    if (dt < since) return;
    const key = dt.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) || 0) + Number(o.amount || 0));
  });
  const labels = Array.from(buckets.keys()).sort();
  const data = labels.map((k) => buckets.get(k));
  const ctx = document.getElementById("salesChart").getContext("2d");
  if (window._chart) window._chart.destroy();
  window._chart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: `Sales (last ${days}d)`, data }] },
    options: { responsive: true, plugins: { legend: { display: true } } },
  });
}

async function listFeedback() {
  const u = auth.currentUser;
  if (!u) return;
  let isAdmin = false;
  try {
    const t = await u.getIdTokenResult(true);
    isAdmin = t.claims?.admin === true;
  } catch {}
  if (!isAdmin) return; // non-admin: silently skip
  try {
    const snaps = await getDocs(collection(db, "feedback"));
    const wrap = document.getElementById("feedbackList");
    if (!wrap) return;
    wrap.innerHTML = snaps.docs
      .map((d) => {
        const f = d.data();
        const when = (f.createdAt?.toDate?.() ?? new Date()).toLocaleString();
        return `<div class="card" style="margin:6px 0"><b>${
          f.name || "Anon"
        }</b> <span class="muted">${when}</span><div>${
          f.message || ""
        }</div></div>`;
      })
      .join("");
  } catch (e) {
    console.warn("Feedback read skipped:", e.message || e);
  }
}

async function sendEmailBlast() {
  await requireAdmin(); // add this guard
  const msg = $("#emailBlastMsg").value.trim();
  if (!msg) return alert("Message required");
  const snaps = await getDocs(collection(db, "users"));
  const recipients = snaps.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((u) => u.emailOptIn && u.email);
  if (!recipients.length) return alert("No opted-in users");
  let sent = 0,
    failed = 0;
  for (const u of recipients) {
    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        message: msg,
        to_email: u.email,
        to_name: u.name || u.email,
      });
      sent++;
    } catch (e) {
      failed++;
      console.error("EmailJS", e);
    }
  }
  alert(`Blast done. Sent: ${sent}, Failed: ${failed}`);
}

// ===== Feedback prompt (optional) =====
window.addEventListener("load", () => {
  setTimeout(() => {
    if (confirm("Enjoying MegaShop? Send quick feedback?")) {
      const message = prompt("Your feedback");
      if (message) {
        addDoc(collection(db, "feedback"), {
          message,
          createdAt: today(),
          name: state.user?.email || "Anon",
        });
      }
    }
  }, 10000);
});

// ---------- Robust DOM attach for Home buttons + Router kick ----------
function ready(fn) {
  if (document.readyState !== "loading") fn();
  else document.addEventListener("DOMContentLoaded", fn, { once: true });
}

ready(() => {
  // Router first render (in case script loaded before hash listeners)
  if (typeof route === "function") route();

  // +Add Item -> go to Admin
  const goAdminBtn = document.getElementById("btnGoAdmin");
  if (goAdminBtn) {
    goAdminBtn.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        location.hash = "admin";
        if (typeof route === "function") route();
      },
      { once: false }
    );
  } else {
    console.warn("btnGoAdmin not found");
  }

  // 🌱 Seed Demo Items
  const seedBtn = document.getElementById("btnSeedDemo");
  if (seedBtn) {
    seedBtn.addEventListener(
      "click",
      async () => {
        try {
          if (!auth.currentUser) {
            alert("Please login first.");
            return;
          }

          // OPTIONAL: dev-only — allow any signed-in to seed; in prod gate with requireAdmin()
          // await requireAdmin();

          const batch = DEMO_ITEMS || [];
          if (!batch.length) {
            alert("No demo items defined.");
            return;
          }

          // Create items one by one (show progress)
          let ok = 0;
          for (const it of batch) {
            await addDoc(collection(db, "items"), it);
            ok++;
          }
          alert(`Seeded ${ok} demo item(s)!`);
          // Reload items on home
          if (typeof loadItems === "function") await loadItems();
        } catch (err) {
          // Show clear message if rules are blocking writes
          alert(err && err.message ? err.message : String(err));
          console.error("Seed demo error:", err);
        }
      },
      { once: false }
    );
  } else {
    console.warn("btnSeedDemo not found");
  }
});

// ============= SINGLE, SAFE INIT (use this only) =============
async function init() {
  // close buttons on dialogs
  $$("[data-close]").forEach((b) =>
    b.addEventListener("click", (e) => e.target.closest("dialog")?.close())
  );

  // 1) Cart first (local state) — no network
  restoreCart?.();
  renderCart?.();
  updateCartCount?.();

  // your route() if you have SPA
  if (typeof route === "function") {
    route();
    window.addEventListener("hashchange", route);
  }

  // load items last (don’t clear cart inside!)
  if (typeof loadItems === "function") await loadItems();

  // 2) Router once
  route?.();
  window.addEventListener("hashchange", route, { once: false });

  // 3) Load data (parallel where safe)
  await Promise.allSettled([
    loadItems?.(), // renders grid inside
    loadPromo?.(),
    loadAds?.(),
  ]);

  // 4) Secondary loads (non-blocking)
  loadAnalytics?.(7);
  listFeedback?.();

  // 5) Universal dialog close buttons
  document.querySelectorAll("[data-close]").forEach((b) => {
    b.addEventListener("click", (e) => e.target.closest("dialog")?.close());
  });
}

// Kick off after DOM is ready
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
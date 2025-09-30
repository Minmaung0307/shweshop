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
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// -------- helpers (ensure $ exists) ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const money = (n) => `$${Number(n || 0).toFixed(2)}`;

const raf2 = () => new Promise(r => requestAnimationFrame(()=>requestAnimationFrame(r)));
const show = el => el && el.classList.remove('hidden');
const hide = el => el && el.classList.add('hidden');

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

function currentFulfillment(){
  const isDelivery = $('#optDelivery')?.checked;
  if (isDelivery){
    // prefer cart mini form; fallback to saved
    const a = readCartAddress();
    const filled = Object.values(a).some(Boolean);
    return { mode:'delivery', address: filled ? a : restoreAddress() };
  }else{
    return { mode:'pickup', location: $('#pickupSelect')?.value || 'PICKUP' };
  }
}

// ==== in PayPal Buttons onApprove ====
onApprove: async (_d, actions)=>{
  const details = await actions.order.capture();
  const amount  = (STATE.cart||[]).reduce((s,c)=> s + (c.price||0)*(c.qty||1), 0);
  const user    = (window.firebaseAuth && firebaseAuth.currentUser) || null;
  const email   = user?.email || $('#accEmail')?.textContent || '';

  const fulfill = currentFulfillment();
  let extraRow  = '';
  if (fulfill.mode === 'delivery') {
    extraRow = `<tr><td style="padding:6px 8px;border:1px solid #eee"><b>Shipping</b></td><td style="padding:6px 8px;border:1px solid #eee">${addressToLines(fulfill.address)||'—'}</td></tr>`;
  } else {
    extraRow = `<tr><td style="padding:6px 8px;border:1px solid #eee"><b>Pickup</b></td><td style="padding:6px 8px;border:1px solid #eee">${fulfill.location}</td></tr>`;
  }

  if (email) {
    const base = orderHtml({ items: STATE.cart||[], amount, method: 'PayPal', orderId: details?.id || '' });
    // inject fulfillment row after table open
    const html = base.replace('</tbody></table>', `${extraRow}</tbody></table>`);
    await sendEmail({ to: email, subject: `MegaShop receipt – $${amount.toFixed(2)}`, html });
  }

  alert('Payment success!');
  STATE.cart = []; persistCart?.(); renderCart?.(); updateCartCount?.();
  resetCheckoutUI?.(); $('#cartDrawer')?.close();
}

// ==== in QR Done (wallet) handler ====
$('#qrDone')?.addEventListener('click', async ()=>{
  const user  = (window.firebaseAuth && firebaseAuth.currentUser) || null;
  const email = user?.email || $('#accEmail')?.textContent || '';
  const amount= (STATE.cart||[]).reduce((s,c)=> s + (c.price||0)*(c.qty||1), 0);

  const fulfill = currentFulfillment();
  let extraRow  = '';
  if (fulfill.mode === 'delivery') {
    extraRow = `<tr><td style="padding:6px 8px;border:1px solid #eee"><b>Shipping</b></td><td style="padding:6px 8px;border:1px solid #eee">${addressToLines(fulfill.address)||'—'}</td></tr>`;
  } else {
    extraRow = `<tr><td style="padding:6px 8px;border:1px solid #eee"><b>Pickup</b></td><td style="padding:6px 8px;border:1px solid #eee">${fulfill.location}</td></tr>`;
  }

  if (email) {
    const base = orderHtml({ items: STATE.cart||[], amount, method: 'Wallet (QR)' });
    const html = base.replace('</tbody></table>', `${extraRow}</tbody></table>`);
    await sendEmail({ to: email, subject: `MegaShop receipt – $${amount.toFixed(2)}`, html });
  }

  STATE.cart = []; persistCart?.(); renderCart?.(); updateCartCount?.();
  resetCheckoutUI?.(); $('#cartDrawer')?.close();
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
// document
//   .getElementById("btnSignup")
//   ?.addEventListener("click", () => signupModal.showModal());

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

// $("#btnLogin").addEventListener("click", () => $("#loginModal").showModal());
document.getElementById('btnLogin')?.addEventListener('click', () => {
  document.getElementById('loginModal')?.showModal();
});
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
  // show("#btnSignup", !user);
  document.querySelector("#btnSignup")?.classList.toggle("hidden", !!user);
  applyAuthNavUI(user);

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
document.addEventListener('DOMContentLoaded', ()=>{
  // Home toolbar “➕ Add Item”
  $('#btnGoAdmin')?.addEventListener('click', (e)=>{
    e.preventDefault();
    location.hash = 'admin';
    // admin page visible ဖြစ်တဲ့အချိန် modal ဖွင့် (ရှိရင်သာ)
    setTimeout(()=> { $('#itemModal')?.showModal(); }, 150);
  });

  // Admin page card ထဲက Open Add Item Modal
  $('#btnOpenItemModalAdmin')?.addEventListener('click', ()=>{
    $('#itemModal')?.showModal();
  });
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

document.querySelectorAll(".btn-feedback").forEach(btn=>{
  btn.addEventListener("click", async e=>{
    const card = e.target.closest(".item-card");
    const itemId = card.dataset.id;
    const message = prompt("Your feedback for this item?");
    if (!message) return;

    await addDoc(collection(db, "feedback"), {
      itemId,
      message,
      createdAt: today(),
      name: state.user?.email || "Anon",
    });

    // UI update
    const list = card.querySelector(".feedback-list");
    const div = document.createElement("div");
    div.textContent = `${state.user?.email || "Anon"}: ${message}`;
    list.appendChild(div);
  });
});

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
// function openProduct(id) {
//   const p = STATE.items.find((x) => x.id === id);
//   if (!p) return;
//   $("#pdImg").src =
//     p.imageUrl ||
//     p.gallery?.[0] ||
//     `https://picsum.photos/seed/${p.id}/800/600`;
//   $("#pdTitle").textContent = p.title || "";
//   $("#pdDesc").textContent = p.description || "";
//   $("#pdPrice").textContent = money(p.price);
//   $("#pdRating").textContent = `★ ${p.rating ?? "—"}`;
//   $("#pdProCode").textContent = p.proCode || "—";
//   $("#pdMemberCoupon").textContent = p.memberCoupon || "—";
//   $("#pdQty").value = 1;

//   const thumbs = p.gallery?.length ? p.gallery : [p.imageUrl].filter(Boolean);
//   const wrap = $("#pdThumbs");
//   wrap.innerHTML = (thumbs || [])
//     .map(
//       (src, i) =>
//         `<img src="${src}" class="${
//           i === 0 ? "active" : ""
//         }" data-src="${src}">`
//     )
//     .join("");
//   wrap.querySelectorAll("img").forEach((img) => {
//     img.addEventListener("click", () => {
//       wrap.querySelectorAll("img").forEach((x) => x.classList.remove("active"));
//       img.classList.add("active");
//       $("#pdImg").src = img.dataset.src;
//     });
//   });

//   $("#qtyMinus").onclick = () =>
//     ($("#pdQty").value = Math.max(1, (+$("#pdQty").value || 1) - 1));
//   $("#qtyPlus").onclick = () =>
//     ($("#pdQty").value = (+$("#pdQty").value || 1) + 1);

//   // ✅ Add to cart ⇒ add & close modal (do NOT open cart here)
//   $("#pdAdd").onclick = () => {
//     addToCartId(id, +$("#pdQty").value || 1);
//     $("#productModal")?.close(); // close after adding
//     resetCheckoutUI(); // hide payment options until user clicks Checkout
//   };

//   $("#productModal").showModal();
// }

function openAddItemModal(prefill = null) {
  const m = document.getElementById('itemModal');
  if (!m) return;
  const set = (sel, v='') => { const el = m.querySelector(sel); if (el) el.value = v; };

  // clear or prefill
  set('#itemId',            prefill?.id || '');
  set('#itemTitle',         prefill?.title || '');
  set('#itemCategory',      prefill?.category || '');
  set('#itemPrice',         prefill?.price || '');
  set('#itemDesc',          prefill?.description || '');
  set('#itemProCode',       prefill?.proCode || '');
  set('#itemMemberCoupon',  prefill?.memberCoupon || '');
  set('#itemThumb',         prefill?.imageUrl || '');
  // if you add #itemGallery input later:
  // set('#itemGallery', (prefill?.gallery || []).join(', '));

  m.showModal();
}

// Home toolbar button
document.getElementById('btnGoAdmin')?.addEventListener('click', (e)=>{
  e.preventDefault();
  // (1) သင် Admin page သို့ပြောင်းချင်ရင် — location.hash = 'admin';
  // (2) သင် modal ကိုတန်းဖွင့်ချင်ရင် —
  openAddItemModal();
});

// Admin page button
document.getElementById('btnOpenItemModalAdmin')?.addEventListener('click', ()=>{
  openAddItemModal();
});

function openProductModal(p){
  const modal = document.querySelector('#productModal');
  if (!modal) return;

  // fill basic fields...
  modal.querySelector('#pdTitle').textContent = p.title || '—';
  modal.querySelector('#pdDesc').textContent  = p.description || '';
  modal.querySelector('#pdPrice').textContent = money(p.price || 0);
  modal.querySelector('#pdImg').src = p.imageUrl || p.gallery?.[0] || 'https://picsum.photos/seed/'+(p.id||'x')+'/600/400';

  // thumbnails
  const thumbs = modal.querySelector('#pdThumbs');
  if (thumbs){
    const imgs = [p.imageUrl, ...(p.gallery||[])].filter(Boolean);
    thumbs.innerHTML = imgs.map(u=>`<img class="thumb" src="${u}" alt="">`).join('');
    thumbs.querySelectorAll('img').forEach(img=>{
      img.addEventListener('click', ()=> { modal.querySelector('#pdImg').src = img.src; });
    });
  }

  // qty controls
  const qtyEl = modal.querySelector('#pdQty');
  modal.querySelector('#qtyPlus')?.addEventListener('click', ()=> qtyEl.value = (+qtyEl.value||1)+1);
  modal.querySelector('#qtyMinus')?.addEventListener('click', ()=> qtyEl.value = Math.max(1, (+qtyEl.value||1)-1));

  // add to cart
  modal.querySelector('#pdAdd')?.addEventListener('click', ()=>{
    addToCartId(p.id, +qtyEl.value || 1);
    modal.close();                         // <<— ADD THIS to close after add
    // user then can open cart via header “Cart”
  }, { once:true });

  modal.showModal();
}

document.querySelectorAll(".item-card").forEach(card => {
  card.addEventListener("click", () => {
    const product = {
      title: card.querySelector("h3")?.textContent,
      price: card.getAttribute("data-price"),
      thumbnail: card.querySelector("img")?.src
    };
    openProductModal(product);
  });
});

// === Fix: legacy calls to openProduct(...) ===
window.openProduct = function (id) {
  if (!id) return;
  const p = (STATE.items || []).find(x => x.id === id);
  if (p) openProductModal(p);
};

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
function setCartBadge(n){
  const b = document.getElementById('cartBadge');
  if (!b) return;
  b.textContent = n;
  b.style.display = n > 0 ? '' : 'none';
  // lil' bump animation
  b.animate([{ transform:'scale(1)' }, { transform:'scale(1.2)' }, { transform:'scale(1)' }], { duration:200 });
}

function updateCartCount(){
  const cnt = (STATE?.cart || []).reduce((s,x)=> s + (x.qty||0), 0);
  setCartBadge(cnt);
}

function markActiveNav(){
  const hash = location.hash.replace('#','') || 'home';
  const links = document.querySelectorAll('.header .nav .link.pill[href], .header .nav .link.pill');
  links.forEach(el=>{
    el.removeAttribute('aria-current');
    const href = el.getAttribute('href');
    // buttons (Account/Login/Logout/Cart) များမှာ href မရှိ… Orders/Admin မှာပဲ စစ်မယ်
    if (href && href.startsWith('#')){
      const key = href.replace('#','');
      if (hash === key || hash.startsWith(key + '/')) el.setAttribute('aria-current','page');
    }
  });
}

// router setup ဖြစ်နေပြီးသားဆိုရင် route() အဆုံးမှာ ခေါ်ပါ
window.addEventListener('hashchange', markActiveNav);
document.addEventListener('DOMContentLoaded', markActiveNav, { once:true });

function show2(el, yes=true){ if (!el) return; el.classList.toggle('hidden', !yes); }

function applyAuthNavUI(user){
  const btnLogin  = document.getElementById('btnLogin');
  const btnSignup = document.getElementById('btnSignup');
  const btnAcc    = document.getElementById('btnAccount');
  const btnOut    = document.getElementById('btnLogoutHeader');

  const signedIn = !!user;
  show(btnLogin,  !signedIn);
  show(btnSignup, !signedIn);
  show(btnAcc,     signedIn);
  show(btnOut,     signedIn);
}

// Example: in your Firebase auth listener
// onAuthStateChanged(auth, (user)=> { applyAuthNavUI(user); });

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
// ====== SAVE / DELETE ITEM (Modal scope) ======
document.addEventListener('DOMContentLoaded', ()=>{
  const modal = $('#itemModal');
  const by = (sel)=> modal?.querySelector(sel);

  // SAVE
  by('#btnSaveItem')?.addEventListener('click', async ()=>{
    if (!modal) return;

    const id      = (by('#itemId')?.value || '').trim();
    const title   = (by('#itemTitle')?.value || '').trim();
    const category= (by('#itemCategory')?.value || '').trim().toLowerCase();
    const price   = parseFloat(by('#itemPrice')?.value || '0') || 0;
    const proCode = (by('#itemProCode')?.value || '').trim();
    const memberCoupon = (by('#itemMemberCoupon')?.value || '').trim();
    const desc    = (by('#itemDesc')?.value || '').trim();
    const thumb   = (by('#itemThumb')?.value || '').trim();
    const gallery = (by('#itemGallery')?.value || '')
                      .split(',')
                      .map(s=>s.trim())
                      .filter(Boolean);

    if (!title)   return alert('Title is required');
    if (!category)return alert('Category is required');

    const payload = {
      title, category, price, proCode, memberCoupon, desc,
      imageUrl: thumb || (gallery[0] || ''),
      gallery,
      updatedAt: serverTimestamp(),
    };
    if (!id) payload.createdAt = serverTimestamp();

    try {
      if (id) {
        await updateDoc(doc(db,'items',id), payload);
      } else {
        const ref = await addDoc(collection(db,'items'), payload);
        by('#itemId').value = ref.id;
      }
      alert('Item saved!');
      // refresh grid/list if you have a loader
      if (typeof loadItems === 'function') await loadItems();
      modal.close();
    } catch (e) {
      console.error('Save item error:', e);
      alert(e?.message || String(e));
    }
  });

  // DELETE
  by('#btnDeleteItem')?.addEventListener('click', async ()=>{
    const id = (by('#itemId')?.value || '').trim();
    if (!id) return alert('No item id');
    if (!confirm('Delete this item?')) return;
    try {
      await deleteDoc(doc(db,'items',id));
      alert('Deleted');
      if (typeof loadItems === 'function') await loadItems();
      modal.close();
    } catch(e){
      console.error(e);
      alert(e?.message || String(e));
    }
  });
});
// $("#btnSaveItem").addEventListener("click", saveItem);
// $("#btnDeleteItem").addEventListener("click", deleteItem);
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
// ==== Save Item (Add/Edit) null-safe ====
document.getElementById('btnSaveItem')?.addEventListener('click', async () => {
  const modal = document.getElementById('itemModal');
  if (!modal) return;

  // read from the modal scope only
  const $m = (sel) => modal.querySelector(sel);

  const id    = $m('#itemId')?.value.trim();
  const title = $m('#itemTitle')?.value.trim() || '';
  const cat   = ($m('#itemCategory')?.value || '').trim().toLowerCase();
  const price = parseFloat($m('#itemPrice')?.value || '0') || 0;
  const desc  = $m('#itemDesc')?.value || '';
  const pro   = $m('#itemProCode')?.value || '';
  const mem   = $m('#itemMemberCoupon')?.value || '';
  const thumb = $m('#itemThumb')?.value || '';

  // OPTIONAL gallery: comma-separated URLs in a hidden/extra field
  const galleryRaw = $m('#itemGallery')?.value || '';
  const gallery = galleryRaw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (!title)  return alert('Please enter a title');
  if (!cat)    return alert('Please enter a category (men/women/kids/electronics/home)');

  const payload = {
    title, category: cat, price,
    description: desc,
    proCode: pro, memberCoupon: mem,
    imageUrl: thumb,             // main thumbnail
    gallery,                     // optional more images
    updatedAt: (typeof serverTimestamp === 'function') ? serverTimestamp() : new Date().toISOString(),
  };

  try {
    if (id) {
      // update existing
      await setDoc(doc(db, 'items', id), payload, { merge: true });
      alert('Item updated!');
    } else {
      // create new
      payload.createdAt = (typeof serverTimestamp === 'function') ? serverTimestamp() : new Date().toISOString();
      const ref = await addDoc(collection(db, 'items'), payload);
      $m('#itemId').value = ref.id; // write back id so user can edit next time
      alert('Item created!');
    }
    // refresh list
    if (typeof loadItems === 'function') await loadItems();

    // close modal safely
    if (typeof modal.close === 'function') modal.close();
  } catch (e) {
    console.error('Save item error:', e);
    alert(e?.message || String(e));
  }
});
// $("#btnSaveItem")?.addEventListener("click", saveItem);
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
// window.addEventListener("load", () => {
//   setTimeout(() => {
//     if (confirm("Enjoying MegaShop? Send quick feedback?")) {
//       const message = prompt("Your feedback");
//       if (message) {
//         addDoc(collection(db, "feedback"), {
//           message,
//           createdAt: today(),
//           name: state.user?.email || "Anon",
//         });
//       }
//     }
//   }, 25000);
// });

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

/* ===========================
   MEMBERSHIP META + HELPERS
=========================== */
const MEMBERSHIP_META = {
  free:     { annualFee: 0,   discount: '0%',   cashback: '0%'  },
  silver:   { annualFee: 10,  discount: '3%',   cashback: '1%'  },
  gold:     { annualFee: 25,  discount: '5%',   cashback: '2%'  },
  platinum: { annualFee: 49,  discount: '8%',   cashback: '3%'  },
};

// build a simple member id (uid last 6 or timestamp)
function buildMemberId(uid) {
  if (uid && uid.length >= 6) return 'MS-' + uid.slice(-6).toUpperCase();
  return 'MS-' + String(Date.now()).slice(-6);
}

// address store/load (localStorage)
const ADDRESS_KEY = 'megashop_address';

function persistAddress(addr){
  localStorage.setItem(ADDRESS_KEY, JSON.stringify(addr||{}));
}
function restoreAddress(){
  try { return JSON.parse(localStorage.getItem(ADDRESS_KEY) || '{}'); } catch { return {}; }
}
function addressToLines(addr){
  if (!addr) return '';
  const { name, phone, line1, city, zip } = addr;
  return [name, phone, line1, city, zip].filter(Boolean).join(' • ');
}

// sync Account form -> storage
function readAccountAddress(){
  return {
    name:  $('#shipName')?.value?.trim()  || '',
    phone: $('#shipPhone')?.value?.trim() || '',
    line1: $('#shipLine1')?.value?.trim() || '',
    city:  $('#shipCity')?.value?.trim()  || '',
    zip:   $('#shipZip')?.value?.trim()   || '',
  };
}
function writeAccountAddress(addr){
  if (!addr) return;
  if ($('#shipName'))  $('#shipName').value  = addr.name  || '';
  if ($('#shipPhone')) $('#shipPhone').value = addr.phone || '';
  if ($('#shipLine1')) $('#shipLine1').value = addr.line1 || '';
  if ($('#shipCity'))  $('#shipCity').value  = addr.city  || '';
  if ($('#shipZip'))   $('#shipZip').value   = addr.zip   || '';
}

// load address on Account page open (call in your route/account render if needed)
(function preloadAddressToAccount(){
  const a = restoreAddress();
  writeAccountAddress(a);
})();

// Account: Save Address
$('#btnSaveAddress')?.addEventListener('click', ()=>{
  const a = readAccountAddress();
  persistAddress(a);
  const msg = $('#addrSavedMsg');
  if (msg){ msg.style.display='block'; setTimeout(()=> msg.style.display='none', 1200); }
});

// Cart mini form helpers
function readCartAddress(){
  return {
    name:  $('#shipNameCart')?.value?.trim()  || '',
    phone: $('#shipPhoneCart')?.value?.trim() || '',
    line1: $('#shipLine1Cart')?.value?.trim() || '',
    city:  $('#shipCityCart')?.value?.trim()  || '',
    zip:   $('#shipZipCart')?.value?.trim()   || '',
  };
}
function writeCartAddress(addr){
  if (!addr) return;
  if ($('#shipNameCart'))  $('#shipNameCart').value  = addr.name  || '';
  if ($('#shipPhoneCart')) $('#shipPhoneCart').value = addr.phone || '';
  if ($('#shipLine1Cart')) $('#shipLine1Cart').value = addr.line1 || '';
  if ($('#shipCityCart'))  $('#shipCityCart').value  = addr.city  || '';
  if ($('#shipZipCart'))   $('#shipZipCart').value   = addr.zip   || '';
  // preview line
  if ($('#shipPreview')) $('#shipPreview').textContent = addressToLines(addr) || 'No address saved yet.';
}

// “Use account address” → copy to cart mini form
$('#btnUseAccountAddr')?.addEventListener('click', ()=>{
  const a = restoreAddress();
  writeCartAddress(a);
});

// show/hide delivery vs pickup
function updateFulfillmentUI(){
  const isDelivery = $('#optDelivery')?.checked;
  if ($('#shipForm'))   $('#shipForm').style.display   = isDelivery ? '' : 'none';
  if ($('#pickupList')) $('#pickupList').style.display = isDelivery ? 'none' : '';
}
$('#optDelivery')?.addEventListener('change', updateFulfillmentUI);
$('#optPickup')  ?.addEventListener('change', updateFulfillmentUI);
updateFulfillmentUI();

// init cart mini preview
writeCartAddress(restoreAddress());

/* ===========================
   MEMBERSHIP EMAIL CONTENT
=========================== */
function membershipHtml({ level, memberId, meta, address }){
  const addrHtml = addressToLines(address) || '—';
  return `
  <div style="font-family:Inter,Arial,sans-serif">
    <h2 style="margin:0 0 8px">Welcome to MegaShop ${level.toUpperCase()}!</h2>
    <p>Thank you for joining as a <b>${level.toUpperCase()}</b> member.</p>
    <table style="border-collapse:collapse;margin:8px 0">
      <tbody>
        <tr><td style="padding:6px 8px;border:1px solid #eee"><b>Member ID</b></td><td style="padding:6px 8px;border:1px solid #eee">${memberId}</td></tr>
        <tr><td style="padding:6px 8px;border:1px solid #eee"><b>Annual Fee</b></td><td style="padding:6px 8px;border:1px solid #eee">$${Number(meta.annualFee||0).toFixed(2)}</td></tr>
        <tr><td style="padding:6px 8px;border:1px solid #eee"><b>Discount</b></td><td style="padding:6px 8px;border:1px solid #eee">${meta.discount}</td></tr>
        <tr><td style="padding:6px 8px;border:1px solid #eee"><b>Cashback</b></td><td style="padding:6px 8px;border:1px solid #eee">${meta.cashback}</td></tr>
        <tr><td style="padding:6px 8px;border:1px solid #eee"><b>Shipping Address</b></td><td style="padding:6px 8px;border:1px solid #eee">${addrHtml}</td></tr>
      </tbody>
    </table>
    <p>Enjoy exclusive coupons and faster checkout!</p>
  </div>`;
}

// Apply membership click → send rich email (replace your existing handler if needed)
$('#btnApplyMembership')?.addEventListener('click', async ()=>{
  const level = $('#membershipLevel')?.value || 'free';
  const meta  = MEMBERSHIP_META[level] || MEMBERSHIP_META.free;

  // resolve user + memberId
  const user    = (window.firebaseAuth && firebaseAuth.currentUser) || null;
  const email   = user?.email || $('#accEmail')?.textContent || '';
  const memberId= buildMemberId(user?.uid);

  // keep latest address (prefer account form; fallback to saved)
  let addr = readAccountAddress();
  if (!addr.line1 && !addr.city) addr = restoreAddress();
  persistAddress(addr); // keep it

  if (email) {
    await sendEmail({
      to: email,
      subject: `Your MegaShop membership: ${level.toUpperCase()}`,
      html: membershipHtml({ level, memberId, meta, address: addr })
    });
    alert('Membership applied and email sent.');
  } else {
    alert('Membership applied. (No email: user not signed in / no email)');
  }

  // UI reflect
  if ($('#accMember')) $('#accMember').textContent = level;
});

// ---------------- AUTH WIRING (SAFE) ----------------
// function applyAuthNavUI(user) {
//   // hide Login when signed in; show Account + Logout
//   document.getElementById('btnLogin')?.classList.toggle('hidden', !!user);
//   document.getElementById('btnAccount')?.classList.toggle('hidden', !user);
//   document.getElementById('btnLogoutHeader')?.classList.toggle('hidden', !user);

//   // account page email / membership (optional)
//   const accEmail = document.getElementById('accEmail');
//   if (accEmail) accEmail.textContent = user?.email || '—';
// }

// ==== AUTH WIRING SHIM (map DOM ids to variables the auth block uses) ====
(() => {
  const $ = (s) => document.querySelector(s);
  // dialog element
  const dlg = document.getElementById('loginModal');
  // buttons (match index.html ids)
  window.loginBtn  = document.getElementById('doLogin');
  window.signupBtn = document.getElementById('doSignup');
  window.forgotBtn = document.getElementById('doForgot');
  // fields
  window.$ = $; // used by auth block below
})();

/* ========= ADMIN ITEMS: one-time wiring + local fallback (table-optional) ========= */
(function wireAdminItemsOnce(){
  if (window.__adminItemsWired) return; window.__adminItemsWired = true;

  const $ = (s)=>document.querySelector(s);
  const openBtn = $('#btnOpenItemModalAdmin'); // index.html has this (Admin Console)
  // use existing #itemModal from index.html (already present)
  const dlg = document.getElementById('itemModal');
  const idEl = $('#itemId'), tEl = $('#itemTitle'), cEl = $('#itemCategory');
  const pEl = $('#itemPrice'), proEl = $('#itemProCode'), memEl = $('#itemMemberCoupon');
  const dEl = $('#itemDesc'), thEl = $('#itemThumb'), gEl = $('#itemGallery');
  const saveBtn = $('#btnSaveItem'), delBtn = $('#btnDeleteItem');

  // simple local storage store
  const KEY = 'ol_items';
  const read = ()=>{ try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch{return[]} };
  const write= (a)=>{ try{localStorage.setItem(KEY, JSON.stringify(a));}catch{} };

  function openEditor(item=null){
    if (item){
      $('#itemModalTitle').textContent = 'Edit Item';
      idEl.value = item.id||'';
      tEl.value = item.title||'';
      cEl.value = item.category||'';
      pEl.value = item.price!=null ? item.price : '';
      proEl.value = item.proCode||'';
      memEl.value = item.memberCoupon||'';
      dEl.value = item.desc||'';
      thEl.value = item.thumb||'';
      gEl.value = Array.isArray(item.gallery)? item.gallery.join(', ') : (item.gallery||'');
      delBtn.style.display = '';
    } else {
      $('#itemModalTitle').textContent = 'Add Item';
      idEl.value = ''; tEl.value=''; cEl.value=''; pEl.value=''; proEl.value=''; memEl.value='';
      dEl.value = ''; thEl.value=''; gEl.value='';
      delBtn.style.display = 'none';
    }
    dlg.showModal?.();
  }

  openBtn?.addEventListener('click', ()=> openEditor(null));

  saveBtn?.addEventListener('click', ()=>{
    const items = read();
    const id = idEl.value || ('item_'+Date.now());
    const gallery = (gEl.value||'').split(',').map(s=>s.trim()).filter(Boolean);
    const obj = {
      id,
      title: tEl.value.trim(),
      category: cEl.value.trim(),
      price: Number(pEl.value||0),
      proCode: proEl.value.trim(),
      memberCoupon: memEl.value.trim(),
      desc: dEl.value.trim(),
      thumb: thEl.value.trim(),
      gallery
    };
    const i = items.findIndex(x=>x.id===id);
    if (i>=0) items[i]=obj; else items.push(obj);
    write(items);
    dlg.close?.();
    toast?.('Saved item');
  });

  delBtn?.addEventListener('click', ()=>{
    const items = read();
    const id = idEl.value;
    if (!id) return;
    const next = items.filter(x=>x.id!==id);
    write(next);
    dlg.close?.();
    toast?.('Deleted item');
  });

  // close buttons in dialog (× / data-close)
  dlg?.addEventListener('click', (e)=>{
    const t = e.target;
    if (t && (t.matches('.close,[data-close]'))) dlg.close?.();
  });
})();

function wireAuthUI() {
  // open login modal
  const btnLogin = document.getElementById('btnLogin');
  const loginModal = document.getElementById('loginModal');
  btnLogin?.addEventListener('click', () => loginModal?.showModal());

  // universal [x] close buttons for dialogs
  document.querySelectorAll('[data-close]')?.forEach(b => {
    b.addEventListener('click', (e) => e.target.closest('dialog')?.close());
  });

  // ---- LOGIN ----
  const doLogin    = document.getElementById('doLogin');
  const loginEmail = document.getElementById('loginEmail');
  const loginPass  = document.getElementById('loginPass');

  doLogin?.addEventListener('click', async () => {
    try {
      const email = loginEmail?.value.trim();
      const pass  = loginPass?.value;
      if (!email || !pass) return alert('Enter email and password');
      // uses already-imported auth instance
      const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
      await signInWithEmailAndPassword(auth, email, pass);
      loginModal?.close();
    } catch (e) {
      alert(e?.message || String(e));
      console.error(e);
    }
  });

  // ---- FORGOT PASSWORD ----
  const openForgot   = document.getElementById('openForgot');
  const forgotModal  = document.getElementById('forgotModal');
  const doForgot     = document.getElementById('doForgot');
  const forgotEmail  = document.getElementById('forgotEmail');

  openForgot?.addEventListener('click', () => {
    loginModal?.close();
    forgotModal?.showModal();
  });

  doForgot?.addEventListener('click', async () => {
    try {
      const email = forgotEmail?.value.trim();
      if (!email) return alert('Enter your email');
      const { sendPasswordResetEmail } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
      await sendPasswordResetEmail(auth, email);
      alert('Password reset email sent.');
      forgotModal?.close();
    } catch (e) {
      alert(e?.message || String(e));
      console.error(e);
    }
  });

  // ---- LOGOUT (header + account page) ----
  const btnLogout        = document.getElementById('btnLogout');
  const btnLogoutHeader  = document.getElementById('btnLogoutHeader');
  const doLogout = async () => {
    try {
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
      await signOut(auth);
    } catch (e) {
      alert(e?.message || String(e));
      console.error(e);
    }
  };
  btnLogout?.addEventListener('click', doLogout);
  btnLogoutHeader?.addEventListener('click', doLogout);
}

// Bind only AFTER DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    wireAuthUI();
    // auth state → adjust nav
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js').then(({ onAuthStateChanged }) => {
      onAuthStateChanged(auth, (user) => applyAuthNavUI(user));
    });
  }, { once: true });
} else {
  wireAuthUI();
  import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js').then(({ onAuthStateChanged }) => {
    onAuthStateChanged(auth, (user) => applyAuthNavUI(user));
  });
}

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

/* ========= AUTH: one-time safe wiring ========= */
(function wireAuthOnce(){
  if (window.__authWired) return; window.__authWired = true;

  // helpers
  const $ = (s)=>document.querySelector(s);
  const dlg = $('#authModal'); // index.html has this dialog
  // guard existing modal markup
  if (!dlg) return;

  const loginBtn  = $('#doLogin');
  const signupBtn = $('#doSignup');
  const forgotBtn = $('#doForgot');

  // single-submit guard to avoid double fire
  function once(fn){
    let busy = false;
    return async (...args)=>{
      if (busy) return;
      busy = true;
      try{ await fn(...args); } finally { busy=false; }
    };
  }

  // role helpers (keep same API as rest of app)
  function setUser(u){ try { window.__USER__ = u; localStorage.setItem('ol_user', JSON.stringify(u||null)); } catch{} }
  function getUser(){ try { return window.__USER__ || JSON.parse(localStorage.getItem('ol_user')||'null'); } catch { return null; } }
  function setLogged(on, email){ /* UI refresh hooks if you had */ }

  // Firebase available?
  function hasFB(){
    try { return !!window.firebase && !!window.auth && !!auth.signInWithEmailAndPassword; } catch { return false; }
  }

  // Fallback “soft auth” store
  const UKEY='ol_fake_users';
  const readUsers = ()=>{ try{ return JSON.parse(localStorage.getItem(UKEY)||'{}'); }catch{return{}}; };
  const writeUsers = (o)=>{ try{ localStorage.setItem(UKEY, JSON.stringify(o)); }catch{} };

  // LOGIN
  loginBtn?.addEventListener('click', once(async (e)=>{
    e.preventDefault();
    const email = ($('#loginEmail')?.value||'').trim().toLowerCase();
    const pass  = ($('#loginPass')?.value||'').trim();
    if (!email || !pass) return;

    try {
      if (hasFB()){
        // Firebase path (adjust to your SDK shape if using modular v9)
        await firebase.auth().signInWithEmailAndPassword(email, pass);
        setUser({email, role: 'admin'}); // role will be resolved later if you already do
      } else {
        // Local fallback
        const users = readUsers();
        if (!users[email] || users[email].pass !== pass) {
          toast?.('Invalid email or password'); return;
        }
        setUser({email, role: users[email].role||'admin'});
      }
      dlg.close?.();
      setLogged(true, email);
      // optional: refresh gates / pages
      window.renderCatalog?.(); window.renderProfilePanel?.(); window.enforceRoleGates?.();
      toast?.('Logged in');
    } catch (err){
      toast?.(err?.message || 'Login failed');
    }
  }));

  // SIGNUP
  signupBtn?.addEventListener('click', once(async (e)=>{
    e.preventDefault();
    const email = ($('#signupEmail')?.value||'').trim().toLowerCase();
    const pass  = ($('#signupPass')?.value||'').trim();
    if (!email || pass.length<6) { toast?.('Password must be ≥ 6'); return; }
    try{
      if (hasFB()){
        await firebase.auth().createUserWithEmailAndPassword(email, pass);
        setUser({email, role:'admin'});
      } else {
        const users = readUsers();
        if (users[email]) { toast?.('Account already exists'); return; }
        users[email] = { pass, role:'admin' }; // give admin so you can manage items
        writeUsers(users);
        setUser({email, role:'admin'});
      }
      dlg.close?.(); setLogged(true, email);
      window.enforceRoleGates?.(); toast?.('Account created');
    }catch(err){ toast?.(err?.message||'Signup failed'); }
  }));

  // FORGOT (no-op in local mode)
  forgotBtn?.addEventListener('click', once(async (e)=>{
    e.preventDefault();
    const email = ($('#forgotEmail')?.value||'').trim().toLowerCase();
    if (!email) return;
    try{
      if (hasFB()){
        await firebase.auth().sendPasswordResetEmail(email);
        toast?.('Reset link sent');
      } else {
        toast?.('Reset only works when Firebase Auth is connected');
      }
    }catch(err){ toast?.(err?.message||'Reset failed'); }
  }));

  // open login programmatically if needed:
  window.openLogin = ()=> dlg.showModal?.();
})();

/* ========= ADMIN ITEMS: one-time wiring + local fallback ========= */
(function wireAdminItemsOnce(){
  if (window.__adminItemsWired) return; window.__adminItemsWired = true;

  const $ = (s)=>document.querySelector(s);
  const table = $('#adminTable tbody');
  const openBtn = $('#btnOpenItemModalAdmin'); // index.html (admin section) has this
  const dlg = document.getElementById('itemModal') || (function createModal(){
    const d = document.createElement('dialog');
    d.id='itemModal';
    d.className='ol-modal card';
    d.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
        <b class="modal-title" id="itemModalTitle">Add Item</b>
        <button class="btn small" id="closeItemModal" type="button">Close</button>
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr; gap:8px">
        <label>Title<input id="fmTitle" class="input"/></label>
        <label>Category<input id="fmCategory" class="input"/></label>
        <label>Level<input id="fmLevel" class="input"/></label>
        <label>Hours<input id="fmHours" class="input" type="number"/></label>
        <label>Price<input id="fmPrice" class="input" type="number"/></label>
        <label>Rating<input id="fmRating" class="input" type="number" step="0.1"/></label>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:10px;gap:8px">
        <button class="btn" id="btnDeleteItem" type="button" style="display:none">Delete</button>
        <button class="btn primary" id="btnSaveItem" type="button">Save</button>
      </div>`;
    document.body.appendChild(d);
    d.querySelector('#closeItemModal').onclick = ()=> d.close();
    return d;
  })();

  // simple in-memory + localStorage helpers
  const CK='ol_catalog';
  const readCatalog = ()=>{ try{ return JSON.parse(localStorage.getItem(CK)||'[]'); }catch{return[]} };
  const writeCatalog= (arr)=>{ try{ localStorage.setItem(CK, JSON.stringify(arr)); }catch{} };

  // render table rows
  function renderAdminTable(){
    if (!table) return;
    const data = readCatalog();
    table.innerHTML = data.map((c, i)=> `
      <tr data-idx="${i}">
        <td>${c.title||'-'}</td>
        <td>${c.category||'-'}</td>
        <td>${c.level||'-'}</td>
        <td>${c.rating||'-'}</td>
        <td>${c.hours||'-'}</td>
        <td>${c.price||0}</td>
        <td style="text-align:right">
          <button class="btn small" data-edit="${i}">Edit</button>
        </td>
      </tr>
    `).join('');
  }

  function openEditor(idx=null){
    dlg.showModal?.();
    const isEdit = idx!=null;
    const data = readCatalog();
    const row = isEdit ? data[idx] : {};
    $('#itemModalTitle').textContent = isEdit ? 'Edit Item' : 'Add Item';
    $('#fmTitle').value    = row?.title    || '';
    $('#fmCategory').value = row?.category || '';
    $('#fmLevel').value    = row?.level    || '';
    $('#fmHours').value    = row?.hours    || '';
    $('#fmPrice').value    = row?.price    || '';
    $('#fmRating').value   = row?.rating   || '';
    const delBtn = dlg.querySelector('#btnDeleteItem');
    delBtn.style.display = isEdit ? '' : 'none';
    delBtn.onclick = ()=>{
      const arr = readCatalog();
      arr.splice(idx,1);
      writeCatalog(arr);
      dlg.close(); renderAdminTable(); toast?.('Deleted');
    };
    dlg.querySelector('#btnSaveItem').onclick = ()=>{
      const item = {
        title:    $('#fmTitle').value.trim(),
        category: $('#fmCategory').value.trim(),
        level:    $('#fmLevel').value.trim(),
        hours:    Number($('#fmHours').value||0),
        price:    Number($('#fmPrice').value||0),
        rating:   Number($('#fmRating').value||0),
      };
      const arr = readCatalog();
      if (isEdit) arr[idx] = item; else arr.push(item);
      writeCatalog(arr);
      dlg.close(); renderAdminTable(); toast?.('Saved');
    };
  }

  // open button + row edit (single delegation)
  openBtn?.addEventListener('click', ()=> openEditor(null));
  table?.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-edit]');
    if (!btn) return;
    const idx = Number(btn.getAttribute('data-edit'));
    if (Number.isFinite(idx)) openEditor(idx);
  });

  // first draw
  renderAdminTable();
})();

(function(){
  // prevent re-wiring the same DOM ids repeatedly
  const _addEvent = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, opts){
    // mark once per node+type+toString(listener)
    const key = '__once_'+type+'_'+(listener && (listener._id || (listener._id = Math.random().toString(36).slice(2))));
    if (this[key]) return;
    this[key] = true;
    return _addEvent.call(this, type, listener, opts);
  };
})();

(function safeInitAll(){
  function init(){
    try { wireAuthOnce?.(); } catch(e){ console.warn('auth wire failed:', e?.message||e); }
    try { wireAdminItemsOnce?.(); } catch(e){ console.warn('admin wire failed:', e?.message||e); }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();

// ===== DEDUPE LISTENERS (SAFE) =====
(function dedupeListeners(){
  const seen = new WeakMap();                   // target -> Map(type -> Set(listener))
  const orig = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options){
    if (!listener) return;                      // nothing to add
    let types = seen.get(this);
    if (!types) { types = new Map(); seen.set(this, types); }
    let ls = types.get(type);
    if (!ls) { ls = new Set(); types.set(type, ls); }
    if (ls.has(listener)) return;               // same fn already added to this target+type
    ls.add(listener);
    return orig.call(this, type, listener, options);
  };
})();

// ===== AUTH: one-time safe wiring =====
window.wireAuthOnce = function wireAuthOnce(){
  if (window.__authWired) return; window.__authWired = true;

  const $ = (s)=>document.querySelector(s);
  const dlg = $('#authModal');                  // must exist in index.html
  if (!dlg) { console.warn('#authModal missing'); return; }

  const loginBtn  = $('#doLogin');
  const signupBtn = $('#doSignup');
  const forgotBtn = $('#doForgot');

  const once = (fn)=>{ let busy=false; return async (e)=>{ if(busy) return; busy=true; try{ await fn(e);} finally{busy=false;} }; };

  // helpers
  function setUser(u){ try { window.__USER__=u; localStorage.setItem('ol_user', JSON.stringify(u||null)); }catch{} }
  function setLogged(){}

  // local fallback store
  const UKEY='ol_fake_users';
  const readUsers = ()=>{ try{ return JSON.parse(localStorage.getItem(UKEY)||'{}'); }catch{return{}}; };
  const writeUsers= (o)=>{ try{ localStorage.setItem(UKEY, JSON.stringify(o)); }catch{} };

  // LOGIN
  if (loginBtn) loginBtn.addEventListener('click', once(async (e)=>{
    e.preventDefault();
    const email = (document.querySelector('#loginEmail')?.value||'').trim().toLowerCase();
    const pass  = (document.querySelector('#loginPass')?.value||'').trim();
    if (!email || !pass) return;

    // Firebase available?
    let ok=false, errMsg='';
    try {
      if (window.firebase?.auth) {
        await firebase.auth().signInWithEmailAndPassword(email, pass);
        ok=true;
      } else {
        const users = readUsers();
        if (users[email]?.pass === pass) ok=true; else errMsg='Invalid email or password';
      }
    } catch (e){ errMsg = e?.message||'Login failed'; }

    if (!ok){ toast?.(errMsg||'Login failed'); return; }
    setUser({ email, role: 'admin' });          // role resolver later if you have one
    dlg.close?.(); setLogged(true, email);
    window.renderCatalog?.(); window.renderProfilePanel?.(); window.enforceRoleGates?.();
    toast?.('Logged in');
  }));

  // SIGNUP
  if (signupBtn) signupBtn.addEventListener('click', once(async (e)=>{
    e.preventDefault();
    const email = (document.querySelector('#signupEmail')?.value||'').trim().toLowerCase();
    const pass  = (document.querySelector('#signupPass')?.value||'').trim();
    if (!email || pass.length<6) { toast?.('Password must be ≥ 6'); return; }

    let ok=false, errMsg='';
    try{
      if (window.firebase?.auth){
        await firebase.auth().createUserWithEmailAndPassword(email, pass);
        ok=true;
      } else {
        const users = readUsers();
        if (users[email]) { errMsg='Account already exists'; }
        else { users[email] = { pass, role:'admin' }; writeUsers(users); ok=true; }
      }
    }catch(e){ errMsg=e?.message||'Signup failed'; }

    if (!ok){ toast?.(errMsg||'Signup failed'); return; }
    setUser({ email, role:'admin' });
    dlg.close?.(); setLogged(true, email);
    window.enforceRoleGates?.(); toast?.('Account created');
  }));

  // FORGOT
  if (forgotBtn) forgotBtn.addEventListener('click', once(async (e)=>{
    e.preventDefault();
    const email = (document.querySelector('#forgotEmail')?.value||'').trim().toLowerCase();
    if (!email) return;
    try{
      if (window.firebase?.auth) {
        await firebase.auth().sendPasswordResetEmail(email);
        toast?.('Reset link sent');
      } else {
        toast?.('Reset works only with Firebase Auth connected');
      }
    }catch(err){ toast?.(err?.message||'Reset failed'); }
  }));
};

// ===== ADMIN: one-time safe wiring =====
window.wireAdminItemsOnce = function wireAdminItemsOnce(){
  if (window.__adminItemsWired) return; window.__adminItemsWired = true;

  const $ = (s)=>document.querySelector(s);
  const tbody = document.querySelector('#adminTable tbody');
  if (!tbody) { console.warn('#adminTable tbody missing'); return; }

  // in-memory/localStorage store
  const CK='ol_catalog';
  const readCatalog = ()=>{ try{ return JSON.parse(localStorage.getItem(CK)||'[]'); }catch{return[]} };
  const writeCatalog= (arr)=>{ try{ localStorage.setItem(CK, JSON.stringify(arr)); }catch{} };

  // Ensure modal
  let dlg = document.getElementById('itemModal');
  if (!dlg){
    dlg = document.createElement('dialog');
    dlg.id='itemModal'; dlg.className='ol-modal card';
    dlg.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
        <b class="modal-title" id="itemModalTitle">Add Item</b>
        <button class="btn small" id="closeItemModal" type="button">Close</button>
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr; gap:8px">
        <label>Title<input id="fmTitle" class="input"/></label>
        <label>Category<input id="fmCategory" class="input"/></label>
        <label>Level<input id="fmLevel" class="input"/></label>
        <label>Hours<input id="fmHours" class="input" type="number"/></label>
        <label>Price<input id="fmPrice" class="input" type="number"/></label>
        <label>Rating<input id="fmRating" class="input" type="number" step="0.1"/></label>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:10px;gap:8px">
        <button class="btn" id="btnDeleteItem" type="button" style="display:none">Delete</button>
        <button class="btn primary" id="btnSaveItem" type="button">Save</button>
      </div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('#closeItemModal')?.addEventListener('click', ()=> dlg.close());
  }

  function renderAdminTable(){
    const data = readCatalog();
    tbody.innerHTML = data.map((c, i)=> `
      <tr data-idx="${i}">
        <td>${c.title||'-'}</td>
        <td>${c.category||'-'}</td>
        <td>${c.level||'-'}</td>
        <td>${c.rating||'-'}</td>
        <td>${c.hours||'-'}</td>
        <td>${c.price||0}</td>
        <td style="text-align:right">
          <button class="btn small" data-edit="${i}">Edit</button>
        </td>
      </tr>`).join('');
  }

  function openEditor(idx=null){
    dlg.showModal?.();
    const data = readCatalog();
    const row = (idx!=null) ? data[idx] : {};
    const $v = (id)=> dlg.querySelector(id);

    $v('#itemModalTitle').textContent = (idx!=null) ? 'Edit Item' : 'Add Item';
    $v('#fmTitle').value    = row?.title    || '';
    $v('#fmCategory').value = row?.category || '';
    $v('#fmLevel').value    = row?.level    || '';
    $v('#fmHours').value    = row?.hours    || '';
    $v('#fmPrice').value    = row?.price    || '';
    $v('#fmRating').value   = row?.rating   || '';

    const del = $v('#btnDeleteItem');
    del.style.display = (idx!=null) ? '' : 'none';
    del.onclick = ()=>{
      const arr = readCatalog();
      arr.splice(idx,1); writeCatalog(arr);
      dlg.close(); renderAdminTable(); toast?.('Deleted');
    };
    $v('#btnSaveItem').onclick = ()=>{
      const item = {
        title:    $v('#fmTitle').value.trim(),
        category: $v('#fmCategory').value.trim(),
        level:    $v('#fmLevel').value.trim(),
        hours:    Number($v('#fmHours').value||0),
        price:    Number($v('#fmPrice').value||0),
        rating:   Number($v('#fmRating').value||0),
      };
      const arr = readCatalog();
      if (idx!=null) arr[idx]=item; else arr.push(item);
      writeCatalog(arr);
      dlg.close(); renderAdminTable(); toast?.('Saved');
    };
  }

  // “Add Item” button (optional — only bind if present)
  document.getElementById('btnOpenItemModalAdmin')?.addEventListener('click', ()=> openEditor(null));

  // Row edit (delegation; tbody guaranteed)
  tbody.addEventListener('click', (e)=>{
    const btn = e.target.closest?.('[data-edit]');
    if (!btn) return;
    const idx = Number(btn.getAttribute('data-edit'));
    if (Number.isFinite(idx)) openEditor(idx);
  });

  renderAdminTable();
};
// === Part 0: Firebase & libs ===
import { auth, db } from "./config.js"; // ✅ ONLY this import, no initializeApp/getAuth here

import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithRedirect,
  getIdTokenResult,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
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

// Buttons (support both ids just in case)
const btnLogin =
  document.getElementById("btnLogin") || document.getElementById("btnUser");
const btnGoogle = document.getElementById("btnGoogle");

// Open auth modal
btnLogin?.addEventListener("click", () => {
  if (state.user) {
    return toast("Already signed in");
  }
  document.getElementById("authModal")?.showModal();
});

// Google sign-in
btnGoogle?.addEventListener("click", async () => {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithRedirect(auth, provider);
  } catch (e) {
    console.warn("sign-in failed", e);
    toast("Sign-in failed. Check API keys / authorized domains.");
  }
});

// simple state & utils
const state =
  window.state ||
  (window.state = { cart: [], itemPromos: {}, user: null, isAdmin: false });
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const h = (tag) => document.createElement(tag);
// const fmt = (n) => "$" + Number(n || 0).toFixed(2);
const toast = (msg) => console.log("TOAST:", msg);

// ========= CART (minimal & de-duplicated) =========
const CART_KEY = "cart";

// -- storage helpers --
function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function setCart(arr) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(arr));
  } catch {}
  state.cart = Array.isArray(arr) ? arr : [];
}
function ensureCart() {
  if (!Array.isArray(state.cart)) state.cart = getCart();
  return state.cart;
}
function saveCart() {
  setCart(ensureCart());
}

// ==== PAYMENT CONFIG (edit as needed) ====
const PAYPAL_CLIENT_ID = "YOUR_PAYPAL_CLIENT_ID"; // <-- သင့် client id ထည့်ပါ
const PAY_MERCHANT = {
  kbz: "KBZ-STORE-001", // KBZPay merchant/ref
  cb: "CB-STORE-001", // CBPay merchant/ref
  aya: "AYA-STORE-001", // AyaPay merchant/ref
};

// build a unified memo / payload for QR & PayPal
function buildPaymentMemo(method) {
  const t = computeTotals?.() || { total: 0, subtotal: 0, shipping: 0 };
  return {
    method,
    amount: Number(t.total || 0),
    currency: "USD",
    ts: Date.now(),
    note: "ShweShop Order",
  };
}

// Dynamically load PayPal SDK once
function loadPayPalSdk(clientId) {
  return new Promise((resolve, reject) => {
    if (window.paypal) return resolve();
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      clientId
    )}&currency=USD`;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// Render PayPal Buttons into #paypalZone (inside drawer)
async function renderPayPalButtons() {
  const zone = document.getElementById("paypalZone");
  if (!zone) return;
  zone.innerHTML = ""; // clear previous
  try {
    await loadPayPalSdk(PAYPAL_CLIENT_ID);
    const memo = buildPaymentMemo("PayPal");
    if (!window.paypal) throw new Error("PayPal SDK not available");
    window.paypal
      .Buttons({
        style: { layout: "horizontal", height: 40 },
        createOrder: (data, actions) => {
          return actions.order.create({
            purchase_units: [
              {
                amount: { value: memo.amount.toFixed(2) },
                description: memo.note,
              },
            ],
          });
        },
        onApprove: async (data, actions) => {
          try {
            await actions.order.capture();
          } catch {}
          alert(`PayPal paid ${memo.amount.toFixed(2)} USD. Thanks!`);
          setCart([]);
          renderCartPage();
        },
        onError: (err) => {
          console.error("PayPal error:", err);
          alert("PayPal payment failed. Please try again.");
        },
      })
      .render(zone);
  } catch (e) {
    console.error(e);
    zone.innerHTML = `<p class="small">PayPal unavailable. Check client id or network.</p>`;
  }
}

// Build QR img URL (primary + fallback providers)
function generateQrImgSrc(payload, provider = "google") {
  const txt = typeof payload === "string" ? payload : JSON.stringify(payload);
  const enc = encodeURIComponent(txt);
  if (provider === "google") {
    // Primary: Google Charts
    return `https://chart.googleapis.com/chart?cht=qr&chs=360x360&chl=${enc}`;
  }
  // Fallback: qrserver
  return `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${enc}`;
}

// Bigger, prettier modal with robust QR loading & fallback
function openQrPay(method) {
  const drawer = document.getElementById("cartDrawer");
  const body = drawer?.querySelector(".drawer-body");
  if (!body) return;

  const memo = buildPaymentMemo(method);
  const merchant =
    method === "KBZPay"
      ? PAY_MERCHANT.kbz
      : method === "CBPay"
      ? PAY_MERCHANT.cb
      : method === "AyaPay"
      ? PAY_MERCHANT.aya
      : "STORE";

  const payload = {
    method,
    merchant,
    amount: memo.amount.toFixed(2),
    currency: memo.currency,
    note: memo.note,
    ts: memo.ts,
  };

  // Create (or reuse) modal
  let modal = body.querySelector("#qrPayModal");
  if (!modal) {
    modal = document.createElement("dialog");
    modal.id = "qrPayModal";
    modal.innerHTML = `
      <div class="qr-wrap">
        <div class="qr-head">
          <div class="qr-title">Scan to Pay — <span id="qrBrand"></span></div>
          <button id="qrClose" class="btn-mini btn-outline" aria-label="Close">✕</button>
        </div>

        <div class="qr-body">
          <div id="qrImgWrap" class="qr-imgwrap">
            <div class="qr-loading" id="qrLoading">Loading QR…</div>
            <img id="qrImg" alt="Payment QR" />
          </div>

          <div class="qr-meta">
            <div class="row between"><div>Amount</div><div class="price" id="qrAmt">$0.00</div></div>
            <div class="row between"><div>Merchant</div><div id="qrMerchant">—</div></div>
          </div>

          <div class="qr-actions">
            <button id="qrRefresh" class="btn-mini">Reload</button>
            <button id="qrDownload" class="btn-mini">Download</button>
            <button id="qrCopy" class="btn-mini">Copy Payload</button>
          </div>
        </div>
      </div>
    `;
    body.appendChild(modal);
    // Close button
    modal
      .querySelector("#qrClose")
      ?.addEventListener("click", () => modal.close());
  }

  // Fill brand, amount, merchant
  modal.querySelector("#qrBrand").textContent = method;
  modal.querySelector("#qrAmt").textContent = `$${memo.amount.toFixed(2)}`;
  modal.querySelector("#qrMerchant").textContent = merchant;

  const img = modal.querySelector("#qrImg");
  const loading = modal.querySelector("#qrLoading");

  // Load with primary → fallback
  const loadQR = async () => {
    loading.style.display = "flex";
    img.style.display = "none";

    // try primary
    const primary = generateQrImgSrc(payload, "google");
    // prepare fallback
    const fallback = generateQrImgSrc(payload, "qrserver");

    const tryLoad = (src) =>
      new Promise((resolve, reject) => {
        const test = new Image();
        test.onload = () => resolve(src);
        test.onerror = reject;
        test.src = src;
      });

    try {
      const good = await tryLoad(primary).catch(() => tryLoad(fallback));
      img.src = good;
      loading.style.display = "none";
      img.style.display = "block";
    } catch {
      loading.textContent = "QR unavailable. Check network.";
    }
  };

  // Actions
  modal.querySelector("#qrRefresh")?.addEventListener("click", loadQR);
  modal.querySelector("#qrCopy")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload));
      alert("Payload copied.");
    } catch {
      alert("Copy failed.");
    }
  });
  modal.querySelector("#qrDownload")?.addEventListener("click", async () => {
    try {
      const a = document.createElement("a");
      a.href = img.src;
      a.download = `${method}-qr.png`;
      a.click();
    } catch {
      alert("Download failed.");
    }
  });

  modal.showModal();
  loadQR(); // start loading QR
}

// === MEMBERSHIP: mapping & state helpers ===
const MEMBERSHIP_PLANS = {
  gold: {
    label: "Gold Member",
    fee: 29,
    rate: 0.05,
    cashback: 0.01,
    color: "#ffda7a",
  },
  platinum: {
    label: "Platinum Member",
    fee: 59,
    rate: 0.1,
    cashback: 0.02,
    color: "#b6f5ff",
  },
  diamond: {
    label: "Diamond Member",
    fee: 99,
    rate: 0.15,
    cashback: 0.03,
    color: "#bfa1ff",
  },
};

// persist membership (optional)
function loadMembership() {
  try {
    const raw = localStorage.getItem("membership");
    if (raw) state.membership = JSON.parse(raw);
  } catch {}
}
function saveMembership() {
  try {
    localStorage.setItem("membership", JSON.stringify(state.membership || {}));
  } catch {}
}

// Open/close modal
(function wireMembershipModal() {
  const open = () => document.getElementById("memberModal")?.showModal();
  const close = () => document.getElementById("memberModal")?.close();

  document.getElementById("btnMembership")?.addEventListener("click", open);
  document.getElementById("mClose")?.addEventListener("click", close);
  // ...
})();
// (function wireMembershipModal(){
//   const open = () => document.getElementById("memberModal")?.showModal();
//   const close = () => document.getElementById("memberModal")?.close();

//   // Topbar/wherever: #btnMembership should open
//   document.getElementById("btnMembership")?.addEventListener("click", open);
//   document.getElementById("mClose")?.addEventListener("click", close);

//   // Join handler
//   document.getElementById("mJoin")?.addEventListener("click", () => {
//     const tier = (document.querySelector('input[name="mTier"]:checked')?.value || "gold");
//     const plan = MEMBERSHIP_PLANS[tier] || MEMBERSHIP_PLANS.gold;

//     const name  = document.getElementById("mName")?.value?.trim();
//     const phone = document.getElementById("mPhone")?.value?.trim();
//     const addr  = document.getElementById("mAddr")?.value?.trim();
//     const city  = document.getElementById("mCity")?.value?.trim();

//     if (!name || !phone || !addr || !city) {
//       alert("Please fill Name, Phone, Address, City."); return;
//     }

//     // save to state (active membership)
//     state.membership = {
//       active: true,
//       level: tier,
//       label: plan.label,
//       fee: plan.fee,
//       rate: plan.rate,             // used by computeTotals() for discount
//       cashback: plan.cashback,     // you can show this elsewhere if needed
//       name, phone, addr, city,
//       joinedAt: Date.now(),
//       memberId: "MBR-" + Math.random().toString(36).slice(2,8).toUpperCase()
//     };
//     saveMembership();

//     alert(`${plan.label} joined! Annual fee $${plan.fee}. Discount ${(plan.rate*100)|0}% applied.`);
//     document.getElementById("memberModal")?.close();

//     // If your cart UI shows member toggle, force totals refresh
//     try { renderCartPage?.(); } catch {}
//   });
// })();

// load persisted membership at boot
loadMembership();

// ===== EmailJS config (REPLACE these three) =====
const EMAILJS_PUBLIC_KEY = "WT0GOYrL9HnDKvLUf"; // e.g. "AbC123..."
const EMAILJS_SERVICE_ID = "service_z9tkmvr"; // e.g. "service_xxxxxx"
const EMAILJS_TEMPLATE_ID = "template_q5q471f"; // e.g. "template_membership"

// (optional) who receives admin notifications (can be your company email)
const ADMIN_EMAIL = "minmaung0307@gmail.com";

// -- utils --
function fmt(n) {
  try {
    return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
  } catch {
    return `$${(+n || 0).toFixed(2)}`;
  }
}
function updateCartCount() {
  const n = ensureCart().reduce((s, x) => s + (x.qty || 0), 0);
  const badge = document.getElementById("cartCount");
  if (badge) badge.textContent = n ? String(n) : "";
}

// -- main renderer (IDs are fixed & simple) --
function renderCartPage() {
  setCart(getCart());

  // Prefer drawer-body scope
  const scope =
    document.getElementById("cartDrawer")?.querySelector(".drawer-body") ||
    document;

  const listEl = scope.querySelector("#cartPageList");
  const elSub = scope.querySelector("#cartSubtotal");
  const elShip = scope.querySelector("#cartShip");
  const elTot = scope.querySelector("#cartTotal");
  if (!listEl) return;

  const items = ensureCart();
  listEl.innerHTML = "";

  if (!items.length) {
    listEl.innerHTML = `<p class="small">Your cart is empty.</p>`;
    if (elSub) elSub.textContent = "$0.00";
    if (elShip) elShip.textContent = "$0.00";
    if (elTot) elTot.textContent = "$0.00";
    updateCartCount();
    return;
  }

  items.forEach((it, idx) => {
    const line = (it.price || 0) * (it.qty || 0);

    const row = document.createElement("div");
    row.className = "card";
    row.style.cssText = `
      background:${idx % 2 ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.06)"};
      border:1px solid rgba(255,255,255,.08);
      border-radius:12px; margin:.4rem 0;
    `;
    row.innerHTML = `
      <div class="pad" style="padding:.6rem .75rem;">
        <div class="row between" style="gap:.75rem; align-items:center;">
          <div class="strong" style="text-align:left">${it.title || ""}</div>
          <div class="row" style="gap:.35rem; align-items:center;">
            <button class="btn-mini" data-dec="${
              it.id
            }" title="Decrease">−</button>
            <span class="strong" aria-live="polite">${it.qty || 0}</span>
            <button class="btn-mini" data-inc="${
              it.id
            }" title="Increase">＋</button>
            <button class="btn-mini btn-outline" data-remove="${
              it.id
            }" title="Remove">🗑️</button>
          </div>
        </div>
        <div class="row between" style="margin-top:.4rem;">
          <div class="small" style="opacity:.8;">&nbsp;</div>
          <div class="price">${fmt(line)}</div>
        </div>
      </div>
    `;
    listEl.appendChild(row);
  });

  const t = computeTotals();
  if (elSub) elSub.textContent = fmt(t.subtotal);
  if (elShip) elShip.textContent = fmt(t.shipping);
  if (elTot) elTot.textContent = fmt(t.total);

  updateCartCount();
}

// Legacy alias (if old code calls renderCart?.())
const renderCart = renderCartPage;

// -- single delegation for qty +/- / remove (cart PAGE only) --
document.getElementById("cartPageList")?.addEventListener("click", (e) => {
  const inc = e.target.closest("[data-inc]");
  const dec = e.target.closest("[data-dec]");
  const rem = e.target.closest("[data-remove]");
  const id = inc?.dataset.inc || dec?.dataset.dec || rem?.dataset.remove;
  if (!id) return;

  const cart = ensureCart();
  const i = cart.findIndex((x) => x.id === id);
  if (i < 0) return;

  if (inc) cart[i].qty += 1;
  if (dec) cart[i].qty = Math.max(0, (cart[i].qty || 0) - 1);
  if (rem || cart[i].qty === 0) cart.splice(i, 1);

  setCart(cart);
  renderCartPage();
});

// Open cart drawer and render inside drawer-body
document.getElementById("btnCart")?.addEventListener("click", () => {
  ensureCartDrawerShell(); // drawer-body ထဲ shell တည်ဆောက်
  document.getElementById("cartDrawer")?.classList.add("open");
  renderCartPage(); // drawer-body scope IDs ပေါ် render
});

// -- boot & cross-tab sync (single) --
setCart(getCart());
updateCartCount();
window.addEventListener("storage", (e) => {
  if (e.key === CART_KEY) {
    setCart(getCart());
    renderCartPage();
  }
});

// Ensure the cart markup exists inside the drawer-body (single shell, with promo/member/pay & delivery & pickup list)
function ensureCartDrawerShell() {
  const drawer = document.getElementById("cartDrawer");
  const body = drawer?.querySelector(".drawer-body");
  if (!body) return null;

  // Remove old/duplicate summaries that showed zeros
  body
    .querySelectorAll(".pay-summary, #paySummary, [data-pay-summary]")
    .forEach((n) => n.remove());

  if (!body.querySelector("#cartPageList")) {
    body.innerHTML = `
      <div class="pad"><div class="card-title">Your Cart</div></div>

      <div id="cartPageList" class="vlist"></div>

      <!-- Controls: Promo / Member / Delivery -->
      <div class="card" style="border:1px solid rgba(255,255,255,.08); border-radius:12px; margin-top:.5rem;">
        <div class="pad" style="display:grid; gap:.6rem;">
          <!-- Promo -->
          <div class="row between" style="gap:.5rem;">
            <input id="promoInput" class="input" placeholder="Promo code (e.g. DEMO10)" style="flex:1 1 auto;">
            <button id="applyPromoBtn" class="btn-mini">Apply</button>
            <button id="demoPromoBtn" class="btn-mini" title="Fill a test promo">Use Demo</button>
          </div>
          <!-- Member -->
          <div class="row between" style="gap:.5rem; align-items:center;">
            <label class="row" style="gap:.35rem; align-items:center;">
              <input id="applyMemberChk" type="checkbox">
              <span>Member discount</span>
            </label>
            <select id="memberRateSelect" class="input compact" title="Member % off" style="width:110px;">
              <option value="0.05">5% off</option>
              <option value="0.10" selected>10% off</option>
              <option value="0.15">15% off</option>
            </select>
          </div>
          <!-- Mode -->
          <div class="row between" style="gap:.5rem; align-items:center;">
            <label for="deliveryModeSelect">Order type</label>
            <select id="deliveryModeSelect" class="input compact" style="width:180px;">
              <option value="pickup" selected>Pickup</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>

          <!-- Pickup locations (show only when pickup) -->
          <div id="pickupFields" style="display:block;">
            <div class="col" style="gap:.35rem;">
              <label class="row" style="gap:.35rem; align-items:center;">
                <input type="radio" name="pickupLoc" value="Downtown Store" checked>
                <span>Downtown Store — 123 Main St (10:00–20:00)</span>
              </label>
              <label class="row" style="gap:.35rem; align-items:center;">
                <input type="radio" name="pickupLoc" value="Riverside Kiosk">
                <span>Riverside Kiosk — 88 River Rd (11:00–19:00)</span>
              </label>
            </div>
          </div>

          <!-- Delivery fields (show only when delivery) -->
          <div id="deliveryFields" style="display:none;">
            <div class="row" style="gap:.5rem; margin-top:.25rem;">
              <input id="addrLine" class="input" placeholder="Address line" style="flex:1 1 60%;">
              <input id="city" class="input" placeholder="City" style="flex:1 1 40%;">
            </div>
            <div class="row" style="gap:.5rem; margin-top:.25rem;">
              <input id="phone" class="input" placeholder="Phone" style="flex:1 1 40%;">
              <input id="note"  class="input" placeholder="Note (optional)" style="flex:1 1 60%;">
            </div>
          </div>
        </div>
      </div>

      <!-- Totals (single panel only) -->
      <div id="cartTotals" class="card" style="background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.02)); border:1px solid rgba(255,255,255,.12); border-radius:12px; margin-top:.75rem;">
        <div class="pad">
          <div class="row between" style="padding:.25rem 0;">
            <div>Subtotal</div><div id="cartSubtotal" class="price">$0.00</div>
          </div>
          <div class="row between" style="padding:.25rem 0; border-top:1px dashed rgba(255,255,255,.15)">
            <div>Shipping</div><div id="cartShip" class="price">$0.00</div>
          </div>
          <div class="row between strong" style="padding:.5rem 0; border-top:1px solid rgba(255,255,255,.25)">
            <div>Total</div><div id="cartTotal" class="price">$0.00</div>
          </div>
        </div>
      </div>

      <!-- Pay controls -->
      <div class="col" style="gap:.5rem; margin-top:.6rem;">
        <div class="row" style="gap:.5rem; flex-wrap:wrap;">
          <button id="btnPayPal" class="btn-mini">PayPal</button>
          <button id="btnKBZ"   class="btn-mini">KBZPay</button>
          <button id="btnCB"    class="btn-mini">CBPay</button>
          <button id="btnAya"   class="btn-mini">AyaPay</button>
        </div>
        <!-- PayPal button zone -->
        <div id="paypalZone" style="margin-top:.25rem;"></div>
      </div>
    `;

    // qty -/+ / remove (drawer won't close)
    body.addEventListener("click", (e) => {
      const inc = e.target.closest?.("[data-inc]");
      const dec = e.target.closest?.("[data-dec]");
      const rem = e.target.closest?.("[data-remove]");
      const id = inc?.dataset.inc || dec?.dataset.dec || rem?.dataset.remove;
      if (!id) return;

      const cart = ensureCart();
      const i = cart.findIndex((x) => x.id === id);
      if (i < 0) return;
      if (inc) cart[i].qty += 1;
      if (dec) cart[i].qty = Math.max(0, (cart[i].qty || 0) - 1);
      if (rem || cart[i].qty === 0) cart.splice(i, 1);
      setCart(cart);
      renderCartPage();
    });

    // Promo
    body.querySelector("#applyPromoBtn")?.addEventListener("click", () => {
      const code = body.querySelector("#promoInput")?.value || "";
      applyPromo(code);
    });
    body.querySelector("#demoPromoBtn")?.addEventListener("click", () => {
      const input = body.querySelector("#promoInput");
      if (input) input.value = "DEMO10";
      applyPromo("DEMO10"); // 10% off demo
    });

    // Member toggle / rate
    body.querySelector("#applyMemberChk")?.addEventListener("change", (e) => {
      const on = !!e.target.checked;
      const rate = body.querySelector("#memberRateSelect")?.value || "0.10";
      setMembershipActive(on, rate);
    });
    body.querySelector("#memberRateSelect")?.addEventListener("change", (e) => {
      const on = body.querySelector("#applyMemberChk")?.checked;
      setMembershipActive(!!on, e.target.value);
    });

    // Mode toggle: pickup vs delivery
    const modeSel = body.querySelector("#deliveryModeSelect");
    const pickupBox = body.querySelector("#pickupFields");
    const deliveryBox = body.querySelector("#deliveryFields");
    const syncModeUI = () => {
      const isDelivery = modeSel?.value === "delivery";
      if (pickupBox) pickupBox.style.display = isDelivery ? "none" : "";
      if (deliveryBox) deliveryBox.style.display = isDelivery ? "" : "none";
    };
    modeSel?.addEventListener("change", syncModeUI);
    syncModeUI();

    // Pay buttons
    body
      .querySelector("#btnPayPal")
      ?.addEventListener("click", () => renderPayPalButtons());
    body
      .querySelector("#btnKBZ")
      ?.addEventListener("click", () => openQrPay("KBZPay"));
    body
      .querySelector("#btnCB")
      ?.addEventListener("click", () => openQrPay("CBPay"));
    body
      .querySelector("#btnAya")
      ?.addEventListener("click", () => openQrPay("AyaPay"));
  }

  return body;
}

// === Promo & Member handlers ===
function applyPromo(code) {
  code = (code || "").trim().toUpperCase();
  if (!code) {
    state.globalPromo = { active: false };
    renderCartPage();
    return;
  }
  if (code === "DEMO10") {
    state.globalPromo = { active: true, code, type: "percent", value: 10 };
  } else if (code === "OFF5") {
    state.globalPromo = { active: true, code, type: "amount", value: 5 };
  } else {
    state.globalPromo = { active: false, code };
  }
  renderCartPage();
}
function setMembershipActive(on, rate) {
  if (on) state.membership = { rate: Number(rate || 0) };
  else state.membership = { rate: 0 };
  renderCartPage();
}

// wire inputs (id-based)
document.addEventListener("click", (e) => {
  if (e.target?.id === "applyPromoBtn") {
    const code = document.getElementById("promoInput")?.value;
    applyPromo(code);
  }
});
document.addEventListener("change", (e) => {
  if (e.target?.id === "applyMemberChk") {
    const on = !!e.target.checked;
    const rate = document.getElementById("memberRateSelect")?.value || "0.10";
    setMembershipActive(on, rate);
  }
  if (e.target?.id === "memberRateSelect") {
    const on = document.getElementById("applyMemberChk")?.checked;
    const rate = e.target.value;
    setMembershipActive(on, rate);
  }
});

// === Pay buttons (demo flow) ===
function proceedPayment(method) {
  // If delivery is chosen, require basic fields
  const drawer = document.getElementById("cartDrawer");
  const body = drawer?.querySelector(".drawer-body");
  const mode = body?.querySelector("#deliveryModeSelect")?.value || "pickup";
  if (mode === "delivery") {
    const addr = body.querySelector("#addrLine")?.value?.trim();
    const city = body.querySelector("#city")?.value?.trim();
    const phone = body.querySelector("#phone")?.value?.trim();
    if (!addr || !city || !phone) {
      alert("Please fill Address, City, and Phone for delivery.");
      return;
    }
  }

  const t =
    typeof computeTotals === "function" ? computeTotals() : { total: 0 };
  if (!t || t.total <= 0) {
    alert("Cart is empty or total is $0.00");
    return;
  }

  alert(`Paid with ${method}. Charged ${fmt(t.total)}. Thank you!`);
  setCart([]); // clear cart after mock payment
  renderCartPage(); // show empty state in drawer
}
document.addEventListener("click", (e) => {
  if (e.target?.id === "btnPayPal") proceedPayment("PayPal");
  if (e.target?.id === "btnKBZ") proceedPayment("KBZPay");
  if (e.target?.id === "btnCB") proceedPayment("CBPay");
  if (e.target?.id === "btnAya") proceedPayment("AyaPay");
});

// Keep cart drawer open on internal clicks & button actions
function wireCartDrawerGuards() {
  const drawer = document.getElementById("cartDrawer");
  if (!drawer) return;

  // 1) Any clicks inside drawer should NOT bubble to "outside-click to close"
  drawer.addEventListener("click", (e) => {
    // stop all inside clicks from reaching document-level closers
    e.stopPropagation();
  });

  // 2) Also guard the drawer-body explicitly (some UIs attach on body)
  const body = drawer.querySelector(".drawer-body");
  body?.addEventListener("click", (e) => e.stopPropagation());

  // 3) Re-open class if anything toggled it off by other code (safety)
  const keepOpen = () => drawer.classList.add("open");

  // 4) Ensure our qty+/−/remove re-render doesn't close drawer
  body?.addEventListener("click", (e) => {
    const hit = e.target.closest?.("[data-inc],[data-dec],[data-remove]");
    if (!hit) return;
    // In case any other global handler tries to close after click:
    setTimeout(keepOpen, 0);
  });

  // 5) If you have an overlay that closes on click, ensure only overlay clicks close it
  const overlay = drawer.querySelector(".drawer-overlay");
  overlay?.addEventListener("click", () => drawer.classList.remove("open"));

  // If there's a close button, it should close — we keep its behavior
  // document.getElementById("btnCartClose")?.addEventListener("click", () => drawer.classList.remove("open"));
}

// Call after shell creation (ensureCartDrawerShell) and on first load
document.addEventListener("DOMContentLoaded", wireCartDrawerGuards);

// Update your Cart button to mount shell, guard, and render (keep drawer open)
document.getElementById("btnCart")?.addEventListener("click", () => {
  ensureCartDrawerShell?.(); // build shell if missing
  wireCartDrawerGuards(); // make sure guards are attached
  document.getElementById("cartDrawer")?.classList.add("open");
  renderCartPage?.(); // paint items/totals in drawer-body
});

function computeTotals() {
  const items = ensureCart();
  let subtotal = 0;
  items.forEach((it) => (subtotal += (it.price || 0) * (it.qty || 0)));

  // promo
  let promo = 0;
  if (state.globalPromo?.active) {
    const gp = state.globalPromo;
    if (gp.type === "percent") promo = subtotal * (Number(gp.value || 0) / 100);
    if (gp.type === "amount") promo = Number(gp.value || 0);
    promo = Math.min(promo, subtotal); // don't over-discount
  }

  // member
  let member = 0;
  const rate = Number(state.membership?.rate || 0);
  if (rate > 0) member = subtotal * rate;

  const shipping = subtotal > 0 ? 3.99 : 0;
  const total = Math.max(0, subtotal - promo - member + shipping);
  return { subtotal, promo, member, shipping, total };
}

// Mount a clean Cart shell into #view-cart (once)
function ensureCartViewShell() {
  const view = document.getElementById("view-cart");
  if (!view) return null;
  // If our cart containers are not present, create them
  if (!document.getElementById("cartPageList")) {
    view.innerHTML = `
      <div class="card"><div class="pad">
        <div class="card-title">Your Cart</div>
      </div></div>

      <div id="cartPageList" class="vlist"></div>

      <div class="card"><div class="pad">
        <div class="row between"><div>Subtotal</div><div id="cartSubtotal" class="price">$0.00</div></div>
        <div class="row between"><div>Shipping</div><div id="cartShip" class="price">$0.00</div></div>
        <div class="row between strong"><div>Total</div><div id="cartTotal" class="price">$0.00</div></div>
      </div></div>
    `;
  }
  return view;
}

// === Image placeholders ===
const IMG_PLACE = "https://picsum.photos/seed/shweshop/600/600";
const THUMB_PLACE = "https://picsum.photos/seed/shweshopthumb/160/160";
// === Distinct image placeholders (seeded by product id) ===
function ph(size, seed) {
  return `https://picsum.photos/seed/${encodeURIComponent(
    seed
  )}/${size}/${size}`;
}
function ensureCategorySeed(cat) {
  if (cat === "new") return; // 'new' uses p.new === true
  if (!(DEMO_PRODUCTS || []).some((p) => p.cat === cat)) {
    const add = (t, price) => ({
      id: `${cat}-${t}`.toLowerCase(),
      title: t,
      cat,
      price,
      img: ph(600, `${cat}-${t}`),
      new: true,
    });
    const samples = {
      baby: [
        add("Stroller", 129),
        add("Baby Monitor", 89),
        add("Bottle Warmer", 39),
      ],
      home: [
        add("LED Lamp", 25),
        add("Air Purifier", 149),
        add("Cushion Set", 19),
      ],
      auto: [
        add("Dash Cam", 79),
        add("Tire Inflator", 39),
        add("Car Vacuum", 29),
      ],
      beauty: [
        add("Face Serum", 29),
        add("Lipstick Set", 19),
        add("Hair Dryer", 49),
      ],
    };
    DEMO_PRODUCTS.push(...(samples[cat] || []));
  }
}

function renderOrders() {
  const wrap = document.getElementById("ordersList");
  if (!wrap) return;
  if (!state.user) {
    wrap.innerHTML = `
      <div class="card"><div class="pad">
        <div class="card-title">Sign in to see orders</div>
        <div class="small">No orders yet. Add to cart and checkout to create an order.</div>
      </div></div>`;
    return;
  }
  // TODO: real Firestore; simple placeholder
  wrap.innerHTML = `
    <div class="card"><div class="pad">
      <div class="row between"><div class="card-title">Order #DEMO01</div><div class="small">2025-09-01</div></div>
      <div class="small">Channel: Web — Status: Paid</div>
      <ul class="disc small"><li>LED Lamp × 1 — ${fmt(
        25
      )}</li><li>Face Serum × 2 — ${fmt(58)}</li></ul>
      <div class="row between"><div>Total</div><div class="price">${fmt(
        83
      )}</div></div>
    </div></div>
  `;
}

function withImgFallback(imgEl, src, isThumb = false, seed = "default") {
  const fallback = ph(isThumb ? 160 : 600, seed);
  imgEl.src = src || fallback;
  imgEl.onerror = () => {
    imgEl.onerror = null;
    imgEl.src = fallback;
  };
}

// === Horizontal drag-scroll for carousels ===
function makeDragScroll(container) {
  if (!container) return;
  let isDown = false,
    startX = 0,
    startY = 0,
    scrollLeft = 0;
  const onDown = (e) => {
    isDown = true;
    container.classList.add("dragging");
    startX = "touches" in e ? e.touches[0].pageX : e.pageX;
    startY = "touches" in e ? e.touches[0].pageY : e.pageY;
    scrollLeft = container.scrollLeft;
  };
  const onMove = (e) => {
    if (!isDown) return;
    const x = "touches" in e ? e.touches[0].pageX : e.pageX;
    const y = "touches" in e ? e.touches[0].pageY : e.pageY;
    const dx = x - startX;
    const dy = y - startY;
    if (Math.abs(dx) > Math.abs(dy)) {
      e.preventDefault(); // prevent page scroll
      container.scrollLeft = scrollLeft - dx;
    }
  };
  const onUp = () => {
    isDown = false;
    container.classList.remove("dragging");
  };
  container.addEventListener("mousedown", onDown);
  container.addEventListener("mousemove", onMove);
  container.addEventListener("mouseup", onUp);
  container.addEventListener("mouseleave", onUp);
  container.addEventListener("touchstart", onDown, { passive: false });
  container.addEventListener("touchmove", onMove, { passive: false });
  container.addEventListener("touchend", onUp);
}

// === Attach arrows (< >) & drag to a section ===
function attachCarouselControls(sec) {
  const cont = sec.querySelector(".hlist");
  if (!cont) return;
  // arrows
  if (!sec.querySelector(".sec-nav.prev")) {
    const prev = h("button");
    prev.className = "sec-nav prev";
    prev.setAttribute("aria-label", "Previous");
    prev.textContent = "‹";
    const next = h("button");
    next.className = "sec-nav next";
    next.setAttribute("aria-label", "Next");
    next.textContent = "›";
    sec.appendChild(prev);
    sec.appendChild(next);
    const step = () => Math.max(160, Math.round(cont.clientWidth * 0.9));
    prev.addEventListener("click", () =>
      cont.scrollBy({ left: -step(), behavior: "smooth" })
    );
    next.addEventListener("click", () =>
      cont.scrollBy({ left: step(), behavior: "smooth" })
    );
  }
  // drag
  makeDragScroll(cont);
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
  {
    id: "m101",
    title: "Men Running Shorts",
    price: 18,
    cat: "Fashion",
    aud: "men",
    img: "images/products/men/m101/thumb.jpg",
    images: [
      "images/products/men/m101/main.jpg",
      "images/products/men/m101/1.jpg",
      "images/products/men/m101/2.jpg",
    ],
    desc: "Lightweight quick-dry shorts",
    specs: ["100% polyester", "Drawstring", "2 pockets"],
    new: true,
  },
  {
    id: "m102",
    title: "Men Graphic Tee",
    price: 14.5,
    cat: "Fashion",
    aud: "men",
    img: "images/products/men/m102/thumb.jpg",
    images: [
      "images/products/men/m102/main.jpg",
      "images/products/men/m102/1.jpg",
    ],
    desc: "Soft cotton tee",
    specs: ["100% cotton", "Regular fit", "Machine washable"],
  },

  // Fashion (Women)
  {
    id: "w201",
    title: "Women Yoga Mat",
    price: 22,
    cat: "Beauty",
    aud: "women",
    img: "images/products/women/w201/thumb.jpg",
    images: [
      "images/products/women/w201/main.jpg",
      "images/products/women/w201/1.jpg",
    ],
    desc: "Non-slip TPE yoga mat",
    specs: ["183×61cm", "6mm thick"],
    new: true,
  },
  {
    id: "w202",
    title: "Women Tote Bag",
    price: 19,
    cat: "Fashion",
    aud: "women",
    img: "images/products/women/w202/thumb.jpg",
    images: ["images/products/women/w202/main.jpg"],
    desc: "Everyday canvas tote",
    specs: ["Canvas", "Inner pocket"],
  },

  // Kids / Baby
  {
    id: "k301",
    title: "Kids Story Book",
    price: 6,
    cat: "Baby",
    aud: "kids",
    img: "images/products/kids/k301/thumb.jpg",
    images: ["images/products/kids/k301/main.jpg"],
    desc: "Colorful bedtime tales",
    specs: ["Hardcover", "Ages 4-8"],
  },
  {
    id: "k302",
    title: "Kids Water Bottle",
    price: 9,
    cat: "Baby",
    aud: "kids",
    img: "images/products/kids/k302/thumb.jpg",
    images: ["images/products/kids/k302/main.jpg"],
    desc: "Leak-proof bottle",
    specs: ["BPA-free", "350ml"],
  },

  // Pets
  {
    id: "p401",
    title: "Pet Chew Toy",
    price: 7,
    cat: "Pets",
    aud: "pets",
    img: "images/products/pets/p401/thumb.jpg",
    images: ["images/products/pets/p401/main.jpg"],
    desc: "Durable rubber toy",
    specs: ["Teething safe", "Dishwasher safe"],
  },
  {
    id: "p402",
    title: "Pet Bed (S)",
    price: 24,
    cat: "Pets",
    aud: "pets",
    img: "images/products/pets/p402/thumb.jpg",
    images: ["images/products/pets/p402/main.jpg"],
    desc: "Cozy plush bed",
    specs: ["50×40cm", "Anti-slip bottom"],
  },

  // Auto
  {
    id: "a501",
    title: "Car Phone Mount",
    price: 9,
    cat: "Auto",
    aud: "all",
    img: "images/products/auto/a501/thumb.jpg",
    images: ["images/products/auto/a501/main.jpg"],
    desc: "360° rotation mount",
    specs: ["Vent-clip", "One-click lock"],
  },
  {
    id: "a502",
    title: "Microfiber Wash Mitt",
    price: 5.5,
    cat: "Auto",
    aud: "all",
    img: "images/products/auto/a502/thumb.jpg",
    images: ["images/products/auto/a502/main.jpg"],
    desc: "Scratch-free wash",
    specs: ["Microfiber", "Elastic cuff"],
  },

  // Home
  {
    id: "h601",
    title: "Home LED Strip 5m",
    price: 12,
    cat: "Home",
    aud: "all",
    img: "images/products/home/h601/thumb.jpg",
    images: ["images/products/home/h601/main.jpg"],
    desc: "RGB with remote",
    specs: ["5m", "USB powered"],
    new: true,
  },
  {
    id: "h602",
    title: "Aroma Diffuser",
    price: 16,
    cat: "Home",
    aud: "all",
    img: "images/products/home/h602/thumb.jpg",
    images: ["images/products/home/h602/main.jpg"],
    desc: "Ultrasonic diffuser",
    specs: ["300ml", "Auto-off"],
  },

  // Beauty
  {
    id: "b701",
    title: "Face Sheet Mask (5)",
    price: 8,
    cat: "Beauty",
    aud: "women",
    img: "images/products/beauty/b701/thumb.jpg",
    images: ["images/products/beauty/b701/main.jpg"],
    desc: "Hydrating masks",
    specs: ["Hyaluronic", "5 sheets"],
  },
  {
    id: "b702",
    title: "Men Face Wash",
    price: 7.5,
    cat: "Beauty",
    aud: "men",
    img: "images/products/beauty/b702/thumb.jpg",
    images: ["images/products/beauty/b702/main.jpg"],
    desc: "Oil-control cleanser",
    specs: ["150ml", "Daily use"],
  },

  // Electronics (New Arrivals tag demo)
  {
    id: "e801",
    title: "Wireless Earbuds",
    price: 25,
    cat: "Electronics",
    aud: "all",
    img: "images/products/all/e801/thumb.jpg",
    images: [
      "images/products/all/e801/main.jpg",
      "images/products/all/e801/1.jpg",
    ],
    desc: "ENC mic + 20h battery",
    specs: ["BT 5.3", "USB-C"],
    new: true,
  },
  {
    id: "e802",
    title: "Power Bank 10,000mAh",
    price: 15,
    cat: "Electronics",
    aud: "all",
    img: "images/products/all/e802/thumb.jpg",
    images: ["images/products/all/e802/main.jpg"],
    desc: "Slim + fast charge",
    specs: ["10Ah", "Type-C in/out"],
  },

  // Fashion (Kids Men Women extra)
  {
    id: "m103",
    title: "Men Hoodie",
    price: 28,
    cat: "Fashion",
    aud: "men",
    img: "images/products/men/m103/thumb.jpg",
    images: ["images/products/men/m103/main.jpg"],
    desc: "Fleece lined",
    specs: ["Poly-cotton", "Front pocket"],
  },
  {
    id: "w203",
    title: "Women Leggings",
    price: 17,
    cat: "Fashion",
    aud: "women",
    img: "images/products/women/w203/thumb.jpg",
    images: ["images/products/women/w203/main.jpg"],
    desc: "High-waist stretch",
    specs: ["Nylon/Spandex"],
  },
  {
    id: "k303",
    title: "Kids Sneakers",
    price: 21,
    cat: "Fashion",
    aud: "kids",
    img: "images/products/kids/k303/thumb.jpg",
    images: ["images/products/kids/k303/main.jpg"],
    desc: "Lightweight runners",
    specs: ["Sizes 28–34"],
  },
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
  // 🔧 'All Categories' ကို ပြန်မထည့်
  const items = NAV_ITEMS.filter((it) => it.key !== "allCategories");

  items.forEach((item) => {
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
  // active UI
  document
    .querySelectorAll(".nav-chip")
    .forEach((c) => c.classList.remove("active"));
  btn?.classList.add("active");

  // audience keys: forAll/men/women/kids/pets
  if (item.type === "aud") {
    currentAudience = item.value; // 'all'|'men'|'women'|'kids'|'pets'
    currentCategory = ""; // clear cat filter
    showShopGrid(item.label || "Shop");
    return;
  }

  // categories: electronics/fashion/beauty/home/auto/baby
  if (item.type === "cat") {
    currentAudience = "all";
    currentCategory = item.value; // cat slug
    showShopGrid(item.label || item.value);
    return;
  }

  // new arrivals
  if (item.type === "tag" && item.key === "new") {
    currentAudience = "all";
    currentCategory = "";
    showShopGrid("New Arrivals", { tag: "new" });
    return;
  }

  if (item.key === "orders") {
    switchView("orders");
    renderOrders?.();
    return;
  }
  if (item.key === "analytics") {
    switchView("analytics");
    renderAnalytics?.();
    return;
  }

  // default
  showShopGrid(item.label || "Shop");
}

// --- SWITCH VIEW (class-based) ---
function switchView(name) {
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.remove("active"));
  document.getElementById("view-" + name)?.classList.add("active");
}

// === Part 6: Search sync ===
// === Search (desktop + mobile) ===
function getSearchQuery() {
  const d = document.getElementById("searchInput");
  const m = document.getElementById("searchInputMobile");
  return ((d?.value || "") + " " + (m?.value || "")).trim().toLowerCase();
}
function wireSearchInputs() {
  const run = () => {
    const q = getSearchQuery();
    currentCategory = ""; // clear category lock for search
    showShopGrid(q ? "Results" : "Shop"); // render grid + switch to shop
    if (typeof homeSections !== "undefined" && homeSections) {
      homeSections.style.display = q ? "none" : ""; // hide ads/sections on search
    }
    document
      .getElementById("view-shop")
      ?.scrollIntoView({ behavior: "smooth", block: "start" }); // ⬅ ensure at top
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  ["searchInput", "searchInputMobile"].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener("input", run);
    el?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") run();
    });
  });
}

// === Part 7A: Home sections ===
// --- Ad inventory demo ---
const ADS = [
  {
    img: "images/ads/sale-fashion.jpg",
    text: "Mid-season Sale • Fashion up to 40%",
    href: "#",
  },
  {
    img: "images/ads/new-arrivals.jpg",
    text: "New Arrivals • Fresh picks today",
    href: "#",
  },
  {
    img: "images/ads/home-deals.jpg",
    text: "Home Deals • Lights & Decor",
    href: "#",
  },
  {
    img: "images/ads/pets-care.jpg",
    text: "Pets Care • Toys & Beds",
    href: "#",
  },
  {
    img: "https://picsum.photos/seed/fashion/320/80",
    text: "Mid-season Sale • Fashion up to 40%",
    href: "#",
  },
  {
    img: "https://picsum.photos/seed/arrivals/320/80",
    text: "New Arrivals • Fresh picks today",
    href: "#",
  },
  {
    img: "https://picsum.photos/seed/home/320/80",
    text: "Home Deals • Lights & Decor",
    href: "#",
  },
  {
    img: "https://picsum.photos/seed/pets/320/80",
    text: "Pets Care • Toys & Beds",
    href: "#",
  },
];

function renderHomeSections() {
  const catsAll = Array.from(
    new Set((DEMO_PRODUCTS || []).map((p) => p.cat))
  ).filter(Boolean);
  if (!homeSections) return;
  homeSections.innerHTML = "";

  catsAll.forEach((cat, idx) => {
    // audience + category filter
    const list = (DEMO_PRODUCTS || []).filter((p) => {
      const okAud =
        currentAudience === "all" ? true : (p.aud || "all") === currentAudience;
      return okAud && p.cat === cat;
    });
    if (!list.length) return;

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

    // horizontal items (use fallback images)
    list.slice(0, 12).forEach((p) => {
      const item = document.createElement("div");
      item.className = "hitem";
      item.innerHTML = `
        <img class="thumb" alt="${p.title}" loading="lazy" decoding="async">
        <div class="small strong" style="margin-top:.4rem">${p.title}</div>
        <div class="small">${fmt(p.price)}</div>
      `;
      const im = item.querySelector("img.thumb");
      if (im) withImgFallback(im, p.img, true, p.id);

      im?.addEventListener("click", () => openProduct(p));
      cont?.appendChild(item);
    });

    // fill ad (guard ADS existence)
    if (typeof ADS !== "undefined" && ADS.length) {
      const ad = ADS[idx % ADS.length];
      const a = sec.querySelector(".ad-link");
      const ai = sec.querySelector(".ad-img");
      const at = sec.querySelector(".ad-text");
      if (a && ai && at && ad) {
        a.href = ad.href || "#";
        ai.alt = ad.text || "Ad";
        if (ad.img) withImgFallback(ai, ad.img, true);
        ai.style.maxHeight = "68px";
        at.textContent = " " + (ad.text || "");
        a.style.display = "inline-flex";
        a.style.alignItems = "center";
        a.style.gap = ".6rem";
      }
    }

    // See all → open grid
    sec.querySelector("[data-see]")?.addEventListener("click", () => {
      currentCategory = cat;
      showShopGrid(cat);
    });

    homeSections.appendChild(sec);
    attachCarouselControls(sec);
  });
}

// === Part 7B: Shop grid ===
function renderGrid(opts = {}) {
  const q = getSearchQuery();
  const cat = (currentCategory || "").trim().toLowerCase();
  const aud = currentAudience || "all";
  if (!grid) return;
  grid.innerHTML = "";

  const filtered = (DEMO_PRODUCTS || []).filter((p) => {
    const okCat = !cat || (p.cat || "").toLowerCase() === cat;
    const hay = ((p.title || "") + " " + (p.desc || "")).toLowerCase();
    const okQ = !q || hay.includes(q);
    const okAud = aud === "all" || (p.aud || "all") === aud;
    const okTag = !opts.tag || opts.tag !== "new" || p.new === true;
    return okCat && okQ && okAud && okTag;
  });

  if (!filtered.length) {
    // try similar by token overlap
    const tokens = (q || "").split(/\s+/).filter(Boolean);
    let similar = [];
    if (tokens.length) {
      const score = (p) =>
        tokens.reduce(
          (s, t) =>
            s +
            ((p.title || "").toLowerCase().includes(t) ? 1 : 0) +
            ((p.desc || "").toLowerCase().includes(t) ? 1 : 0),
          0
        );
      similar = (DEMO_PRODUCTS || [])
        .map((p) => ({ p, s: score(p) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 8)
        .map((x) => x.p);
    }
    grid.innerHTML = `
    <div class="card"><div class="pad">
      <div class="card-title">No results</div>
      <p class="small">We couldn't find items for "<b>${q}</b>".</p>
    </div></div>`;
    if (similar.length) {
      const sec = document.createElement("div");
      sec.className = "section";
      sec.innerHTML = `<div class="section-head"><div class="strong">Similar items</div></div><div class="hlist"></div>`;
      const cont = sec.querySelector(".hlist");
      similar.forEach((p) => {
        const item = document.createElement("div");
        item.className = "hitem";
        item.innerHTML = `
        <img class="thumb" alt="${p.title}" loading="lazy" decoding="async">
        <div class="small strong">${p.title}</div>
        <div class="small">${fmt(p.price)}</div>`;
        const im = item.querySelector("img.thumb");
        if (im) withImgFallback(im, p.img, true, p.id);
        item.addEventListener("click", () => openProduct(p));
        cont.appendChild(item);
      });
      grid.appendChild(sec);
    }
    return;
  }

  filtered.forEach((p) => {
    const card = h("div");
    card.className = "card";
    card.innerHTML = `
      <img class="thumb" alt="${
        p.title
      }" width="600" height="600" loading="lazy" decoding="async">
      <div class="pad">
        <div class="card-title">${p.title}</div>
        <div class="row between">
          <div class="price">${fmt(p.price)}</div>
          <div class="row gap">
            <button class="btn btn-soft btn-view">View</button>
            <button class="btn btn-mini btn-add" data-id="${
              p.id
            }">Add to Cart</button>
          </div>
        </div>
        <div class="promo-inline">
          <input placeholder="Promo code" aria-label="promo for ${p.title}">
          <button class="btn-mini">Apply</button>
        </div>
      </div>
    `;

    // image fallback
    const imc = card.querySelector("img.thumb");
    if (imc) withImgFallback(imc, p.img, true, p.id);

    // open product
    card
      .querySelector(".btn-view")
      ?.addEventListener("click", () => openProduct(p));
    imc?.addEventListener("click", () => openProduct(p));

    // add-to-cart (from grid)
    card.querySelector(".btn-add")?.addEventListener("click", () => {
      addToCart(p, 1);
      toast(`${p.title} added to cart`);
      updateCartCount();
      renderCart?.();
    });

    // per-item promo
    const [promoInput, promoBtn] = card.querySelectorAll(".promo-inline > *");
    promoBtn?.addEventListener("click", () => {
      const code = (promoInput?.value || "").trim().toUpperCase();
      const rule = PROMO_MAP[code] || null;
      if (!code) {
        delete state.itemPromos?.[p.id];
        toast("Promo cleared");
        renderCart?.();
        return;
      }
      if (!rule) {
        toast("Invalid code");
        return;
      }
      state.itemPromos ||= {};
      state.itemPromos[p.id] = { code, ...rule };
      toast(`Promo ${code} applied to ${p.title}`);
      renderCart?.();
    });

    grid.appendChild(card);
  });
}

// core addToCart (replace this whole function)
function addToCart(p, qty = 1) {
  const cart = ensureCart();
  const i = cart.findIndex((x) => x.id === p.id);
  if (i >= 0) cart[i].qty += qty;
  else cart.push({ id: p.id, title: p.title, price: p.price, img: p.img, qty });

  setCart(cart); // <- persist
  updateCartCount(); // <- badge
  // optional: if cart view is open, re-render rows immediately
  if (document.getElementById("view-cart")?.classList.contains("active")) {
    renderCartPage?.();
  }
}

document.addEventListener("click", (e) => {
  const addBtn = e.target.closest(".btn-add");
  if (addBtn) {
    const pid = addBtn.getAttribute("data-id");
    const p = (DEMO_PRODUCTS || []).find((x) => x.id === pid);
    if (p) {
      addToCart(p);
    }
  }
});

// Open login modal
document.getElementById("btnLogin")?.addEventListener("click", () => {
  document.getElementById("signupRow").style.display = "none";
  document.getElementById("resetRow").style.display = "none";
  document.getElementById("authModal")?.showModal();
});

// Toggle sections
document.getElementById("btnShowSignup")?.addEventListener("click", () => {
  document.getElementById("signupRow").style.display = "";
  document.getElementById("resetRow").style.display = "none";
});
document.getElementById("btnShowReset")?.addEventListener("click", () => {
  document.getElementById("signupRow").style.display = "none";
  document.getElementById("resetRow").style.display = "";
});

// Email login
document
  .getElementById("btnEmailLogin")
  ?.addEventListener("click", async () => {
    const email = document.getElementById("authEmail")?.value.trim();
    const pass = document.getElementById("authPass")?.value;
    if (!email || !pass) {
      toast?.("Enter email & password");
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      document.getElementById("authModal")?.close();
    } catch (e) {
      console.warn(e);
      toast?.("Login failed");
    }
  });

// Signup
document.getElementById("btnDoSignup")?.addEventListener("click", async () => {
  const email = document.getElementById("authEmail")?.value.trim();
  const pass = document.getElementById("authPass")?.value;
  if (!email || !pass) {
    toast?.("Enter email & password");
    return;
  }
  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    toast?.("Account created, signed in");
    document.getElementById("authModal")?.close();
  } catch (e) {
    console.warn(e);
    toast?.("Sign up failed");
  }
});

// Forgot
document.getElementById("btnDoReset")?.addEventListener("click", async () => {
  const email = document.getElementById("authEmail")?.value.trim();
  if (!email) {
    toast?.("Enter your email first");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    toast?.("Reset email sent");
    document.getElementById("authModal")?.close();
  } catch (e) {
    console.warn(e);
    toast?.("Reset failed");
  }
});

// Logout
document.getElementById("btnLogout")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    toast?.("Signed out");
  } catch (e) {
    console.warn(e);
  }
});

function showShopGrid(title, opts = {}) {
  const shopTitle = document.getElementById("shopTitle");
  if (shopTitle) shopTitle.textContent = title || "Shop";
  switchView?.("shop");
  renderGrid?.(opts);
  document
    .getElementById("view-shop")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// === Part 8: Product Modal ===
let currentProduct = null;
function openProduct(p) {
  currentProduct = p;
  const imgs = p.images?.length ? p.images : [p.img];

  // wire gallery
  const pdImg = document.getElementById("pdImg");
  const pdThumbs = document.getElementById("pdThumbs");
  const pdTitle = document.getElementById("pdTitle");
  const pdPrice = document.getElementById("pdPrice");
  const pdDesc = document.getElementById("pdDesc");
  const pdSpecs = document.getElementById("pdSpecs");

  pdThumbs.innerHTML = "";
  if (pdImg) {
    withImgFallback(pdImg, imgs[0], false);
    pdImg.alt = p.title;
  }
  imgs.forEach((src, i) => {
    const im = h("img");
    withImgFallback(im, src, true);
    im.alt = `${p.title} ${i + 1}`;
    if (i === 0) im.classList.add("active");
    im.addEventListener("click", () => {
      pdThumbs
        .querySelectorAll("img")
        .forEach((x) => x.classList.remove("active"));
      im.classList.add("active");
      withImgFallback(pdImg, src, false);
    });
    pdThumbs.appendChild(im);
  });

  if (pdTitle) pdTitle.textContent = p.title;
  if (pdPrice) pdPrice.textContent = fmt(p.price);
  if (pdDesc) pdDesc.textContent = p.desc || "";
  if (pdSpecs)
    pdSpecs.innerHTML = (p.specs || []).map((s) => `<li>${s}</li>`).join("");

  // modal-level add to cart
  document.getElementById("pdAdd")?.addEventListener(
    "click",
    () => {
      const qty = Math.max(
        1,
        Number(document.getElementById("pdQty")?.value || 1)
      );
      addToCart(currentProduct, qty);
      updateCartCount();
      renderCart?.();
      toast(`${currentProduct.title} × ${qty} added`);
      document.getElementById("productModal")?.close();
    },
    { once: true }
  );

  document.getElementById("productModal")?.showModal();
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
  const daysBack = Number(document.getElementById("anaRange")?.value || 365);
  const sinceIso = new Date(Date.now() - daysBack * 86400000)
    .toISOString()
    .slice(0, 10);

  let orders = [];

  if (state.user) {
    try {
      let qref;
      if (state.isAdmin) {
        // ✅ admin: shop-wide
        qref = query(
          collection(db, "orders"),
          where("orderDate", ">=", sinceIso),
          limit(1000)
        );
      } else {
        // ✅ non-admin: my orders only
        qref = query(
          collection(db, "orders"),
          where("orderDate", ">=", sinceIso),
          where("userId", "==", state.user.uid),
          limit(1000)
        );
      }
      const snap = await getDocs(qref);
      snap.forEach((d) => orders.push(d.data()));
    } catch (e) {
      console.warn("analytics blocked", e);
    }
  }

  // Fallback to demo if empty/blocked
  if (!orders.length) {
    orders = makeDemoOrders(daysBack);
  }

  // === aggregate ===
  const byDay = {};
  const tally = {};
  orders.forEach((o) => {
    const d = o.orderDate || o.createdAt?.slice?.(0, 10);
    const amt = Number(o.pricing?.total || o.total || 0);
    if (d) byDay[d] = (byDay[d] || 0) + amt;
    (o.items || []).forEach((it) => {
      tally[it.title] = (tally[it.title] || 0) + Number(it.qty || 1);
    });
  });

  const days = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push(d);
  }
  const rev = days.map((d) => byDay[d] || 0);

  new Chart(document.getElementById("revChart"), {
    type: "line",
    data: {
      labels: days.map((d) => d.slice(5)),
      datasets: [{ data: rev, label: "Revenue" }],
    },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });

  const top = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);
  new Chart(document.getElementById("topChart"), {
    type: "bar",
    data: {
      labels: top.map(([k]) => k),
      datasets: [{ data: top.map(([, v]) => v), label: "Qty" }],
    },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });
}
document
  .getElementById("anaRange")
  ?.addEventListener("change", renderAnalytics);

// simple demo generator
function makeDemoOrders(daysBack = 365) {
  const cats = ["fashion", "beauty", "home", "auto", "electronics", "baby"];
  const names = [
    "Bag",
    "T-Shirt",
    "Serum",
    "LED Lamp",
    "Dash Cam",
    "Stroller",
    "Hair Dryer",
    "Sneakers",
  ];
  const arr = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const n = Math.floor(Math.random() * 3); // 0-2 orders/day
    for (let j = 0; j < n; j++) {
      const items = [];
      const k = 1 + Math.floor(Math.random() * 3);
      for (let t = 0; t < k; t++) {
        const title = names[Math.floor(Math.random() * names.length)];
        items.push({
          title,
          qty: 1 + Math.floor(Math.random() * 3),
          price: 10 + Math.floor(Math.random() * 90),
        });
      }
      const total = items.reduce((s, x) => s + x.price * x.qty, 0);
      arr.push({
        orderDate: d,
        pricing: { total },
        items,
        cat: cats[Math.floor(Math.random() * cats.length)],
      });
    }
  }
  return arr;
}

// === Part 11: Membership (demo activate) ===
// open membership
document
  .getElementById("btnMembership")
  ?.addEventListener("click", () =>
    document.getElementById("memberModal")?.showModal()
  );

// buy flow
document
  .getElementById("buyMembership")
  ?.addEventListener("click", async () => {
    if (!state.user) {
      document.getElementById("authModal")?.showModal();
      toast("Please sign in to continue");
      return;
    }
    const plan =
      document.querySelector('input[name="mplan"]:checked')?.value || "basic";
    const fees = { basic: 9, plus: 19, pro: 39 };
    const rates = { basic: 0.02, plus: 0.03, pro: 0.05 };
    const method = document.getElementById("payMethod")?.value || "paypal";
    const auto = document.getElementById("autoRenew")?.checked ? true : false;

    const now = Date.now(),
      yearMs = 365 * 86400000;
    state.membership = {
      plan,
      rate: rates[plan],
      fee: fees[plan],
      method,
      autoRenew: auto,
      startTs: now,
      expiresTs: now + yearMs,
    };

    try {
      await setDoc(
        doc(db, "users", state.user.uid),
        { member: state.membership },
        { merge: true }
      );
      toast(`Membership ${plan.toUpperCase()} - $${fees[plan]}/yr activated`);
    } catch (e) {
      console.warn("membership save failed", e);
    }
    document.getElementById("memberModal")?.close();
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

// === Admin check ===
// 1) Try custom claims (Cloud Functions ထဲမှာသတ်မှတ်ထားလို့ရမယ်)
// 2) Fallback: users/{uid}.role === 'admin' or 'owner'
async function checkAdmin(user) {
  if (!user) {
    state.isAdmin = false;
    return false;
  }

  try {
    // 🔹 Step 1: custom claim
    const tok = await getIdTokenResult(user, true);
    if (tok?.claims?.admin === true) {
      state.isAdmin = true;
      return true;
    }
  } catch (e) {
    console.warn("token check failed", e);
  }

  try {
    // 🔹 Step 2: fallback users doc
    const snap = await getDoc(doc(db, "users", user.uid));
    const role = snap.exists() ? snap.data().role : null;
    state.isAdmin = role === "admin" || role === "owner";
    return state.isAdmin;
  } catch (e) {
    console.warn("users doc check failed", e);
    state.isAdmin = false;
    return false;
  }
}

// Greeting
// ===== Auth icon toggle (single button) =====
const btnAuth = document.getElementById("btnAuth");

function updateGreet() {
  const el = document.getElementById("greet");
  if (!el) return;
  if (state.user) {
    const name = state.user.displayName || state.user.email || "there";
    el.textContent = `Hi, ${String(name).split("@")[0]}`;
  } else {
    el.textContent = "";
  }
}

function updateAuthIcon() {
  if (!btnAuth) return;
  if (state.user) {
    btnAuth.textContent = "⎋";
    btnAuth.title = "Log out";
    btnAuth.dataset.mode = "logout";
  } else {
    btnAuth.textContent = "👤";
    btnAuth.title = "Sign in";
    btnAuth.dataset.mode = "login";
  }
}

btnAuth?.addEventListener("click", async () => {
  if (btnAuth.dataset.mode === "logout") {
    try {
      await signOut(auth);
      toast?.("Signed out");
    } catch (e) {
      console.warn(e);
    }
  } else {
    document.getElementById("authModal")?.showModal();
  }
});

// ===== Auth modal small handlers =====
document.getElementById("btnShowSignup")?.addEventListener("click", () => {
  document.getElementById("signupRow").style.display = "";
  document.getElementById("resetRow").style.display = "none";
});
document.getElementById("btnShowReset")?.addEventListener("click", () => {
  document.getElementById("signupRow").style.display = "none";
  document.getElementById("resetRow").style.display = "";
});
document
  .getElementById("btnEmailLogin")
  ?.addEventListener("click", async () => {
    const email = document.getElementById("authEmail")?.value.trim();
    const pass = document.getElementById("authPass")?.value;
    if (!email || !pass) {
      return toast?.("Enter email & password");
    }
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      document.getElementById("authModal")?.close();
    } catch (e) {
      console.warn(e);
      toast?.("Login failed");
    }
  });
document.getElementById("btnDoSignup")?.addEventListener("click", async () => {
  const email = document.getElementById("authEmail")?.value.trim();
  const pass = document.getElementById("authPass")?.value;
  if (!email || !pass) {
    return toast?.("Enter email & password");
  }
  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    toast?.("Account created");
    document.getElementById("authModal")?.close();
  } catch (e) {
    console.warn(e);
    toast?.("Sign up failed");
  }
});
document.getElementById("btnDoReset")?.addEventListener("click", async () => {
  const email = document.getElementById("authEmail")?.value.trim();
  if (!email) {
    return toast?.("Enter your email");
  }
  try {
    await sendPasswordResetEmail(auth, email);
    toast?.("Reset email sent");
    document.getElementById("authModal")?.close();
  } catch (e) {
    console.warn(e);
    toast?.("Reset failed");
  }
});

// Logout button toggle + action
const btnLogout = document.getElementById("btnLogout");
btnLogout?.addEventListener("click", async () => {
  try {
    const { signOut } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"
    );
    await signOut(auth);
    toast("Signed out");
  } catch (e) {
    console.warn("signout failed", e);
  }
});

// sign-in button (if any)
$("#btnUser")?.addEventListener("click", async () => {
  if (state.user) {
    toast("Already signed in");
    return;
  }
  const provider = new GoogleAuthProvider();
  await signInWithRedirect(auth, provider); // avoids popup COOP warnings
});

// Sign-in (redirect များအောင် popup error မတက်အောင်)
document.getElementById("btnUser")?.addEventListener("click", async () => {
  if (state.user) {
    toast("Already signed in");
    return;
  }
  const provider = new GoogleAuthProvider();
  await signInWithRedirect(auth, provider);
});

// Cart open/close
const cartDrawer = document.getElementById("cartDrawer");
document
  .getElementById("btnCart")
  ?.addEventListener("click", () => cartDrawer?.classList.add("open"));
document
  .getElementById("closeCart")
  ?.addEventListener("click", () => cartDrawer?.classList.remove("open"));

// Click outside main → close cart (optional)
document.addEventListener("click", (e) => {
  const inside = e.target.closest("#cartDrawer, #btnCart");
  if (!inside) cartDrawer?.classList.remove("open");
});

// === Theme & Font size ===
const rootEl = document.documentElement;
(function restorePrefs() {
  try {
    const th = localStorage.getItem("theme");
    if (th) rootEl.setAttribute("data-theme", th);
    const fs = parseFloat(localStorage.getItem("fs") || "1");
    if (fs) rootEl.style.setProperty("--fs", fs);
  } catch {}
})();
$("#btnTheme")?.addEventListener("click", () => {
  const now = rootEl.getAttribute("data-theme") === "light" ? "dark" : "light";
  if (now === "dark") rootEl.removeAttribute("data-theme");
  else rootEl.setAttribute("data-theme", now);
  try {
    localStorage.setItem("theme", now);
  } catch {}
});
$("#fsPlus")?.addEventListener("click", () => {
  const cur =
    parseFloat(getComputedStyle(rootEl).getPropertyValue("--fs")) || 1;
  const next = Math.min(1.35, cur + 0.05);
  rootEl.style.setProperty("--fs", next);
  try {
    localStorage.setItem("fs", next);
  } catch {}
});
$("#fsMinus")?.addEventListener("click", () => {
  const cur =
    parseFloat(getComputedStyle(rootEl).getPropertyValue("--fs")) || 1;
  const next = Math.max(0.9, cur - 0.05);
  rootEl.style.setProperty("--fs", next);
  try {
    localStorage.setItem("fs", next);
  } catch {}
});

// === Payments ===
function switchPayTab(key) {
  $$(".pay-panel").forEach((p) => p.classList.remove("active"));
  $$(".pay-tabs .chip").forEach((c) => c.classList.remove("active"));
  $(`#payPanel-${key}`)?.classList.add("active");
  $(`[data-paytab="${key}"]`)?.classList.add("active");

  if (key === "paypal") setupPayPalButtons();
  if (key === "kbz") drawWalletQR("#kbzQR");
  if (key === "cb") drawWalletQR("#cbQR");
  if (key === "aya") drawWalletQR("#ayaQR");
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-paytab]");
  if (!btn) return;
  switchPayTab(btn.getAttribute("data-paytab"));
});

// Simple dummy-QR (placeholder) — real app မှာ backend လင့်ခ်/QR string ထည့်ပါ
function drawWalletQR(sel) {
  const cvs = document.querySelector(sel);
  if (!cvs) return;
  const ctx = cvs.getContext("2d");
  const w = cvs.width,
    h = cvs.height;
  ctx.fillStyle = "#0b0f14";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.font = "16px sans-serif";
  ctx.fillText("Scan to Pay", 28, 28);
  // fake pattern
  for (let y = 45; y < h - 10; y += 12) {
    for (let x = 10; x < w - 10; x += 12) {
      ctx.fillStyle = Math.random() > 0.5 ? "#fff" : "#1f3b5a";
      ctx.fillRect(x, y, 8, 8);
    }
  }
}

// PayPal Buttons
let paypalRendered = false;
function setupPayPalButtons() {
  if (!window.paypal) return; // SDK not ready yet
  if (paypalRendered) {
    return;
  } // render once per open
  const host = document.getElementById("paypal-button-container");
  if (!host) return;

  host.innerHTML = ""; // clear
  paypalRendered = true;
  // total from your computeTotals() if available
  const total =
    typeof computeTotals === "function" ? computeTotals().total : 10;

  window.paypal
    .Buttons({
      style: { layout: "horizontal", tagline: false },
      createOrder: (data, actions) => {
        return actions.order.create({
          purchase_units: [{ amount: { value: String(total) } }],
        });
      },
      onApprove: async (data, actions) => {
        try {
          const details = await actions.order.capture();
          toast("Payment complete ✅");
          console.log("PayPal details", details);
          // TODO: create order doc in Firestore here
        } catch (e) {
          console.warn("approve failed", e);
        }
      },
      onError: (err) => {
        console.warn("paypal error", err);
        toast("PayPal error");
      },
    })
    .render(host);
}

// Open cart -> initialize payments each time
// const cartDrawer = document.getElementById('cartDrawer');
// document.getElementById('btnCart')?.addEventListener('click', ()=>{
//   cartDrawer?.classList.add('open');
//   paypalRendered = false;
//   switchPayTab('paypal'); // default
// });
// document.getElementById('closeCart')?.addEventListener('click', ()=> cartDrawer?.classList.remove('open'));

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

  // products paging function ရှိသော် call, မရှိသေးရင် grid တန်း render
  if (typeof loadProductsPage === "function") {
    loadProductsPage();
  } else {
    renderGrid();
  }

  // home sections + promo
  renderHomeSections();
  fetchPromos?.();

  updateCartCount();

  // Open membership as modal
  // === Membership modal open ===
  document.getElementById("btnMembership")?.addEventListener("click", () => {
    document.getElementById("memberModal")?.showModal();
  });
  // document.getElementById("btnMembership")?.addEventListener("click", (e) => {
  //   e.preventDefault();
  //   const dlg = document.getElementById("memberModal");
  //   if (dlg?.showModal) dlg.showModal();
  // });

  // Close buttons (generic)
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-close");
      document.getElementById(id)?.close();
    });
  });

  // Membership save (once)
  const buyBtn = document.getElementById("buyMembership");
  buyBtn?.addEventListener(
    "click",
    async () => {
      if (!state.user) {
        document.getElementById("authModal")?.showModal();
        toast("Please sign in to continue");
        return;
      }
      const plan =
        document.querySelector('input[name="mplan"]:checked')?.value || "basic";
      const fees = { basic: 9, plus: 19, pro: 39 };
      const rates = { basic: 0.02, plus: 0.03, pro: 0.05 };
      const method = document.getElementById("payMethod")?.value || "paypal";
      const auto = document.getElementById("autoRenew")?.checked || false;

      const now = Date.now();
      const yearMs = 365 * 86400000;
      state.membership = {
        plan,
        rate: rates[plan],
        fee: fees[plan],
        method,
        autoRenew: auto,
        startTs: now,
        expiresTs: now + yearMs,
      };

      try {
        await setDoc(
          doc(db, "users", state.user.uid),
          { member: state.membership },
          { merge: true }
        );
        toast(`Membership ${plan.toUpperCase()} - $${fees[plan]}/yr activated`);
      } catch (e) {
        console.warn("membership save failed", e);
      }
      document.getElementById("memberModal")?.close();
    },
    { once: true }
  ); // ✅ prevent multiple bindings if init ever re-runs
}

// ✅ Only run init after DOM is ready
document.addEventListener("DOMContentLoaded", init);

// === MEMBERSHIP: Join Now + email capture + send email ===
document.addEventListener("DOMContentLoaded", () => {
  const joinBtn = document.getElementById("mJoin");
  if (!joinBtn) return;

  // helper: crude email check
  const isEmail = (s) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());

  // === Send member welcome + admin notify via EmailJS ===
  async function sendMembershipEmail(member) {
    if (!window.emailjs) {
      console.error("EmailJS SDK not loaded");
      return false;
    }
    if (!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID) {
      console.error("EmailJS config missing");
      return false;
    }

    const vars = {
      to_email: member.email, // ← Template “To email” must be {{to_email}}
      to_name: member.name,
      subject: `Welcome ${member.label} — ${member.name}`,
      level: member.label,
      discount: `${(member.rate * 100) | 0}%`,
      cashback: `${Math.round((member.cashback || 0) * 100)}%`,
      member_id: member.memberId,
      addr: member.addr,
      city: member.city,
      phone: member.phone,
      fee: `$${member.fee}`,
      admin_email: ADMIN_EMAIL,
    };

    try {
      const res = await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        vars
      );
      console.log("EmailJS response:", res.status, res.text, vars);
      return true;
    } catch (e) {
      console.error("EmailJS failed:", e, vars);
      return false;
    }
  }

  joinBtn.addEventListener("click", async () => {
    // 1) တန်ဖိုးတွေယူပြီး validation လုပ်
    const tier =
      document.querySelector('input[name="mTier"]:checked')?.value || "gold";
    const name = document.getElementById("mName")?.value.trim();
    const email = document.getElementById("mEmail")?.value.trim();
    const phone = document.getElementById("mPhone")?.value.trim();
    const addr = document.getElementById("mAddr")?.value.trim();
    const city = document.getElementById("mCity")?.value.trim();

    if (!name || !email || !phone || !addr || !city) {
      alert("❗ Please fill Name, Email, Phone, Address, and City");
      return;
    }

    // 2) Membership plan တန်ဖိုးများ သတ်မှတ်
    const plans = {
      gold: { label: "Gold Member", fee: 29, rate: 0.05, cashback: 0.01 },
      platinum: {
        label: "Platinum Member",
        fee: 59,
        rate: 0.1,
        cashback: 0.02,
      },
      diamond: { label: "Diamond Member", fee: 99, rate: 0.15, cashback: 0.03 },
    };
    const plan = plans[tier] || plans.gold;

    // 3) State & localStorage ထဲသိမ်း
    state.membership = {
      active: true,
      level: tier,
      label: plan.label,
      fee: plan.fee,
      rate: plan.rate,
      cashback: plan.cashback,
      name,
      email,
      phone,
      addr,
      city,
      joinedAt: Date.now(),
      memberId: "MBR-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
    };
    try {
      localStorage.setItem("membership", JSON.stringify(state.membership));
    } catch {}

    // 4) 🆕 ဒီနေရာမှာ သင့်ပေးထားတဲ့ကုဒ်ထည့်ပါ
    const ok = await sendMembershipEmail(state.membership);
    if (!ok) {
      alert(
        "Joined, but sending email failed. Please check EmailJS keys/template."
      );
    } else {
      console.log("Welcome email sent.");
    }

    // 5) UI update + modal close
    alert(
      `🎉 ${plan.label} joined!\nAnnual fee $${plan.fee}.\n${
        plan.rate * 100
      }% discount will apply.`
    );
    document.getElementById("memberModal")?.close();
    try {
      renderCartPage?.();
    } catch {}
  });
});

// === Admin chip show/hide AFTER auth & nav built ===
function updateAdminChip() {
  const nav = document.getElementById("navScroll");
  if (!nav) return;
  const adminChip = [...nav.querySelectorAll(".nav-chip, button, a")].find(
    (b) => b.textContent?.includes("Analytics")
  );
  if (adminChip) adminChip.style.display = state.isAdmin ? "" : "none";
}

// auth state → check admin → toggle chip
onAuthStateChanged(auth, async (user) => {
  state.user = user || null;
  await checkAdmin(user);
  updateAdminChip();
});

// === Quick Prefs: Theme & Font Size ===
(function setupQuickPrefs() {
  const root = document.documentElement;
  function applyTheme(name) {
    const t = (name || localStorage.getItem("theme") || "dark").trim();
    root.setAttribute("data-theme", t);
    const sel = document.getElementById("themeSelect");
    if (sel) sel.value = t;
    try {
      localStorage.setItem("theme", t);
    } catch {}
  }
  function applyFs(scale) {
    const fs = String(scale || localStorage.getItem("fs") || "1.00");
    root.style.setProperty("--fs", fs);
    const sel = document.getElementById("fsSelect");
    if (sel) sel.value = fs;
    try {
      localStorage.setItem("fs", fs);
    } catch {}
  }
  document
    .getElementById("themeSelect")
    ?.addEventListener("change", (e) => applyTheme(e.target.value));
  document
    .getElementById("fsSelect")
    ?.addEventListener("change", (e) => applyFs(e.target.value));
  applyTheme();
  applyFs();
})();

// === Auth UI Toggle (robust) ===
(function ensureAuthUIToggle() {
  const btnAuth = document.getElementById("btnAuth");
  const btnLogout = document.getElementById("btnLogout");

  async function doLogout() {
    try {
      await signOut(auth);
      console.log("Signed out");
    } catch (e) {
      console.warn("signOut failed", e);
    }
  }
  btnLogout?.addEventListener("click", doLogout);
  btnAuth?.addEventListener("click", () => {
    if (window.state?.user) return;
    document.getElementById("authModal")?.showModal();
  });

  function updateAuthUI(user) {
    const btnAuth = document.getElementById("btnAuth");
    const btnLogout = document.getElementById("btnLogout");
    const greetEl = document.getElementById("greet");
    const authed = !!user;

    // Toggle buttons
    if (btnAuth) btnAuth.style.display = authed ? "none" : "inline-block";
    if (btnLogout) btnLogout.style.display = authed ? "inline-block" : "none";

    // Username: prefer displayName; else email local-part
    let uname = "";
    if (authed) {
      if (user.displayName && user.displayName.trim()) {
        uname = user.displayName.split(" ")[0];
      } else if (user.email) {
        uname = user.email.split("@")[0];
      } else {
        uname = "User";
      }
    }
    if (greetEl) greetEl.textContent = authed ? "Hi, " + uname : "";
  }

  // A dedicated listener just for UI (safe even if another listener exists)
  try {
    onAuthStateChanged(auth, (user) => {
      window.state = window.state || {};
      window.state.user = user || null;
      updateAuthUI(user);
    });
  } catch {}

  // Also run once on boot in case auth already resolved
  setTimeout(() => updateAuthUI(window.state?.user || null), 0);
})();

// === MEMBERSHIP MODAL WIRES (robust) ===
(function () {
  function getDlg() {
    return document.getElementById("memberModal");
  }

  function openMemberModal() {
    const dlg = getDlg();
    if (!dlg) {
      console.warn("memberModal not found");
      return;
    }
    // If <dialog> is supported use showModal; else fallback to [open] attribute
    if (typeof dlg.showModal === "function") {
      dlg.showModal();
    } else {
      dlg.setAttribute("open", "");
      dlg.style.display = "block";
    }
  }

  function closeMemberModal() {
    const dlg = getDlg();
    if (!dlg) return;
    if (typeof dlg.close === "function") {
      dlg.close();
    } else {
      dlg.removeAttribute("open");
      dlg.style.display = "none";
    }
  }

  // 1) Direct binding (if button exists now)
  document
    .getElementById("btnMembership")
    ?.addEventListener("click", openMemberModal);

  // 2) Delegated binding (if the button is rendered later)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest?.("#btnMembership");
    if (btn) {
      openMemberModal();
      e.preventDefault();
    }
    if (e.target?.id === "mClose") {
      closeMemberModal();
    }
  });

  // 3) ESC key closes (fallback)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && getDlg()?.hasAttribute("open"))
      closeMemberModal();
  });

  // 4) Click backdrop to close (native dialog already handles; fallback for polyfill)
  const dlg = getDlg();
  if (dlg && typeof dlg.showModal !== "function") {
    dlg.addEventListener("click", (ev) => {
      // click outside .m-wrap closes
      const box = dlg.querySelector(".m-wrap");
      if (box && !box.contains(ev.target)) closeMemberModal();
    });
  }
})();

// === MEMBERSHIP BUTTON → ALWAYS OPEN MODAL (block nav) ===
(function () {
  function openMemberModal() {
    const dlg = document.getElementById("memberModal");
    if (!dlg) {
      console.warn("memberModal not found");
      return;
    }
    if (typeof dlg.showModal === "function") dlg.showModal();
    else {
      dlg.setAttribute("open", "");
      dlg.style.display = "block";
    }
  }
  function closeMemberModal() {
    const dlg = document.getElementById("memberModal");
    if (!dlg) return;
    if (typeof dlg.close === "function") dlg.close();
    else {
      dlg.removeAttribute("open");
      dlg.style.display = "none";
    }
  }

  // 1) Direct bind (if the element exists now)
  const btn = document.getElementById("btnMembership");
  const stopNavAndOpen = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    openMemberModal();
    return false;
  };
  btn?.addEventListener("click", stopNavAndOpen);

  // 2) Defensive: capture-phase delegate (wins over global nav handlers)
  document.addEventListener(
    "click",
    (e) => {
      const trigger = e.target.closest?.(
        '#btnMembership, [data-action="membership"], a[href="#membership"]'
      );
      if (!trigger) return;
      stopNavAndOpen(e);
    },
    true
  ); // ← capture=true (very important)

  // 3) Optional: neutralize auto-router attributes on the button
  if (btn) {
    btn.removeAttribute?.("data-view"); // avoid switchView('shop')
    if (btn.tagName === "A") btn.setAttribute("href", ""); // avoid hash nav
    btn.setAttribute("role", "button");
  }

  // 4) Close button / ESC / backdrop
  document.addEventListener("click", (e) => {
    if (e.target?.id === "mClose") {
      e.preventDefault();
      closeMemberModal();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMemberModal();
  });
  const dlg = document.getElementById("memberModal");
  if (dlg && typeof dlg.showModal !== "function") {
    dlg.addEventListener("click", (ev) => {
      const box = dlg.querySelector(".m-wrap");
      if (box && !box.contains(ev.target)) closeMemberModal();
    });
  }
})();

// === MEMBERSHIP TOPBAR ICON → OPEN MODAL (block nav/router) ===
(function () {
  // ensure the button exists in topbar; if not, try to append next to btnCart
  if (!document.getElementById("btnMembership")) {
    const cartBtn = document.getElementById("btnCart");
    if (cartBtn && cartBtn.parentElement) {
      const btn = document.createElement("button");
      btn.id = "btnMembership";
      btn.className = "icon-btn";
      btn.title = "Membership";
      btn.setAttribute("aria-label", "Membership");
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M3 7l4.5 3 3.5-5 3.5 5L19 7l2 10H3L3 7zm2.8 12h12.4c.4 0 .8-.3.9-.7l.7-3.8-3.6 1.6a1 1 0 0 1-1.1-.2L12 11.8 8.9 16a1 1 0 0 1-1.1.2L4.2 14.5l.7 3.8c.1.4.5.7.9.7z" fill="currentColor"/></svg>`;
      cartBtn.parentElement.insertBefore(btn, cartBtn); // put before cart; or use .appendChild(btn)
    }
  }

  function openMemberModal(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
    }
    const dlg = document.getElementById("memberModal");
    if (!dlg) {
      console.warn("memberModal not found");
      return;
    }
    if (typeof dlg.showModal === "function") dlg.showModal();
    else {
      dlg.setAttribute("open", "");
      dlg.style.display = "block";
    }
    return false;
  }

  function closeMemberModal() {
    const dlg = document.getElementById("memberModal");
    if (!dlg) return;
    if (typeof dlg.close === "function") dlg.close();
    else {
      dlg.removeAttribute("open");
      dlg.style.display = "none";
    }
  }

  // bind (capture phase to beat routers like data-view / SPA handlers)
  document.addEventListener(
    "click",
    (e) => {
      const hit = e.target.closest?.(
        '#btnMembership, [data-action="membership"], a[href="#membership"]'
      );
      if (hit) openMemberModal(e);
      if (e.target?.id === "mClose") closeMemberModal();
    },
    true
  ); // capture=true

  // Esc/backdrop (fallback for non-native dialog)
  const dlg = document.getElementById("memberModal");
  if (dlg && typeof dlg.showModal !== "function") {
    dlg.addEventListener("click", (ev) => {
      const box = dlg.querySelector(".m-wrap");
      if (box && !box.contains(ev.target)) closeMemberModal();
    });
  }

  // safety: remove router attrs from the button if any
  const b = document.getElementById("btnMembership");
  if (b) {
    b.removeAttribute?.("data-view"); // avoid switchView('shop') etc
    if (b.tagName === "A") b.setAttribute("href", ""); // neutralize hash nav
    b.setAttribute("role", "button");
  }
})();

// ================= BARCODE SCAN → ADD TO CART =================

// 3.1 Map barcode → product (သင့်ရဲ့ SKU/ID အတိုင်း ပြင်ပါ)
const codeReader = new ZXing.BrowserMultiFormatReader();
const BARCODE_MAP = {
  // "EAN_13 or CODE128 text": product object (id/title/price/img)
  5901234123457: {
    id: "m101",
    title: "Men Graphic Tee",
    price: 14.5,
    img: "images/products/men/m101/thumb.jpg",
  },
  5901234123458: {
    id: "m205",
    title: "Men Running Shorts",
    price: 18.0,
    img: "images/products/men/m205/thumb.jpg",
  },
  978020137962: {
    id: "w202",
    title: "Women Tote Bag",
    price: 19.0,
    img: "images/products/women/w202/thumb.jpg",
  },
  // TODO: သင့် shop ရဲ့ barcode/sku များကို ဒီနေရာထပ်ဖြည့်ပါ
};

// 3.2 helper: add to cart by product object (id/title/price/img)
function addProductToCart(prod) {
  if (!prod?.id) return;
  const cart = ensureCart();
  const i = cart.findIndex((x) => x.id === prod.id);
  if (i >= 0) cart[i].qty = (cart[i].qty || 0) + 1;
  else
    cart.push({
      id: prod.id,
      title: prod.title,
      price: prod.price,
      img: prod.img,
      qty: 1,
    });
  setCart(cart);
  updateCartCount();
  // drawer-body ထဲမှာပြနေတဲ့အခါ refresh
  try {
    renderCartPage?.();
  } catch {}
}

// 3.3 barcode → product lookup
function handleDetectedBarcode(text) {
  const prod = BARCODE_MAP[text];
  if (!prod) {
    // မတွေ့ရင် အချက်ပေး
    console.warn("Unknown barcode:", text);
    const hint = document.getElementById("scanHint");
    if (hint) hint.textContent = `Unknown barcode: ${text}`;
    return false;
  }
  addProductToCart(prod);
  // success hint
  const hint = document.getElementById("scanHint");
  if (hint) hint.textContent = `Added: ${prod.title} (${text})`;
  return true;
}

// 3.4 ZXing scanner wires
let zxingReader = null;
let currentDeviceId = null;

// --- REPLACE your listCameras() with this native version ---
async function listCameras() {
  const sel = document.getElementById("scanCameraSelect");
  if (!sel) return;
  sel.innerHTML = "";

  try {
    // 1) Ensure permission prompt shows up at least once on some browsers
    // (enumerateDevices may return empty labels until permission granted)
    if (!window._triedCameraProbe) {
      window._triedCameraProbe = true;
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        s.getTracks().forEach((t) => t.stop());
      } catch (_) {
        // ignore; user will press Start later
      }
    }

    // 2) List devices natively
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === "videoinput"
    );

    if (!devices.length) {
      sel.innerHTML = `<option value="">No camera found</option>`;
      return;
    }

    // fill options
    devices.forEach((d, i) => {
      const opt = document.createElement("option");
      opt.value = d.deviceId || "";
      opt.textContent = d.label || `Camera ${i + 1}`;
      sel.appendChild(opt);
    });

    // prefer rear camera by label hint
    const rear = devices.find((d) => /back|rear|environment/i.test(d.label));
    sel.value = rear?.deviceId || devices[0]?.deviceId || "";
    currentDeviceId = sel.value || null;
  } catch (e) {
    console.error("Camera list failed", e);
    sel.innerHTML = `<option value="">Camera access blocked</option>`;
  }
}

// --- REPLACE your startScanner() with this robust version ---
async function startScanner() {
  const videoEl = document.getElementById("scanVideo");
  const sel = document.getElementById("scanCameraSelect");
  const hint = document.getElementById("scanHint");
  if (!videoEl) return;

  if (!zxingReader) zxingReader = new ZXing.BrowserMultiFormatReader();

  // pick deviceId if available; otherwise use facingMode
  const deviceId = sel?.value || currentDeviceId || "";
  const constraints = deviceId
    ? { video: { deviceId: { exact: deviceId } }, audio: false }
    : { video: { facingMode: { ideal: "environment" } }, audio: false };

  try {
    // Warm up a stream so that browsers grant permission before decoding loop
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = stream;

    // Start ZXing decode loop
    await zxingReader.decodeFromVideoDevice(
      deviceId || undefined, // undefined lets ZXing pick the current stream
      videoEl,
      (result, err) => {
        if (result?.text) {
          const ok = handleDetectedBarcode(result.text);
          if (ok) {
            // stop briefly to avoid rapid duplicates
            try {
              zxingReader.reset();
            } catch {}
            // leave stream alive to keep permission
            setTimeout(() => startScanner().catch(() => {}), 600);
          }
        }
        // err is normal during scan; ignore
      }
    );

    hint && (hint.textContent = "Scanning… Aim barcode inside the frame.");
  } catch (e) {
    // Permission dismissed/denied or other error
    console.error("Scanner start failed", e);
    if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
      hint &&
        (hint.textContent =
          "Camera permission denied/dismissed. Please allow camera access and press Start again.");
    } else if (e && e.name === "NotFoundError") {
      hint && (hint.textContent = "No camera device found.");
    } else {
      hint &&
        (hint.textContent = "Camera error. Try another camera or reload.");
    }
  }
}

function stopScanner() {
  if (zxingReader) {
    try {
      zxingReader.reset();
    } catch {}
  }
  const videoEl = document.getElementById("scanVideo");
  if (videoEl?.srcObject) {
    try {
      videoEl.srcObject.getTracks().forEach((t) => t.stop());
    } catch {}
    videoEl.srcObject = null;
  }
  const hint = document.getElementById("scanHint");
  if (hint) hint.textContent = "Scanner stopped.";
}

// 3.5 Modal open/close
function openScanModal() {
  const dlg = document.getElementById("scanModal");
  if (!dlg) return;
  if (typeof dlg.showModal === "function") dlg.showModal();
  else {
    dlg.setAttribute("open", "");
    dlg.style.display = "block";
  }
  // list first; let user choose; Start ကိုနှိပ်မှ decode
  listCameras().catch(() => {});
}
function closeScanModal() {
  stopScanner();
  const dlg = document.getElementById("scanModal");
  if (!dlg) return;
  if (typeof dlg.close === "function") dlg.close();
  else {
    dlg.removeAttribute("open");
    dlg.style.display = "none";
  }
}

// 3.6 UI events
document.getElementById("btnScan")?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  openScanModal();
});
document.getElementById("scanClose")?.addEventListener("click", closeScanModal);
document.getElementById("scanStart")?.addEventListener("click", startScanner);
document.getElementById("scanStop")?.addEventListener("click", stopScanner);
document.getElementById("scanCameraSelect")?.addEventListener("change", () => {
  stopScanner();
  startScanner();
});

// 3.7 iOS Safari permissions hint (user gesture is needed)
document.addEventListener("visibilitychange", () => {
  const dlgOpen = document.getElementById("scanModal")?.open;
  if (document.visibilityState === "visible" && dlgOpen) {
    // try to keep scanning after switching apps/permissions sheet
    startScanner().catch(() => {});
  }
});

/* ===========================================================
   PRODUCT MANAGER — Firestore + Storage (Consolidated)
   Requires:
     - window.db (Firestore compat) / window.storage (Storage compat)
     - Buttons:   #btnAddProduct, #btnProductManager
     - Modals:    #productModal, #productListModal
     - Form:      #productForm  (inputs: #pId #pTitle #pCategory #pPrice #pBarcode #pImgFile)
     - Preview:   #pThumbPreview
     - Manager:   #plSearch #plCategory #plSort #plList
   =========================================================== */
(function () {
  // ---------- Bind compat instances safely (avoid modular shadowing) ----------
  const fdb =
    window.db && typeof window.db.collection === "function"
      ? window.db
      : window.firebase && firebase.firestore
      ? firebase.firestore()
      : null;

  const fstorage =
    window.storage && typeof window.storage.ref === "function"
      ? window.storage
      : window.firebase && firebase.storage
      ? firebase.storage()
      : null;

  // ---------- Guards ----------
  if (!fdb || !fstorage) {
    console.error(
      "[ProductManager] Firebase compat not ready. Ensure compat SDKs are loaded and firebase.initializeApp(...) ran before app.js."
    );
  }

  // ---------- Small UI helpers ----------
  function openDialog(id) {
    const d = document.getElementById(id);
    if (!d) return;
    d.showModal ? d.showModal() : d.setAttribute("open", "");
  }
  function closeDialog(id) {
    const d = document.getElementById(id);
    if (!d) return;
    d.close ? d.close() : d.removeAttribute("open");
  }

  // ---------- Cloud Store ----------
  const PRODUCTS_COL = "products";

  async function loadProducts() {
    const snap = await fdb
      .collection(PRODUCTS_COL)
      .orderBy("updatedAt", "desc")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async function upsertProduct(p) {
    const id = p.id || fdb.collection(PRODUCTS_COL).doc().id;
    const now = Date.now();
    const data = { ...p, updatedAt: now, createdAt: p.createdAt || now };
    await fdb.collection(PRODUCTS_COL).doc(id).set(data, { merge: true });
    return id;
  }

  async function deleteProduct(id) {
    try {
      await fdb.collection(PRODUCTS_COL).doc(id).delete();
    } catch (e) {
      console.warn("delete doc:", e);
    }
    try {
      await fstorage.ref(`products/${id}/thumb.jpg`).delete();
    } catch (e) {
      /* file may not exist */
    }
  }

  // ---------- Image helpers ----------
  async function fileToPreviewURL(file) {
    return new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(file);
    });
  }
  async function uploadProductThumb(file, productId) {
    if (!file) return "";
    const ref = fstorage.ref(`products/${productId}/thumb.jpg`);
    // ✅ contentType တိကျစွာ assign
    await ref.put(file, { contentType: file.type || "image/jpeg" });
    return await ref.getDownloadURL();
  }

  // ---------- Form / Modal wires ----------
  const elForm = document.getElementById("productForm");
  const elThumbPrev = document.getElementById("pThumbPreview");
  const elImgFile = document.getElementById("pImgFile");

  function resetProductForm() {
    const mode = document.getElementById("pmMode");
    if (mode) mode.textContent = "Add";
    elForm?.reset();
    const idEl = document.getElementById("pId");
    if (idEl) idEl.value = "";
    if (elThumbPrev) elThumbPrev.src = "";
  }

  // Reset button listener
  document
    .getElementById("pmReset")
    ?.addEventListener("click", resetProductForm);

  document.getElementById("btnAddProduct")?.addEventListener("click", () => {
    resetProductForm();
    openDialog("productModal");
  });
  document
    .getElementById("pmClose")
    ?.addEventListener("click", () => closeDialog("productModal"));

  elImgFile?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) {
      if (elThumbPrev) elThumbPrev.src = "";
      return;
    }
    if (elThumbPrev) elThumbPrev.src = await fileToPreviewURL(f);
  });

  elForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    // Prepare id early to upload under stable path
    let id =
      document.getElementById("pId")?.value.trim() ||
      fdb.collection(PRODUCTS_COL).doc().id;

    const title = document.getElementById("pTitle")?.value.trim();
    const category = document.getElementById("pCategory")?.value.trim();
    const price = parseFloat(document.getElementById("pPrice")?.value);
    const barcode = document.getElementById("pBarcode")?.value.trim();
    const file = document.getElementById("pImgFile")?.files?.[0] || null;

    if (!title || !category || isNaN(price) || !barcode) {
      alert("Please fill Title, Category, Price, Barcode");
      return;
    }

    // Preview already set on change; ensure present for UX
    if (file && elThumbPrev && !elThumbPrev.src) {
      elThumbPrev.src = await fileToPreviewURL(file);
    }

    // Upload image if any → get downloadURL
    let thumbURL = elThumbPrev?.src || "";
    if (file) {
      try {
        thumbURL = await uploadProductThumb(file, id);
      } catch (err) {
        console.error("upload error:", err);
        alert("Image upload failed (permission or network).");
      }
    }

    const prod = {
      id,
      title,
      category,
      price: +price,
      barcode,
      thumb: thumbURL,
    };
    try {
      id = await upsertProduct(prod);
    } catch (err) {
      console.error("save error:", err);
      alert("Save failed. You may not have permission to add/edit products.");
      return;
    }

    // Keep BARCODE_MAP fresh for scanner usage
    window.BARCODE_MAP = window.BARCODE_MAP || {};
    window.BARCODE_MAP[barcode] = { id, title, price: +price, img: thumbURL };

    alert("Product saved.");
    closeDialog("productModal");
  });

  // ---------- Products Manager (list/search/filter/sort) ----------
  const elPlList = document.getElementById("plList");
  const elPlSearch = document.getElementById("plSearch");
  const elPlCategory = document.getElementById("plCategory");
  const elPlSort = document.getElementById("plSort");

  let _productsCache = [];
  // Realtime boot with guard + retry
  let _unsubProducts = null;

  function ensureProductsRealtime() {
    if (_unsubProducts) return;

    // Guard: wait until Firestore compat is ready
    if (!fdb || typeof fdb.collection !== "function") {
      console.warn("Firestore not ready yet. Retrying in 300ms…");
      setTimeout(ensureProductsRealtime, 300);
      return;
    }

    _unsubProducts = fdb.collection(PRODUCTS_COL).onSnapshot(
      (snap) => {
        _productsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // hydrate scanner map
        window.BARCODE_MAP = {};
        for (const p of _productsCache) {
          if (p.barcode)
            window.BARCODE_MAP[p.barcode] = {
              id: p.id,
              title: p.title,
              price: p.price,
              img: p.thumb,
            };
        }
        renderProductList?.();
      },
      (err) => console.error("realtime error:", err)
    );
  }

  // Listen for fb-ready (fired after auth state known + compat instances set)
  document.addEventListener("fb-ready", () => {
    ensureProductsRealtime();
  });

  // Fallback: DOM ready → in case fb-ready fired before app.js attached listener
  document.addEventListener("DOMContentLoaded", () => {
    if (!_unsubProducts) ensureProductsRealtime();
  });

  function populateCategoriesDropdown() {
    if (!elPlCategory) return;
    const cats = Array.from(
      new Set(_productsCache.map((x) => x.category).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    const cur = elPlCategory.value;
    elPlCategory.innerHTML =
      `<option value="">All categories</option>` +
      cats.map((c) => `<option value="${c}">${c}</option>`).join("");
    if (cats.includes(cur)) elPlCategory.value = cur;
  }

  function filteredSortedProducts() {
    const q = (elPlSearch?.value || "").trim().toLowerCase();
    const cat = elPlCategory?.value || "";
    const sort = elPlSort?.value || "new";

    let items = _productsCache.slice();

    if (q)
      items = items.filter(
        (x) =>
          (x.title || "").toLowerCase().includes(q) ||
          (x.barcode || "").toLowerCase().includes(q) ||
          (x.id || "").toLowerCase().includes(q)
      );
    if (cat) items = items.filter((x) => (x.category || "") === cat);

    const collator = new Intl.Collator(undefined, { sensitivity: "base" });
    if (sort === "title_az")
      items.sort((a, b) => collator.compare(a.title, b.title));
    if (sort === "title_za")
      items.sort((a, b) => collator.compare(b.title, a.title));
    if (sort === "price_low")
      items.sort((a, b) => (a.price || 0) - (b.price || 0));
    if (sort === "price_high")
      items.sort((a, b) => (b.price || 0) - (a.price || 0));
    if (sort === "new")
      items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    return items;
  }

  function renderProductList() {
    if (!elPlList) return;
    populateCategoriesDropdown();

    const items = filteredSortedProducts();
    elPlList.innerHTML = "";
    if (!items.length) {
      elPlList.innerHTML = `<div class="small" style="opacity:.8;">No products yet.</div>`;
      return;
    }
    for (const p of items) {
      const card = document.createElement("div");
      card.className = "pm-card";
      card.innerHTML = `
        <img alt="${p.title ?? ""}" src="${p.thumb || ""}">
        <div class="row"><div class="strong">${
          p.title ?? ""
        }</div><div class="tag">$${(+p.price || 0).toFixed(2)}</div></div>
        <div class="row"><div class="small" style="opacity:.85;">${
          p.category || "-"
        }</div><div class="small">#${p.id}</div></div>
        <div class="row"><div class="small" style="opacity:.75;">Barcode:</div><div class="small" style="opacity:.9;">${
          p.barcode || "-"
        }</div></div>
        <div class="row" style="gap:.4rem; justify-content:flex-end;">
          <button class="btn-mini" data-edit="${p.id}">Edit</button>
          <button class="btn-mini btn-outline" data-del="${
            p.id
          }">Delete</button>
        </div>
      `;
      elPlList.appendChild(card);
    }
  }

  // Search/filter/sort events
  elPlSearch?.addEventListener("input", renderProductList);
  elPlCategory?.addEventListener("change", renderProductList);
  elPlSort?.addEventListener("change", renderProductList);

  // Edit/Delete delegation
  elPlList?.addEventListener("click", async (e) => {
    const edit = e.target.closest?.("[data-edit]");
    const del = e.target.closest?.("[data-del]");
    if (!edit && !del) return;

    const id = edit?.dataset.edit || del?.dataset.del;
    const p = _productsCache.find((x) => x.id === id);
    if (!p) return;

    if (del) {
      if (confirm(`Delete "${p.title}"?`)) {
        await deleteProduct(id);
        // Snapshot will refresh UI & BARCODE_MAP
      }
      return;
    }

    // Edit flow
    const mode = document.getElementById("pmMode");
    if (mode) mode.textContent = "Edit";
    document.getElementById("pId").value = p.id;
    document.getElementById("pTitle").value = p.title || "";
    document.getElementById("pCategory").value = p.category || "";
    document.getElementById("pPrice").value = p.price || 0;
    document.getElementById("pBarcode").value = p.barcode || "";
    document.getElementById("pThumbPreview").src = p.thumb || "";
    openDialog("productModal");
  });

  // Manager modal open
  document
    .getElementById("btnProductManager")
    ?.addEventListener("click", () => {
      ensureProductsRealtime();
      openDialog("productListModal");
    });
  document
    .getElementById("plClose")
    ?.addEventListener("click", () => closeDialog("productListModal"));
})();

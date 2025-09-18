import { firebaseConfig } from './index.html'; // only to help IDEs; actual config is in index.html <script type="module">
// Firebase modular imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ---- EmailJS init ----
window.addEventListener('load', () => {
  if (window.emailjs) {
    emailjs.init({ publicKey: "WT0GOYrL9HnDKvLUf" });
  }
});

// ---- App State ----
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const state = {
  user: null,
  products: [],
  categories: [],
  page: 0,
  pageSize: 12,
  cart: loadJSON('cart', []),
  promo: null, // {code, type:'percent'|'amount', value}
  membership: null, // {plan:'basic'|'plus', startTs, expiresTs, rate}
};

// ---- Helpers ----
function $(sel){ return document.querySelector(sel) }
function h(t){ return document.createElement(t) }
function fmt(n){ return '$' + (Number(n||0).toFixed(2)) }
function loadJSON(k, def){ try{ return JSON.parse(localStorage.getItem(k)) ?? def }catch{ return def } }
function saveJSON(k, v){ localStorage.setItem(k, JSON.stringify(v)) }
function uid(){ return Math.random().toString(36).slice(2,10) }
function todayISO(){ return new Date().toISOString().slice(0,10) }
function daysFrom(ts){ return (Date.now() - ts) / 86400000 }
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)) }

// ---- Demo products (fallback) ----
const DEMO_PRODUCTS = [
  {id:'p1', title:'Classic Sushi Set', price:19.9, cat:'Food', img:'https://images.unsplash.com/photo-1553621042-f6e147245754?q=80&w=800&auto=format&fit=crop', desc:'Fresh nigiri & rolls.'},
  {id:'p2', title:'Matcha Latte', price:4.9, cat:'Drinks', img:'https://images.unsplash.com/photo-1498804103079-a6351b050096?q=80&w=800&auto=format&fit=crop', desc:'Creamy, earthy, energizing.'},
  {id:'p3', title:'Bluetooth Earbuds', price:39.0, cat:'Electronics', img:'https://images.unsplash.com/photo-1518442072051-99d3c131e1c1?q=80&w=800&auto=format&fit=crop', desc:'Clear sound, long battery.'},
  {id:'p4', title:'Handmade Tote', price:24.5, cat:'Fashion', img:'https://images.unsplash.com/photo-1547949003-9792a18a2601?q=80&w=800&auto=format&fit=crop', desc:'Durable canvas everyday bag.'},
  {id:'p5', title:'AyaPay Gift Card', price:25.0, cat:'Gift', img:'https://images.unsplash.com/photo-1557426272-fc759fdf7a8d?q=80&w=800&auto=format&fit=crop', desc:'Send love instantly.'},
  {id:'p6', title:'KBZPay Top-Up', price:10.0, cat:'Topup', img:'https://images.unsplash.com/photo-1535223289827-42f1e9919769?q=80&w=800&auto=format&fit=crop', desc:'Digital wallet recharge.'},
];
// Will be extended

// ---- UI Elements ----
const sidebar = $("#sidebar");
const btnMenu = $("#btnMenu");
const closeSidebar = $("#closeSidebar");
const main = $("#main");
const grid = $("#productGrid");
const categorySelect = $("#categorySelect");
const searchInput = $("#searchInput");
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
const pdTitle = $("#pdTitle");
const pdPrice = $("#pdPrice");
const pdDesc = $("#pdDesc");
const pdQty = $("#pdQty");
const pdAdd = $("#pdAdd");

const promoCodeInput = $("#promoCode");
const applyPromoBtn = $("#applyPromo");

const payTabs = document.querySelectorAll(".pay-tabs .chip");
const panels = document.querySelectorAll(".pay-panel");
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
const viewShop = $("#view-shop");
const viewAnalytics = $("#view-analytics");
const viewOrders = $("#view-orders");

// ---- Sidebar ----
btnMenu.addEventListener('click', () => sidebar.classList.add('open'));
closeSidebar.addEventListener('click', () => sidebar.classList.remove('open'));

// ---- Views ----
navLinks.forEach(b=>{
  b.addEventListener('click', ()=>{
    navLinks.forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    $("#view-"+b.dataset.view).classList.add('active');
    sidebar.classList.remove('open');
    if(b.dataset.view==='analytics') renderAnalytics();
    if(b.dataset.view==='orders') loadOrders();
  });
});

// ---- Auth ----
btnUser.addEventListener('click', ()=>{
  if(state.user){ // profile mini
    alert(`Logged in as: ${state.user.displayName || state.user.email}\nTap OK to sign out from browser menu.`);
  }else{
    authModal.showModal();
  }
});
btnGoogle.addEventListener('click', async ()=>{
  try{
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    await ensureUser(cred.user);
    authModal.close();
    toast('Signed in ✔');
  }catch(e){ console.error(e); alert('Sign-in failed'); }
});
onAuthStateChanged(auth, async (user)=>{
  state.user = user || null;
  if(user) await ensureUser(user);
  renderMember();
});

async function ensureUser(user){
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref, {
      email: user.email || null,
      name: user.displayName || '',
      createdAt: serverTimestamp(),
      member: null,
      totalSpent: 0,
      firstOrderAt: null
    });
  }else{
    state.membership = snap.data().member || null;
  }
}

// ---- Products (from Firestore if available, fallback to demo) ----
async function loadProductsPage(){
  // For simplicity, we use DEMO_PRODUCTS paginated. You can replace with Firestore query with pagination.
  if(state.page===0 && state.products.length===0){
    // Merge categories
    const cats = new Set(DEMO_PRODUCTS.map(p=>p.cat));
    state.categories = Array.from(cats);
    fillCategories();
  }
  const start = state.page * state.pageSize;
  const next = DEMO_PRODUCTS.slice(start, start+state.pageSize);
  state.products.push(...next);
  state.page++;
  renderGrid();
}
function fillCategories(){
  state.categories.forEach(c=>{
    const opt = h('option'); opt.value=c; opt.textContent=c;
    categorySelect.appendChild(opt);
  });
}
function renderGrid(){
  const cat = categorySelect.value.trim().toLowerCase();
  const q = (searchInput.value||'').trim().toLowerCase();
  grid.innerHTML = '';
  const filtered = state.products.filter(p=>{
    const okCat = !cat || p.cat.toLowerCase()===cat;
    const hay = (p.title+' '+p.desc).toLowerCase();
    const okQ = !q || hay.includes(q);
    return okCat && okQ;
  });
  filtered.forEach(p=>{
    const card = h('div'); card.className='card';
    card.innerHTML = `
      <img class="thumb" src="${p.img}" alt="${p.title}">
      <div class="pad">
        <div class="card-title">${p.title}</div>
        <div class="row between">
          <div class="price">${fmt(p.price)}</div>
          <button class="btn btn-soft">View</button>
        </div>
      </div>
    `;
    card.querySelector('.btn').addEventListener('click', ()=>openProduct(p));
    card.querySelector('img').addEventListener('click', ()=>openProduct(p));
    grid.appendChild(card);
  });
}
categorySelect.addEventListener('change', renderGrid);
searchInput.addEventListener('input', ()=>{ renderGrid(); });

// ---- Product Detail Modal ----
let currentProduct = null;
function openProduct(p){
  currentProduct = p;
  pdImg.src = p.img; pdImg.alt = p.title;
  pdTitle.textContent = p.title;
  pdPrice.textContent = fmt(p.price);
  pdDesc.textContent = p.desc;
  pdQty.value = 1;
  productModal.showModal();
}
pdAdd.addEventListener('click', ()=>{
  const qty = clamp(parseInt(pdQty.value||'1',10), 1, 999);
  addToCart(currentProduct, qty);
  productModal.close();
  openCart();
});

// ---- Cart ----
btnCart.addEventListener('click', openCart);
closeCart.addEventListener('click', ()=>cartDrawer.classList.remove('open'));

function openCart(){
  cartDrawer.classList.add('open');
  renderCart();
  setupPayPalButtons();
  drawWalletQRs();
}
function addToCart(p, qty=1){
  const i = state.cart.findIndex(x=>x.id===p.id);
  if(i>-1) state.cart[i].qty += qty;
  else state.cart.push({id:p.id, title:p.title, price:p.price, img:p.img, qty});
  saveJSON('cart', state.cart);
  updateCartCount();
  toast('Added to cart');
}
function removeFromCart(pid){
  state.cart = state.cart.filter(x=>x.id!==pid);
  saveJSON('cart', state.cart);
  renderCart(); updateCartCount();
}
function updateQty(pid, qty){
  const i = state.cart.findIndex(x=>x.id===pid);
  if(i>-1){
    state.cart[i].qty = clamp(qty,1,999);
    saveJSON('cart', state.cart);
    renderCart();
  }
}
function updateCartCount(){
  const n = state.cart.reduce((a,b)=>a+b.qty,0);
  cartCount.textContent = n;
}
function renderCart(){
  cartItems.innerHTML = '';
  if(state.cart.length===0){
    cartItems.innerHTML = `<p class="small">Your cart is empty.</p>`;
  }else{
    state.cart.forEach(item=>{
      const row = h('div'); row.className='cart-row';
      row.innerHTML = `
        <img src="${item.img}" alt="${item.title}">
        <div>
          <div>${item.title}</div>
          <div class="small">${fmt(item.price)}</div>
          <div class="qty">
            <button class="icon-btn" aria-label="dec">−</button>
            <input type="number" value="${item.qty}" min="1">
            <button class="icon-btn" aria-label="inc">+</button>
          </div>
        </div>
        <button class="icon-btn" aria-label="remove">✕</button>
      `;
      const [dec, input, inc] = row.querySelectorAll('.qty > *');
      dec.addEventListener('click', ()=>updateQty(item.id, item.qty-1));
      inc.addEventListener('click', ()=>updateQty(item.id, item.qty+1));
      input.addEventListener('input', ()=>updateQty(item.id, parseInt(input.value||'1',10)));
      row.querySelector('[aria-label="remove"]').addEventListener('click', ()=>removeFromCart(item.id));
      cartItems.appendChild(row);
    });
  }
  computeTotals();
}
function computeTotals(){
  const subtotal = state.cart.reduce((a,b)=>a + b.price*b.qty, 0);
  let promoCut = 0;
  let memberCut = 0;

  // Automatic threshold 5% off if subtotal > 100
  if(subtotal > 100) promoCut += 0.05 * subtotal;

  // Coupon
  if(state.promo){
    if(state.promo.type==='percent') promoCut += (state.promo.value/100)*subtotal;
    if(state.promo.type==='amount') promoCut += state.promo.value;
  }
  // Membership & Loyalty
  const rate = state.membership?.rate || 0;
  memberCut += rate * subtotal; // member exclusive discount
  if(isLoyalCustomer()) memberCut += 0.01 * subtotal; // extra 1%

  const total = Math.max(0, subtotal - promoCut - memberCut);

  subtotalEl.textContent = fmt(subtotal);
  promoAmountEl.textContent = '-'+fmt(promoCut);
  memberDiscEl.textContent = '-'+fmt(memberCut);
  grandTotalEl.textContent = fmt(total);

  return { subtotal, promoCut, memberCut, total };
}

// ---- Promo Codes ----
applyPromoBtn.addEventListener('click', ()=>{
  const code = (promoCodeInput.value||'').trim().toUpperCase();
  if(!code){ state.promo=null; computeTotals(); return }
  // Simple examples
  const MAP = {
    'BUYMORE10': {type:'percent', value:10},
    'WELCOME5':  {type:'amount',  value:5},
  };
  state.promo = MAP[code] || null;
  toast(state.promo ? 'Promo applied' : 'Invalid code');
  computeTotals();
});

// ---- Pay Tabs ----
payTabs.forEach(t=>{
  t.addEventListener('click', ()=>{
    payTabs.forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    panels.forEach(p=>p.classList.remove('active'));
    $("#payPanel-"+t.dataset.paytab).classList.add('active');
    if(t.dataset.paytab==='paypal') setupPayPalButtons();
    else drawWalletQRs();
  });
});

// ---- Wallet QR (KBZ/CB/Aya demo) ----
function drawQR(canvas, text){
  const ctx = canvas.getContext('2d');
  // Simple placeholder “QR-like” pattern; replace with real QR generator lib if needed.
  ctx.fillStyle = '#0d1624';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#7dd3fc';
  for(let y=0;y<canvas.height;y+=12){
    for(let x=0;x<canvas.width;x+=12){
      const v = ((x*7 + y*13 + text.length*31) % 97) > 48 ? 1:0;
      if(v) ctx.fillRect(x+2,y+2,8,8);
    }
  }
  ctx.fillStyle='#e7edf3';
  ctx.fillRect(10, canvas.height-22, canvas.width-20, 16);
  ctx.fillStyle='#0b0f14';
  ctx.font='12px Inter';
  ctx.fillText('Demo QR', 14, canvas.height-10);
}
function drawWalletQRs(){
  const { total } = computeTotals();
  const orderId = currentOrderId() || uid();
  const amt = total.toFixed(2);
  const kbzCanvas = $("#kbzQR"), cbCanvas=$("#cbQR"), ayaCanvas=$("#ayaQR");
  if(kbzCanvas) drawQR(kbzCanvas, `kbzpay://pay?order=${orderId}&amount=${amt}`);
  if(cbCanvas) drawQR(cbCanvas, `cbpay://pay?order=${orderId}&amount=${amt}`);
  if(ayaCanvas) drawQR(ayaCanvas, `ayapay://pay?order=${orderId}&amount=${amt}`);
}
kbzPaid.addEventListener('click', ()=>walletPaid('KBZPay'));
cbPaid.addEventListener('click', ()=>walletPaid('CBPay'));
ayaPaid.addEventListener('click', ()=>walletPaid('AyaPay'));
async function walletPaid(channel){
  const order = await placeOrder({ channel, status:'paid' });
  await sendEmail(order);
  toast(`Payment confirmed via ${channel}`);
  afterOrderClear(order);
}

// ---- PayPal Buttons ----
let paypalButtonsRendered=false;
function setupPayPalButtons(){
  if(!window.paypal || paypalButtonsRendered) return;
  const container = document.getElementById('paypal-button-container');
  container.innerHTML = '';
  paypalButtonsRendered = true;
  const { total } = computeTotals();

  window.paypal.Buttons({
    style:{ layout:'horizontal' },
    createOrder: async (data, actions)=>{
      return actions.order.create({
        purchase_units:[{ amount:{ value: total.toFixed(2) } }]
      });
    },
    onApprove: async (data, actions)=>{
      const details = await actions.order.capture();
      const order = await placeOrder({ channel:'PayPal', status:'paid', paypal: details });
      await sendEmail(order);
      toast('Payment successful with PayPal');
      afterOrderClear(order);
    },
    onError: (err)=>{ console.error(err); alert('PayPal error'); }
  }).render('#paypal-button-container');
}

// ---- Orders & Checkout ----
function currentOrderId(){ return sessionStorage.getItem('currentOrderId') }
function setCurrentOrderId(id){ sessionStorage.setItem('currentOrderId', id) }

async function placeOrder(extra={}){
  if(state.cart.length===0){ alert('Cart is empty'); throw new Error('empty') }
  if(!state.user){ authModal.showModal(); throw new Error('signin required') }

  const sums = computeTotals();
  const order = {
    userId: state.user.uid,
    items: state.cart.map(i=>({id:i.id, title:i.title, price:i.price, qty:i.qty})),
    pricing: sums,
    promo: state.promo,
    membership: state.membership,
    channel: extra.channel||'',
    status: extra.status||'pending',
    createdAt: serverTimestamp(),
    orderDate: todayISO(),
  };
  const ref = await addDoc(collection(db,'orders'), order);
  order.id = ref.id;

  // Update analytics
  trackSale(order);

  // Update user accumulators
  const uref = doc(db,'users',state.user.uid);
  const usnap = await getDoc(uref);
  if(usnap.exists()){
    const prev = usnap.data();
    await updateDoc(uref, {
      totalSpent: (prev.totalSpent||0) + order.pricing.total,
      firstOrderAt: prev.firstOrderAt || serverTimestamp()
    });
  }
  setCurrentOrderId(order.id);
  return order;
}
async function afterOrderClear(order){
  state.cart = []; saveJSON('cart', state.cart);
  renderCart(); updateCartCount();
  await loadOrders();
}

// ---- EmailJS Confirmation ----
async function sendEmail(order){
  try{
    if(!window.emailjs) return;
    await emailjs.send("YOUR_EMAILJS_SERVICE_ID","YOUR_EMAILJS_TEMPLATE_ID",{
      to_email: state.user.email,
      to_name: state.user.displayName || state.user.email,
      order_id: order.id,
      amount: order.pricing.total.toFixed(2),
      date: order.orderDate
    });
  }catch(e){ console.warn('EmailJS failed', e) }
}

// ---- Orders list ----
async function loadOrders(){
  if(!state.user){ $("#ordersList").innerHTML='<p class="small">Sign in to see orders.</p>'; return }
  const qref = query(collection(db,'orders'), where('userId','==', state.user.uid), orderBy('createdAt','desc'), limit(50));
  const snap = await getDocs(qref);
  const wrap = $("#ordersList"); wrap.innerHTML='';
  snap.forEach(docu=>{
    const o = docu.data();
    const card = h('div'); card.className='card'; card.innerHTML = `
      <div class="pad">
        <div class="row between">
          <div class="card-title">Order #${docu.id.slice(-6).toUpperCase()}</div>
          <div class="small">${o.orderDate||''}</div>
        </div>
        <div class="small">Channel: ${o.channel} — Status: ${o.status}</div>
        <ul class="disc small">
          ${o.items.map(it=>`<li>${it.title} × ${it.qty} — ${fmt(it.price*it.qty)}</li>`).join('')}
        </ul>
        <div class="row between">
          <div>Total</div><div class="price">${fmt(o.pricing.total)}</div>
        </div>
      </div>
    `;
    wrap.appendChild(card);
  });
}

// ---- Membership ----
btnMembership.addEventListener('click', ()=>memberModal.showModal());
buyMembership.addEventListener('click', async ()=>{
  if(!state.user){ authModal.showModal(); return }
  // Simple client-side “purchase” using PayPal flow would be ideal.
  // For demo, activate immediately as Basic/Plus according to selected radio.
  const plan = (document.querySelector('input[name="mplan"]:checked')?.value)||'basic';
  const rate = plan==='plus' ? 0.03 : 0.02;
  const now = Date.now(), year = 365*86400000;
  state.membership = { plan, rate, startTs: now, expiresTs: now+year };
  await updateDoc(doc(db,'users', state.user.uid), { member: state.membership });
  memberModal.close();
  renderMember();
  toast('Membership activated');
});
function renderMember(){
  const m = state.membership;
  if(!state.user){ memberStatus.textContent='Sign in to see status'; return }
  if(!m){ memberStatus.textContent='Not a member yet'; return }
  const daysLeft = Math.max(0, Math.round((m.expiresTs-Date.now())/86400000));
  memberStatus.textContent = `Active: ${m.plan} (${Math.round(m.rate*100)}% cashback). ${daysLeft} days left.`;
}
function isLoyalCustomer(){
  // Loyal if first order more than 2 years ago
  // We estimate with local orders or via users.firstOrderAt (not client-readable by default, so using heuristic)
  // For demo: if user.totalSpent loaded earlier is high; here we just check membership start older than 2 years OR (pretend) flag.
  if(!state.user) return false;
  // You may fetch and compute with users.firstOrderAt; keeping it simple here:
  return false; // change to true per your business logic/server check
}

// ---- Analytics ----
async function renderAnalytics(){
  // Revenue last 30 days (from orders)
  const since = new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  const qref = query(collection(db,'orders'), where('orderDate','>=', since), limit(500));
  const snap = await getDocs(qref);
  const days = Array.from({length:30}, (_,i)=>{
    const d = new Date(Date.now()-(29-i)*86400000).toISOString().slice(0,10);
    return {d, v:0}
  });
  const tally = {}; // product -> qty
  snap.forEach(docu=>{
    const o = docu.data();
    const k = o.orderDate;
    const day = days.find(x=>x.d===k);
    if(day) day.v += Number(o.pricing?.total||0);
    (o.items||[]).forEach(it=>{
      tally[it.title] = (tally[it.title]||0) + it.qty;
    });
  });

  // Charts
  const revCtx = document.getElementById('revChart');
  new Chart(revCtx, {
    type:'line',
    data:{ labels:days.map(x=>x.d.slice(5)), datasets:[{ label:'Revenue', data:days.map(x=>x.v) }]},
    options:{ responsive:true, plugins:{ legend:{ display:false } } }
  });

  const top = Object.entries(tally).sort((a,b)=>b[1]-a[1]).slice(0,7);
  const topCtx = document.getElementById('topChart');
  new Chart(topCtx, {
    type:'bar',
    data:{ labels:top.map(([k])=>k), datasets:[{ label:'Qty', data:top.map(([,v])=>v) }]},
    options:{ responsive:true, plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ maxRotation:45, minRotation:0 }}} }
  });
}
function trackSale(order){
  // Optionally write analytics collection or aggregate via Cloud Functions
  addDoc(collection(db,'analytics'),{
    type:'sale',
    amount: order.pricing.total,
    at: serverTimestamp(),
    items: order.items.map(i=>({id:i.id, qty:i.qty})),
    userId: order.userId
  });
}

// ---- Cart open on load if items exist ----
updateCartCount();
if(state.cart.length>0){ /* optional: openCart(); */ }

// ---- Product modal close buttons ----
document.querySelectorAll('[data-close]').forEach(btn=>{
  btn.addEventListener('click', ()=>{ const id=btn.getAttribute('data-close'); document.getElementById(id).close(); })
});

// ---- Load products ----
loadMoreBtn.addEventListener('click', loadProductsPage);
loadProductsPage();

// ---- Toast ----
function toast(msg){
  const t = h('div'); t.textContent = msg; t.style.cssText = `
    position:fixed; left:50%; bottom:24px; transform:translateX(-50%);
    background:#0f1724; border:1px solid #243149; padding:.5rem .8rem; border-radius:.6rem; z-index:50;
  `;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 1800);
}
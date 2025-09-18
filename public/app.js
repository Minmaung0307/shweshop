import { firebaseConfig } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// EmailJS init
window.addEventListener('load', () => { if (window.emailjs) emailjs.init({ publicKey: "YOUR_EMAILJS_PUBLIC_KEY" }); });

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
  cart: loadJSON('cart', []),
  promo: null,
  membership: null,
};

// Utils
function $(s){ return document.querySelector(s) }
function h(t){ return document.createElement(t) }
function fmt(n){ return '$' + (Number(n||0).toFixed(2)) }
function loadJSON(k, d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d }catch{ return d } }
function saveJSON(k, v){ localStorage.setItem(k, JSON.stringify(v)) }
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)) }
function uid(){ return Math.random().toString(36).slice(2,10) }
function todayISO(){ return new Date().toISOString().slice(0,10) }

// DEMO PRODUCTS (more items)
const DEMO_PRODUCTS = [
  {id:'p1', title:'Classic Sushi Set', price:19.9, cat:'Food', img:'https://images.unsplash.com/photo-1553621042-f6e147245754?q=80&w=800&auto=format&fit=crop', desc:'Fresh nigiri & rolls.'},
  {id:'p2', title:'Matcha Latte', price:4.9, cat:'Drinks', img:'https://images.unsplash.com/photo-1498804103079-a6351b050096?q=80&w=800&auto=format&fit=crop', desc:'Creamy, earthy, energizing.'},
  {id:'p3', title:'Bluetooth Earbuds', price:39.0, cat:'Electronics', img:'https://images.unsplash.com/photo-1518442072051-99d3c131e1c1?q=80&w=800&auto=format&fit=crop', desc:'Clear sound, long battery.'},
  {id:'p4', title:'Handmade Tote', price:24.5, cat:'Fashion', img:'https://images.unsplash.com/photo-1547949003-9792a18a2601?q=80&w=800&auto=format&fit=crop', desc:'Durable canvas everyday bag.'},
  {id:'p5', title:'AyaPay Gift Card', price:25.0, cat:'Gift', img:'https://images.unsplash.com/photo-1557426272-fc759fdf7a8d?q=80&w=800&auto=format&fit=crop', desc:'Send love instantly.'},
  {id:'p6', title:'KBZPay Top-Up', price:10.0, cat:'Topup', img:'https://images.unsplash.com/photo-1535223289827-42f1e9919769?q=80&w=800&auto=format&fit=crop', desc:'Digital wallet recharge.'},
  {id:'p7', title:'Salmon Sashimi', price:12.9, cat:'Food', img:'https://images.unsplash.com/photo-1559305616-3f99cd43e353?q=80&w=800&auto=format&fit=crop', desc:'Premium cut, melt-in-mouth.'},
  {id:'p8', title:'Tuna Roll', price:7.9, cat:'Food', img:'https://images.unsplash.com/photo-1562158070-0bdc6aab9476?q=80&w=800&auto=format&fit=crop', desc:'Light and tasty roll.'},
  {id:'p9', title:'Iced Americano', price:3.5, cat:'Drinks', img:'https://images.unsplash.com/photo-1498804103079-a6351b050096?q=80&w=800&auto=format&fit=crop', desc:'Bold & refreshing.'},
  {id:'p10', title:'Green Tea', price:2.2, cat:'Drinks', img:'https://images.unsplash.com/photo-1442512595331-e89e73853f31?q=80&w=800&auto=format&fit=crop', desc:'Healthy classic brew.'},
  {id:'p11', title:'USB-C Cable', price:6.9, cat:'Electronics', img:'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?q=80&w=800&auto=format&fit=crop', desc:'Fast charging, durable.'},
  {id:'p12', title:'Phone Stand', price:8.0, cat:'Electronics', img:'https://images.unsplash.com/photo-1498049794561-7780e7231661?q=80&w=800&auto=format&fit=crop', desc:'Adjustable, sturdy.'},
  {id:'p13', title:'Graphic T-shirt', price:14.5, cat:'Fashion', img:'https://images.unsplash.com/photo-1520975916090-3105956dac38?q=80&w=800&auto=format&fit=crop', desc:'Soft cotton tee.'},
  {id:'p14', title:'Hoodie', price:29.0, cat:'Fashion', img:'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=800&auto=format&fit=crop', desc:'Cozy & warm.'},
  {id:'p15', title:'Gift Box S', price:9.9, cat:'Gift', img:'https://images.unsplash.com/photo-1487700160041-babef9c3cb55?q=80&w=800&auto=format&fit=crop', desc:'For small surprises.'},
  {id:'p16', title:'Gift Box L', price:19.9, cat:'Gift', img:'https://images.unsplash.com/photo-1487700160041-babef9c3cb55?q=80&w=800&auto=format&fit=crop', desc:'For big surprises.'},
  {id:'p17', title:'Jasmine Tea', price:3.0, cat:'Drinks', img:'https://images.unsplash.com/photo-1451748266019-3c100abf4f68?q=80&w=800&auto=format&fit=crop', desc:'Floral aroma.'},
  {id:'p18', title:'Nigiri Mix', price:16.9, cat:'Food', img:'https://images.unsplash.com/photo-1553621042-f6e147245754?q=80&w=800&auto=format&fit=crop', desc:'Chef selection.'},
  {id:'p19', title:'Chopsticks Set', price:5.9, cat:'Food', img:'https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=800&auto=format&fit=crop', desc:'Reusable bamboo.'},
  {id:'p20', title:'Thermal Bottle', price:18.0, cat:'Electronics', img:'https://images.unsplash.com/photo-1512428559087-560fa5ceab42?q=80&w=800&auto=format&fit=crop', desc:'Hot or cold all day.'},
  {id:'p21', title:'Sushi Knife', price:44.0, cat:'Food', img:'https://images.unsplash.com/photo-1604907053170-1c812f3b5481?q=80&w=800&auto=format&fit=crop', desc:'Sharp & precise.'},
  {id:'p22', title:'Cordless Trimmer', price:25.0, cat:'Electronics', img:'https://images.unsplash.com/photo-1560393464-5c69a73c5770?q=80&w=800&auto=format&fit=crop', desc:'Portable grooming.'},
  {id:'p23', title:'Canvas Cap', price:11.0, cat:'Fashion', img:'https://images.unsplash.com/photo-1520975916090-3105956dac38?q=80&w=800&auto=format&fit=crop', desc:'Daily essential.'},
  {id:'p24', title:'Sticker Pack', price:3.2, cat:'Gift', img:'https://images.unsplash.com/photo-1587300003388-59208cc962cb?q=80&w=800&auto=format&fit=crop', desc:'Fun & colorful.'},
];

// Elements
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
// const panels = document.querySelectorAll(".pay-panel");
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

// Sidebar open/close
btnMenu.addEventListener('click', () => sidebar.classList.add('open'));
closeSidebar.addEventListener('click', () => sidebar.classList.remove('open'));

// Auto-close sidebar when category changed ✅
categorySelect.addEventListener('change', () => {
  renderGrid();
  sidebar.classList.remove('open');
});

// ✅ Search icon ကို sidebar ဖွင့်ချင်တာသာ — DB မခေါ်ပါ
const btnSearch = document.getElementById('btnSearch');
btnSearch?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('searchInput')?.focus();
});

// Views
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

// Auth
btnUser.addEventListener('click', ()=>{
  if(state.user){
    alert(`Logged in as: ${state.user.displayName || state.user.email}`);
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

// Products (demo page)
function fillCategoriesOnce(){
  const cats = Array.from(new Set(DEMO_PRODUCTS.map(p=>p.cat)));
  state.categories = cats;
  cats.forEach(c=>{
    const opt = h('option'); opt.value=c; opt.textContent=c;
    categorySelect.appendChild(opt);
  });
}
function renderGrid(){
  const cat = categorySelect.value.trim().toLowerCase();
  const q = (searchInput.value||'').trim().toLowerCase();
  grid.innerHTML = '';
  const filtered = DEMO_PRODUCTS.filter(p=>{
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
searchInput.addEventListener('input', renderGrid);

// Product modal
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

// Cart
btnCart.addEventListener('click', openCart);
closeCart.addEventListener('click', ()=>cartDrawer.classList.remove('open'));

// ✅ Click outside main area to close cart
main.addEventListener('click', (e)=>{
  if(cartDrawer.classList.contains('open') &&
     !cartDrawer.contains(e.target) &&
     !btnCart.contains(e.target)){
    cartDrawer.classList.remove('open');
  }
});

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
          <div class="strong">${item.title}</div>
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
  if(subtotal > 100) promoCut += 0.05 * subtotal;
  if(state.promo){
    if(state.promo.type==='percent') promoCut += (state.promo.value/100)*subtotal;
    if(state.promo.type==='amount') promoCut += state.promo.value;
  }
  const rate = state.membership?.rate || 0;
  memberCut += rate * subtotal;
  const total = Math.max(0, subtotal - promoCut - memberCut);
  subtotalEl.textContent = fmt(subtotal);
  promoAmountEl.textContent = '-'+fmt(promoCut);
  memberDiscEl.textContent = '-'+fmt(memberCut);
  grandTotalEl.textContent = fmt(total);
  return { subtotal, promoCut, memberCut, total };
}

// Promo
applyPromoBtn.addEventListener('click', ()=>{
  const code = (promoCodeInput.value||'').trim().toUpperCase();
  if(!code){ state.promo=null; computeTotals(); return }
  const MAP = { 'BUYMORE10': {type:'percent', value:10}, 'WELCOME5':  {type:'amount',  value:5} };
  state.promo = MAP[code] || null;
  toast(state.promo ? 'Promo applied' : 'Invalid code');
  computeTotals();
});

// Pay tabs
const panels = document.querySelectorAll(".pay-panel"); // re-define after update?
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

// Wallet “QR”
function drawQR(canvas, text){
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d1624'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#7dd3fc';
  for(let y=0;y<canvas.height;y+=12){
    for(let x=0;x<canvas.width;x+=12){
      const v = ((x*7 + y*13 + text.length*31) % 97) > 48 ? 1:0;
      if(v) ctx.fillRect(x+2,y+2,8,8);
    }
  }
  ctx.fillStyle='#e7edf3'; ctx.fillRect(10, canvas.height-22, canvas.width-20, 16);
  ctx.fillStyle='#0b0f14'; ctx.font='12px Inter'; ctx.fillText('Demo QR', 14, canvas.height-10);
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

// PayPal
let paypalButtonsRendered=false;
function setupPayPalButtons(){
  if(!window.paypal) return;
  const container = document.getElementById('paypal-button-container');
  container.innerHTML = '';
  const { total } = computeTotals();
  window.paypal.Buttons({
    style:{ layout:'horizontal' },
    createOrder: async (data, actions)=> actions.order.create({ purchase_units:[{ amount:{ value: total.toFixed(2) } }] }),
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

// Orders & Checkout
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
  trackSale(order);
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

// EmailJS
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

// Orders list
// === Orders (fixed) ===
async function loadOrders() {
  const wrap = $("#ordersList");
  if (!state.user) {
    wrap.innerHTML = '<p class="small">Sign in to see orders.</p>';
    return;
  }
  try {
    const qref = query(
      collection(db, 'orders'),
      where('userId', '==', state.user.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const snap = await getDocs(qref);

    wrap.innerHTML = '';
    if (snap.empty) {
      wrap.innerHTML = '<p class="small">No orders yet.</p>';
      return;
    }

    snap.forEach((docu) => {
      const o = docu.data();
      const card = h('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="pad">
          <div class="row between">
            <div class="card-title">Order #${docu.id.slice(-6).toUpperCase()}</div>
            <div class="small">${o.orderDate || ''}</div>
          </div>
          <div class="small">Channel: ${o.channel || '-'} — Status: ${o.status || '-'}</div>
          <ul class="disc small">
            ${(o.items || [])
              .map(it => `<li>${it.title} × ${it.qty} — ${fmt((it.price || 0) * (it.qty || 0))}</li>`)
              .join('')}
          </ul>
          <div class="row between">
            <div>Total</div><div class="price">${fmt(o.pricing?.total || 0)}</div>
          </div>
        </div>
      `;
      wrap.appendChild(card);
    });
  } catch (e) {
    console.warn('orders load blocked', e);
    wrap.innerHTML = '<p class="small">Unable to load orders.</p>';
  }
}

// === Membership (unchanged, just tidy) ===
document.getElementById("btnMembership")?.addEventListener('click', () => memberModal.showModal());

document.getElementById("buyMembership")?.addEventListener('click', async () => {
  if (!state.user) { authModal.showModal(); return; }
  const plan = (document.querySelector('input[name="mplan"]:checked')?.value) || 'basic';
  const rate = plan === 'plus' ? 0.03 : 0.02;
  const now = Date.now(), year = 365 * 86400000;
  state.membership = { plan, rate, startTs: now, expiresTs: now + year };
  try {
    await updateDoc(doc(db, 'users', state.user.uid), { member: state.membership });
  } catch (e) {
    // user doc မတည်ရှိသေးလို့ fail ဖြစ်နိုင်လို့ fallback
    await setDoc(doc(db, 'users', state.user.uid), {
      email: state.user.email || null,
      name: state.user.displayName || '',
      createdAt: serverTimestamp(),
      member: state.membership,
      totalSpent: 0,
      firstOrderAt: null
    }, { merge: true });
  }
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

// Analytics
// Put these near the top of app.js (once only)
let revChartInst = null;
let topChartInst = null;

// === Replace your existing renderAnalytics with this whole function ===
async function renderAnalytics() {
  const revEl = document.getElementById('revChart');
  const topEl = document.getElementById('topChart');
  if (!revEl || !topEl) return; // canvases not mounted yet

  // helper: destroy old charts to avoid duplicate-instance errors
  const destroyCharts = () => {
    try { revChartInst?.destroy(); } catch {}
    try { topChartInst?.destroy(); } catch {}
    revChartInst = null;
    topChartInst = null;
  };

  // helper: draw empty charts (for logged-out or error states)
  const drawEmptyCharts = () => {
    destroyCharts();
    revChartInst = new Chart(revEl, {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Revenue', data: [] }] },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
    topChartInst = new Chart(topEl, {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Qty', data: [] }] },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  };

  // ✅ If not signed in, do NOT call Firestore. Show empty charts quietly.
  if (!state.user) {
    drawEmptyCharts();
    return;
  }

  try {
    // === Firestore query (last 30 days) ===
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const qref = query(
      collection(db, 'orders'),
      where('orderDate', '>=', since),
      limit(500)
    );
    const snap = await getDocs(qref);

    // Prepare x-axis days
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10);
      return { d, v: 0 };
    });

    // Tally revenue per day and top sellers
    const tally = {}; // title -> qty
    snap.forEach(docu => {
      const o = docu.data();
      const day = days.find(x => x.d === o.orderDate);
      if (day) day.v += Number(o?.pricing?.total || 0);
      (o.items || []).forEach(it => {
        const key = it.title || '—';
        tally[key] = (tally[key] || 0) + (it.qty || 0);
      });
    });

    // Draw charts
    destroyCharts();

    // Revenue line
    revChartInst = new Chart(revEl, {
      type: 'line',
      data: {
        labels: days.map(x => x.d.slice(5)), // MM-DD
        datasets: [{ label: 'Revenue', data: days.map(x => x.v) }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });

    // Top sellers bar (top 7)
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 7);
    topChartInst = new Chart(topEl, {
      type: 'bar',
      data: {
        labels: top.map(([k]) => k),
        datasets: [{ label: 'Qty', data: top.map(([, v]) => v) }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { maxRotation: 45 } } }
      }
    });
  } catch (e) {
    console.warn('analytics blocked', e);
    // If Firestore blocked by rules or offline, show empty charts instead of throwing
    drawEmptyCharts();
  }
}

function trackSale(order){
  addDoc(collection(db,'analytics'),{
    type:'sale',
    amount: order.pricing.total,
    at: serverTimestamp(),
    items: order.items.map(i=>({id:i.id, qty:i.qty})),
    userId: order.userId
  });
}

// Init
function init(){
  fillCategoriesOnce();
  renderGrid();
  updateCartCount();
  document.querySelectorAll('[data-close]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ const id=btn.getAttribute('data-close'); document.getElementById(id).close(); })
  });
}
init();

// Toast
function toast(msg){
  const t = h('div'); t.textContent = msg; t.style.cssText = `
    position:fixed; left:50%; bottom:24px; transform:translateX(-50%);
    background:#0f1724; border:1px solid #243149; padding:.55rem .85rem; border-radius:.7rem; z-index:50;
    font-weight:700;
  `;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 1800);
}
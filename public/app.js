// ===== Firebase v10 Modular (CDN imports) =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signOut,
  GithubAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  collection, getDocs, query, where, orderBy, limit, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ===== EmailJS init (replace with your keys) =====
const EMAILJS_PUBLIC_KEY  = "WT0GOYrL9HnDKvLUf";
const EMAILJS_SERVICE_ID  = "service_z9tkmvr";
const EMAILJS_TEMPLATE_ID = "template_q5q471f";
emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

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

// ===== Helpers =====
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const fmt = (n) => `$${Number(n||0).toFixed(2)}`;
const today = () => Timestamp.now();
const asDate = (ts) => ts?.toDate ? ts.toDate() : new Date(ts);
// NOTE: Admin custom claims must be set on a secure server (do not use require() in browser).
// Remove server-side code from client. Proceed without here.

// ===== State =====
let state = {
  user: null,
  items: [],
  cart: [],
  ads: [],
  membership: 'free',
  promo: null
};

// ===== Routing (hash) =====
const pages = {
  home: '#page-home',
  orders: '#page-orders',
  account: '#page-account',
  admin: '#page-admin'
};
function route(){
  const hash = location.hash.replace('#','') || 'home';
  $$('.page').forEach(p=>p.classList.remove('active'));
  const id = pages[hash] || pages.home;
  $(id).classList.add('active');
}
window.addEventListener('hashchange', route);

// ===== UI Bindings =====
$('#year').textContent = new Date().getFullYear();
$('#btnCart').addEventListener('click', ()=> $('#cartDrawer').showModal());
$$('[data-close]').forEach(b=> b.addEventListener('click', (e)=> e.target.closest('dialog').close()));

$('#btnLogin').addEventListener('click', ()=> $('#loginModal').showModal());
$('#btnSignup').addEventListener('click', ()=> $('#signupModal').showModal());
const forgotBtn = $('#openForgot');
if (forgotBtn) forgotBtn.addEventListener('click', ()=> { $('#loginModal').close(); $('#forgotModal').showModal(); });

$('#doLogin').addEventListener('click', async ()=>{
  const email = $('#loginEmail').value.trim();
  const pass  = $('#loginPass').value;
  try{ await signInWithEmailAndPassword(auth, email, pass); $('#loginModal').close(); }
  catch(e){ alert(e.message); }
});
const ghBtn = $('#doGitHub');
if (ghBtn) ghBtn.addEventListener('click', async ()=>{
  try{ await signInWithPopup(auth, new GithubAuthProvider()); $('#loginModal').close(); }
  catch(e){ alert(e.message); }
});
$('#doSignup').addEventListener('click', async ()=>{
  const email = $('#signupEmail').value.trim();
  const pass  = $('#signupPass').value;
  try{ await createUserWithEmailAndPassword(auth, email, pass); $('#signupModal').close(); }
  catch(e){ alert(e.message); }
});
$('#doForgot').addEventListener('click', async ()=>{
  const email = $('#forgotEmail').value.trim();
  try{ await sendPasswordResetEmail(auth, email); alert('Reset email sent'); $('#forgotModal').close(); }
  catch(e){ alert(e.message); }
});
$('#btnLogout').addEventListener('click', ()=> signOut(auth));
// Header logout (visible only when signed in)
const hdrLogout = $('#btnLogoutHeader');
if (hdrLogout) hdrLogout.addEventListener('click', ()=> signOut(auth));

$('#btnAccount').addEventListener('click', ()=>{
  if (location.hash !== '#account') { location.hash = 'account'; }
  else { route(); } // already on #account? force rerender
});

// Membership
$('#btnApplyMembership').addEventListener('click', async ()=>{
  if(!auth.currentUser) return alert('Login required');
  const level = $('#membershipLevel').value;
  try{
    await setDoc(doc(db,'users', auth.currentUser.uid), {
      membership: level, emailOptIn: $('#emailOptIn').checked
    }, { merge:true });
    alert('Membership applied');
  }catch(e){ alert(e.message); }
});
$('#btnSaveOpt').addEventListener('click', async ()=>{
  if(!auth.currentUser) return alert('Login required');
  try{
    await setDoc(doc(db,'users', auth.currentUser.uid), {
      emailOptIn: $('#emailOptIn').checked
    }, { merge:true });
    alert('Saved');
  }catch(e){ alert(e.message); }
});

// Search & filters
$('#searchForm').addEventListener('submit', (e)=>{
  e.preventDefault(); renderItems();
});
$('#filterCategory').addEventListener('change', renderItems);
$('#sortBy').addEventListener('change', renderItems);

// Cart
$('#btnCheckout').addEventListener('click', ()=> startCheckout());

// Alt payments stubs
['kbzPay','cbPay','ayaPay'].forEach(id=>{
  const el = $('#'+id);
  if(el) el.addEventListener('click', ()=>{
    alert(`${id} stub: integrate provider SDK or QR flow here.`);
  });
});

// ===== Auth State =====
onAuthStateChanged(auth, async (user)=>{
  state.user = user;

  let isAdmin = false;
  if (user) {
    const token = await user.getIdTokenResult(true);
    isAdmin = token.claims?.admin === true;
  }
  document.body.dataset.isAdmin = String(isAdmin);

  const show = (el, yes)=> el && el.classList.toggle('hidden', !yes);
  show($('#btnAccount'), !!user);
  show($('#btnLogoutHeader'), !!user);
  show($('#btnLogin'), !user);
  show($('#btnSignup'), !user);

  // Admin page/link ကို non-admin မှာ ဖျောက်
  const adminLink = document.querySelector('a[href="#admin"]');
  if (adminLink) adminLink.style.display = isAdmin ? '' : 'none';
  const adminPage = document.querySelector('#page-admin');
  if (adminPage) adminPage.style.display = isAdmin ? '' : 'none';

  if (user) {
    $('#accEmail').textContent = user.email || user.displayName || user.uid;

    const uref = doc(db,'users', user.uid);
    const snap = await getDoc(uref);
    const data = snap.exists()? snap.data() : { membership:'free', emailOptIn:false };

    state.membership = data.membership || 'free';
    $('#accMember').textContent = state.membership;

    const ml = $('#membershipLevel'); if (ml) ml.value = state.membership;
    const eo = $('#emailOptIn'); if (eo) eo.checked = !!data.emailOptIn;

    loadOrders();
  } else {
    $('#accEmail').textContent = '—';
    $('#accMember').textContent = 'free';
    const eo = $('#emailOptIn'); if (eo) eo.checked = false;
    $('#ordersList').innerHTML = '';
  }
});

// ===== Load Promotions Banner and Ads =====
async function loadPromo(){
  const snaps = await getDocs(collection(db,'promotions'));
  const active = [];
  snaps.forEach(s=>{ const d=s.data(); if(d.active) active.push(d); });
  if(active.length){
    const p = active[0];
    state.promo = p;
    const bar = $('#promoBar');
    bar.innerHTML = `<b>${p.title}</b> — ${p.message}`;
    bar.classList.remove('hidden');
  }
}
async function loadAds(){
  const snaps = await getDocs(collection(db,'ads'));
  state.ads = snaps.docs.map(d=>({id:d.id, ...d.data()}));
  const wrap = $('#adsPreview');
  if(wrap){
    wrap.innerHTML = state.ads.map(a=>`<a class="ad" href="${a.href||'#'}" target="_blank">
      <img src="${a.imageUrl||''}" alt="${a.title||''}">
      <div style="padding:6px">${a.title||''}</div>
    </a>`).join('');
  }
}

// ===== Items (Catalog) =====
async function loadItems(){
  const snaps = await getDocs(collection(db,'items'));
  state.items = snaps.docs.map(d=>({id:d.id, ...d.data()}));
  renderItems();
}
function renderItems(){
  const q = $('#searchInput').value.trim().toLowerCase();
  const cat = $('#filterCategory').value;
  const sort = $('#sortBy').value;
  let rows = [...state.items];
  if(cat && cat!=='all') rows = rows.filter(r=> (r.category||'').toLowerCase() === cat.toLowerCase());
  if(q) rows = rows.filter(r=> (r.title+" "+(r.description||""))?.toLowerCase().includes(q));
  switch(sort){
    case 'price_asc': rows.sort((a,b)=> (a.price||0)-(b.price||0)); break;
    case 'price_desc': rows.sort((a,b)=> (b.price||0)-(a.price||0)); break;
    case 'newest': rows.sort((a,b)=> asDate(b.createdAt) - asDate(a.createdAt)); break;
    case 'rating': rows.sort((a,b)=> (b.rating||0)-(a.rating||0)); break;
    default: break;
  }
  const grid = $('#grid');
  grid.innerHTML = rows.map(p=>`
    <div class="card product">
      <img src="${p.imageUrl||'https://picsum.photos/seed/'+p.id+'/600/400'}" alt="${p.title}">
      <div class="pbody">
        <div class="row" style="justify-content:space-between">
          <b>${p.title}</b><span class="rating">★ ${p.rating||'—'}</span>
        </div>
        <div class="row" style="justify-content:space-between">
          <span class="muted">${p.category||''}</span><span class="price">${fmt(p.price)}</span>
        </div>
        <button class="btn" data-open-product="${p.id}">View</button>
      </div>
    </div>`).join('');
  $$('[data-open-product]').forEach(b=> b.addEventListener('click', ()=> openProduct(b.dataset.openProduct)));
}

function openProduct(id){
  const p = state.items.find(x=>x.id===id);
  if(!p) return;
  $('#pdImg').src = p.imageUrl || 'https://picsum.photos/seed/'+p.id+'/600/400';
  $('#pdTitle').textContent = p.title;
  $('#pdDesc').textContent = p.description || '';
  $('#pdPrice').textContent = fmt(p.price);
  $('#pdRating').textContent = `★ ${p.rating||'—'}`;
  $('#pdProCode').textContent = p.proCode||'—';
  $('#pdMemberCoupon').textContent = p.memberCoupon||'—';
  $('#pdQty').value = 1;
  $('#pdAdd').onclick = ()=> addToCart(p, parseInt($('#pdQty').value||'1',10));
  $('#productModal').showModal();
}

// ===== Cart =====
function addToCart(p, qty=1){
  const ex = state.cart.find(x=>x.id===p.id);
  if(ex) ex.qty += qty; else state.cart.push({ id:p.id, title:p.title, price:p.price, imageUrl:p.imageUrl, qty });
  persistCart();
  renderCart();
  alert('Added to cart');
}
function removeFromCart(id){
  state.cart = state.cart.filter(x=>x.id!==id); persistCart(); renderCart();
}
function changeQty(id, delta){
  const it = state.cart.find(x=>x.id===id); if(!it) return;
  it.qty = Math.max(1, it.qty+delta); persistCart(); renderCart();
}
function persistCart(){ localStorage.setItem('megashop_cart', JSON.stringify(state.cart)); }
function restoreCart(){ try{ state.cart = JSON.parse(localStorage.getItem('megashop_cart')||'[]'); }catch{} }
function renderCart(){
  $('#cartCount').textContent = state.cart.reduce((a,b)=>a+b.qty,0);
  const wrap = $('#cartItems');
  wrap.innerHTML = state.cart.map(c=>`
    <div class="cart-item">
      <img src="${c.imageUrl||'https://picsum.photos/seed/'+c.id+'/80/80'}">
      <div><b>${c.title}</b><div class="muted">${fmt(c.price)} × ${c.qty}</div></div>
      <div class="qty">
        <button class="btn" onclick="changeQty('${c.id}',-1)">−</button>
        <span>${c.qty}</span>
        <button class="btn" onclick="changeQty('${c.id}',1)">+</button>
      </div>
      <button class="btn" onclick="removeFromCart('${c.id}')">Remove</button>
    </div>`).join('');
  const sub = state.cart.reduce((s,c)=> s + c.price*c.qty, 0);
  $('#cartSubtotal').textContent = fmt(sub);
}
window.changeQty = changeQty; window.removeFromCart = removeFromCart;

// ===== Checkout (PayPal) =====
async function startCheckout(){
  const amount = state.cart.reduce((s,c)=> s + c.price*c.qty, 0).toFixed(2);
  if(amount<=0){ alert('Cart empty'); return; }
  await loadPayPal();
  if(window.paypal){
    $('#paypalContainer').innerHTML = '';
    window.paypal.Buttons({
      createOrder: (data, actions)=> actions.order.create({
        purchase_units:[{ amount:{ value: amount } }]
      }),
      onApprove: (data, actions)=> actions.order.capture().then(async (details)=>{
        await placeOrder('paypal', details.id, amount);
        alert('Payment successful!');
        $('#cartDrawer').close();
      }),
      onError: (err)=> alert('PayPal error: '+err)
    }).render('#paypalContainer');
  }
}
function loadPayPal(){
  return new Promise((res)=>{
    if(window.paypal) return res();
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=AVpfmQ8DyyatFaAGQ3Jg58XtUt_2cJDr1leqcc_JI8LvKIR2N5WB_yljqCOTTCtvK1hFJ7Q9X0ojXsEC&currency=USD`;
    s.onload = res; document.body.appendChild(s);
  });
}

async function placeOrder(method, txnId, amount){
  if(!auth.currentUser){ alert('Login required'); return; }
  const items = state.cart.map(c=> ({ id:c.id, title:c.title, price:c.price, qty:c.qty }));
  const order = { userId: auth.currentUser.uid, items, amount: Number(amount), method, txnId, status:'paid', createdAt: today() };
  await addDoc(collection(db,'orders'), order);
  state.cart = []; persistCart(); renderCart(); loadOrders();
}

// ===== Orders =====
async function loadOrders(){
  if(!auth.currentUser) return;

  // No-index version
  const qref = query(
    collection(db,'orders'),
    where('userId','==',auth.currentUser.uid),
    limit(50)
  );
  const snaps = await getDocs(qref);
  const orders = snaps.docs.map(d=> ({ id:d.id, ...d.data() }));

  // optional: client-side sort by createdAt desc
  orders.sort((a,b)=> (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

  const list = $('#ordersList');
  list.innerHTML = orders.map(o=>{
    const date = (o.createdAt?.toDate?.() ?? new Date()).toLocaleString();
    const lines = (o.items||[]).map(i=> `${i.title} × ${i.qty} — $${(i.price*i.qty).toFixed(2)}`).join('<br/>');
    return `<div class="order">
      <div class="line"><b>Order #${o.id.slice(-6).toUpperCase()}</b><span>${date}</span></div>
      <div>${lines}</div>
      <div class="line"><span class="muted">${o.method} • ${o.txnId||''}</span><b>$${Number(o.amount||0).toFixed(2)}</b></div>
      <div class="row" style="margin-top:6px">
        ${(o.items||[]).map(i=> `<button class='btn' onclick="reorder('${i.id}')">Re-order ${i.title}</button>`).join('')}
      </div>
    </div>`;
  }).join('');
}
window.reorder = async function(id){
  const p = state.items.find(x=>x.id===id); if(!p) return alert('Item no longer available');
  addToCart(p, 1); $('#cartDrawer').showModal();
}

// ===== Admin: Save Item, Promo, Ad, Analytics, Feedback list, Email blast =====
$('#btnSaveItem').addEventListener('click', saveItem);
$('#btnDeleteItem').addEventListener('click', deleteItem);
$('#btnSavePromo').addEventListener('click', savePromo);
$('#btnSaveAd').addEventListener('click', saveAd);
$$('#page-admin [data-range]').forEach(b=> b.addEventListener('click', ()=> loadAnalytics(parseInt(b.dataset.range,10))));
$('#btnSendBlast').addEventListener('click', sendEmailBlast);

async function saveItem(){
  const id = $('#itemId').value.trim();
  const data = {
    title: $('#itemTitle').value.trim(),
    category: $('#itemCategory').value.trim().toLowerCase(),
    price: Number($('#itemPrice').value||0),
    rating: Number($('#itemRating').value||0),
    description: $('#itemDesc').value.trim(),
    proCode: $('#itemProCode').value.trim(),
    memberCoupon: $('#itemMemberCoupon').value.trim(),
    createdAt: today()
  };
  // upload image if present
  const file = $('#itemImage').files[0];
  if(file){
    const rid = id || crypto.randomUUID();
    const r = ref(storage, `items/${rid}/${file.name}`);
    await uploadBytes(r, file);
    data.imageUrl = await getDownloadURL(r);
    if(!id) $('#itemId').value = rid;
  }
  if(id){ await setDoc(doc(db,'items', id), data, { merge:true }); }
  else { const refDoc = await addDoc(collection(db,'items'), data); $('#itemId').value = refDoc.id; }
  alert('Saved item'); await loadItems();
}
async function deleteItem(){
  const id = $('#itemId').value.trim(); if(!id) return alert('No id');
  await deleteDoc(doc(db,'items', id)); alert('Deleted'); $('#itemId').value=''; await loadItems();
}
async function savePromo(){
  await requireAdmin(); // add this guard
  const p = { title: $('#promoTitle').value.trim(),
              message: $('#promoMessage').value.trim(),
              active: $('#promoActive').checked };
  await setDoc(doc(db,'promotions','main'), p);
  alert('Promotion saved'); await loadPromo();
}
async function saveAd(){
  await requireAdmin(); // add this guard
  const a = { title: $('#adTitle').value.trim(),
              imageUrl: $('#adImageUrl').value.trim(),
              href: $('#adHref').value.trim(),
              createdAt: today() };
  await addDoc(collection(db,'ads'), a);
  alert('Ad saved'); await loadAds();
}

async function loadAnalytics(days=7){
  const since = new Date(); since.setDate(since.getDate() - days);
  const snaps = await getDocs(query(collection(db,'orders'), orderBy('createdAt','desc'), limit(500)));
  const buckets = new Map();
  snaps.forEach(d=>{
    const o = d.data(); const dt = asDate(o.createdAt); if(dt < since) return;
    const key = dt.toISOString().slice(0,10);
    buckets.set(key, (buckets.get(key)||0) + Number(o.amount||0));
  });
  const labels = Array.from(buckets.keys()).sort();
  const data = labels.map(k=> buckets.get(k));
  const ctx = document.getElementById('salesChart').getContext('2d');
  if(window._chart) window._chart.destroy();
  window._chart = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ label:`Sales (last ${days}d)`, data }] },
    options:{ responsive:true, plugins:{ legend:{ display:true }}}
  });
}

async function listFeedback(){
  const snaps = await getDocs(collection(db,'feedback'));
  $('#feedbackList').innerHTML = snaps.docs.map(d=>{
    const f = d.data();
    return `<div class="card" style="margin:6px 0">
      <b>${f.name||'Anon'}</b> <span class="muted">${(asDate(f.createdAt)).toLocaleString()}</span>
      <div>${f.message||''}</div>
    </div>`;
  }).join('');
}

async function sendEmailBlast(){
  await requireAdmin(); // add this guard
  const msg = $('#emailBlastMsg').value.trim(); if(!msg) return alert('Message required');
  const snaps = await getDocs(collection(db,'users'));
  const recipients = snaps.docs.map(d=> ({ id:d.id, ...d.data() }))
    .filter(u=> u.emailOptIn && u.email);
  if(!recipients.length) return alert('No opted-in users');
  let sent = 0, failed = 0;
  for(const u of recipients){
    try{
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        message: msg, to_email: u.email, to_name: u.name||u.email
      });
      sent++;
    }catch(e){ failed++; console.error('EmailJS', e); }
  }
  alert(`Blast done. Sent: ${sent}, Failed: ${failed}`);
}

// ===== Feedback prompt (optional) =====
window.addEventListener('load', ()=>{
  setTimeout(()=>{
    if(confirm('Enjoying MegaShop? Send quick feedback?')){
      const message = prompt('Your feedback');
      if(message){
        addDoc(collection(db,'feedback'), { message, createdAt: today(), name: state.user?.email||'Anon' });
      }
    }
  }, 10000);
});

// ===== Init =====
async function init(){
  restoreCart(); renderCart(); route();
  await Promise.all([loadPromo(), loadAds(), loadItems()]);
  loadAnalytics(7); listFeedback();
}
init();
// OpenLearn Lite — localStorage SPA

/* ---------- helpers ---------- */
const $ = (sel, root=document)=> root.querySelector(sel);
const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));
const esc = (s)=> String(s==null?"":s).replace(/[&<>"]/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[m]));

/* ---------- storage ---------- */
const KEY_COURSES = "ol_courses";
const KEY_USER    = "ol_user";
const KEY_ENROLLS = "ol_enrolls";

const load = (k, d)=> { try{ return JSON.parse(localStorage.getItem(k)||JSON.stringify(d)); }catch{return d;} };
const save = (k, v)=> localStorage.setItem(k, JSON.stringify(v));

/* ---------- auth (demo) ---------- */
function currentUser(){ return load(KEY_USER, null); }
function setUser(u){ save(KEY_USER, u); paintAuth(); }
function paintAuth(){
  const u = currentUser();
  $("#btnLogin")?.classList.toggle("hidden", !!u);
  $("#btnAccount")?.classList.toggle("hidden", !u);
  $("#btnLogoutHeader")?.classList.toggle("hidden", !u);
  if (u) $("#who").textContent = u.email;
}

/* ---------- routing ---------- */
function showPage(id){
  $$(".page").forEach(s=>s.classList.remove("active"));
  const sec = $(`#page-${id}`);
  if (sec) sec.classList.add("active");
  if (id==="home") renderGrid();
  if (id==="admin") renderAdmin();
}
window.addEventListener("hashchange", ()=>{
  const h = (location.hash || "#home").slice(1);
  showPage(h.split("/")[0] || "home");
});

/* ---------- seed demo ---------- */
function seedDemo(){
  const now = Date.now();
  const demo = [
    {id: crypto.randomUUID(), title:"JavaScript Essentials", category:"web", level:"Beginner", price:0, rating:4.8, summary:"Start from zero.", img:"https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=1280&auto=format&fit=crop", updated: now},
    {id: crypto.randomUUID(), title:"Data Analysis", category:"data", level:"Intermediate", price:19, rating:4.6, summary:"Analyze with Python.", img:"https://images.unsplash.com/photo-1517430816045-df4b7de11d1d?q=80&w=1280&auto=format&fit=crop", updated: now},
    {id: crypto.randomUUID(), title:"Design Basics", category:"design", level:"Beginner", price:9, rating:4.4, summary:"Visual principles.", img:"https://images.unsplash.com/photo-1526498460520-4c246339dccb?q=80&w=1280&auto=format&fit=crop", updated: now},
  ];
  save(KEY_COURSES, demo);
  renderGrid();
  renderAdmin();
}

/* ---------- courses ---------- */
function getCourses(){ return load(KEY_COURSES, []); }
function setCourses(a){ save(KEY_COURSES, a); }

function renderGrid(){
  const grid = $("#grid"); if (!grid) return;
  const list = getCourses();
  // categories
  const cats = Array.from(new Set(list.map(x=>x.category).filter(Boolean))).sort();
  const sel = $("#filterCategory");
  if (sel && sel.children.length<=1){
    cats.forEach(c=>{
      const o = document.createElement("option");
      o.value=c; o.textContent=c;
      sel.appendChild(o);
    });
  }
  const want = sel?.value || "all";
  const sort = $("#sortBy")?.value || "featured";

  let arr = list.slice();
  if (want && want!=="all") arr = arr.filter(x=> String(x.category||"").toLowerCase() === String(want).toLowerCase());
  if (sort==="price_asc") arr.sort((a,b)=> (a.price||0)-(b.price||0));
  if (sort==="price_desc") arr.sort((a,b)=> (b.price||0)-(a.price||0));
  if (sort==="rating") arr.sort((a,b)=> (b.rating||0)-(a.rating||0));
  if (sort==="newest") arr.sort((a,b)=> (b.updated||0)-(a.updated||0));

  grid.innerHTML = arr.map(c=>`
    <div class="card course" data-id="${esc(c.id)}">
      <img src="${esc(c.img||"https://picsum.photos/seed/"+c.id+"/640/360")}" alt="">
      <div class="pbody">
        <div class="row" style="justify-content:space-between">
          <b>${esc(c.title)}</b>
          <span class="price">${c.price>0?"$"+Number(c.price).toFixed(2):"Free"}</span>
        </div>
        <div class="muted">${esc(c.category||"")} • ${esc(c.level||"")} • ⭐ ${c.rating||"—"}</div>
        <div class="muted">${esc(c.summary||"")}</div>
        <div class="row" style="justify-content:flex-end">
          <button class="btn" data-view="${esc(c.id)}">Details</button>
          <button class="btn primary" data-enroll="${esc(c.id)}">Enroll</button>
        </div>
      </div>
    </div>
  `).join("") or "<div class='card'>No courses yet. Click “Seed Demo Courses”.</div>";

  grid.querySelectorAll("[data-view]").forEach(b=> b.onclick=()=> openCourse(b.getAttribute("data-view")));
  grid.querySelectorAll("[data-enroll]").forEach(b=> b.onclick=()=> enrollCourse(b.getAttribute("data-enroll")));
}

let _curCourse=null;
function openCourse(id){
  const c = getCourses().find(x=>x.id===id); if (!c) return;
  _curCourse = c;
  $("#pdImg").src = c.img || "";
  $("#pdTitle").textContent = c.title || "";
  $("#pdDesc").textContent = c.summary || "";
  $("#pdPrice").textContent = c.price>0 ? "$"+Number(c.price).toFixed(2) : "Free";
  $("#pdRating").textContent = "⭐ "+(c.rating||0);
  $("#courseModal")?.showModal();
}
$("#pdEnroll")?.addEventListener("click", ()=>{
  if (!_curCourse) return;
  enrollCourse(_curCourse.id);
  $("#courseModal")?.close();
});

function getEnrolls(){ return load(KEY_ENROLLS, []); }
function setEnrolls(a){ save(KEY_ENROLLS, a); }
function enrollCourse(id){
  const u = currentUser();
  if (!u){ $("#loginModal").showModal(); return; }
  const list = getEnrolls();
  if (!list.includes(id)) list.push(id);
  setEnrolls(list);
  alert("Enrolled!");
}

/* ---------- admin ---------- */
function openItemModal(item){
  $("#itemModalTitle").textContent = item ? "Edit Course" : "Add Course";
  $("#itemId").value = item?.id || "";
  $("#itemTitle").value = item?.title || "";
  $("#itemCategory").value = item?.category || "";
  $("#itemLevel").value = item?.level || "";
  $("#itemPrice").value = item?.price ?? "";
  $("#itemRating").value = item?.rating ?? "";
  $("#itemDesc").value = item?.summary || "";
  $("#itemThumb").value = item?.img || "";
  $("#btnDeleteItem").classList.toggle("hidden", !item);
  $("#itemModal").showModal();
}
function renderAdmin(){
  const tb = $("#adminTable tbody"); if (!tb) return;
  const list = getCourses();
  tb.innerHTML = list.map(c=>`
    <tr>
      <td>${esc(c.title)}</td>
      <td class="muted">${esc(c.category||"")}</td>
      <td>${c.price>0?"$"+Number(c.price).toFixed(2):"Free"}</td>
      <td>${c.rating||"—"}</td>
      <td class="muted">${new Date(c.updated||Date.now()).toLocaleDateString()}</td>
      <td style="text-align:right">
        <div class="actions">
          <button class="btn" data-edit="${c.id}">Edit</button>
          <button class="btn danger" data-del="${c.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join("") or "<tr><td class='muted' colspan='6'>No courses. Click “Add Course”.</td></tr>";
  tb.querySelectorAll("[data-edit]").forEach(b=> b.onclick=()=>{
    const it = getCourses().find(x=>x.id===b.getAttribute("data-edit"));
    openItemModal(it);
  });
  tb.querySelectorAll("[data-del]").forEach(b=> b.onclick=()=>{
    const id = b.getAttribute("data-del");
    const rest = getCourses().filter(x=>x.id!==id);
    setCourses(rest);
    renderAdmin(); renderGrid();
  });
}

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", ()=>{
  showPage((location.hash||"#home").slice(1) || "home");
  paintAuth();
  renderGrid();

  // header
  $("#btnLogin").onclick = ()=> $("#loginModal").showModal();
  $("#btnLogoutHeader").onclick = ()=> setUser(null);
  $("#btnAccount").onclick = ()=> alert("Logged in as: "+(currentUser()?.email||""));

  // login
  $("#btnDoLogin").onclick = ()=>{
    const email = ($("#loginEmail").value||"").trim();
    if (!email) return;
    setUser({ email });
    $("#loginModal").close();
  };

  // modal close
  document.body.addEventListener("click", (e)=>{
    const t = e.target;
    if (t.matches("[data-close]")) t.closest("dialog")?.close();
  });

  // seed & admin add
  $("#btnSeedDemo").onclick = seedDemo;
  $("#btnAddItemTop").onclick = ()=> openItemModal(null);

  // save / delete
  $("#btnSaveItem").onclick = ()=>{
    const id = $("#itemId").value || crypto.randomUUID();
    const rec = {
      id,
      title: $("#itemTitle").value.trim(),
      category: $("#itemCategory").value.trim(),
      level: $("#itemLevel").value.trim(),
      price: Number($("#itemPrice").value||0),
      rating: Number($("#itemRating").value||0),
      summary: $("#itemDesc").value.trim(),
      img: $("#itemThumb").value.trim(),
      updated: Date.now()
    };
    const list = getCourses();
    const ix = list.findIndex(x=>x.id===id);
    if (ix>=0) list[ix]=rec; else list.push(rec);
    setCourses(list);
    $("#itemModal").close();
    renderAdmin(); renderGrid();
  };
  $("#btnDeleteItem").onclick = ()=>{
    const id = $("#itemId").value;
    if (!id) return;
    setCourses(getCourses().filter(x=>x.id!==id));
    $("#itemModal").close();
    renderAdmin(); renderGrid();
  };

  // filters
  $("#filterCategory").addEventListener("change", renderGrid);
  $("#sortBy").addEventListener("change", renderGrid);
});

/*
  SETUP: Paste your Supabase Project URL and publishable/anon key below.
  Never put a Supabase service_role/secret key in browser code.
*/
const SUPABASE_URL = window.https://dhndbdcigcpcdljtvzna.supabase.co || "";
const SUPABASE_PUBLISHABLE_KEY = window.sb_publishable_If3orw2w2aeUvokLpEmh0A_THIm7kgd || "";
const STORAGE_BUCKET = "gallery";

const $ = (id) => document.getElementById(id);
const configured = SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("PASTE_") && !SUPABASE_PUBLISHABLE_KEY.includes("PASTE_");
let supabase = null;
if (configured && window.supabase) {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
$("year").textContent = new Date().getFullYear();

function notify(message, bad = false) {
  const el = $("notice");
  el.textContent = message;
  el.classList.remove("hidden", "bad");
  if (bad) el.classList.add("bad");
  window.setTimeout(() => el.classList.add("hidden"), 5000);
}
function esc(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function requireConfig() {
  if (!supabase) {
    $("login-error").textContent = "Setup needed: add your Supabase URL and publishable key in admin.js.";
    return false;
  }
  return true;
}
async function isAdmin(userId) {
  const { data, error } = await supabase.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
async function showApp(user) {
  if (!user) return showLogin();
  try {
    if (!(await isAdmin(user.id))) {
      await supabase.auth.signOut();
      $("login-error").textContent = "This account is not approved as an admin.";
      return showLogin();
    }
    $("login-view").classList.add("hidden");
    $("app-view").classList.remove("hidden");
    await loadOverview();
  } catch (e) {
    $("login-error").textContent = "Could not verify admin access. Check your Supabase SQL policies.";
    console.error(e);
    showLogin();
  }
}
function showLogin() {
  $("app-view").classList.add("hidden");
  $("login-view").classList.remove("hidden");
}
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-error").textContent = "";
  if (!requireConfig()) return;
  const button = e.currentTarget.querySelector("button");
  button.disabled = true; button.textContent = "Signing in…";
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: $("email").value.trim(), password: $("password").value
    });
    if (error) throw error;
    await showApp(data.user);
  } catch (err) {
    $("login-error").textContent = err.message || "Login failed.";
  } finally {
    button.disabled = false; button.innerHTML = 'Sign in <span>↗</span>';
  }
});
$("logout").addEventListener("click", async () => {
  if (supabase) await supabase.auth.signOut();
  showLogin();
});
if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) setTimeout(() => showApp(session.user), 0);
    else showLogin();
  });
  supabase.auth.getSession().then(({data}) => showApp(data.session?.user || null));
}

function navigate(page) {
  document.querySelectorAll(".page").forEach(el => el.classList.add("hidden"));
  $("page-" + page).classList.remove("hidden");
  document.querySelectorAll(".nav").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  const labels = {overview:"Overview",gallery:"Gallery",messages:"Messages",bookings:"Bookings",settings:"Website settings"};
  $("page-title").textContent = labels[page] || "Overview";
  $("page-kicker").textContent = page === "overview" ? "YOUR WORKSPACE" : "STUDIO MANAGEMENT";
  if (page === "gallery") loadGallery();
  if (page === "messages") loadMessages();
  if (page === "bookings") loadBookings();
  if (page === "settings") loadSettings();
}
document.querySelectorAll("[data-page]").forEach(btn => btn.addEventListener("click", () => navigate(btn.dataset.page)));
document.querySelectorAll("[data-go]").forEach(btn => btn.addEventListener("click", () => navigate(btn.dataset.go)));

async function loadOverview() {
  if (!supabase) return;
  const [photos, messages, bookings] = await Promise.all([
    supabase.from("gallery_photos").select("id", {count:"exact",head:true}),
    supabase.from("contact_messages").select("id", {count:"exact",head:true}).eq("is_read", false),
    supabase.from("booking_requests").select("id", {count:"exact",head:true})
  ]);
  $("stat-photos").textContent = photos.count ?? "—";
  $("stat-messages").textContent = messages.count ?? "—";
  $("stat-bookings").textContent = bookings.count ?? "—";
}
async function loadGallery() {
  const root = $("gallery-list"); root.innerHTML = '<div class="empty">Loading gallery…</div>';
  const {data,error} = await supabase.from("gallery_photos").select("*").order("created_at",{ascending:false});
  if (error) { root.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
  if (!data.length) { root.innerHTML = '<div class="empty">No photos yet. Upload your first image above.</div>'; return; }
  root.innerHTML = data.map(p => `<article class="photo-card"><img src="${esc(p.image_url)}" alt="${esc(p.title)}" loading="lazy"><div class="photo-info"><strong>${esc(p.title)}</strong><small>${esc(p.category || "Uncategorized")}</small><button class="danger" data-delete-photo="${esc(p.id)}" data-path="${esc(p.storage_path || "")}">Delete photo</button></div></article>`).join("");
  root.querySelectorAll("[data-delete-photo]").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("Delete this photo from the gallery?")) return;
    try {
      const id = btn.dataset.deletePhoto, path = btn.dataset.path;
      const {error:dbError} = await supabase.from("gallery_photos").delete().eq("id",id);
      if (dbError) throw dbError;
      if (path) {
        const {error:storageError} = await supabase.storage.from(STORAGE_BUCKET).remove([path]);
        if (storageError) console.warn("DB row removed; storage cleanup failed:", storageError.message);
      }
      notify("Photo deleted."); await loadGallery(); await loadOverview();
    } catch(e) { notify(e.message, true); }
  }));
}
$("photo-form").addEventListener("submit", async e => {
  e.preventDefault();
  const file = $("photo-file").files[0];
  if (!file) return;
  if (!["image/jpeg","image/png","image/webp"].includes(file.type)) return notify("Use a JPG, PNG or WebP image.",true);
  if (file.size > 10 * 1024 * 1024) return notify("Maximum image size is 10 MB.",true);
  const button = e.currentTarget.querySelector("button"); button.disabled = true; button.textContent = "Uploading…";
  try {
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g,"-");
    const path = `${crypto.randomUUID()}-${safeName}`;
    const {error:uploadError} = await supabase.storage.from(STORAGE_BUCKET).upload(path,file,{contentType:file.type,upsert:false});
    if (uploadError) throw uploadError;
    const {data:publicData} = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    const {error:insertError} = await supabase.from("gallery_photos").insert({
      title:$("photo-title").value.trim(), category:$("photo-category").value.trim() || null,
      image_url:publicData.publicUrl, storage_path:path
    });
    if (insertError) {
      await supabase.storage.from(STORAGE_BUCKET).remove([path]);
      throw insertError;
    }
    e.currentTarget.reset(); notify("Photo uploaded."); await loadGallery(); await loadOverview();
  } catch(err) { notify(err.message || "Upload failed.",true); }
  finally { button.disabled = false; button.textContent = "Upload photo ↑"; }
});

async function loadMessages() {
  const root = $("messages-list"); root.innerHTML = '<div class="empty">Loading messages…</div>';
  const {data,error} = await supabase.from("contact_messages").select("*").order("created_at",{ascending:false});
  if(error){root.innerHTML=`<div class="empty">${esc(error.message)}</div>`;return}
  if(!data.length){root.innerHTML='<div class="empty">No customer messages yet.</div>';return}
  root.innerHTML=data.map(m=>`<article class="data-item"><div class="meta"><span>${esc(m.name)} · ${esc(m.email)}</span><span>${esc(new Date(m.created_at).toLocaleString())}</span></div><p>${esc(m.message)}</p><div class="item-actions"><button class="secondary" data-read="${esc(m.id)}" data-state="${m.is_read}">${m.is_read?"Mark unread":"Mark read"}</button><button class="danger" data-delete-message="${esc(m.id)}">Delete</button></div></article>`).join("");
  root.querySelectorAll("[data-read]").forEach(b=>b.addEventListener("click",async()=>{const {error}=await supabase.from("contact_messages").update({is_read:b.dataset.state!=="true"}).eq("id",b.dataset.read);if(error)notify(error.message,true);else{await loadMessages();await loadOverview()}}));
  root.querySelectorAll("[data-delete-message]").forEach(b=>b.addEventListener("click",async()=>{if(!confirm("Delete this message?"))return;const {error}=await supabase.from("contact_messages").delete().eq("id",b.dataset.deleteMessage);if(error)notify(error.message,true);else{notify("Message deleted.");await loadMessages();await loadOverview()}}));
}
$("refresh-messages").addEventListener("click",loadMessages);

async function loadBookings() {
  const root = $("bookings-list"); root.innerHTML = '<div class="empty">Loading bookings…</div>';
  const {data,error}=await supabase.from("booking_requests").select("*").order("created_at",{ascending:false});
  if(error){root.innerHTML=`<div class="empty">${esc(error.message)}</div>`;return}
  if(!data.length){root.innerHTML='<div class="empty">No booking requests yet.</div>';return}
  const statuses=["pending","confirmed","completed","cancelled"];
  root.innerHTML=data.map(b=>`<article class="data-item"><div class="meta"><span>${esc(b.name)} · ${esc(b.email)}</span><span>${esc(new Date(b.created_at).toLocaleString())}</span></div><p><b>Session:</b> ${esc(b.session_type||"Not specified")} &nbsp; <b>Date:</b> ${esc(b.preferred_date||"Flexible")}</p><p>${esc(b.notes||"No additional notes.")}</p><div class="item-actions"><select aria-label="Booking status" data-booking-status="${esc(b.id)}">${statuses.map(s=>`<option value="${s}" ${s===b.status?"selected":""}>${s[0].toUpperCase()+s.slice(1)}</option>`).join("")}</select><button class="danger" data-delete-booking="${esc(b.id)}">Delete</button></div></article>`).join("");
  root.querySelectorAll("[data-booking-status]").forEach(sel=>sel.addEventListener("change",async()=>{const {error}=await supabase.from("booking_requests").update({status:sel.value}).eq("id",sel.dataset.bookingStatus);if(error)notify(error.message,true);else notify("Booking status updated.")}));
  root.querySelectorAll("[data-delete-booking]").forEach(b=>b.addEventListener("click",async()=>{if(!confirm("Delete this booking request?"))return;const {error}=await supabase.from("booking_requests").delete().eq("id",b.dataset.deleteBooking);if(error)notify(error.message,true);else{notify("Booking deleted.");await loadBookings();await loadOverview()}}));
}
$("refresh-bookings").addEventListener("click",loadBookings);

async function loadSettings() {
  const {data,error}=await supabase.from("site_settings").select("*").eq("id",1).maybeSingle();
  if(error){notify(error.message,true);return}
  $("setting-title").value=data?.site_title||"";
  $("setting-subtitle").value=data?.hero_subtitle||"";
  $("setting-email").value=data?.contact_email||"";
}
$("settings-form").addEventListener("submit",async e=>{
  e.preventDefault();
  const {error}=await supabase.from("site_settings").upsert({id:1,site_title:$("setting-title").value.trim(),hero_subtitle:$("setting-subtitle").value.trim(),contact_email:$("setting-email").value.trim()},{onConflict:"id"});
  if(error)notify(error.message,true);else notify("Settings saved. Connect these fields to your public website to show the changes.");
});

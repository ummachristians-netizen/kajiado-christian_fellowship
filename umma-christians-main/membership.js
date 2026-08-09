import { auth, db, hasSupabaseConfig } from "./firebase-config.js";
import {
  addDoc,
  collection,
  createUserWithEmailAndPassword,
  doc,
  get,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  query,
  sendPasswordResetEmail,
  setDoc,
  signInWithEmailAndPassword,
  signOut,
  updateDoc
} from "./supabase-firebase-compat.js";

const CHANNEL_URL = "https://whatsapp.com/channel/0029Vb8PwvSGJP897JzdL01F";

const state = {
  user: null,
  profile: null,
  notifications: [],
  events: [],
  responses: []
};

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 2800);
}

function setAuthView(view) {
  $("loginPanel")?.classList.toggle("hidden", view !== "login");
  $("registerPanel")?.classList.toggle("hidden", view !== "register");
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
}

function setSection(section) {
  document.querySelectorAll(".dash-section").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll(".dash-tab").forEach((el) => el.classList.toggle("active", el.dataset.section === section));
  $(`${section}Section`)?.classList.add("active");
}

function showSuccess(profile) {
  $("successOrg").textContent = profile.name || "-";
  $("successCode").textContent = profile.code || "-";
  $("successText").textContent = "Your organization has been registered with KCF.";
  $("successModal")?.classList.remove("hidden");
}

function hideSuccess() {
  $("successModal")?.classList.add("hidden");
}

function openDrawer(id) {
  $(id)?.classList.remove("hidden");
}

function closeDrawer(id) {
  $(id)?.classList.add("hidden");
}

function normalize(text) {
  return String(text ?? "").trim();
}

function makeMemberCode() {
  return `KCF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function makeTempPassword() {
  return `Kcf${Math.random().toString(36).slice(2, 8)}9!`;
}

function requireFields(ids) {
  for (const id of ids) {
    if (!normalize($(id)?.value).length) return false;
  }
  return true;
}

async function saveProfile(profile) {
  await setDoc(doc(db, "members", state.user.id), profile);
  state.profile = profile;
}

async function loadProfile() {
  if (!state.user) return null;
  const snap = await get(doc(db, "members", state.user.id));
  return snap.exists() ? snap.data() : null;
}

async function findProfileByCodeOrEmail(codeOrEmail) {
  const needle = normalize(codeOrEmail).toLowerCase();
  const snap = await new Promise((resolve, reject) => {
    onSnapshot(query(collection(db, "members"), orderBy("createdAt", "desc")), resolve, reject);
  });
  return snap.docs.map((entry) => entry.data()).find((profile) => {
    return normalize(profile.email).toLowerCase() === needle || normalize(profile.code).toLowerCase() === needle;
  }) || null;
}

function renderProfile(profile) {
  const safe = profile || {};
  $("orgWelcomeName").textContent = safe.name || "Organization";
  $("orgWelcomeLead").textContent = safe.description || "Your membership portal is ready.";
  $("orgLogoPreview").src = safe.logoUrl || "logo.svg";
  $("membershipStatusText").textContent = String(safe.status || "Pending Approval").toUpperCase();
  $("memberCodeText").textContent = `Member ID: ${safe.code || "-"}`;

  const details = [
    ["Organization", safe.name],
    ["Type", safe.type],
    ["Contact", safe.contactName],
    ["Role", safe.role],
    ["Phone", safe.phone],
    ["Email", safe.email],
    ["Location", safe.location],
    ["County", safe.county],
    ["Town", safe.town],
    ["Website", safe.website],
    ["Description", safe.description]
  ];
  $("overviewDetails").innerHTML = details
    .filter(([, value]) => value)
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("") || "<div><span>No profile data yet.</span><strong>Complete your organization profile.</strong></div>";

  $("profileName").value = safe.name || "";
  $("profileType").value = safe.type || "";
  $("profileContact").value = safe.contactName || "";
  $("profilePhone").value = safe.phone || "";
  $("profileEmail").value = safe.email || "";
  if ($("profileLocation")) $("profileLocation").value = safe.location || "";
  if ($("profileWebsite")) $("profileWebsite").value = safe.website || "";
  if ($("profileLogo")) $("profileLogo").value = safe.logoUrl || "";
  if ($("profileDescription")) $("profileDescription").value = safe.description || "";

  $("statPosted").textContent = String(state.events.filter((item) => item.memberId === state.user.id).length);
  $("statResponses").textContent = String(state.responses.length);
  $("statPolls").textContent = String(state.events.length);
  $("statUpcoming").textContent = String(state.events.filter((item) => new Date(item.date) >= new Date()).length);
}

function renderNotifications() {
  const feed = state.notifications.length
    ? state.notifications.map((item) => `<div class="feed-item"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p></div>`).join("")
    : `<div class="feed-item"><strong>You're all caught up.</strong><p>New KCF updates and notifications will appear here.</p></div>`;
  $("notificationFeed").innerHTML = feed;
  $("drawerFeed").innerHTML = feed;
}

function renderEvents() {
  const eventsFeed = $("eventsFeed");
  if (!state.events.length) {
    eventsFeed.innerHTML = `<article class="glass-panel"><h3>No upcoming events yet.</h3><p>Stay connected for upcoming KCF and member activities.</p><button class="button button-primary" id="emptyCreateEventBtn" type="button">Create Your First Event</button></article>`;
    $("emptyCreateEventBtn")?.addEventListener("click", () => openDrawer("eventDrawer"));
    return;
  }

  const myResponses = new Map(state.responses.map((row) => [row.eventId, row.response]));
  eventsFeed.innerHTML = state.events.map((event) => {
    const yes = Number(event.pollYes || 0);
    const maybe = Number(event.pollMaybe || 0);
    const no = Number(event.pollNo || 0);
    const total = yes + maybe + no || 1;
    const current = myResponses.get(event.id);
    const isKcf = event.sourceType === "kcf";
    const organizerLabel = isKcf ? "KCF" : (event.organizer || "Member Event");
    const share = Math.round((yes / total) * 100);
    return `
      <article class="event-card reveal is-visible">
        <div class="event-top">
          <span class="chip">${isKcf ? "KCF" : "Member Event"}</span>
          <span class="chip">${escapeHtml(event.category || "General")}</span>
        </div>
        <h3>${escapeHtml(event.title)}</h3>
        <div class="event-meta">
          <span><strong>Organizer:</strong> ${escapeHtml(organizerLabel)}</span>
          <span>${escapeHtml(event.date)}</span>
          <span>${escapeHtml(event.startTime || "")}${event.endTime ? ` - ${escapeHtml(event.endTime)}` : ""}</span>
          <span>${escapeHtml(event.venue || "")}</span>
        </div>
        <p>${escapeHtml(event.description || "")}</p>
        <div class="poll-track"><span style="width:${share}%"></span></div>
        <div class="event-meta"><span>YES - ${yes}</span><span>MAYBE - ${maybe}</span><span>NO - ${no}</span></div>
        <div class="poll-actions">
          <button class="button button-primary" data-vote="${event.id}" data-response="yes" type="button">Yes, I will attend</button>
          <button class="button button-secondary" data-vote="${event.id}" data-response="maybe" type="button">Maybe</button>
          <button class="button button-ghost" data-vote="${event.id}" data-response="no" type="button">No, I cannot attend</button>
        </div>
        <p class="muted">${current ? `Thank you for responding. Your attendance is recorded.` : "Will you be joining us?"}</p>
      </article>`;
  }).join("");

  eventsFeed.querySelectorAll("[data-vote]").forEach((button) => {
    button.addEventListener("click", async () => {
      await submitPoll(button.getAttribute("data-vote"), button.getAttribute("data-response"));
    });
  });
}

async function submitPoll(eventId, response) {
  if (!state.user) return showToast("Please log in first.");
  const existing = state.responses.find((item) => item.eventId === eventId);
  const eventRef = doc(db, "member_events", eventId);
  const eventSnap = await get(eventRef);
  if (!eventSnap.exists()) return showToast("Event not found.");
  const eventData = eventSnap.data();

  if (existing) {
    const old = existing.response;
    const next = { yes: Number(eventData.pollYes || 0), maybe: Number(eventData.pollMaybe || 0), no: Number(eventData.pollNo || 0) };
    next[old] = Math.max(0, next[old] - 1);
    next[response] += 1;
    await updateDoc(eventRef, { pollYes: next.yes, pollMaybe: next.maybe, pollNo: next.no });
    await setDoc(doc(db, "event_polls", `${eventId}_${state.user.id}`), { eventId, memberId: state.user.id, response }, { merge: true });
    existing.response = response;
  } else {
    const next = { yes: Number(eventData.pollYes || 0), maybe: Number(eventData.pollMaybe || 0), no: Number(eventData.pollNo || 0) };
    next[response] += 1;
    await updateDoc(eventRef, { pollYes: next.yes, pollMaybe: next.maybe, pollNo: next.no });
    await setDoc(doc(db, "event_polls", `${eventId}_${state.user.id}`), { eventId, memberId: state.user.id, response }, { merge: true });
    state.responses.push({ eventId, response });
  }
    showToast("Thank you for responding.");
  await loadEventsAndResponses();
}

async function loadEventsAndResponses() {
  if (!state.user) return;
  const eventsSnap = await new Promise((resolve, reject) => {
    onSnapshot(query(collection(db, "member_events"), orderBy("createdAt", "desc")), resolve, reject);
  });
  state.events = eventsSnap.docs.map((docSnap) => docSnap.data());

  const responseSnap = await new Promise((resolve, reject) => {
    onSnapshot(query(collection(db, "event_polls"), orderBy("createdAt", "desc")), resolve, reject);
  });
  state.responses = responseSnap.docs.map((docSnap) => docSnap.data()).filter((item) => item.memberId === state.user.id);
}

async function loadNotifications() {
  if (!state.user) return;
  const snap = await new Promise((resolve, reject) => {
    onSnapshot(query(collection(db, "notifications"), orderBy("createdAt", "desc")), resolve, reject);
  });
  state.notifications = snap.docs.map((docSnap) => docSnap.data()).slice(0, 8);
}

function attachCommonHandlers() {
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setAuthView(button.dataset.view)));
  document.querySelectorAll("[data-close-success]").forEach((button) => button.addEventListener("click", hideSuccess));
  document.querySelectorAll("[data-section]").forEach((button) => button.addEventListener("click", () => setSection(button.dataset.section)));
  $("continuePortalBtn")?.addEventListener("click", () => {
    hideSuccess();
    setAuthView("login");
  });
  $("logoutBtn")?.addEventListener("click", async () => {
    await signOut(auth);
    window.location.reload();
  });
  $("notificationsBtn")?.addEventListener("click", () => openDrawer("notificationsDrawer"));
  $("mobileNotificationBtn")?.addEventListener("click", () => openDrawer("notificationsDrawer"));
  $("mobileMenuBtn")?.addEventListener("click", () => {
    showToast("Use the dashboard tabs below on mobile.");
  });
  document.querySelectorAll("[data-close-drawer]").forEach((button) => button.addEventListener("click", () => closeDrawer("notificationsDrawer")));
  document.querySelectorAll("[data-close-event-drawer]").forEach((button) => button.addEventListener("click", () => closeDrawer("eventDrawer")));
  $("openCreateEventBtn")?.addEventListener("click", () => openDrawer("eventDrawer"));
  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const field = document.querySelector(button.dataset.togglePassword);
      if (!field) return;
      field.type = field.type === "password" ? "text" : "password";
      button.textContent = field.type === "password" ? "Show" : "Hide";
    });
  });
  document.querySelectorAll(".dash-tab").forEach((button) => button.addEventListener("click", () => setSection(button.dataset.section)));
}

async function loginMember(codeOrEmail, password) {
  const normalized = normalize(codeOrEmail);
  const email = normalized.includes("@") ? normalized : (await findProfileByCodeOrEmail(normalized))?.email;
  if (!email) throw new Error("Member profile not found.");
  const result = await signInWithEmailAndPassword(auth, email, password);
  state.user = result.user;
}

function canAccessPortal(profile) {
  const status = normalize(profile?.status).toLowerCase();
  return status === "active" || status === "approved";
}

async function handleRegister(event) {
  event.preventDefault();
  if (!requireFields(["orgName","orgType","location","county","contactName","phone","email"])) {
    return showToast("Please complete all required fields.");
  }
  const password = makeTempPassword();
  const email = $("email").value.trim().toLowerCase();
  try {
    const authResult = await createUserWithEmailAndPassword(auth, email, password);
    state.user = authResult.user;
    const profile = {
      userId: authResult.user.id,
      code: makeMemberCode(),
      name: $("orgName").value.trim(),
      type: $("orgType").value,
      location: $("location").value.trim(),
      county: $("county").value.trim(),
      contactName: $("contactName").value.trim(),
      phone: $("phone").value.trim(),
      email,
      status: "Pending Approval",
      tempPassword: password,
      createdAt: new Date().toISOString()
    };
    await saveProfile(profile);
    renderProfile(profile);
    showSuccess(profile);
    setAuthView("login");
    $("loginCode").value = email;
    $("loginPassword").value = password;
    showToast("Registration saved successfully.");
  } catch (error) {
    console.error(error);
    showToast("Your registration could not be completed.");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  if (!normalize($("loginCode").value) || !normalize($("loginPassword").value)) return showToast("Enter your member code/email and password.");
  try {
    await loginMember($("loginCode").value, $("loginPassword").value);
    state.profile = await loadProfile();
    if (!state.profile) {
      await signOut(auth);
      showToast("Member profile not found.");
      return;
    }
    if (!canAccessPortal(state.profile)) {
      await signOut(auth);
      showToast("Your organization is pending approval. Please wait for KCF to approve your account before login.");
      return;
    }
    renderProfile(state.profile);
    $("authScreen")?.classList.add("hidden");
    $("dashboardShell")?.classList.remove("hidden");
    await loadEventsAndResponses();
    await loadNotifications();
    renderEvents();
    renderNotifications();
  } catch (error) {
    console.error(error);
    showToast("Invalid member credentials.");
  }
}

async function handleEventSubmit(event, sourceType = "member") {
  event.preventDefault();
  if (!state.user || !state.profile) return showToast("Please log in first.");
  const title = normalize($(sourceType === "member" ? "eventTitle" : "drawerEventTitle").value);
  if (!title) return showToast("Enter an event title.");
  const payload = {
    memberId: state.user.id,
    memberCode: state.profile.code,
    organizer: sourceType === "kcf" ? "Kajiado Christian Fellowship" : state.profile.name,
    organizerType: state.profile.type,
    sourceType: sourceType === "kcf" ? "kcf" : "member",
    title,
    description: normalize($(sourceType === "member" ? "eventDescription" : "drawerEventDescription").value),
    category: normalize($(sourceType === "member" ? "eventCategory" : "drawerEventCategory").value),
    date: $(sourceType === "member" ? "eventDate" : "drawerEventDate").value,
    startTime: $(sourceType === "member" ? "eventStart" : "drawerEventStart").value,
    endTime: $(sourceType === "member" ? "eventEnd" : "drawerEventEnd").value,
    venue: normalize($(sourceType === "member" ? "eventVenue" : "drawerEventVenue").value),
    contactInfo: normalize($(sourceType === "member" ? "eventContact" : "drawerEventContact").value),
    bannerUrl: normalize($(sourceType === "member" ? "eventBanner" : "drawerEventBanner").value),
    registrationLink: normalize($(sourceType === "member" ? "eventLink" : "drawerEventLink").value),
    pollYes: 0,
    pollMaybe: 0,
    pollNo: 0,
    createdAt: new Date().toISOString()
  };
  try {
    await addDoc(collection(db, "member_events"), payload);
    showToast("Event published successfully.");
    closeDrawer("eventDrawer");
    await loadEventsAndResponses();
    renderEvents();
  } catch (error) {
    console.error(error);
    showToast("Unable to publish event right now.");
  }
}

async function handleProfileSubmit(event) {
  event.preventDefault();
  if (!state.user || !state.profile) return;
  const updated = {
    ...state.profile,
    name: $("profileName").value.trim(),
    type: $("profileType").value.trim(),
    contactName: $("profileContact").value.trim(),
    phone: $("profilePhone").value.trim(),
    email: $("profileEmail").value.trim(),
    location: $("profileLocation").value.trim(),
    website: $("profileWebsite").value.trim(),
    logoUrl: $("profileLogo").value.trim(),
    description: $("profileDescription").value.trim(),
    updatedAt: new Date().toISOString()
  };
  await saveProfile(updated);
  renderProfile(updated);
  showToast("Profile updated successfully.");
}

function initShell() {
  attachCommonHandlers();
  setAuthView("login");
  $("loginForm")?.addEventListener("submit", handleLogin);
  $("registerForm")?.addEventListener("submit", handleRegister);
  $("eventForm")?.addEventListener("submit", (e) => handleEventSubmit(e, "member"));
  $("eventDrawerForm")?.addEventListener("submit", (e) => handleEventSubmit(e, "member"));
  $("profileForm")?.addEventListener("submit", handleProfileSubmit);
  $("forgotBtn")?.addEventListener("click", async () => {
    const email = normalize($("loginCode").value).includes("@") ? $("loginCode").value : "";
    if (!email) return showToast("Enter an email address first.");
    try {
      await sendPasswordResetEmail(auth, email);
      showToast("Password reset email sent.");
    } catch (error) {
      console.error(error);
      showToast("Unable to send password reset email.");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initShell();
  onAuthStateChanged(auth, async (user) => {
    state.user = user;
    if (!user) return;
    state.profile = await loadProfile();
    if (state.profile) {
      renderProfile(state.profile);
      $("authScreen")?.classList.add("hidden");
      $("dashboardShell")?.classList.remove("hidden");
      await loadEventsAndResponses();
      await loadNotifications();
      renderEvents();
      renderNotifications();
    }
  });
});

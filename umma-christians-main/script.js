import { auth, db, rtdb } from "./firebase-config.js";
import {
    addDoc,
    collection,
    doc,
    get,
    onAuthStateChanged,
    onSnapshot,
    onValue,
    orderBy,
    query,
    ref,
    updateDoc,
    signOut
} from "./supabase-firebase-compat.js";

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function escapeAttr(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function toBase64UrlUtf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((b) => {
        binary += String.fromCharCode(b);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizeGoogleDriveImageUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        if (!url.hostname.includes("drive.google.com")) return rawUrl;

        const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
        if (fileMatch?.[1]) return `https://drive.google.com/uc?export=view&id=${fileMatch[1]}`;

        const id = url.searchParams.get("id");
        if (id) return `https://drive.google.com/uc?export=view&id=${id}`;

        return rawUrl;
    } catch (_) {
        return rawUrl;
    }
}

function normalizeOneDriveImageUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        const host = url.hostname.toLowerCase();
        if (!host.includes("onedrive.live.com") && !host.includes("1drv.ms")) return rawUrl;

        if (host.includes("1drv.ms")) {
            const encoded = toBase64UrlUtf8(rawUrl);
            return `https://api.onedrive.com/v1.0/shares/u!${encoded}/root/content`;
        }

        const cid = url.searchParams.get("cid");
        const resid = url.searchParams.get("resid");
        if (cid && resid) {
            return `https://onedrive.live.com/download?cid=${encodeURIComponent(cid)}&resid=${encodeURIComponent(resid)}&authkey=${encodeURIComponent(url.searchParams.get("authkey") || "")}`;
        }

        return rawUrl;
    } catch (_) {
        return rawUrl;
    }
}

function normalizeCloudImageUrl(rawUrl) {
    const trimmed = String(rawUrl || "").trim();
    if (!trimmed) return "";
    if (trimmed.includes("drive.google.com")) return normalizeGoogleDriveImageUrl(trimmed);
    if (trimmed.includes("1drv.ms") || trimmed.includes("onedrive.live.com")) return normalizeOneDriveImageUrl(trimmed);
    return trimmed;
}

function showPageToast(message) {
    let toast = document.querySelector(".page-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.className = "page-toast";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showPageToast.timer);
    showPageToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function initSidebar() {
    const sidebar = document.getElementById("sidebar");
    const hamburger = document.getElementById("hamburger");
    const overlay = document.getElementById("overlay");
    const main = document.querySelector(".main");
    if (!sidebar || !hamburger || !overlay) return;

    let closeButton = sidebar.querySelector("[data-close-menu]");
    if (!closeButton) {
        closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.className = "menu-close";
        closeButton.setAttribute("data-close-menu", "true");
        closeButton.setAttribute("aria-label", "Close menu");
        closeButton.textContent = "×";
        sidebar.appendChild(closeButton);
    }

    const isMobile = () => window.innerWidth <= 860;

    const closeMenu = () => {
        document.body.classList.remove("menu-open");
        if (isMobile()) {
            sidebar.classList.remove("active");
            overlay.classList.remove("active");
        } else {
            sidebar.classList.add("closed");
            if (main) main.classList.add("expanded");
            overlay.classList.remove("active");
        }
    };

    const openMenu = () => {
        document.body.classList.add("menu-open");
        sidebar.classList.add("active");
        if (!isMobile()) {
            sidebar.classList.remove("closed");
            if (main) main.classList.remove("expanded");
        }
        overlay.classList.add("active");
    };

    closeButton.addEventListener("click", closeMenu);
    hamburger.addEventListener("click", () => {
        if (sidebar.classList.contains("active")) closeMenu();
        else openMenu();
        return;
    });

    overlay.addEventListener("click", () => {
        closeMenu();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeMenu();
    });

    document.querySelectorAll(".nav-links a").forEach((link) => {
        link.addEventListener("click", () => {
            closeMenu();
        });
    });
}

function highlightCurrentNav() {
    const path = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
    document.querySelectorAll(".nav-links a").forEach((link) => {
        const href = (link.getAttribute("href") || "").toLowerCase();
        if (href === path) link.classList.add("active");
    });
}

function initScrollReveal() {
    const targets = document.querySelectorAll(".hero, .card, .footer");
    if (!targets.length) return;

    targets.forEach((el, index) => {
        el.classList.add("reveal");
        el.style.transitionDelay = `${Math.min(index * 70, 420)}ms`;
    });

    if (!("IntersectionObserver" in window)) {
        targets.forEach((el) => el.classList.add("is-visible"));
        return;
    }

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
    );

    targets.forEach((el) => observer.observe(el));
}

function formatHumanDate(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function loadEventVotes() {
    try {
        return JSON.parse(localStorage.getItem("kcf-event-polls") || "{}");
    } catch (_) {
        return {};
    }
}

function saveEventVotes(votes) {
    localStorage.setItem("kcf-event-polls", JSON.stringify(votes));
}

async function voteOnEvent(eventId, voteType) {
    const votes = loadEventVotes();
    if (votes[eventId]) return;
    votes[eventId] = voteType;
    saveEventVotes(votes);

    const eventRef = doc(db, "events", eventId);
    const snapshot = await get(eventRef);
    const data = snapshot.exists() ? snapshot.data() : {};
    const nextYes = Number(data.pollYes || 0) + (voteType === "yes" ? 1 : 0);
    const nextNo = Number(data.pollNo || 0) + (voteType === "no" ? 1 : 0);
    await updateDoc(eventRef, { pollYes: nextYes, pollNo: nextNo });
}

function renderSiteConfig(cfg = {}) {
    const verseTextEl = document.querySelector("[data-site='verse-text']");
    const verseRefEl = document.querySelector("[data-site='verse-ref']");
    const yearThemeEl = document.querySelector("[data-site='theme-year']");
    const semThemeEl = document.querySelector("[data-site='theme-semester']");
    const contactEmailEl = document.querySelector("[data-site='contact-email']");
    const fellowshipDayEl = document.querySelector("[data-site='fellowship-day']");
    const fellowshipTimeEl = document.querySelector("[data-site='fellowship-time']");
    const fellowshipVenueEl = document.querySelector("[data-site='fellowship-venue']");

    if (verseTextEl) verseTextEl.textContent = cfg.verseText || "Verse will be published by the ministry office.";
    if (verseRefEl) verseRefEl.textContent = cfg.verseReference || "-";
    if (yearThemeEl) yearThemeEl.textContent = cfg.themeYear || "Not set yet.";
    if (semThemeEl) semThemeEl.textContent = cfg.themeDay || cfg.themeSemester || "Not set yet.";
    if (contactEmailEl) contactEmailEl.textContent = cfg.contactEmail || "Not set yet.";
    if (fellowshipDayEl) fellowshipDayEl.textContent = cfg.fellowshipDay || "Not set yet.";
    if (fellowshipTimeEl) fellowshipTimeEl.textContent = cfg.fellowshipTime || "Not set yet.";
    if (fellowshipVenueEl) fellowshipVenueEl.textContent = cfg.fellowshipVenue || "Not set yet.";
}

function watchSiteConfig() {
    onSnapshot(doc(db, "site_config", "current"), (snap) => {
        renderSiteConfig(snap.exists() ? snap.data() : {});
    });
}

function watchPrograms() {
    const container = document.getElementById("programsList");
    if (!container) return;
    const q = query(collection(db, "programs"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snap) => {
        if (snap.empty) {
            container.innerHTML = "<li>No upcoming programs yet. Check back soon for fellowship gatherings, ministry activities, and KCF announcements.</li>";
            return;
        }
        container.innerHTML = snap.docs
            .map((d) => {
                const p = d.data();
                return `<li><strong>${p.day || "Day"}:</strong> ${p.title || ""} (${p.time || ""}, ${p.venue || ""})</li>`;
            })
            .join("");
    });
}

function watchEvents() {
    const container = document.getElementById("eventsList");
    if (!container) return;
    const q = query(collection(db, "events"), orderBy("date", "asc"));
    onSnapshot(q, (snap) => {
        if (snap.empty) {
            container.innerHTML = "<li class=\"event-card\"><strong>No upcoming events yet.</strong><p>Stay connected for fellowship gatherings, ministry activities, and community events.</p><p class=\"muted\">Explore membership to stay informed when new programs are announced.</p></li>";
            return;
        }
        container.innerHTML = snap.docs
            .map((d) => {
                const e = d.data();
                const yes = Number(e.pollYes || 0);
                const no = Number(e.pollNo || 0);
                const total = yes + no;
                const voteShare = total ? Math.round((yes / total) * 100) : 0;
                return `
                <li class="event-card">
                    <div class="event-head">
                        <div>
                            <p class="event-kicker">${e.hostName || "KCF"}</p>
                            <strong>${e.title || "Untitled Event"}</strong>
                        </div>
                        <span class="chip">${e.category || "General"}</span>
                    </div>
                    <div class="event-meta">
                        <span>${formatHumanDate(e.date || "")}</span>
                        <span>${e.time || ""}</span>
                        <span>${e.location || ""}</span>
                    </div>
                    <p>${e.description || ""}</p>
                    <div class="poll-block">
                        <div class="poll-track"><span style="width:${voteShare}%"></span></div>
                        <div class="poll-stats">
                            <span>${yes} available</span>
                            <span>${no} unavailable</span>
                        </div>
                        <div class="poll-actions">
                            <button class="btn btn-primary" type="button" data-vote="${d.id}" data-choice="yes">I am available</button>
                            <button class="btn btn-outline" type="button" data-vote="${d.id}" data-choice="no">Not available</button>
                        </div>
                    </div>
                </li>`;
            })
            .join("");

        container.querySelectorAll("[data-vote]").forEach((button) => {
            button.addEventListener("click", async () => {
                const eventId = button.getAttribute("data-vote");
                const choice = button.getAttribute("data-choice");
                try {
                    await voteOnEvent(eventId, choice);
                } catch (error) {
                    console.error("Unable to submit vote:", error);
                }
            });
        });
    });
}

function watchGallery() {
    const container = document.getElementById("galleryGrid");
    const status = document.getElementById("galleryPublishedStatus");
    if (!container) return;
    onValue(ref(rtdb, "gallery"), (snap) => {
        const value = snap.val();
        if (!value) {
            container.innerHTML = "<p>No photos published yet.</p><p class=\"section-sub\">A visual archive will appear here as KCF shares ministry moments and fellowship highlights.</p><p class=\"muted\">New photos can be added by the ministry team whenever they’re available.</p>";
            if (status) status.textContent = "No photos published yet.";
            return;
        }
        const items = Object.entries(value)
            .map(([key, item]) => ({ key, ...item }))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (status) status.textContent = `Photos published: ${items.length}`;

        container.innerHTML = items
            .map(
                (photo) => {
                    const imageSrc = photo.image ? `data:image/jpeg;base64,${photo.image}` : normalizeCloudImageUrl(photo.url || "");
                    const title = escapeHtml(photo.title || "Untitled");
                    const link = (photo.link || "").trim();
                    const openTarget = link || (photo.url || "").trim();
                    const body = `
                        <div style="width:100%;min-height:220px;display:grid;place-items:center;background:#f5f8fd;border:1px solid #dde6f2;border-radius:10px;padding:8px;">
                            <img src="${escapeAttr(imageSrc)}" alt="${escapeAttr(title || "Gallery photo")}" style="width:100%;height:auto;max-height:420px;object-fit:contain;border-radius:8px;display:block;">
                        </div>
                        <h3 style="margin-top:10px;">${title}</h3>
                    `;

                    if (openTarget) {
                        return `
                            <article class="card">
                                ${body}
                                <a class="btn btn-outline gallery-open-btn" href="${escapeAttr(openTarget)}" target="_blank" rel="noopener noreferrer">Open Gallery</a>
                            </article>`;
                    }

                    return `
                        <article class="card">
                            ${body}
                            <p style="margin-top:8px;color:#5a6a82;">No Drive link attached for this photo.</p>
                        </article>`;
                }
            )
            .join("");
    });
}

function initOfficeBridge() {
    const actions = document.querySelector(".topbar-actions");
    if (!actions) return;

    onAuthStateChanged(auth, (user) => {
        const existingLogin = document.getElementById("officeLoginLink");
        const existingLink = document.getElementById("officeDashLink");
        const existingSignout = document.getElementById("officeSignoutBtn");
        const existingChip = document.getElementById("officeModeChip");

        if (existingLogin) existingLogin.remove();
        if (existingLink) existingLink.remove();
        if (existingSignout) existingSignout.remove();
        if (existingChip) existingChip.remove();

        if (!user) {
            const loginLink = document.createElement("a");
            loginLink.id = "officeLoginLink";
            loginLink.className = "btn btn-outline";
            loginLink.href = "admin-login.html";
            loginLink.textContent = "Office Login";
            actions.appendChild(loginLink);
            return;
        }

        const chip = document.createElement("span");
        chip.className = "chip";
        chip.id = "officeModeChip";
        chip.textContent = "Office Mode";

        const dashLink = document.createElement("a");
        dashLink.id = "officeDashLink";
        dashLink.className = "btn btn-outline";
        dashLink.href = "admin.html";
        dashLink.textContent = "Office Dashboard";

        const signoutBtn = document.createElement("button");
        signoutBtn.id = "officeSignoutBtn";
        signoutBtn.className = "btn btn-danger";
        signoutBtn.type = "button";
        signoutBtn.textContent = "Sign Out";
        signoutBtn.addEventListener("click", async () => {
            await signOut(auth);
            window.location.reload();
        });

        actions.appendChild(chip);
        actions.appendChild(dashLink);
        actions.appendChild(signoutBtn);
    });
}

function initFeedbackForm() {
    const form = document.getElementById("feedbackForm");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const name = document.getElementById("feedbackName")?.value.trim();
        const email = document.getElementById("feedbackEmail")?.value.trim();
        const phone = document.getElementById("feedbackPhone")?.value.trim();
        const message = document.getElementById("feedbackMessage")?.value.trim();
        if (!name || !email || !message) {
            showPageToast("Please fill in the required fields.");
            return;
        }

        try {
            await addDoc(collection(db, "feedback"), {
                name,
                email,
                phone,
                message,
                status: "new",
                createdAt: new Date().toISOString()
            });
            form.reset();
            showPageToast("Thank you for your feedback!");
        } catch (error) {
            console.error(error);
            showPageToast("Unable to send your feedback. Please try again.");
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    initSidebar();
    highlightCurrentNav();
    initScrollReveal();
    initOfficeBridge();
    watchSiteConfig();
    watchPrograms();
    watchEvents();
    watchGallery();
    initFeedbackForm();
});

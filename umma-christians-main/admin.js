import { auth, db, hasSupabaseConfig, rtdb, supabase } from "./firebase-config.js";
import {
    addDoc,
    browserLocalPersistence,
    collection,
    deleteDoc,
    doc,
    get,
    limit,
    onAuthStateChanged,
    onSnapshot,
    onValue,
    orderBy,
    push,
    query,
    ref as dbRef,
    remove,
    set,
    setDoc,
    setPersistence,
    signInWithEmailAndPassword,
    signOut,
    update as updateRtdb,
    updateDoc
} from "./supabase-firebase-compat.js";

const MAX_IMAGE_BYTES = 1024 * 1024;
const OFFICE_ADMIN_STORAGE_KEY = "kajiado-office-admin-pending";
const OFFICE_AUTH_ERROR_KEY = "kajiado-office-auth-error";
const DESIGNATED_ADMIN_EMAIL = "adminkcf@gmail.com";

function withTimeout(promise, message, timeoutMs = 12000) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function escAttr(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function initOfficeSidebar() {
    const sidebar = document.getElementById("officeSidebar");
    const main = document.querySelector(".office-main");
    const burger = document.getElementById("officeHamburger");
    const overlay = document.getElementById("officeOverlay");
    if (!sidebar || !main || !burger || !overlay) return;

    const isMobile = () => window.innerWidth <= 900;

    const closeSidebar = () => {
        if (isMobile()) {
            sidebar.classList.remove("active");
            overlay.classList.remove("active");
            burger.setAttribute("aria-expanded", "false");
        } else {
            sidebar.classList.add("closed");
            main.classList.add("expanded");
            burger.setAttribute("aria-expanded", "false");
        }
    };

    const openSidebar = () => {
        if (isMobile()) {
            sidebar.classList.add("active");
            overlay.classList.add("active");
            burger.setAttribute("aria-expanded", "true");
        } else {
            sidebar.classList.remove("closed");
            main.classList.remove("expanded");
            burger.setAttribute("aria-expanded", "true");
        }
    };

    burger.addEventListener("click", () => {
        if (isMobile()) {
            if (sidebar.classList.contains("active")) closeSidebar();
            else openSidebar();
            return;
        }
        if (sidebar.classList.contains("closed")) openSidebar();
        else closeSidebar();
    });

    overlay.addEventListener("click", closeSidebar);

    document.addEventListener("click", (event) => {
        if (!isMobile()) return;
        const clickedOutsideSidebar = !sidebar.contains(event.target) && !burger.contains(event.target);
        if (clickedOutsideSidebar) closeSidebar();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeSidebar();
    });

    window.addEventListener("resize", () => {
        if (isMobile()) {
            sidebar.classList.remove("closed");
            main.classList.remove("expanded");
            burger.setAttribute("aria-expanded", sidebar.classList.contains("active") ? "true" : "false");
        } else {
            sidebar.classList.remove("active");
            overlay.classList.remove("active");
            burger.setAttribute("aria-expanded", sidebar.classList.contains("closed") ? "false" : "true");
        }
    });

    burger.setAttribute("aria-expanded", "true");
}

function initOfficeSections() {
    const links = Array.from(document.querySelectorAll(".office-links a[data-section]"));
    const sections = Array.from(document.querySelectorAll(".office-section"));
    if (!links.length || !sections.length) return;

    const activate = (sectionId) => {
        sections.forEach((section) => {
            if (section.id === sectionId) section.classList.add("active");
            else section.classList.remove("active");
        });

        links.forEach((link) => {
            if (link.getAttribute("data-section") === sectionId) link.classList.add("active");
            else link.classList.remove("active");
        });
    };

    links.forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const target = link.getAttribute("data-section");
            activate(target);

            // Match user-side behavior: close sidebar after selecting on mobile.
            const sidebar = document.getElementById("officeSidebar");
            const overlay = document.getElementById("officeOverlay");
            const burger = document.getElementById("officeHamburger");
            if (window.innerWidth <= 900 && sidebar && overlay && burger) {
                sidebar.classList.remove("active");
                overlay.classList.remove("active");
                burger.setAttribute("aria-expanded", "false");
            }
        });
    });

    activate(links[0].getAttribute("data-section"));
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

function toMillis(value) {
    if (typeof value === "number") return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? Date.now() : parsed;
    }
    // Timestamp-like object
    if (value && typeof value === "object" && typeof value.seconds === "number") {
        return (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1e6);
    }
    return Date.now();
}

function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to load image."));
        };
        img.src = url;
    });
}

function canvasToBlob(canvas, quality) {
    return new Promise((resolve) => {
        canvas.toBlob(
            (blob) => resolve(blob),
            "image/jpeg",
            quality
        );
    });
}

function fileToBase64NoPrefix(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || "");
            const base64 = result.includes(",") ? result.split(",")[1] : result;
            resolve(base64);
        };
        reader.onerror = () => reject(new Error("Failed to read file as base64."));
        reader.readAsDataURL(file);
    });
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
        if (fileMatch?.[1]) {
            return `https://drive.google.com/uc?export=view&id=${fileMatch[1]}`;
        }

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

async function compressImageTo1MB(file) {
    if (file.size <= MAX_IMAGE_BYTES) return file;

    const img = await loadImageFromFile(file);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    let width = img.width;
    let height = img.height;
    let quality = 0.9;
    let outputBlob = null;

    for (let pass = 0; pass < 8; pass += 1) {
        canvas.width = Math.max(1, Math.floor(width));
        canvas.height = Math.max(1, Math.floor(height));
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        outputBlob = await canvasToBlob(canvas, quality);
        if (outputBlob && outputBlob.size <= MAX_IMAGE_BYTES) break;

        if (quality > 0.45) {
            quality -= 0.1;
        } else {
            width *= 0.85;
            height *= 0.85;
        }
    }

    if (!outputBlob) throw new Error("Failed to compress image.");
    if (outputBlob.size > MAX_IMAGE_BYTES) throw new Error("Image remains larger than 1 MB after compression.");

    const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([outputBlob], `${baseName}-compressed.${extension === "png" ? "jpg" : extension}`, {
        type: "image/jpeg"
    });
}

function normalizeEmail(value) {
    return String(value ?? "").trim().toLowerCase();
}

function normalizeFullName(value) {
    return String(value ?? "").trim();
}

function resolveOfficeAdminName(fullName, email) {
    const preferred = normalizeFullName(fullName);
    if (preferred) return preferred;

    const localPart = normalizeEmail(email).split("@")[0].replace(/[._-]+/g, " ").trim();
    if (!localPart) return "Office Admin";
    return localPart.replace(/\b\w/g, (char) => char.toUpperCase());
}

function mapOfficeAdminRow(row = {}) {
    return {
        id: row.id || "",
        userId: row.user_id || "",
        email: normalizeEmail(row.email),
        fullName: normalizeFullName(row.full_name),
        role: normalizeFullName(row.role) || "admin",
        isActive: row.is_active !== false,
        createdAt: row.created_at || "",
        updatedAt: row.updated_at || ""
    };
}

function getPendingOfficeAdminRegistration() {
    try {
        const raw = localStorage.getItem(OFFICE_ADMIN_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        return {
            email: normalizeEmail(parsed.email),
            fullName: normalizeFullName(parsed.fullName)
        };
    } catch (_) {
        return null;
    }
}

function savePendingOfficeAdminRegistration(email, fullName) {
    try {
        localStorage.setItem(OFFICE_ADMIN_STORAGE_KEY, JSON.stringify({
            email: normalizeEmail(email),
            fullName: normalizeFullName(fullName)
        }));
    } catch (_) {
        // Ignore storage failures.
    }
}

function clearPendingOfficeAdminRegistration() {
    try {
        localStorage.removeItem(OFFICE_ADMIN_STORAGE_KEY);
    } catch (_) {
        // Ignore storage failures.
    }
}

function formatOfficeUserLabel(profile, user) {
    const name = normalizeFullName(profile?.fullName);
    const email = normalizeEmail(user?.email);
    if (name && email) return `${name} · ${email}`;
    return name || email || "Signed in";
}

async function fetchOfficeAdminProfile(userId) {
    if (!supabase || !userId) return null;

    const { data, error } = await supabase
        .from("office_admins")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) throw error;
    return data ? mapOfficeAdminRow(data) : null;
}

async function ensureOfficeAdminProfile(user, preferredFullName = "") {
    if (!supabase) {
        throw new Error("Supabase is not configured yet. Set SUPABASE_URL and SUPABASE_ANON_KEY in runtime-config.js or Vercel.");
    }
    if (!user?.id) throw new Error("Missing authenticated user.");

    const email = normalizeEmail(user.email);
    // Only the database can bootstrap the designated office account. This keeps
    // role assignment out of the browser and avoids RLS-blocked client inserts.
    if (email === DESIGNATED_ADMIN_EMAIL) {
        const { error } = await supabase.rpc("ensure_designated_admin");
        if (error) throw error;
    }

    const profile = await fetchOfficeAdminProfile(user.id);
    if (!profile) {
        throw new Error("This account is authenticated but is not authorized for the KCF office dashboard.");
    }
    if (profile.role !== "admin" || !profile.isActive) {
        throw new Error("This office account is inactive or does not have administrator access.");
    }

    const requestedName = normalizeFullName(preferredFullName);
    if (requestedName && requestedName !== profile.fullName) {
        const { data, error } = await supabase
            .from("office_admins")
            .update({ full_name: requestedName, updated_at: new Date().toISOString() })
            .eq("user_id", user.id)
            .select("*")
            .maybeSingle();
        if (error) throw error;
        return data ? mapOfficeAdminRow(data) : profile;
    }
    return profile;
}
function mapOfficeAdminError(error) {
    const message = String(error?.message || error || "");
    const lower = message.toLowerCase();

    if (lower.includes("office admin limit") || lower.includes("maximum 10") || lower.includes("limit reached")) {
        return "Office admin limit reached. Maximum 10 active admins are allowed.";
    }
    if (lower.includes("not authorized") || lower.includes("does not have administrator access")) {
        return "This account is not authorized for the KCF office dashboard.";
    }
    if (lower.includes("inactive")) {
        return "This office account is inactive. Contact the ministry office.";
    }
    if (lower.includes("already linked to another admin")) {
        return "This office email is already linked to another admin account.";
    }
    if (lower.includes("row-level security") || lower.includes("permission denied") || lower.includes("not authorized")) {
        return "Supabase blocked this office action. Check the office_admins and admin table policies.";
    }
    if (lower.includes("could not find the function") || lower.includes("schema cache") || lower.includes("ensure_designated_admin")) {
        return "Admin database setup is incomplete. Run the latest supabase-schema.sql in the deployed Supabase project, then try again.";
    }
    if (lower.includes("missing authenticated user")) {
        return "Sign in again to continue.";
    }

    return "";
}

function initOfficeLogin() {
    const loginForm = document.getElementById("adminLoginForm");
    if (!loginForm) return;

    const status = document.getElementById("loginStatus");
    let loginSubmissionActive = false;
    let redirectActive = false;

    const showStatus = (message, isError = false) => {
        if (!status) return;
        status.textContent = message;
        status.style.color = isError ? "#b3261e" : "#0f4c81";
    };

    if (!hasSupabaseConfig) {
        showStatus("Supabase is not configured yet. Set SUPABASE_URL and SUPABASE_ANON_KEY in runtime-config.js or Vercel.", true);
    }

    let previousError = "";
    try {
        previousError = sessionStorage.getItem(OFFICE_AUTH_ERROR_KEY) || "";
    } catch (error) {
        console.warn("Session storage is unavailable on the admin login page.", error);
    }
    if (previousError) {
        try {
            sessionStorage.removeItem(OFFICE_AUTH_ERROR_KEY);
        } catch (error) {
            console.warn("Could not clear the stored admin login error.", error);
        }
        showStatus(previousError, true);
    }

    const mapAuthError = (error) => {
        const message = String(error?.message || error || "");
        const lower = message.toLowerCase();

        if (lower.includes("invalid email")) return "Invalid email format.";
        if (lower.includes("email address") && lower.includes("invalid")) return "Invalid email format.";
        if (lower.includes("invalid login credentials")) return "Invalid email or password.";
        if (lower.includes("could not find the function") || lower.includes("schema cache")) {
            return "Admin database setup is outdated. Run the latest supabase-schema.sql, then try again.";
        }
        if (lower.includes("email not confirmed")) return "Check your email to confirm the account.";
        if (lower.includes("user already registered")) return "This email is already in use.";
        if (lower.includes("password should be")) return "Password is too weak.";
        if (lower.includes("supabase is not configured")) return "Supabase is not configured yet. Set SUPABASE_URL and SUPABASE_ANON_KEY.";
        if (lower.includes("rate limit")) return "Too many attempts. Try again later.";
        if (lower.includes("network")) return "Network error. Check internet connection.";

        return message || "Authentication failed. Check Supabase setup and try again.";
    };

    onAuthStateChanged(auth, (user) => {
        if (!user || loginSubmissionActive || redirectActive) return;

        window.setTimeout(() => void (async () => {
            try {
                redirectActive = true;
                const pending = getPendingOfficeAdminRegistration();
                const profile = await withTimeout(
                    ensureOfficeAdminProfile(user, pending?.fullName || ""),
                    "Admin authorization timed out. Run the latest Supabase SQL and try again."
                );
                clearPendingOfficeAdminRegistration();
                showStatus(`Welcome${profile?.fullName ? `, ${profile.fullName}` : ""}.`);
                window.location.replace(new URL("admin.html", window.location.href).href);
            } catch (error) {
                redirectActive = false;
                clearPendingOfficeAdminRegistration();
                await signOut(auth).catch(() => {});
                showStatus(mapOfficeAdminError(error) || mapAuthError(error), true);
            }
        })(), 0);
    });

    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("adminEmail").value.trim();
        const password = document.getElementById("adminPassword").value;
        const fullName = document.getElementById("adminFullName")?.value.trim() || "";
        const loginBtn = loginForm.querySelector("button[type='submit']");
        if (!email || !password) {
            showStatus("Enter your office email and password.", true);
            return;
        }
        try {
            loginSubmissionActive = true;
            if (loginBtn) loginBtn.disabled = true;
            showStatus("Signing in...");
            await setPersistence(auth, browserLocalPersistence);
            const result = await withTimeout(
                signInWithEmailAndPassword(auth, email, password),
                "Sign-in timed out. Check your connection and try again."
            );
            const user = result?.user || result?.data?.user || null;
            if (!result?.session || !user?.id) throw new Error("Sign-in did not create a valid session. Please try again.");
            showStatus("Verifying administrator access...");
            await withTimeout(
                ensureOfficeAdminProfile(user, fullName || getPendingOfficeAdminRegistration()?.fullName || ""),
                "Admin authorization timed out. Run the latest Supabase SQL and try again."
            );
            clearPendingOfficeAdminRegistration();
            redirectActive = true;
            window.location.replace(new URL("admin.html", window.location.href).href);
        } catch (error) {
            await signOut(auth).catch(() => {});
            showStatus(mapOfficeAdminError(error) || mapAuthError(error), true);
        } finally {
            loginSubmissionActive = false;
            if (loginBtn) loginBtn.disabled = false;
        }
    });

    if (hasSupabaseConfig && !previousError) {
        showStatus("Enter your office email and password to continue.");
    }
    window.__KCF_ADMIN_LOGIN_READY__ = true;
}

function initOfficeDashboard() {
    const dashboard = document.getElementById("adminDashboard");
    if (!dashboard) return;

    const status = document.getElementById("adminStatus");
    const setStatus = (message, isError = false) => {
        if (!status) return;
        status.textContent = message;
        status.style.color = isError ? "#b3261e" : "#0f4c81";
    };

    let workspaceMounted = false;

    const mountWorkspace = (profile, user) => {
        if (workspaceMounted) {
            const emailTag = document.getElementById("officeUserEmail");
            if (emailTag) emailTag.textContent = formatOfficeUserLabel(profile, user);
            return;
        }
        workspaceMounted = true;

        initOfficeSidebar();
        initOfficeSections();

        const emailTag = document.getElementById("officeUserEmail");
        if (emailTag) emailTag.textContent = formatOfficeUserLabel(profile, user);

        const logoutBtn = document.getElementById("logoutBtn");
        if (logoutBtn) {
            logoutBtn.addEventListener("click", async () => {
                clearPendingOfficeAdminRegistration();
                await signOut(auth);
                window.location.href = "admin-login.html";
            });
        }

        const programsList = document.getElementById("adminProgramsList");
        const eventsList = document.getElementById("eventsList");
        const membersList = document.getElementById("adminMembersList");
        const photosList = document.getElementById("adminPhotosList");
        const activityFeed = document.getElementById("activityFeed");
        let localActivityItems = [];

        const renderActivityItems = (items) => {
            if (!activityFeed) return;
            if (!items.length) {
                activityFeed.innerHTML = "<li>No activity yet.</li>";
                return;
            }
            activityFeed.innerHTML = items
                .map((a) => {
                    const time = formatHumanDate(new Date(toMillis(a.createdAt)).toISOString());
                    const deleteBtn = a.id
                        ? ` <button class="btn btn-danger" data-delete-activity="${a.id}" type="button">Delete</button>`
                        : "";
                    return `<li><strong>${a.message || "Update"}</strong><div class="event-meta"><span>${time}</span><span class="chip">${a.type || "info"}</span>${deleteBtn}</div></li>`;
                })
                .join("");
        };

        const logActivity = async (message, type = "info") => {
            const localItem = { message, type, createdAt: Date.now() };
            localActivityItems = [localItem, ...localActivityItems].slice(0, 40);
            renderActivityItems(localActivityItems);

            try {
                await addDoc(collection(db, "activity_logs"), {
                    message,
                    type,
                    createdAt: Date.now()
                });
            } catch (error) {
                const denied =
                    error?.code === "42501" ||
                    String(error?.message || "").toLowerCase().includes("row-level security") ||
                    String(error?.message || "").toLowerCase().includes("permission denied");
                if (denied) {
                    setStatus("Activity log is blocked by Supabase RLS. Update policies for activity_logs.", true);
                }
            }
        };

        onSnapshot(query(collection(db, "programs"), orderBy("createdAt", "desc")), (snap) => {
            if (!programsList) return;
            if (snap.empty) {
                programsList.innerHTML = "<li>No weekly programs yet.</li>";
                return;
            }
            programsList.innerHTML = snap.docs
                .map((d) => {
                    const p = d.data();
                    return `<li><strong>${p.day || ""}</strong> - ${p.title || ""} (${p.time || ""}, ${p.venue || ""}) <button class="btn btn-outline" data-edit-program="${d.id}" data-day="${escAttr(p.day)}" data-title="${escAttr(p.title)}" data-time="${escAttr(p.time)}" data-venue="${escAttr(p.venue)}" type="button">Edit</button> <button class="btn btn-danger" data-delete-program="${d.id}" type="button">Delete Program</button></li>`;
                })
                .join("");
        });

        onSnapshot(query(collection(db, "events"), orderBy("date", "asc")), (snap) => {
            if (!eventsList) return;
            if (snap.empty) {
                eventsList.innerHTML = "<li>No events yet.</li>";
                return;
            }
            eventsList.innerHTML = snap.docs
                .map((d) => {
                    const e = d.data();
                    return `<li><strong>${e.title || ""}</strong><div class="event-meta"><span>${formatHumanDate(e.date || "")}</span><span>${e.time || ""}</span><span>${e.location || ""}</span><span class="chip">${e.category || "General"}</span></div><p>${e.description || ""}</p><button class="btn btn-outline" data-edit-event="${d.id}" data-title="${escAttr(e.title)}" data-date="${escAttr(e.date)}" data-time="${escAttr(e.time)}" data-location="${escAttr(e.location)}" data-category="${escAttr(e.category)}" data-description="${escAttr(e.description)}" type="button">Edit</button> <button class="btn btn-danger" data-delete-event="${d.id}" type="button">Delete Event</button></li>`;
                })
                .join("");
        }, (error) => setStatus("Events could not be loaded: " + (error?.message || "Check Supabase access."), true));

        const renderMemberActions = (id, status) => {
            const action = status === "active"
                ? `<button class="btn btn-outline" data-member-status="suspended" data-member-id="${id}" type="button">Suspend</button>`
                : `<button class="btn btn-primary" data-member-status="active" data-member-id="${id}" type="button">Approve</button>`;
            const reject = status === "rejected" ? "" : ` <button class="btn btn-danger" data-member-status="rejected" data-member-id="${id}" type="button">Reject</button>`;
            return `${action}${reject}`;
        };
        onSnapshot(query(collection(db, "members"), orderBy("createdAt", "desc")), (snap) => {
            if (!membersList) return;
            if (snap.empty) {
                membersList.innerHTML = "<li>No membership applications yet.</li>";
                return;
            }

            membersList.innerHTML = snap.docs.map((record) => {
                const member = record.data();
                const status = String(member.status || "pending").toLowerCase();
                return `<li data-member-row="${record.id}"><strong>${escAttr(member.name || "Unnamed organization")}</strong><div class="event-meta"><span>${escAttr(member.type || "Organization")}</span><span>${escAttr(member.contactName || "")}</span><span>${escAttr(member.email || "")}</span><span class="chip" data-member-status-label>${escAttr(status.toUpperCase())}</span></div><p>${escAttr(member.location || member.town || "Location not provided")}</p><div class="member-approval-actions">${renderMemberActions(record.id, status)}</div></li>`;
            }).join("");
        }, (error) => setStatus("Membership applications could not be loaded: " + (error?.message || "Check Supabase access."), true));

        onValue(dbRef(rtdb, "gallery"), (snap) => {
            if (!photosList) return;
            const value = snap.val();
            if (!value) {
                photosList.innerHTML = "<li>No gallery photos yet.</li>";
                return;
            }
            const items = Object.entries(value)
                .map(([key, item]) => ({ key, ...item }))
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            photosList.innerHTML = items
                .map(
                    (p) => {
                        const imageSrc = p.image ? `data:image/jpeg;base64,${p.image}` : normalizeCloudImageUrl(p.url || "");
                        return `<li><strong>${p.title || ""}</strong><p><img src="${imageSrc}" alt="${escAttr(p.title)}" style="width:100%;max-width:220px;border-radius:8px;border:1px solid #dde6f2;"></p><p>${p.link ? `Opens: ${escAttr(p.link)}` : "No external link set."}</p><p>${p.url ? `Image URL: ${escAttr(p.url)}` : "Image source: uploaded file."}</p><button class="btn btn-outline" data-edit-photo="${p.key}" data-title="${escAttr(p.title)}" data-link="${escAttr(p.link || "")}" data-url="${escAttr(p.url || "")}" type="button">Edit</button> <button class="btn btn-danger" data-delete-photo="${p.key}" type="button">Delete Photo</button></li>`;
                    }
                )
                .join("");
        });

        if (activityFeed) {
            const activityQuery = query(collection(db, "activity_logs"), orderBy("createdAt", "desc"), limit(40));
            onSnapshot(
                activityQuery,
                (snap) => {
                    if (snap.empty) {
                        renderActivityItems(localActivityItems);
                        return;
                    }
                    localActivityItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                    renderActivityItems(localActivityItems);
                },
                () => {
                    renderActivityItems(localActivityItems);
                    setStatus("Realtime activity feed is blocked by Supabase RLS.", true);
                }
            );
        }

        const addProgramForm = document.getElementById("addProgramForm");
        if (addProgramForm) {
            addProgramForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const payload = {
                    day: document.getElementById("programDay").value.trim(),
                    title: document.getElementById("programTitle").value.trim(),
                    time: document.getElementById("programTime").value.trim(),
                    venue: document.getElementById("programVenue").value.trim(),
                    createdAt: Date.now()
                };
                await addDoc(collection(db, "programs"), payload);
                addProgramForm.reset();
                setStatus("Weekly program added.");
                await logActivity(`Added weekly program: ${payload.day} - ${payload.title}`, "program");
            });
        }

        const addEventForm = document.getElementById("addEventForm");
        if (addEventForm) {
            addEventForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const submitButton = addEventForm.querySelector("button[type='submit']");
                const setEventFormStatus = (message, isError = false) => {
                    setStatus(message, isError);
                    const inlineStatus = document.getElementById("eventFormStatus");
                    if (inlineStatus) {
                        inlineStatus.textContent = message;
                        inlineStatus.style.color = isError ? "#b3261e" : "#0f4c81";
                    }
                };
                const fileInput = document.getElementById("eventImage");
                const imageFile = fileInput?.files?.[0];
                if (!imageFile) {
                    setEventFormStatus("Choose an event image before saving.", true);
                    fileInput?.focus();
                    return;
                }
                if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(imageFile.type)) {
                    setEventFormStatus("Choose a JPEG, PNG, WebP, or GIF image.", true);
                    return;
                }
                let uploadedPath = "";
                try {
                    if (submitButton) submitButton.disabled = true;
                    setEventFormStatus("Preparing event image...");
                    const compressedImage = await compressImageTo1MB(imageFile);
                    const eventId = crypto.randomUUID();
                    uploadedPath = eventId + "/" + Date.now() + "-" + compressedImage.name.replace(/[^a-zA-Z0-9._-]/g, "_");
                    const upload = await supabase.storage.from("event-images").upload(uploadedPath, compressedImage, { contentType: compressedImage.type, upsert: false });
                    if (upload.error) throw upload.error;
                    const imageData = supabase.storage.from("event-images").getPublicUrl(uploadedPath).data;
                    const payload = {
                        title: document.getElementById("eventTitle").value.trim(),
                        date: document.getElementById("eventDate").value,
                        time: document.getElementById("eventTime").value.trim(),
                        location: document.getElementById("eventLocation").value.trim(),
                        category: document.getElementById("eventCategory").value.trim() || "General",
                        description: document.getElementById("eventDescription").value.trim(),
                        imageUrl: imageData.publicUrl,
                        createdAt: Date.now()
                    };
                    setEventFormStatus("Saving event...");
                    await addDoc(collection(db, "events"), payload);
                    addEventForm.reset();
                    setEventFormStatus("Event published. The public Events page will show it shortly.");
                    await logActivity("Added event: " + payload.title, "event");
                } catch (error) {
                    if (uploadedPath) await supabase.storage.from("event-images").remove([uploadedPath]).catch(() => {});
                    console.error("Unable to publish event.", error);
                    const detail = String(error?.message || "");
                    const lowerDetail = detail.toLowerCase();
                    const eventError = lowerDetail.includes("image_url")
                        ? "The Supabase events table is missing image_url. Run the events image_url migration from supabase-schema.sql in Supabase SQL Editor, then retry."
                        : lowerDetail.includes("bucket")
                            ? "Event image storage is not set up. Apply the latest Supabase schema and confirm the event-images bucket exists."
                            : "Event was not published: " + (detail || "Check your connection and try again.");
                    setEventFormStatus(eventError, true);
                } finally {
                    if (submitButton) submitButton.disabled = false;
                }
            });
        }

        const cfgForm = document.getElementById("siteConfigForm");
        if (cfgForm) {
            onSnapshot(doc(db, "site_config", "current"), (snap) => {
                const cfg = snap.exists() ? snap.data() : {};
                document.getElementById("cfgVerseRef").value = cfg.verseReference || "";
                document.getElementById("cfgVerseText").value = cfg.verseText || "";
                document.getElementById("cfgYearTheme").value = cfg.themeYear || "";
                document.getElementById("cfgSemesterTheme").value = cfg.themeSemester || "";
                document.getElementById("cfgWeekTheme").value = cfg.themeWeek || cfg.themeDay || "";
                document.getElementById("cfgContactEmail").value = cfg.contactEmail || "";
                document.getElementById("cfgFellowshipDay").value = cfg.fellowshipDay || "";
                document.getElementById("cfgFellowshipTime").value = cfg.fellowshipTime || "";
                document.getElementById("cfgFellowshipVenue").value = cfg.fellowshipVenue || "";
            });

            cfgForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const payload = {
                    verseReference: document.getElementById("cfgVerseRef").value.trim(),
                    verseText: document.getElementById("cfgVerseText").value.trim(),
                    themeYear: document.getElementById("cfgYearTheme").value.trim(),
                    themeSemester: document.getElementById("cfgSemesterTheme").value.trim(),
                    themeWeek: document.getElementById("cfgWeekTheme").value.trim(),
                    contactEmail: document.getElementById("cfgContactEmail").value.trim(),
                    fellowshipDay: document.getElementById("cfgFellowshipDay").value.trim(),
                    fellowshipTime: document.getElementById("cfgFellowshipTime").value.trim(),
                    fellowshipVenue: document.getElementById("cfgFellowshipVenue").value.trim(),
                    updatedAt: Date.now()
                };
                await setDoc(doc(db, "site_config", "current"), payload, { merge: true });
                setStatus("Verse and themes updated.");
                await logActivity("Updated verse and themes", "theme");
            });
        }

        const photoForm = document.getElementById("photoForm");
        if (photoForm) {
            photoForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const title = document.getElementById("photoTitle").value.trim();
                const imageLinkRaw = document.getElementById("photoImageLink").value.trim();
                const link = document.getElementById("photoDriveLink").value.trim();
                const fileInput = document.getElementById("photoFile");
                const file = fileInput && fileInput.files ? fileInput.files[0] : null;
                const imageLink = normalizeCloudImageUrl(imageLinkRaw);

                if (!title || (!file && !imageLink)) {
                    setStatus("Photo title and either image file or cloud image link are required.", true);
                    return;
                }
                try {
                    let imageBase64 = "";
                    if (file) {
                        setStatus("Compressing image...");
                        const compressedFile = await compressImageTo1MB(file);
                        imageBase64 = await fileToBase64NoPrefix(compressedFile);

                        if (imageBase64.length >= 1500000) {
                            setStatus("Image is still too large after compression. Use a smaller image.", true);
                            return;
                        }
                    }

                    const photoRef = push(dbRef(rtdb, "gallery"));
                    await set(photoRef, {
                        title,
                        image: imageBase64 || "",
                        url: imageBase64 ? "" : imageLink,
                        link: link || "",
                        createdAt: Date.now()
                    });

                    photoForm.reset();
                    setStatus("Gallery item added successfully.");
                    await logActivity(`Added gallery item: ${title}`, "gallery");
                } catch (_) {
                    setStatus("Failed to add gallery item. Check the link or image file.", true);
                }
            });
        }

        document.addEventListener("click", async (e) => {
            const memberStatusBtn = e.target.closest("[data-member-status]");
            if (memberStatusBtn) {
                const id = memberStatusBtn.getAttribute("data-member-id");
                const nextStatus = memberStatusBtn.getAttribute("data-member-status");
                if (!id || !nextStatus) return;
                memberStatusBtn.disabled = true;
                try {
                    const { data, error } = await supabase
                        .from("members")
                        .update({ membership_status: nextStatus, updated_at: new Date().toISOString() })
                        .eq("id", id)
                        .select("id, membership_status")
                        .maybeSingle();
                    if (error) throw error;
                    if (!data) throw new Error("Supabase updated no row. Verify this admin account is active in office_admins and that the members update policy is installed.");
                    const savedStatus = String(data.membership_status || "").toLowerCase();
                    if (savedStatus !== nextStatus) {
                        throw new Error("The database returned membership status '" + (savedStatus || "empty") + "' instead of '" + nextStatus + "'. Refresh and check the members table migration.");
                    }

                    // Realtime may be disabled, so show the server-confirmed status immediately.
                    const memberRow = memberStatusBtn.closest("[data-member-row]");
                    const statusLabel = memberRow?.querySelector("[data-member-status-label]");
                    const actions = memberRow?.querySelector(".member-approval-actions");
                    if (statusLabel) statusLabel.textContent = savedStatus.toUpperCase();
                    if (actions) actions.innerHTML = renderMemberActions(id, savedStatus);

                    setStatus("Membership status changed to " + savedStatus + ".");
                    await logActivity("Changed membership " + id + " to " + savedStatus, "membership");
                } catch (error) {
                    console.error("Membership approval update failed.", error);
                    const detail = String(error?.message || error || "Unknown Supabase error");
                    const lower = detail.toLowerCase();
                    const guidance = lower.includes("row-level security") || lower.includes("permission denied") || lower.includes("updated no row")
                        ? " Check that this signed-in user is an active office admin and run the latest supabase-schema.sql."
                        : "";
                    setStatus("Membership status could not be changed: " + detail + guidance, true);
                    memberStatusBtn.disabled = false;
                }
                return;
            }

            const activityBtn = e.target.closest("[data-delete-activity]");
            if (activityBtn) {
                const id = activityBtn.getAttribute("data-delete-activity");
                if (!id) return;
                await deleteDoc(doc(db, "activity_logs", id));
                setStatus("Activity item deleted.");
                return;
            }

            const editProgramBtn = e.target.closest("[data-edit-program]");
            if (editProgramBtn) {
                const id = editProgramBtn.getAttribute("data-edit-program");
                const day = prompt("Edit Day", editProgramBtn.getAttribute("data-day") || "");
                if (day === null) return;
                const title = prompt("Edit Program Title", editProgramBtn.getAttribute("data-title") || "");
                if (title === null) return;
                const time = prompt("Edit Time", editProgramBtn.getAttribute("data-time") || "");
                if (time === null) return;
                const venue = prompt("Edit Venue", editProgramBtn.getAttribute("data-venue") || "");
                if (venue === null) return;

                await updateDoc(doc(db, "programs", id), {
                    day: day.trim(),
                    title: title.trim(),
                    time: time.trim(),
                    venue: venue.trim(),
                    updatedAt: Date.now()
                });
                setStatus("Weekly program updated.");
                await logActivity(`Updated weekly program: ${day.trim()} - ${title.trim()}`, "program");
                return;
            }

            const programBtn = e.target.closest("[data-delete-program]");
            if (programBtn) {
                await deleteDoc(doc(db, "programs", programBtn.getAttribute("data-delete-program")));
                setStatus("Weekly program removed.");
                await logActivity("Deleted a weekly program", "program");
                return;
            }

            const editEventBtn = e.target.closest("[data-edit-event]");
            if (editEventBtn) {
                const id = editEventBtn.getAttribute("data-edit-event");
                const title = prompt("Edit Event Title", editEventBtn.getAttribute("data-title") || "");
                if (title === null) return;
                const date = prompt("Edit Date (YYYY-MM-DD)", editEventBtn.getAttribute("data-date") || "");
                if (date === null) return;
                const time = prompt("Edit Time", editEventBtn.getAttribute("data-time") || "");
                if (time === null) return;
                const location = prompt("Edit Location", editEventBtn.getAttribute("data-location") || "");
                if (location === null) return;
                const category = prompt("Edit Category", editEventBtn.getAttribute("data-category") || "");
                if (category === null) return;
                const description = prompt("Edit Description", editEventBtn.getAttribute("data-description") || "");
                if (description === null) return;

                await updateDoc(doc(db, "events", id), {
                    title: title.trim(),
                    date: date.trim(),
                    time: time.trim(),
                    location: location.trim(),
                    category: category.trim() || "General",
                    description: description.trim(),
                    updatedAt: Date.now()
                });
                setStatus("Event updated.");
                await logActivity(`Updated event: ${title.trim()}`, "event");
                return;
            }

            const eventBtn = e.target.closest("[data-delete-event]");
            if (eventBtn) {
                await deleteDoc(doc(db, "events", eventBtn.getAttribute("data-delete-event")));
                setStatus("Event removed.");
                await logActivity("Deleted an event", "event");
                return;
            }

            const editPhotoBtn = e.target.closest("[data-edit-photo]");
            if (editPhotoBtn) {
                const key = editPhotoBtn.getAttribute("data-edit-photo");
                const title = prompt("Edit Photo Title", editPhotoBtn.getAttribute("data-title") || "");
                if (title === null) return;
                const imageUrlRaw = prompt("Edit Google Drive/OneDrive Image Link (optional)", editPhotoBtn.getAttribute("data-url") || "");
                if (imageUrlRaw === null) return;
                const link = prompt("Edit Drive/OneDrive Link (optional)", editPhotoBtn.getAttribute("data-link") || "");
                if (link === null) return;
                const currentSnap = await get(dbRef(rtdb, `gallery/${key}`));
                const current = currentSnap.val();
                if (!current || (!current.image && !current.url)) {
                    setStatus("Photo record has no image payload.", true);
                    return;
                }
                const imageUrl = normalizeCloudImageUrl(imageUrlRaw.trim());

                await set(dbRef(rtdb, `gallery/${key}`), {
                    title: title.trim(),
                    image: current.image || "",
                    url: imageUrl || current.url || "",
                    link: link.trim(),
                    createdAt: current.createdAt || Date.now(),
                    updatedAt: Date.now()
                });
                setStatus("Photo updated.");
                await logActivity(`Updated gallery item: ${title.trim()}`, "gallery");
                return;
            }

            const photoBtn = e.target.closest("[data-delete-photo]");
            if (photoBtn) {
                const key = photoBtn.getAttribute("data-delete-photo");
                await remove(dbRef(rtdb, `gallery/${key}`));
                setStatus("Photo removed.");
                await logActivity("Deleted a gallery item", "gallery");
            }
        });
    };

    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.replace(new URL("admin-login.html", window.location.href).href);
            return;
        }

        window.setTimeout(() => void (async () => {
            try {
                const pending = getPendingOfficeAdminRegistration();
                const profile = await withTimeout(
                    ensureOfficeAdminProfile(user, pending?.fullName || ""),
                    "Admin authorization timed out. Run the latest Supabase SQL and try again."
                );
                clearPendingOfficeAdminRegistration();
                mountWorkspace(profile, user);
            } catch (error) {
                clearPendingOfficeAdminRegistration();
                const message = mapOfficeAdminError(error) || String(error?.message || "Office access is not available for this account.");
                setStatus(message, true);
                sessionStorage.setItem(OFFICE_AUTH_ERROR_KEY, message);
                await signOut(auth).catch(() => {});
                window.location.replace("admin-login.html");
            }
        })(), 0);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    try {
        initOfficeLogin();
        initOfficeDashboard();
    } catch (error) {
        console.error("Admin page initialization failed.", error);
        const status = document.getElementById("loginStatus") || document.getElementById("adminStatus");
        if (status) {
            status.textContent = `Admin page initialization failed: ${error?.message || "Unexpected JavaScript error."}`;
            status.style.color = "#b3261e";
        }
    }
});

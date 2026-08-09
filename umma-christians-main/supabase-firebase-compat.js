import { hasSupabaseConfig, supabase } from "./supabase-config.js";

const SETUP_ERROR = "Supabase is not configured. Set the project URL and anon key in supabase-config.js.";

export const browserLocalPersistence = "browserLocalPersistence";

function ensureSupabase() {
    if (!supabase) {
        throw new Error(SETUP_ERROR);
    }
    return supabase;
}

function createId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toMillis(value) {
    if (typeof value === "number") return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? Date.now() : parsed;
    }
    if (value && typeof value === "object") {
        if (typeof value.seconds === "number") {
            return (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1e6);
        }
        if (typeof value.created_at === "string") {
            return toMillis(value.created_at);
        }
    }
    return Date.now();
}

function toIso(value) {
    if (!value) return new Date().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "number") return new Date(value).toISOString();
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
}

function normalizeText(value, fallback = "") {
    const text = String(value ?? "").trim();
    return text || fallback;
}

function normalizeTableRow(table, row = {}) {
    switch (table) {
        case "programs":
            return {
                id: row.id,
                day: normalizeText(row.day),
                title: normalizeText(row.title),
                time: normalizeText(row.time),
                venue: normalizeText(row.venue),
                createdAt: toMillis(row.created_at),
                updatedAt: toMillis(row.updated_at)
            };
        case "events":
            return {
                id: row.id,
                title: normalizeText(row.title),
                date: normalizeText(row.event_date),
                time: normalizeText(row.time),
                location: normalizeText(row.location),
                category: normalizeText(row.category, "General"),
                description: normalizeText(row.description),
                hostName: normalizeText(row.host_name),
                hostType: normalizeText(row.host_type),
                organizer: normalizeText(row.host_name, "Kajiado Christian Fellowship"),
                organizerType: normalizeText(row.host_type, "KCF"),
                sourceType: "kcf",
                bannerUrl: normalizeText(row.image_url),
                startTime: normalizeText(row.start_time || row.time),
                endTime: normalizeText(row.end_time),
                venue: normalizeText(row.location),
                pollYes: Number(row.poll_yes || 0),
                pollNo: Number(row.poll_no || 0),
                createdAt: toMillis(row.created_at),
                updatedAt: toMillis(row.updated_at)
            };
        case "site_config":
            return {
                id: row.id || "current",
                verseReference: normalizeText(row.verse_reference),
                verseText: normalizeText(row.verse_text),
                themeYear: normalizeText(row.theme_year),
                themeWeek: normalizeText(row.theme_week || row.theme_day),
                themeDay: normalizeText(row.theme_day || row.theme_semester),
                themeSemester: normalizeText(row.theme_semester || row.theme_day),
                contactEmail: normalizeText(row.contact_email),
                fellowshipDay: normalizeText(row.fellowship_day),
                fellowshipTime: normalizeText(row.fellowship_time),
                fellowshipVenue: normalizeText(row.fellowship_venue),
                createdAt: toMillis(row.created_at),
                updatedAt: toMillis(row.updated_at)
            };
        case "gallery":
            return {
                id: row.id,
                title: normalizeText(row.title),
                image: normalizeText(row.image_base64),
                url: normalizeText(row.image_url),
                link: normalizeText(row.open_link),
                createdAt: toMillis(row.created_at),
                updatedAt: toMillis(row.updated_at)
            };
        case "activity_logs":
            return {
                id: row.id,
                message: normalizeText(row.message),
                type: normalizeText(row.type, "info"),
                createdAt: toMillis(row.created_at)
            };
        case "feedback":
            return {
                id: row.id,
                name: normalizeText(row.name),
                email: normalizeText(row.email),
                phone: normalizeText(row.phone),
                message: normalizeText(row.message),
                status: normalizeText(row.status, "new"),
                createdAt: toMillis(row.created_at),
                updatedAt: toMillis(row.updated_at)
            };
        case "members":
            return {
                id: row.id,
                userId: normalizeText(row.user_id),
                code: normalizeText(row.member_code),
                name: normalizeText(row.organization_name),
                type: normalizeText(row.organization_type),
                denomination: normalizeText(row.denomination),
                registrationNumber: normalizeText(row.registration_number),
                location: normalizeText(row.physical_location),
                county: normalizeText(row.county),
                town: normalizeText(row.town),
                contactName: normalizeText(row.contact_name),
                role: normalizeText(row.contact_role),
                phone: normalizeText(row.phone),
                email: normalizeText(row.email),
                website: normalizeText(row.website),
                description: normalizeText(row.description),
                logoUrl: normalizeText(row.logo_url),
                status: normalizeText(row.membership_status, "pending"),
                createdAt: toMillis(row.created_at),
                updatedAt: toMillis(row.updated_at)
            };
        case "member_events":
            return {
                id: row.id,
                memberId: normalizeText(row.member_id),
                memberCode: normalizeText(row.member_code),
                organizer: normalizeText(row.organizer),
                organizerType: normalizeText(row.organizer_type),
                sourceType: normalizeText(row.source_type, "member"),
                title: normalizeText(row.title),
                description: normalizeText(row.description),
                category: normalizeText(row.category, "General"),
                date: normalizeText(row.event_date),
                startTime: normalizeText(row.start_time),
                endTime: normalizeText(row.end_time),
                venue: normalizeText(row.venue),
                contactInfo: normalizeText(row.contact_info),
                bannerUrl: normalizeText(row.banner_url),
                registrationLink: normalizeText(row.registration_link),
                pollYes: Number(row.poll_yes || 0),
                pollMaybe: Number(row.poll_maybe || 0),
                pollNo: Number(row.poll_no || 0),
                createdAt: toMillis(row.created_at),
                updatedAt: toMillis(row.updated_at)
            };
        case "event_polls":
            return {
                id: row.id,
                eventId: normalizeText(row.event_id),
                memberId: normalizeText(row.member_id),
                response: normalizeText(row.response, "maybe"),
                createdAt: toMillis(row.created_at),
                updatedAt: toMillis(row.updated_at)
            };
        case "notifications":
            return {
                id: row.id,
                title: normalizeText(row.title),
                message: normalizeText(row.message),
                type: normalizeText(row.type, "info"),
                targetMemberId: normalizeText(row.target_member_id),
                isRead: Boolean(row.is_read),
                createdAt: toMillis(row.created_at),
                updatedAt: toMillis(row.updated_at)
            };
        default:
            return { ...row };
    }
}

function resolveCreatedAt(payload = {}, existing = {}) {
    if (existing.created_at) return existing.created_at;
    if (payload.createdAt != null) return toIso(payload.createdAt);
    if (payload.created_at != null) return toIso(payload.created_at);
    return new Date().toISOString();
}

function buildRow(table, payload = {}, existing = {}, idOverride) {
    const now = new Date().toISOString();

    switch (table) {
        case "programs":
            return {
                ...(idOverride ? { id: idOverride } : {}),
                day: normalizeText(payload.day ?? existing.day),
                title: normalizeText(payload.title ?? existing.title),
                time: normalizeText(payload.time ?? existing.time),
                venue: normalizeText(payload.venue ?? existing.venue),
                created_at: resolveCreatedAt(payload, existing),
                updated_at: now
            };
        case "events":
            return {
                ...(idOverride ? { id: idOverride } : {}),
                title: normalizeText(payload.title ?? existing.title),
                event_date: normalizeText(payload.date ?? payload.eventDate ?? existing.event_date),
                time: normalizeText(payload.time ?? existing.time),
                location: normalizeText(payload.location ?? existing.location),
                category: normalizeText(payload.category ?? existing.category, "General"),
                description: normalizeText(payload.description ?? existing.description),
                host_name: normalizeText(payload.hostName ?? payload.host_name ?? existing.host_name),
                host_type: normalizeText(payload.hostType ?? payload.host_type ?? existing.host_type),
                image_url: normalizeText(payload.bannerUrl ?? payload.imageUrl ?? existing.image_url),
                start_time: normalizeText(payload.startTime ?? payload.time ?? existing.start_time),
                end_time: normalizeText(payload.endTime ?? existing.end_time),
                poll_yes: Number(payload.pollYes ?? payload.poll_yes ?? existing.poll_yes ?? 0),
                poll_no: Number(payload.pollNo ?? payload.poll_no ?? existing.poll_no ?? 0),
                created_at: resolveCreatedAt(payload, existing),
                updated_at: now
            };
        case "site_config":
            return {
                id: idOverride || existing.id || "current",
                verse_reference: normalizeText(payload.verseReference ?? payload.verseRef ?? existing.verse_reference),
                verse_text: normalizeText(payload.verseText ?? existing.verse_text),
                theme_year: normalizeText(payload.themeYear ?? existing.theme_year),
                theme_week: normalizeText(payload.themeWeek ?? existing.theme_week ?? existing.theme_day),
                theme_day: normalizeText(payload.themeWeek ?? payload.themeDay ?? existing.theme_day),
                theme_semester: normalizeText(payload.themeSemester ?? existing.theme_semester),
                contact_email: normalizeText(payload.contactEmail ?? existing.contact_email),
                fellowship_day: normalizeText(payload.fellowshipDay ?? existing.fellowship_day),
                fellowship_time: normalizeText(payload.fellowshipTime ?? existing.fellowship_time),
                fellowship_venue: normalizeText(payload.fellowshipVenue ?? existing.fellowship_venue),
                created_at: resolveCreatedAt(payload, existing),
                updated_at: now
            };
        case "gallery":
            return {
                ...(idOverride ? { id: idOverride } : {}),
                title: normalizeText(payload.title ?? existing.title),
                image_base64: normalizeText(payload.image ?? existing.image_base64),
                image_url: normalizeText(payload.url ?? existing.image_url),
                open_link: normalizeText(payload.link ?? existing.open_link),
                created_at: resolveCreatedAt(payload, existing),
                updated_at: now
            };
        case "activity_logs":
            return {
                ...(idOverride ? { id: idOverride } : {}),
                message: normalizeText(payload.message ?? existing.message),
                type: normalizeText(payload.type ?? existing.type, "info"),
                created_at: resolveCreatedAt(payload, existing)
            };
        case "feedback":
            return {
                ...(idOverride ? { id: idOverride } : {}),
                name: normalizeText(payload.name ?? existing.name),
                email: normalizeText(payload.email ?? existing.email),
                phone: normalizeText(payload.phone ?? existing.phone),
                message: normalizeText(payload.message ?? existing.message),
                status: normalizeText(payload.status ?? existing.status, "new"),
                created_at: resolveCreatedAt(payload, existing),
                updated_at: now
            };
        case "members":
            return {
                ...(idOverride ? { id: idOverride } : {}),
                user_id: normalizeText(payload.userId ?? existing.user_id),
                created_by: normalizeText(payload.createdBy ?? existing.created_by ?? payload.userId),
                member_code: normalizeText(payload.code ?? existing.member_code),
                organization_name: normalizeText(payload.name ?? existing.organization_name),
                organization_type: normalizeText(payload.type ?? existing.organization_type),
                denomination: normalizeText(payload.denomination ?? existing.denomination),
                registration_number: normalizeText(payload.registrationNumber ?? existing.registration_number),
                physical_location: normalizeText(payload.location ?? existing.physical_location),
                county: normalizeText(payload.county ?? existing.county),
                town: normalizeText(payload.town ?? existing.town),
                contact_name: normalizeText(payload.contactName ?? existing.contact_name),
                contact_role: normalizeText(payload.role ?? existing.contact_role),
                phone: normalizeText(payload.phone ?? existing.phone),
                email: normalizeText(payload.email ?? existing.email),
                website: normalizeText(payload.website ?? existing.website),
                description: normalizeText(payload.description ?? existing.description),
                logo_url: normalizeText(payload.logoUrl ?? existing.logo_url),
                membership_status: normalizeText(payload.status ?? existing.membership_status, "pending").toLowerCase(),
                created_at: resolveCreatedAt(payload, existing),
                updated_at: now
            };
        case "member_events":
            return {
                ...(idOverride ? { id: idOverride } : {}),
                member_id: normalizeText(payload.memberId ?? existing.member_id),
                member_code: normalizeText(payload.memberCode ?? existing.member_code),
                organizer: normalizeText(payload.organizer ?? existing.organizer),
                organizer_type: normalizeText(payload.organizerType ?? existing.organizer_type),
                source_type: normalizeText(payload.sourceType ?? existing.source_type, "member"),
                title: normalizeText(payload.title ?? existing.title),
                description: normalizeText(payload.description ?? existing.description),
                category: normalizeText(payload.category ?? existing.category, "General"),
                event_date: normalizeText(payload.date ?? payload.eventDate ?? existing.event_date),
                start_time: normalizeText(payload.startTime ?? existing.start_time),
                end_time: normalizeText(payload.endTime ?? existing.end_time),
                venue: normalizeText(payload.venue ?? existing.venue),
                contact_info: normalizeText(payload.contactInfo ?? existing.contact_info),
                banner_url: normalizeText(payload.bannerUrl ?? existing.banner_url),
                registration_link: normalizeText(payload.registrationLink ?? existing.registration_link),
                poll_yes: Number(payload.pollYes ?? existing.poll_yes ?? 0),
                poll_maybe: Number(payload.pollMaybe ?? existing.poll_maybe ?? 0),
                poll_no: Number(payload.pollNo ?? existing.poll_no ?? 0),
                created_at: resolveCreatedAt(payload, existing),
                updated_at: now
            };
        case "event_polls":
            return {
                ...(idOverride ? { id: idOverride } : {}),
                event_id: normalizeText(payload.eventId ?? existing.event_id),
                member_id: normalizeText(payload.memberId ?? existing.member_id),
                response: normalizeText(payload.response ?? existing.response, "maybe"),
                created_at: resolveCreatedAt(payload, existing),
                updated_at: now
            };
        case "notifications":
            return {
                ...(idOverride ? { id: idOverride } : {}),
                title: normalizeText(payload.title ?? existing.title),
                message: normalizeText(payload.message ?? existing.message),
                type: normalizeText(payload.type ?? existing.type, "info"),
                target_member_id: normalizeText(payload.targetMemberId ?? existing.target_member_id),
                is_read: Boolean(payload.isRead ?? existing.is_read ?? false),
                created_at: resolveCreatedAt(payload, existing),
                updated_at: now
            };
        default:
            return { ...(existing || {}), ...(payload || {}) };
    }
}

function sortFieldForTable(table, field) {
    switch (table) {
        case "programs":
            if (field === "createdAt") return "created_at";
            if (field === "updatedAt") return "updated_at";
            return field;
        case "events":
            if (field === "date") return "event_date";
            if (field === "createdAt") return "created_at";
            if (field === "updatedAt") return "updated_at";
            return field;
        case "site_config":
            if (field === "createdAt") return "created_at";
            if (field === "updatedAt") return "updated_at";
            return field;
        case "gallery":
            if (field === "createdAt") return "created_at";
            if (field === "updatedAt") return "updated_at";
            return field;
        case "activity_logs":
            if (field === "createdAt") return "created_at";
            return field;
        case "members":
        case "member_events":
        case "event_polls":
        case "notifications":
            if (field === "createdAt") return "created_at";
            if (field === "updatedAt") return "updated_at";
            if (field === "date") return "event_date";
            return field;
        default:
            return field;
    }
}

function parseConstraints(table, constraints = []) {
    let orderColumn = null;
    let ascending = true;
    let limitCount = null;

    constraints.forEach((constraint) => {
        if (!constraint) return;
        if (constraint.kind === "orderBy") {
            orderColumn = sortFieldForTable(table, constraint.field);
            ascending = String(constraint.direction || "asc").toLowerCase() !== "desc";
        }
        if (constraint.kind === "limit") {
            limitCount = constraint.count;
        }
    });

    return { orderColumn, ascending, limitCount };
}

async function fetchTableRows(table, constraints = []) {
    if (!hasSupabaseConfig || !table) return [];

    const client = ensureSupabase();
    let request = client.from(table).select("*");
    const { orderColumn, ascending, limitCount } = parseConstraints(table, constraints);

    if (orderColumn) {
        request = request.order(orderColumn, { ascending });
    }

    if (typeof limitCount === "number") {
        request = request.limit(limitCount);
    }

    const { data, error } = await request;
    if (error) throw error;
    return (data || []).map((row) => normalizeTableRow(table, row));
}

async function fetchRawRow(table, id) {
    if (!hasSupabaseConfig || !table || !id) return null;

    const client = ensureSupabase();
    const { data, error } = await client.from(table).select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data || null;
}

function buildCollectionSnapshot(rows) {
    const docs = rows.map((row) => ({
        id: String(row.id),
        data: () => row
    }));

    return {
        empty: docs.length === 0,
        docs,
        size: docs.length,
        forEach: (callback) => docs.forEach(callback)
    };
}

function buildDocSnapshot(id, row) {
    return {
        id: String(id),
        exists: () => Boolean(row),
        data: () => row || undefined
    };
}

function buildRtdbSnapshot(value) {
    return {
        exists: () => value !== null && value !== undefined,
        val: () => value
    };
}

function subscribeToTable(table, refresh) {
    if (!hasSupabaseConfig || !table) return () => {};

    const client = ensureSupabase();
    const channelName = `compat-${table}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = client
        .channel(channelName)
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table
            },
            () => {
                refresh().catch((error) => {
                    console.error(`Failed to refresh ${table} after realtime update`, error);
                });
            }
        )
        .subscribe();

    return () => {
        client.removeChannel(channel);
    };
}

function authRedirect() {
    try {
        const page = window.location.pathname.endsWith("membership.html") ? "membership.html" : "admin-login.html";
        return new URL(page, window.location.href).toString();
    } catch (_) {
        return "admin-login.html";
    }
}

function baseRefPath(refLike) {
    return String(refLike?.path || refLike?.table || "").replace(/^\/+|\/+$/g, "");
}

function normalizeRefPath(path) {
    return String(path || "").replace(/^\/+|\/+$/g, "");
}

function refDetails(refLike) {
    const path = normalizeRefPath(baseRefPath(refLike));
    const parts = path.split("/").filter(Boolean);
    return {
        table: parts[0] || "",
        id: String(refLike?.id || parts[1] || ""),
        path
    };
}

export function collection(db, name) {
    return {
        client: db?.client || supabase,
        kind: "collection",
        table: String(name || "")
    };
}

export function doc(db, collectionName, id) {
    return {
        client: db?.client || supabase,
        kind: "doc",
        table: String(collectionName || ""),
        id: String(id || "")
    };
}

export function query(refLike, ...constraints) {
    return {
        ...refLike,
        kind: "query",
        constraints: [...(refLike?.constraints || []), ...constraints]
    };
}

export function orderBy(field, direction = "asc") {
    return {
        kind: "orderBy",
        field,
        direction
    };
}

export function limit(count) {
    return {
        kind: "limit",
        count
    };
}

export function ref(rtdb, path) {
    const details = refDetails({ path });
    return {
        client: rtdb?.client || supabase,
        kind: "rtdb",
        path: details.path,
        table: details.table,
        id: details.id
    };
}

export async function addDoc(collectionRef, payload) {
    const table = collectionRef?.table;
    if (!table) throw new Error("Missing collection reference.");

    const client = ensureSupabase();
    const row = buildRow(table, payload || {}, {});
    delete row.id;

    const { data, error } = await client.from(table).insert(row).select("*").maybeSingle();
    if (error) throw error;

    return {
        id: data?.id,
        data: () => (data ? normalizeTableRow(table, data) : undefined)
    };
}

export async function deleteDoc(docRef) {
    const table = docRef?.table;
    const id = docRef?.id;
    if (!table || !id) throw new Error("Missing document reference.");

    const client = ensureSupabase();
    const { error } = await client.from(table).delete().eq("id", id);
    if (error) throw error;
}

export async function setDoc(docRef, payload, options = {}) {
    const table = docRef?.table;
    const id = docRef?.id;
    if (!table || !id) throw new Error("Missing document reference.");

    const existing = options?.merge ? await fetchRawRow(table, id) : {};
    const client = ensureSupabase();
    const row = buildRow(table, payload || {}, existing || {}, id);
    const { error } = await client.from(table).upsert(row, { onConflict: "id" });
    if (error) throw error;
}

export async function updateDoc(docRef, payload) {
    const table = docRef?.table;
    const id = docRef?.id;
    if (!table || !id) throw new Error("Missing document reference.");

    const existing = (await fetchRawRow(table, id)) || {};
    const client = ensureSupabase();
    const row = buildRow(table, payload || {}, existing, id);
    const { error } = await client.from(table).upsert(row, { onConflict: "id" });
    if (error) throw error;
}

export function onSnapshot(refLike, next, error) {
    const table = refLike?.table;
    const isDoc = refLike?.kind === "doc";
    const constraints = refLike?.constraints || [];
    let cancelled = false;

    const refresh = async () => {
        try {
            if (!table) throw new Error("Missing table reference.");

            if (isDoc) {
                const row = await fetchRawRow(table, refLike.id);
                if (cancelled) return;
                next(buildDocSnapshot(refLike.id, row ? normalizeTableRow(table, row) : null));
                return;
            }

            const rows = await fetchTableRows(table, constraints);
            if (cancelled) return;
            next(buildCollectionSnapshot(rows));
        } catch (err) {
            if (typeof error === "function") error(err);
            if (cancelled) return;
            if (isDoc) {
                next(buildDocSnapshot(refLike?.id || "", null));
            } else {
                next(buildCollectionSnapshot([]));
            }
        }
    };

    refresh();
    const unsubscribe = subscribeToTable(table, refresh);

    return () => {
        cancelled = true;
        unsubscribe();
    };
}

export async function get(refLike) {
    const details = refDetails(refLike);
    if (!details.table || !details.id) {
        return buildRtdbSnapshot(null);
    }

    const row = await fetchRawRow(details.table, details.id);
    const value = row ? normalizeTableRow(details.table, row) : null;
    return buildRtdbSnapshot(value);
}

export async function set(refLike, value) {
    const details = refDetails(refLike);
    if (!details.table) throw new Error("Missing database reference.");

    const client = ensureSupabase();
    const existing = details.id ? await fetchRawRow(details.table, details.id) : {};
    const rowId = details.id || value?.id || createId();
    const row = buildRow(details.table, value || {}, existing || {}, rowId);

    if (!row.id) {
        row.id = rowId;
    }

    const { error } = await client.from(details.table).upsert(row, { onConflict: "id" });
    if (error) throw error;
}

export async function update(refLike, value) {
    const details = refDetails(refLike);
    if (!details.table || !details.id) throw new Error("Missing database reference.");

    const client = ensureSupabase();
    const existing = (await fetchRawRow(details.table, details.id)) || {};
    const row = buildRow(details.table, value || {}, existing, details.id);
    const { error } = await client.from(details.table).upsert(row, { onConflict: "id" });
    if (error) throw error;
}

export async function remove(refLike) {
    const details = refDetails(refLike);
    if (!details.table || !details.id) throw new Error("Missing database reference.");

    const client = ensureSupabase();
    const { error } = await client.from(details.table).delete().eq("id", details.id);
    if (error) throw error;
}

export function onValue(refLike, next, error) {
    const details = refDetails(refLike);
    let cancelled = false;

    const refresh = async () => {
        try {
            if (!details.table) throw new Error("Missing database reference.");

            if (details.id) {
                const row = await fetchRawRow(details.table, details.id);
                if (cancelled) return;
                next(buildRtdbSnapshot(row ? normalizeTableRow(details.table, row) : null));
                return;
            }

            const rows = await fetchTableRows(details.table, [orderBy("createdAt", "desc")]);
            if (cancelled) return;
            if (!rows.length) {
                next(buildRtdbSnapshot(null));
                return;
            }

            const value = rows.reduce((acc, row) => {
                acc[row.id] = { ...row };
                return acc;
            }, {});
            next(buildRtdbSnapshot(value));
        } catch (err) {
            if (typeof error === "function") error(err);
            if (cancelled) return;
            next(buildRtdbSnapshot(null));
        }
    };

    refresh();
    const unsubscribe = subscribeToTable(details.table, refresh);

    return () => {
        cancelled = true;
        unsubscribe();
    };
}

export function onAuthStateChanged(_auth, callback) {
    if (!hasSupabaseConfig) {
        setTimeout(() => {
            callback(null);
        }, 0);
        return () => {};
    }

    const client = ensureSupabase();
    const { data } = client.auth.onAuthStateChange((_event, session) => {
        callback(session?.user || null);
    });

    return () => {
        data.subscription.unsubscribe();
    };
}

export async function createUserWithEmailAndPassword(_auth, email, password) {
    const client = ensureSupabase();
    const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: authRedirect()
        }
    });
    if (error) throw error;
    return {
        data,
        user: data?.user || null,
        session: data?.session || null
    };
}

export async function signInWithEmailAndPassword(_auth, email, password) {
    const client = ensureSupabase();
    const { data, error } = await client.auth.signInWithPassword({
        email,
        password
    });
    if (error) throw error;
    return {
        data,
        user: data?.user || null,
        session: data?.session || null
    };
}

export async function sendPasswordResetEmail(_auth, email) {
    const client = ensureSupabase();
    const { data, error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: authRedirect()
    });
    if (error) throw error;
    return { data };
}

export async function setPersistence() {
    return undefined;
}

export async function signOut() {
    const client = ensureSupabase();
    const { error } = await client.auth.signOut();
    if (error) throw error;
}

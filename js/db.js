/**
 * db.js
 * Production async data-access layer backed by Supabase.
 */

import { supabase } from './supabase.js';

/* ─────────────────────────────────────────────────────
   ADMIN AUTH & ROLES (PHASE 1 & 3)
───────────────────────────────────────────────────── */

async function adminSignIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };

    // Check role in profiles
    const session = data.session;
    const { data: profile, error: profError } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', session.user.id)
        .single();

    if (profError || !profile || !profile.is_active) {
        await supabase.auth.signOut();
        return { success: false, error: 'Your account is disabled or unauthorized.' };
    }

    if (profile.role !== 'ADMIN' && profile.role !== 'STAFF') {
        await supabase.auth.signOut();
        return { success: false, error: 'Your account is not authorized to access this dashboard.' };
    }

    return { success: true, session };
}

async function adminSignOut() {
    await logActivity('LOGOUT', null, null, null, null);
    await supabase.auth.signOut();
}

async function getAdminSession() {
    const { data } = await supabase.auth.getSession();
    return data?.session ?? null;
}

async function getAdminProfile() {
    const session = await getAdminSession();
    if (!session) return null;
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    return data;
}

/* ─────────────────────────────────────────────────────
   FILE UPLOADS (PHASE 11) - Private Storage
───────────────────────────────────────────────────── */
async function uploadFile(file, bucket, folder, filename) {
    const path = `${folder}/${filename}`;
    const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: true });

    if (uploadError) {
        console.error(`[DB] uploadFile [${bucket}]:`, uploadError);
        return null;
    }

    // Private buckets require signed URLs for admin view, but returning the path is better for DB storage
    // The frontend should ask DB to generate a signed URL when displaying it.
    // However, if we must return a string that can be used directly or stored, we return the path.
    return path;
}

async function getSignedUrl(bucket, path) {
    if (!path) return null;
    if (path.startsWith('http')) return path; // Legacy data fallback
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60); // 1 hour
    return error ? null : data.signedUrl;
}

/* ─────────────────────────────────────────────────────
   POWER BANKS (PHASE 4 & 15)
───────────────────────────────────────────────────── */

async function getPowerBanks(status = null) {
    let query = supabase.from('power_banks').select('*').order('power_bank_number', { ascending: true });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) { console.error('[DB] getPowerBanks:', error); return []; }
    return data.map(pb => ({
        id: pb.power_bank_number, // Map legacy PB-xxx ID usage on frontend to DB power_bank_number
        internalId: pb.id,        // DB UUID
        status: pb.status,
        condition: pb.condition
    }));
}

// Transactionally reserves a power bank via backend RPC
async function reservePowerBank(internalId) {
    const { data, error } = await supabase.rpc('reserve_power_bank', { pb_id: internalId });
    if (error) { console.error('[DB] reservePowerBank:', error); return false; }
    return data;
}

async function updatePowerBankStatus(internalId, newStatus) {
    const { error } = await supabase.from('power_banks').update({ status: newStatus }).eq('id', internalId);
    return !error;
}

/* ─────────────────────────────────────────────────────
   CUSTOMER FLOW (PHASE 5)
───────────────────────────────────────────────────── */

async function createRentalRequest(payload) {
    // 1. Resolve PB UUID (Assuming frontend only knows 'PB-001')
    const { data: pbs } = await supabase.from('power_banks').select('id').eq('power_bank_number', payload.powerBankId).single();
    if (!pbs) return false;
    const internalPbId = pbs.id;

    const args = {
        p_ref_id: payload.id,
        p_pb_id: internalPbId,
        p_creation_source: payload.creationSource || 'CUSTOMER',
        p_amount: payload.amount || 500,
        p_customer_name: payload.customer.name,
        p_customer_phone: payload.customer.phone,
        p_customer_market: payload.customer.marketLine,
        p_photo_path: payload.photoPath || null,
        p_receipt_path: payload.receiptPath || null,
        p_payment_method: payload.paymentMethod || 'TRANSFER',
        p_req_status: payload.status === 'READY_FOR_COLLECTION' ? 'READY_FOR_COLLECTION' : 'PENDING_VERIFICATION',
        p_receipt_bypassed: payload.receiptBypassed || false
    };

    const { data, error } = await supabase.rpc('submit_rental_request', args);
    if (error) {
        console.error('[DB] submit_rental_request error:', error);
        return false;
    }

    if (data === true) {
        // Technically the RPC creates the DB entries, but we still trigger a separate activity log for staff
        await logActivity('RENTAL_REQUEST_CREATED', null, null, internalPbId, { ref: payload.id });
        return true;
    }
    return false;
}

/* ─────────────────────────────────────────────────────
   ADMIN WORKFLOWS (PHASE 6, 7, 8)
───────────────────────────────────────────────────── */

// Remap normalized tables to the object structure expected by `admin-dashboard.html`
async function getAdminDashboardData() {
    // 1. Fetch Requests (PENDING_VERIFICATION, PAYMENT_VERIFIED)
    const { data: requestsData, error: reqErr } = await supabase
        .from('rental_requests')
        .select(`
            *,
            customers ( full_name, phone, market_line, photo_url ),
            power_banks ( power_bank_number, internalId:id )
        `)
        .in('request_status', ['PENDING_VERIFICATION', 'PAYMENT_VERIFIED', 'READY_FOR_COLLECTION'])
        .order('submitted_at', { ascending: false });

    // 2. Fetch Active Rentals (COLLECTED) + returned/overdue for history
    const { data: rentalsData, error: rntErr } = await supabase
        .from('rentals')
        .select(`
            *,
            customers ( full_name, phone, market_line ),
            power_banks ( power_bank_number, internalId:id ),
            rental_requests ( creation_source )
        `)
        .order('created_at', { ascending: false });


    // Map them for the UI
    const requests = (requestsData || []).map(r => ({
        id: r.rental_reference,
        internalId: r.id,
        powerBankId: r.power_banks.power_bank_number,
        pbInternalId: r.power_banks.internalId,
        status: r.request_status, // Maps easily
        amount: r.payment_amount,
        timestamp: r.submitted_at,
        customer: {
            name: r.customers.full_name,
            phone: r.customers.phone,
            marketLine: r.customers.market_line
        },
        photoPath: r.customers.photo_url,
        receiptPath: r.payment_receipt_url,
        paymentMethod: r.payment_method,
        paymentStatus: r.payment_status,
        creationSource: r.creation_source
    }));

    const rentals = (rentalsData || []).map(r => ({
        id: r.rental_reference,
        internalId: r.id,
        powerBankId: r.power_banks.power_bank_number,
        pbInternalId: r.power_banks.internalId,
        status: r.status,
        amount: r.rental_amount,
        timestamp: r.created_at,
        customer: {
            name: r.customers.full_name,
            phone: r.customers.phone,
            marketLine: r.customers.market_line
        },
        chargingCordProvided: r.charging_cord_provided,
        chargingCordReturned: r.charging_cord_returned,
        chargingCordCondition: r.charging_cord_condition,
        creationSource: r.rental_requests.creation_source
    }));

    return { requests, rentals };
}

// Provide backward compatibility for UI calls
async function getRentals() {
    const { rentals } = await getAdminDashboardData();
    return rentals;
}
async function getRentalRequests() {
    const { requests } = await getAdminDashboardData();
    return requests;
}

// Track Rental public page looks up by Reference securely via RPC
async function getPublicTrackData(refId) {
    const { data, error } = await supabase.rpc('get_public_tracking_status', { p_ref_id: refId });
    if (error || !data || data.length === 0) return null;
    return {
        id: data[0].ref_id,
        powerBankId: data[0].pb_number,
        status: data[0].status
    };
}

// Admin Workflow: Verify Payment
async function verifyPayment(requestInternalId, accept = true) {
    const session = await getAdminProfile();
    const status = accept ? 'PAYMENT_VERIFIED' : 'REJECTED';
    const reqStatus = accept ? 'READY_FOR_COLLECTION' : 'REJECTED';

    // Update Request
    await supabase.from('rental_requests').update({
        payment_status: status,
        request_status: reqStatus,
        verified_at: new Date().toISOString(),
        verified_by: session.id
    }).eq('id', requestInternalId);

    // Update Payment table
    await supabase.from('payments').update({
        payment_status: status,
        recorded_at: new Date().toISOString(),
        recorded_by: session.id
    }).eq('rental_request_id', requestInternalId);

    // Log Activity
    await logActivity(accept ? 'PAYMENT_VERIFIED' : 'PAYMENT_REJECTED', null, requestInternalId, null, null);
    return true;
}

// Admin Workflow: Confirm Collection
async function confirmCollection(requestInternalId, cordProvided) {
    const session = await getAdminProfile();

    // Get request details
    const { data: req } = await supabase.from('rental_requests').select('*').eq('id', requestInternalId).single();
    if (!req || req.request_status !== 'READY_FOR_COLLECTION') return false;

    // Create the active rental
    const { data: rnt, error } = await supabase.from('rentals').insert({
        rental_reference: req.rental_reference,
        customer_id: req.customer_id,
        power_bank_id: req.power_bank_id,
        rental_request_id: req.id,
        status: 'COLLECTED',
        rental_amount: req.payment_amount,
        collected_at: new Date().toISOString(),
        collected_by: session.id,
        charging_cord_provided: cordProvided
    }).select('id').single();

    if (error) { console.error(error); return false; }

    // Update Request
    await supabase.from('rental_requests').update({ request_status: 'COLLECTED' }).eq('id', requestInternalId);

    // Update PowerBank -> RENTED
    await updatePowerBankStatus(req.power_bank_id, 'RENTED');

    // Log Activity
    await logActivity('COLLECTION_CONFIRMED', rnt.id, requestInternalId, req.power_bank_id, { cordProvided });
    return true;
}

// Admin Workflow: Process Return
async function processReturn(rentalInternalId, pbCondition, cordReturned, cordCondition) {
    const session = await getAdminProfile();

    const { data: rnt } = await supabase.from('rentals').select('*').eq('id', rentalInternalId).single();
    if (!rnt) return false;

    // Update Rental
    await supabase.from('rentals').update({
        status: 'RETURNED',
        returned_at: new Date().toISOString(),
        returned_by: session.id,
        power_bank_condition_at_return: pbCondition,
        charging_cord_returned: cordReturned,
        charging_cord_condition: cordCondition
    }).eq('id', rentalInternalId);

    // Update PowerBank -> AVAILABLE (or MAINTENANCE if damaged)
    const newPbStatus = (pbCondition === 'GOOD') ? 'AVAILABLE' : 'MAINTENANCE';
    await supabase.from('power_banks').update({
        status: newPbStatus,
        condition: pbCondition
    }).eq('id', rnt.power_bank_id);

    // Log
    await logActivity('RETURN_PROCESSED', rentalInternalId, rnt.rental_request_id, rnt.power_bank_id, { pbCondition, cordReturned });
    return true;
}

/* ─────────────────────────────────────────────────────
   ACTIVITY LOGGING (PHASE 13)
───────────────────────────────────────────────────── */

async function logActivity(action, rentalId, reqId, pbId, details) {
    const session = await getAdminSession();
    const staffId = session ? session.user.id : null;
    await supabase.from('activity_logs').insert({
        staff_id: staffId,
        action: action,
        rental_id: rentalId,
        rental_request_id: reqId,
        power_bank_id: pbId,
        details: details
    });
}
// Legacy fallbacks for un-migrated ui calls
async function logAuditAction(action, refId, details) {
    await logActivity(action, null, null, null, { legacy_ref: refId, ...details });
}

/* ─────────────────────────────────────────────────────
   EXPORTS
───────────────────────────────────────────────────── */
window.SupabaseDB = {
    // Auth
    adminSignIn,
    adminSignOut,
    getAdminSession,

    // File Storage
    uploadFile,
    getSignedUrl,

    // Operations
    getPowerBanks,
    createRental: createRentalRequest, // Mapped for legacy
    getAdminDashboardData,
    getPublicTrackData,

    // Admin workflows
    verifyPayment,
    confirmCollection,
    processReturn,

    logAuditAction
};

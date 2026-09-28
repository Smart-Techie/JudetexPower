import { supabase } from './supabase.js';

async function getAdminSession() {
    const { data, error } = await supabase.auth.getSession();
    return data?.session ?? null;
}

async function getAdminProfile() {
    const session = await getAdminSession();
    if (!session) return null;
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    return data;
}

async function searchCustomers(query, onlyActive = false) {
    let queryBuilder = supabase
        .from('customers')
        .select('*, rentals(status)')
        .order('created_at', { ascending: false });

    if (onlyActive) {
        // Only active customers (for new rentals)
        queryBuilder = queryBuilder.is('is_active', true);
    }

    if (query) {
        const q = query.toLowerCase();
        queryBuilder = queryBuilder.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,market_line.ilike.%${q}%`);
    }

    const { data, error } = await queryBuilder;
    if (error) {
        console.error('[Customers] Supabase query failed:', error);
        return { success: false, error: error.message };
    }

    const mapped = data.map(c => {
        const rentals = c.rentals || [];
        const active = rentals.find(r => r.status === 'RENTED' || r.status === 'OVERDUE');
        return {
            ...c,
            rental_count: rentals.length,
            active_status: active ? active.status : 'NONE'
        };
    });

    return { success: true, data: mapped };
}

async function getCustomerDetails(id) {
    const { data: c, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();
    if (error) return null;

    const { data: rentalsData } = await supabase
        .from('rentals')
        .select('*, power_banks(power_bank_number)')
        .eq('customer_id', id)
        .order('rented_at', { ascending: false });

    return { customer: c, rentals: rentalsData || [] };
}

async function registerCustomer(payload) {
    // 1. Normalize and strictly query duplicates
    const normalizedPhone = payload.phone.replace(/[^0-9+]/g, '');

    const { data: existing } = await supabase.from('customers')
        .select('*')
        .filter('phone', 'like', `%${normalizedPhone}%`)
        .limit(1);

    if (existing && existing.length > 0) {
        return { success: false, error: 'Customer already exists with this phone number.', exists: true, customer: existing[0] };
    }

    // 2. Format explicitly before insert
    payload.phone = normalizedPhone;

    const { data, error } = await supabase.from('customers').insert(payload).select().single();
    if (error) {
        console.error('Register customer error:', error);
        return { success: false, error: error.message };
    }
    return { success: true, customer: data };
}

async function updateCustomerPhoto(custId, path) {
    const { data, error } = await supabase.from('customers').update({ photo_url: path }).eq('id', custId).select();
    console.log('[DEBUG] Update Customer:', { data, error });
    if (error) {
        console.error('Update customer photo error:', error);
        return { success: false, error: error.message };
    }
    return { success: true };
}

async function uploadPhoto(blob) {
    if (!blob || blob.size === 0) {
        return { success: false, error: 'Invalid or empty photo payload.' };
    }
    const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
    console.log('[Storage Upload] Initiating upload of filename:', filename, 'Blob size:', blob.size, 'bytes, type:', blob.type);

    const { data, error } = await supabase.storage
        .from('customer-photos')
        .upload(filename, blob, { contentType: 'image/jpeg', upsert: true });

    if (error) {
        console.error('[Storage Upload Error]:', error);
        return { success: false, error: error.message };
    }

    if (!data || !data.path) {
        return { success: false, error: 'Upload returned empty path payload' };
    }

    console.log('[Storage Upload Success] Saved path:', data.path);
    return { success: true, path: data.path };
}

async function getPhotoUrl(path) {
    if (!path) return null;

    if (path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    }

    let filename = path;
    if (path.includes('customer-photos/')) {
        filename = path.split('customer-photos/').pop();
    }
    filename = filename.split('?')[0].replace(/^\/+/, '');

    if (!filename) return null;

    try {
        // 1. Try public URL (fastest, permanent CDN URL)
        const { data: pubData } = supabase.storage.from('customer-photos').getPublicUrl(filename);
        if (pubData && pubData.publicUrl) {
            console.log('[Photo URL] Generated public URL:', pubData.publicUrl);
            return pubData.publicUrl;
        }

        // 2. Fallback to signed URL
        const { data: signedData, error: signedErr } = await supabase.storage.from('customer-photos').createSignedUrl(filename, 3600);
        if (!signedErr && signedData?.signedUrl) {
            console.log('[Photo URL] Generated signed URL:', signedData.signedUrl);
            return signedData.signedUrl;
        }

        console.warn('[Photo URL] Signed URL failed, fallback to download:', signedErr);
        const dl = await supabase.storage.from('customer-photos').download(filename);
        if (dl.data) {
            return URL.createObjectURL(dl.data);
        }
    } catch (e) {
        console.error('[Photo URL Exception]:', e);
    }

    return null;
}

async function getAvailablePowerBanks() {
    const { data, error } = await supabase
        .from('power_banks')
        .select('*')
        .eq('status', 'AVAILABLE')
        .order('power_bank_number', { ascending: true });
    return data || [];
}

async function getAllPowerBanks() {
    const { data, error } = await supabase
        .from('power_banks')
        .select('*, rentals(*, customers(full_name))')
        .order('power_bank_number', { ascending: true });
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
}

async function addPowerBank(number, condition) {
    const { data: existing } = await supabase.from('power_banks').select('id').eq('power_bank_number', number).single();
    if (existing) {
        return { success: false, error: `Power bank ${number} already exists.` };
    }

    let initialStatus = 'AVAILABLE';
    if (condition === 'DAMAGED' || condition === 'NOT_WORKING') initialStatus = 'MAINTENANCE';

    const { data, error } = await supabase.from('power_banks').insert({
        power_bank_number: number,
        status: initialStatus,
        condition: condition
    }).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data };
}

async function createRental(payload) {
    // payload: { customer_id, power_bank_id, amount, payment_method, charging_cord_provided, rented_by }

    // Check if the power bank is actually available
    const { data: check, error: checkError } = await supabase
        .from('power_banks')
        .select('status')
        .eq('id', payload.power_bank_id)
        .single();
    if (check?.status !== 'AVAILABLE') return { success: false, error: 'Power bank not available' };

    // Change power bank status to RENTED
    await supabase.from('power_banks').update({ status: 'RENTED' }).eq('id', payload.power_bank_id);

    // Insert rental
    const { data, error } = await supabase.from('rentals').insert({
        ...payload,
        rental_reference: 'SA-' + Date.now().toString().slice(-6) + Math.random().toString(36).substring(2, 5).toUpperCase(),
        status: 'RENTED',
        rented_at: new Date().toISOString()
    }).select().single();

    if (error) {
        // Rollback power bank
        await supabase.from('power_banks').update({ status: 'AVAILABLE' }).eq('id', payload.power_bank_id);
        return { success: false, error: error.message };
    }
    return { success: true, rental: data };
}

async function getActiveRentals() {
    const { data, error } = await supabase
        .from('rentals')
        .select(`
            *,
            customers (*),
            power_banks (power_bank_number)
        `)
        .in('status', ['RENTED', 'OVERDUE'])
        .order('rented_at', { ascending: false });
    return data || [];
}

async function getOverdueRentals() {
    const { data, error } = await supabase
        .from('rentals')
        .select(`
            *,
            customers (*),
            power_banks (power_bank_number)
        `)
        .eq('status', 'OVERDUE')
        .order('rented_at', { ascending: false });
    return data || [];
}

async function markRentalsOverdue() {
    // Determine business day closing (just assuming older than 18 hours for this demo)
    const cutoff = new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('rentals')
        .update({ status: 'OVERDUE' })
        .eq('status', 'RENTED')
        .lt('rented_at', cutoff)
        .select('id, power_bank_id');

    if (data && data.length > 0) {
        data.forEach(async (r) => {
            await supabase.from('power_banks').update({ status: 'OVERDUE' }).eq('id', r.power_bank_id);
        });
    }
}

async function processReturn(rentalId, pbId, payload) {
    // payload: { power_bank_condition_at_return, charging_cord_returned, charging_cord_condition, return_notes, returned_by }

    // Update rentals
    const { data, error } = await supabase.from('rentals').update({
        ...payload,
        status: 'RETURNED',
        returned_at: new Date().toISOString()
    }).eq('id', rentalId);

    if (error) return { success: false, error: error.message };

    // Determine power bank new state
    const newState = (payload.power_bank_condition_at_return === 'GOOD' || payload.power_bank_condition_at_return === 'MINOR_DAMAGE')
        ? 'AVAILABLE' : 'MAINTENANCE';

    await supabase.from('power_banks').update({
        status: newState,
        condition: payload.power_bank_condition_at_return
    }).eq('id', pbId);

    return { success: true };
}

async function getDashboardStats() {
    const [pbRes, custRes, rentRes, incRes] = await Promise.all([
        supabase.from('power_banks').select('status, id'),
        supabase.from('customers').select('id', { count: 'exact' }),
        supabase.from('rentals').select('status, id'),
        // using today's revenue simplistic query
        supabase.from('rentals').select('amount, rented_at').gte('rented_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
    ]);

    const pbs = pbRes.data || [];
    const available = pbs.filter(p => p.status === 'AVAILABLE').length;
    const returned = pbs.filter(p => p.status === 'RENTED').length;

    const rentals = rentRes.data || [];
    const active = rentals.filter(r => r.status === 'RENTED').length;
    const overdue = rentals.filter(r => r.status === 'OVERDUE').length;

    const revenue = (incRes.data || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    return {
        availablePBs: available,
        rented: active,
        overdue: overdue,
        totalCustomers: custRes.count || 0,
        revenue: revenue
    }
}

async function signOut() {
    await supabase.auth.signOut();
    window.location.href = 'admin-login.html';
}

async function deleteCustomer(id) {
    const { data: cust, error: fetchErr } = await supabase.from('customers').select('photo_url').eq('id', id).single();
    if (fetchErr) return { success: false, error: fetchErr.message };

    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) {
        console.error('Delete error:', error);
        return { success: false, error: error.message };
    }

    if (cust && cust.photo_url && !cust.photo_url.startsWith('http')) {
        await supabase.storage.from('customer-photos').remove([cust.photo_url]);
    }
    return { success: true };
}

async function archiveCustomer(id, activeStatus) {
    const { error } = await supabase.from('customers').update({ is_active: activeStatus }).eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
}

async function getRentalHistory() {
    const { data, error } = await supabase
        .from('rentals')
        .select('*, customers(full_name), power_banks(power_bank_number)')
        .order('rented_at', { ascending: false })
        .limit(100);
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
}

async function getReportsData() {
    const { data, error } = await supabase.from('rentals').select('*');
    if (error) return { success: false };

    let now = new Date();
    let todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - todayStart.getDay());

    let monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let d = { todayRent: 0, todayRev: 0, weekRent: 0, monthRent: 0 };

    for (let r of data) {
        let rDate = new Date(r.rented_at);
        if (rDate >= monthStart) d.monthRent++;
        if (rDate >= weekStart) d.weekRent++;
        if (rDate >= todayStart) {
            d.todayRent++;
            d.todayRev += (r.amount || 500);
        }
    }
    return { success: true, data: d };
}

async function getStaffProfiles() {
    const { data, error } = await supabase.from('profiles').select('*').order('full_name');
    if (error) return [];
    return data;
}

window.ShopDB = {
    getAdminSession,
    getAdminProfile,
    searchCustomers,
    getCustomerDetails,
    registerCustomer,
    updateCustomerPhoto,
    uploadPhoto,
    getPhotoUrl,
    getAvailablePowerBanks,
    getAllPowerBanks,
    addPowerBank,
    createRental,
    getActiveRentals,
    getOverdueRentals,
    processReturn,
    getRentalHistory,
    getDashboardStats,
    getReportsData,
    getStaffProfiles,
    markRentalsOverdue,
    signOut,
    deleteCustomer,
    archiveCustomer
};

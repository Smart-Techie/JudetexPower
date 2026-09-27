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

async function searchCustomers(query) {
    let queryBuilder = supabase
        .from('customers')
        .select('*, rentals(status)')
        .order('created_at', { ascending: false });

    if (query) {
        const q = query.toLowerCase();
        queryBuilder = queryBuilder.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,market_line.ilike.%${q}%`);
    }

    const { data, error } = await queryBuilder;
    if (error) { console.error('Search error:', error); return []; }
    return data.map(c => {
        const rentals = c.rentals || [];
        const active = rentals.find(r => r.status === 'RENTED' || r.status === 'OVERDUE');
        return {
            ...c,
            rental_count: rentals.length,
            active_status: active ? active.status : 'NONE'
        };
    });
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
    // payload: { full_name, phone, market_line, notes, photo_path }
    const { data, error } = await supabase.from('customers').insert(payload).select().single();
    if (error) {
        console.error('Register customer error:', error);
        return { success: false, error: error.message };
    }
    return { success: true, customer: data };
}

async function uploadPhoto(file) {
    const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
    const { data, error } = await supabase.storage
        .from('customer-photos')
        .upload(filename, file);
    if (error) {
        console.error('Upload Error:', error);
        return null; // upload failed
    }
    return data.path; // returns string path
}

async function getPhotoUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    const { data } = await supabase.storage.from('customer-photos').createSignedUrl(path, 60 * 60);
    return data?.signedUrl || null;
}

async function getAvailablePowerBanks() {
    const { data, error } = await supabase
        .from('power_banks')
        .select('*')
        .eq('status', 'AVAILABLE')
        .order('power_bank_number', { ascending: true });
    return data || [];
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

window.ShopDB = {
    getAdminSession,
    getAdminProfile,
    searchCustomers,
    getCustomerDetails,
    registerCustomer,
    uploadPhoto,
    getPhotoUrl,
    getAvailablePowerBanks,
    createRental,
    getActiveRentals,
    getOverdueRentals,
    processReturn,
    getDashboardStats,
    markRentalsOverdue,
    signOut
};

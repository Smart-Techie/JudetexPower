const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://gnerkzwnxlojhjxfybhz.supabase.co',
    'sb_publishable_xoNxbJjrsBTViHFUesdKTA_07tZpwva'
);

async function listBuckets() {
    const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
    console.log("Buckets:", buckets?.map(b => b.name), "Err:", bErr?.message);

    if (buckets) {
        for (let b of buckets) {
            const { data, error } = await supabase.storage.from(b.name).list();
            console.log(`Files in ${b.name}:`, data?.length || 0, "Err:", error?.message);
            if (data && data.length > 0) {
                console.log("  Sample:", data[0].name);
            }
        }
    }

    const { data: c, error } = await supabase.from('customers').select('photo_url').limit(5);
    console.log("Customers photo_urls:", c);
}
listBuckets();

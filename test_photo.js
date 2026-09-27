const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://gnerkzwnxlojhjxfybhz.supabase.co',
    'sb_publishable_xoNxbJjrsBTViHFUesdKTA_07tZpwva'
);

async function testPhotos() {
    let { data: customers, error: errOpts } = await supabase.from('customers').select('id, full_name, photo_url');
    console.log("Customers:");
    if (!customers || customers.length === 0) {
        console.log("No customers found");
        return;
    }
    for (let c of customers) {
        console.log(`Cust: ${c.full_name}, url: ${c.photo_url}`);
        if (c.photo_url) {
            let res = await supabase.storage.from('customer-photos').createSignedUrl(c.photo_url, 3600);
            console.log("Signed Url Res:", res);
        }
    }
}
testPhotos();

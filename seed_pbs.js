const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://gnerkzwnxlojhjxfybhz.supabase.co',
    'sb_publishable_xoNxbJjrsBTViHFUesdKTA_07tZpwva'
);

async function seed() {
    let pbs = [];
    for (let i = 1; i <= 96; i++) {
        let num = i < 10 ? `PB-00${i}` : `PB-0${i}`;
        pbs.push({
            power_bank_number: num,
            status: 'AVAILABLE',
            condition: 'GOOD'
        });
    }

    // Check which ones already exist
    let { data: existing, error: errOpts } = await supabase.from('power_banks').select('power_bank_number');
    if (errOpts) {
        console.error('Error fetching existing', errOpts);
        return;
    }

    let existingSet = new Set(existing.map(p => p.power_bank_number));

    let toInsert = pbs.filter(p => !existingSet.has(p.power_bank_number));

    if (toInsert.length === 0) {
        console.log('No new power banks to insert.');
        return;
    }

    console.log(`Inserting ${toInsert.length} power banks...`);

    const { error } = await supabase.from('power_banks').insert(toInsert);
    if (error) {
        console.error('Failed to insert', error);
    } else {
        console.log('Successfully inserted all power banks up to PB-096!');
    }
}

seed();

const fs = require('fs');

let sql = 'INSERT INTO public.power_banks (power_bank_number, status, condition) VALUES \n';
let values = [];
for (let i = 1; i <= 96; i++) {
    let num = i < 10 ? 'PB-00' + i : 'PB-0' + i;
    values.push(`('${num}', 'AVAILABLE', 'GOOD')`);
}
sql += values.join(',\n') + ' ON CONFLICT (power_bank_number) DO NOTHING;';
fs.writeFileSync('migrations/024_seed_powerbanks.sql', sql);

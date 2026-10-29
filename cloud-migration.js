/* Mikasa: guarded one-time local-to-cloud migration.
 * Imports only explicit local ledger rows; never wipes or replaces cloud data.
 * Current source ledger has no payment-event history, so migration does not invent events.
 */
(() => {
  'use strict';
  const buttonId = 'mkCloudImport';
  const localKey = 'mikasa.v01.records';
  const custKey = 'mikasa.v01.customers';
  let busy = false;

  const statusLine = (text, isError = false) => {
    let el = document.getElementById('mkCloudMigrationStatus');
    if (!el) {
      el = document.createElement('p');
      el.id = 'mkCloudMigrationStatus';
      el.style.cssText = 'margin:10px 0;color:var(--text-2);font-size:12px;white-space:pre-wrap';
      document.getElementById(buttonId)?.insertAdjacentElement('afterend', el);
    }
    el.style.color = isError ? 'var(--bad)' : 'var(--text-2)';
    el.textContent = text;
  };
  const normName = s => String(s || '').trim().normalize('NFKC').toLocaleLowerCase('id');
  const normPeriod = s => String(s || '').slice(0, 10);
  const money = n => Number.isSafeInteger(Number(n)) && Number(n) > 0 ? Number(n) : 0;

  async function migrate() {
    if (busy) return;
    const client = window.MIKASA_AUTH_CLIENT;
    if (!client) { statusLine('Sesi belum siap. Muat ulang saat koneksi tersedia.', true); return; }
    busy = true;
    const btn = document.getElementById(buttonId);
    if (btn) btn.disabled = true;
    try {
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      const user = userData?.user;
      if (!user) throw new Error('Sesi login tidak ditemukan. Silakan login kembali.');

      const raw = JSON.parse(localStorage.getItem(localKey) || '[]');
      const importedNames = JSON.parse(localStorage.getItem(custKey) || '[]');
      if (!Array.isArray(raw) || !Array.isArray(importedNames)) throw new Error('Format data lokal tidak valid.');
      const parsed = raw.map((r,index)=>({localId:String(r?.id||''),name:String(r?.name||r?.nama||'').trim(),period:normPeriod(r?.period||r?.date),amount:money(r?.amount??r?.jumlah),status:r?.status==='cash'||r?.status==='lunas'?'paid':'unpaid',index}));
      const invalid = parsed.filter(r=>!r.name||!/^\d{4}-\d{2}-\d{2}$/.test(r.period)||!r.amount);
      if(invalid.length) throw new Error('Preflight batal: '+invalid.length+' baris lokal tidak valid; tidak ada perubahan cloud.');
      const bills=[]; const srcKeys=new Map();
      for(const b of parsed){const k=normName(b.name)+'|'+b.period;const p=srcKeys.get(k);if(!p){srcKeys.set(k,b);bills.push(b);}else if(p.amount!==b.amount||p.status!==b.status)throw new Error('Preflight batal: konflik lokal '+b.name+' / '+b.period+'; tidak ada perubahan cloud.');}
      if (!bills.length && !importedNames.length) throw new Error('Tidak ada data lokal valid untuk migrasi.');
      const uniqueNames = [...new Set([
        ...importedNames.map(x => typeof x === 'string' ? x.trim() : ''),
        ...bills.map(b => b.name)
      ].filter(Boolean))];
      const total = bills.length;
      if (!confirm('MIGRASI LOKAL → CLOUD\n\nAkun: ' + user.email +
        '\nPelanggan/nama yang diperiksa: ' + uniqueNames.length +
        '\nCatatan tagihan lokal valid: ' + total +
        '\n\nProses ini menambahkan data yang belum ada. Data cloud yang ada tidak ditimpa. Tagihan dicocokkan berdasarkan pelanggan + periode. Status lunas hanya dipindahkan sebagai status; riwayat pembayaran tidak dibuat karena tidak tersedia di data lokal.\n\nLanjutkan?')) return;

      statusLine('Memeriksa data cloud…');
      const { data: cloudCustomers, error: cErr } = await client.from('mikasa_customers')
        .select('id,name,deleted').eq('user_id', user.id).eq('deleted', false);
      if (cErr) throw cErr;
      const customerByName = new Map();
      (cloudCustomers || []).forEach(c => {
        const k = normName(c.name);
        if (k && !customerByName.has(k)) customerByName.set(k, c.id);
      });

      const nameCounts=new Map(); (cloudCustomers||[]).forEach(c=>{const k=normName(c.name);if(k)nameCounts.set(k,(nameCounts.get(k)||0)+1);});
      if([...nameCounts.values()].some(n=>n>1)) throw new Error('Preflight batal: nama pelanggan cloud ambigu; tidak ada perubahan cloud.');
      let addedCustomers = 0, reusedCustomers = 0;
      for (const name of uniqueNames) {
        const k = normName(name);
        if (customerByName.has(k)) { reusedCustomers++; continue; }
        const { data, error } = await client.from('mikasa_customers')
          .insert({ user_id: user.id, name, phone: null, notes: null })
          .select('id').single();
        if (error) {
          // A same-name profile may have appeared from another device during this run.
          if (error.code === '23505') {
            const retry = await client.from('mikasa_customers').select('id,name,deleted')
              .eq('user_id', user.id).eq('deleted', false);
            if (retry.error) throw retry.error;
            const found = (retry.data || []).find(c => normName(c.name) === k);
            if (found) { customerByName.set(k, found.id); reusedCustomers++; continue; }
          }
          throw error;
        }
        customerByName.set(k, data.id);
        addedCustomers++;
      }

      // Query all bills for the selected owner and skip matching active customer-period pairs.
      const { data: cloudBills, error: bErr } = await client.from('mikasa_bills')
        .select('id,customer_id,period,status,amount,deleted').eq('user_id', user.id).eq('deleted', false);
      if (bErr) throw bErr;
      const billKey = (customerId, period) => customerId + '|' + normPeriod(period);
      const existingByKey = new Map((cloudBills || []).map(b => [billKey(b.customer_id,b.period),b]));
      const conflicts=bills.filter(b=>{const id=customerByName.get(normName(b.name));const old=existingByKey.get(billKey(id,b.period));return old&&(Number(old.amount)!==b.amount||old.status!==b.status);});
      if(conflicts.length) throw new Error('Preflight batal: '+conflicts.length+' tagihan cloud berbeda nominal/status; perlu rekonsiliasi.');
      const knownBills = new Set(existingByKey.keys());
      let addedBills = 0, skippedBills = 0, paymentsOmitted = 0;
      for (const b of bills) {
        const customerId = customerByName.get(normName(b.name));
        if (!customerId) throw new Error('Pemetaan pelanggan gagal: ' + b.name);
        const key = billKey(customerId, b.period);
        if (knownBills.has(key)) { skippedBills++; continue; }
        const { error } = await client.from('mikasa_bills').insert({
          user_id: user.id, customer_id: customerId, period: b.period,
          amount: b.amount, status: b.status
        });
        if (error) {
          if (error.code === '23505') { skippedBills++; knownBills.add(key); continue; }
          throw error;
        }
        knownBills.add(key);
        addedBills++;
        if (b.status === 'paid') paymentsOmitted++;
      }
      statusLine('Migrasi selesai.\nPelanggan baru: ' + addedCustomers +
        '\nPelanggan yang dipakai ulang: ' + reusedCustomers +
        '\nTagihan ditambahkan: ' + addedBills +
        '\nTagihan dilewati (sudah ada): ' + skippedBills +
        (paymentsOmitted ? '\nCatatan: ' + paymentsOmitted + ' tagihan berstatus lunas dipindahkan tanpa event pembayaran.' : '') +
        '\nPerangkat lokal tidak dihapus.');
      alert('Migrasi selesai. Tagihan baru: ' + addedBills + '. Dilewati: ' + skippedBills + '.');
    } catch (err) {
      console.error('[Mikasa cloud migration]', err);
      statusLine('Migrasi berhenti: ' + (err?.message || 'Kesalahan tidak diketahui') +
        '\nData lokal tetap dipertahankan. Periksa koneksi/izin lalu jalankan lagi; proses dirancang melewati data yang sudah ada.', true);
      alert('Migrasi belum tuntas: ' + (err?.message || 'Kesalahan tidak diketahui'));
    } finally {
      busy = false;
      if (btn) btn.disabled = false;
    }
  }

  function attach() {
    const btn = document.getElementById(buttonId);
    if (!btn || btn.dataset.migrationReady) return !!btn;
    btn.dataset.migrationReady = '1';
    btn.addEventListener('click', migrate);
    statusLine('Cloud: login aktif. Migrasi hanya berjalan setelah Anda menekan tombol dan menyetujui konfirmasi.');
    return true;
  }
  if (!attach()) {
    const observer = new MutationObserver(() => { if (attach()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  window.addEventListener('online', () => {
    if (window.MIKASA_AUTH_CLIENT) statusLine('Koneksi online. Anda dapat menjalankan migrasi cloud.');
  });
})();

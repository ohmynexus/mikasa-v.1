/* Personal cloud sync for Mikasa.
 * Deliberately read-only in this release: never pushes local data implicitly.
 * This protects a fresh-start workflow from overwriting the user's cloud state.
 */
(() => {
  const button = document.getElementById('bCloudSync');
  const status = document.getElementById('cloudSyncStatus');
  if (!button || !status) return;
  let client = null;
  let busy = false;

  const say = message => { status.textContent = message; };

  async function ready() {
    if (client) return client;
    const cfg = window.MIKASA_SUPABASE_CONFIG;
    if (!cfg?.url || !cfg?.publishableKey) throw new Error('Konfigurasi cloud belum tersedia.');
    if (!window.supabase?.createClient) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Library cloud tidak dapat dimuat. Periksa internet.'));
        document.head.append(script);
      });
    }
    client = window.MIKASA_AUTH_CLIENT || window.supabase.createClient(cfg.url, cfg.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    return client;
  }

  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    button.textContent = 'Memeriksa…';
    say('Memeriksa sesi login dan koneksi cloud…');
    try {
      const supa = await ready();
      const { data: sessionData, error: sessionError } = await supa.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) throw new Error('Tidak ada sesi login. Masuk kembali ke akun Mikasa.');
      const { data: userData, error: userError } = await supa.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error('Sesi login tidak valid. Masuk kembali.');
      // Verify access only; never touch local records and never auto-upload.
      const checks = await Promise.all([
        supa.from('mikasa_customers').select('id', { count: 'exact', head: true }),
        supa.from('mikasa_bills').select('id', { count: 'exact', head: true }),
        supa.from('mikasa_payments').select('id', { count: 'exact', head: true })
      ]);
      const failed = checks.find(item => item.error);
      if (failed) throw failed.error;
      say('Koneksi cloud dan hak akses berhasil. Data cloud dapat dibaca. Tidak ada unggah otomatis; sinkronisasi tulis dua arah belum diaktifkan.');
      document.dispatchEvent(new CustomEvent('mikasa:cloud-check', {
        detail: { userId: userData.user.id, counts: checks.map(item => item.count ?? 0) }
      }));
    } catch (error) {
      say(error?.message || 'Sinkronisasi cloud gagal. Periksa koneksi lalu coba lagi.');
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = 'Sinkronkan sekarang';
    }
  });
})();
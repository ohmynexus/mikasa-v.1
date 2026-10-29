/* Mikasa Cloud auth gate — account access only; billing sync is not enabled here. */
(() => {
  const cfg = window.MIKASA_SUPABASE_CONFIG;
  const root = document.documentElement;
  let client;
  const style = document.createElement('style');
  style.textContent = `
    #mikasaAuthGate{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:20px;background:var(--bg,#0a0c12);color:var(--text,#f4f6fb);font-family:var(--sans,system-ui)}
    #mikasaAuthGate[hidden]{display:none}
    #mikasaAuthGate .auth-card{width:min(100%,420px);padding:28px;border:1px solid var(--line-2,rgba(255,255,255,.14));border-radius:20px;background:var(--surface,#12161f);box-shadow:0 20px 70px #0005}
    #mikasaAuthGate h1{font-size:24px;margin:0 0 6px}#mikasaAuthGate p{color:var(--text-2,#9aa4b8);margin:0 0 20px;font-size:13px}
    #mikasaAuthGate label{display:block;font-size:12px;font-weight:700;margin:12px 0 6px}
    #mikasaAuthGate input{width:100%;padding:12px;border:1px solid var(--line-2,rgba(255,255,255,.14));border-radius:10px;background:var(--bg-2,#0e1119);color:inherit}
    #mikasaAuthGate button{width:100%;padding:12px;border-radius:10px;background:var(--accent,#f43f5e);color:white;font-weight:800;margin-top:14px}
    #mikasaAuthGate .auth-secondary{background:transparent;border:1px solid var(--line-2,rgba(255,255,255,.14));color:inherit;margin-top:8px}
    #mikasaAuthGate .auth-message{min-height:20px;margin-top:12px;white-space:pre-wrap;overflow-wrap:anywhere}
  `;
  document.head.append(style);
  const gate=document.createElement('section');
  gate.id='mikasaAuthGate';
  gate.innerHTML=`<div class="auth-card"><h1>MIKASA CLOUD</h1><p id="mkAuthIntro">Masuk ke akun Mikasa Anda.</p>
    <form id="mkAuthForm"><label for="mkAuthEmail">Email</label><input id="mkAuthEmail" type="email" autocomplete="username" required>
    <label for="mkAuthPassword">Password</label><input id="mkAuthPassword" type="password" minlength="8" autocomplete="current-password" required>
    <button id="mkAuthSubmit" type="submit">Masuk</button></form>
    <button class="auth-secondary" id="mkAuthMode" type="button">Buat akun Mikasa utama</button>
    <p class="auth-message" id="mkAuthMessage" role="status"></p>
    <p style="margin:8px 0 0;font-size:11px">Akun ini terpisah dari login dashboard Supabase. Jangan gunakan password dashboard.</p>
    </div>`;
  document.body.prepend(gate);
  const shell=document.querySelector('.shell');
  if(shell) shell.hidden=true;
  const form=gate.querySelector('#mkAuthForm'), submit=gate.querySelector('#mkAuthSubmit'), mode=gate.querySelector('#mkAuthMode');
  const intro=gate.querySelector('#mkAuthIntro'), message=gate.querySelector('#mkAuthMessage'), password=gate.querySelector('#mkAuthPassword');
  let registering=false, working=false;
  const msg=(s)=>message.textContent=s;
  function showApp(){gate.hidden=true;if(shell)shell.hidden=false;root.dataset.mikasaAuth='ready';}
  function loadSdk(){
    if(window.supabase?.createClient)return Promise.resolve();
    return new Promise((resolve,reject)=>{const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';sc.onload=resolve;sc.onerror=()=>reject(new Error('Library autentikasi tidak bisa dimuat. Periksa internet lalu muat ulang.'));document.head.append(sc);});
  }
  mode.addEventListener('click',()=>{registering=!registering;submit.textContent=registering?'Daftar akun utama':'Masuk';mode.textContent=registering?'Kembali ke login':'Buat akun Mikasa utama';password.autocomplete=registering?'new-password':'current-password';intro.textContent=registering?'Buat satu akun utama. Setelah itu gunakan akun yang sama di perangkat istri.':'Masuk ke akun Mikasa Anda.';msg('');});
  (async()=>{
    try{
      if(!cfg?.url||!cfg?.publishableKey)throw new Error('Konfigurasi Supabase belum tersedia.');
      await loadSdk();
      client=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      window.MIKASA_AUTH_CLIENT=client;
      const {data,error}=await client.auth.getSession();if(error)throw error;
      if(data.session){showApp();return;}
      client.auth.onAuthStateChange((event,session)=>{if(session&&['SIGNED_IN','TOKEN_REFRESHED'].includes(event))showApp();});
      msg('Siap. Silakan masuk atau buat akun utama.');
    }catch(e){msg(e.message||'Gagal menyiapkan login.');}
  })();
  form.addEventListener('submit',async ev=>{
    ev.preventDefault();if(working||!client){msg('Login belum siap. Pastikan internet aktif, lalu muat ulang.');return;}
    const email=gate.querySelector('#mkAuthEmail').value.trim(), pass=password.value;
    working=true;submit.disabled=true;submit.textContent='Memproses…';msg('');
    try{
      if(registering){
        const {data,error}=await client.auth.signUp({email,password:pass});
        if(error)throw error;
        if(data.session){showApp();return;}
        msg('Pendaftaran diterima. Periksa email untuk verifikasi, lalu kembali login.');
      }else{
        const {error}=await client.auth.signInWithPassword({email,password:pass});
        if(error)throw error;
        showApp();
      }
    }catch(e){msg(e.message||'Permintaan gagal.');}
    finally{working=false;submit.disabled=false;submit.textContent=registering?'Daftar akun utama':'Masuk';}
  });
  window.MIKASA_SIGN_OUT=async()=>{if(!client)return;const {error}=await client.auth.signOut();if(error){alert(error.message);return;}gate.hidden=false;if(shell)shell.hidden=true;};
})();
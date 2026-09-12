(function(){
  const style=document.createElement('style');
  style.textContent=`
  :root{--bg:#f4f7fb;--ink:#0f172a;--ink-soft:#64748b;--ink-faint:#94a3b8;--line:rgba(15,23,42,.09);--line-strong:rgba(15,23,42,.14);--accent:#2563eb}
  body{background:radial-gradient(900px 420px at 5% -10%,#dbeafe 0%,transparent 65%),radial-gradient(850px 420px at 100% 0%,#e0e7ff 0%,transparent 62%),var(--bg)!important;padding:0 24px 64px!important;color:var(--ink)}
  .wrap{max-width:1180px!important}
  .top{padding:30px 0 18px!important;margin-bottom:10px!important}
  .top h1{font-size:24px!important;letter-spacing:-.035em!important;color:#0f172a!important;font-weight:700!important}
  .glass,.panel,.stat{background:rgba(255,255,255,.76)!important;border-color:rgba(15,23,42,.10)!important;box-shadow:0 10px 35px -25px rgba(15,23,42,.28),0 1px 0 rgba(255,255,255,.9) inset!important}
  .panel{border-radius:20px!important;padding:20px!important}.stats{gap:12px!important}.stat{border-radius:16px!important;padding:16px 18px!important}.stat .label{font-size:10px!important;letter-spacing:.09em!important;color:#64748b!important}.stat .value{font-size:26px!important;color:#0f172a!important}
  input,select,textarea{background:rgba(248,250,252,.9)!important;border-color:rgba(15,23,42,.12)!important;border-radius:10px!important}
  .add-btn{border-radius:10px!important;background:linear-gradient(180deg,#3b82f6,#2563eb)!important}.tag{border-radius:999px!important;padding:3px 8px!important;font-size:11px!important}.peek{width:460px!important;background:rgba(255,255,255,.96)!important}
  @media(max-width:700px){body{padding:0 12px 40px!important}.top{padding-top:22px!important}.top h1{font-size:20px!important}.panel{padding:15px!important}}
  `;document.head.appendChild(style);
  function header(){if(document.getElementById('ob-command-header'))return;const w=document.querySelector('.wrap');if(!w)return;const b=document.createElement('div');b.id='ob-command-header';b.innerHTML='<div class="ob-brand"><span class="ob-mark">OB</span><div><div class="ob-name">OB Trading System</div><div class="ob-caption">Execution · Journal · Performance</div></div></div><div class="ob-status"><span class="ob-live-dot"></span>System online</div>';w.prepend(b);const s=document.createElement('style');s.textContent='#ob-command-header{display:flex;justify-content:space-between;align-items:center;padding:18px 2px 4px;gap:16px}.ob-brand{display:flex;align-items:center;gap:11px}.ob-mark{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:#0f172a;color:#fff;font-weight:800;font-size:12px}.ob-name{font-size:14px;font-weight:750}.ob-caption{font-size:10px;color:#94a3b8;margin-top:2px}.ob-status{display:flex;align-items:center;gap:7px;font-size:10px;color:#64748b}.ob-live-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.12)}@media(max-width:600px){.ob-caption{display:none}}';document.head.appendChild(s)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',header);else header();
})();

// Phase 4 backup foundation: export/import through the app's real storage layer.
// This keeps backups compatible with Supabase/server storage instead of relying on localStorage only.
(function phase4Backup(){
  if (window.__phase4BackupLoaded) return;
  window.__phase4BackupLoaded = true;

  async function read(key, fallback) {
    try {
      const raw = await storageGet(key);
      if (!raw) return fallback;
      return JSON.parse(raw) ?? fallback;
    } catch { return fallback; }
  }

  async function collectBackup() {
    const [trades, accounts, strategies, context, analyticsFilters] = await Promise.all([
      read('ob-trades', []),
      read('ob-accounts', []),
      read('ob-strategies', []),
      read('ob-context', null),
      read('ob-analytics-filters', null)
    ]);
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      source: 'ob-trading-system',
      trades,
      accounts,
      strategies,
      context,
      analyticsFilters
    };
  }

  async function exportBackup() {
    const button = document.getElementById('backup-export');
    if (button) { button.disabled = true; button.textContent = 'Preparing…'; }
    try {
      const data = await collectBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ob-trading-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      localStorage.setItem('ob-last-backup', new Date().toISOString());
      renderBackupPanel();
    } catch (err) {
      disciplineShowWarning?.('Backup failed', err?.message || 'The backup could not be created.');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Export backup'; }
    }
  }

  async function restoreBackup(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.trades)) throw new Error('Invalid backup file: trades are missing.');
    if (data.version && Number(data.version) > 2) throw new Error('This backup was created by a newer version of the system.');

    const writes = [storageSet('ob-trades', JSON.stringify(data.trades))];
    if (Array.isArray(data.accounts)) writes.push(storageSet('ob-accounts', JSON.stringify(data.accounts)));
    if (Array.isArray(data.strategies)) writes.push(storageSet('ob-strategies', JSON.stringify(data.strategies)));
    if (data.context) writes.push(storageSet('ob-context', JSON.stringify(data.context)));
    if (data.analyticsFilters) writes.push(storageSet('ob-analytics-filters', JSON.stringify(data.analyticsFilters)));
    await Promise.all(writes);
    localStorage.setItem('ob-last-backup', new Date().toISOString());
    window.location.reload();
  }

  function renderBackupPanel() {
    let p = document.getElementById('backup-panel');
    if (!p) {
      p = document.createElement('div');
      p.id = 'backup-panel';
      p.className = 'panel glass';
      const anchor = document.getElementById('analytics-comparison') || document.getElementById('analytics-panel') || document.querySelector('.wrap');
      anchor?.parentNode?.insertBefore(p, anchor?.nextSibling || null);
    }
    const last = localStorage.getItem('ob-last-backup');
    p.innerHTML = `<h2>Settings <small>backup & data ownership</small></h2>
      <div class="backup-row">
        <div><strong>Journal backup</strong><span>Export the current server/Supabase-backed journal, accounts, strategies and analytics context.</span><small>${last ? 'Last backup: ' + new Date(last).toLocaleString() : 'No backup recorded yet'}</small></div>
        <div class="backup-actions"><button id="backup-export" type="button">Export backup</button><button id="backup-import" type="button">Import backup</button><input id="backup-file" type="file" accept="application/json,.json" hidden></div>
      </div>`;
    document.getElementById('backup-export').onclick = exportBackup;
    document.getElementById('backup-import').onclick = () => document.getElementById('backup-file').click();
    document.getElementById('backup-file').onchange = async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      try { await restoreBackup(file); }
      catch (err) { disciplineShowWarning?.('Restore failed', err?.message || 'The backup could not be restored.'); }
    };
  }

  window.phase4Backup = { collectBackup, exportBackup, restoreBackup, renderBackupPanel };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderBackupPanel, { once: true });
  else renderBackupPanel();
})();

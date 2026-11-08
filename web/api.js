(() => {
  const j = (path, body) => fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }).then(r => r.json());

  const defaults = () => ({
    settings: { fullscreen: false, startWithWindows: false, steamPath: '', musicFolder: '', emulators: [] },
    items: [
      { id: 'preset-jellyfin', name: 'Jellyfin', category: 'app', kind: 'url', target: 'http://localhost:8096', source: 'Media' },
      { id: 'preset-ersatztv', name: 'ErsatzTV', category: 'app', kind: 'url', target: 'http://localhost:8409', source: 'Media' }
    ]
  });

  window.api = {
    load: async () => {
      const d = await j('/api/load');
      const base = defaults();
      if (!d) return base;
      return { ...d, settings: { ...base.settings, ...(d.settings || {}) }, items: d.items || [] };
    },
    save: (d) => j('/api/save', d),
    applySettings: (s) => j('/api/applySettings', s),
    launch: (it) => j('/api/launch', it),
    pick: (o) => j('/api/pick', o).then(r => r.path || null),
    scanSteam: (p) => j('/api/scanSteam?path=' + encodeURIComponent(p || '')),
    startApps: () => j('/api/startApps'),
    scanMusic: (f) => j('/api/scanMusic?folder=' + encodeURIComponent(f)),
    scanAll: (p) => j('/api/scanAll?path=' + encodeURIComponent(p || '')),
    scanFolder: (p) => j('/api/scanFolder?path=' + encodeURIComponent(p)),
    scanRoms: (f, e) => j('/api/scanRoms?folder=' + encodeURIComponent(f) + '&exts=' + encodeURIComponent(e)),
    media: (action, n) => j('/api/media', { action, n: n || 1 }),
    overlay: (action) => j('/api/overlay', { action }),
    toggleFullscreen: async () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
  };

  // lets the program close itself when the window is gone (fallback mode only)
  const ping = () => fetch('/api/ping').catch(() => {});
  ping(); setInterval(ping, 5000);
})();

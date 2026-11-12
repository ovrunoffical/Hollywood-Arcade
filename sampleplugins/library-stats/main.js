// Adds a "Library stats" page to the sidebar.
async function update() {
  const lib = await ha.library();
  const games = lib.filter(i => i.category === 'game'), apps = lib.filter(i => i.category === 'app');
  const hours = Math.round(games.reduce((n, i) => n + (i.playtime || 0), 0) / 60);
  const top = games.filter(i => i.playtime).sort((a, b) => b.playtime - a.playtime).slice(0, 8);
  const sources = {};
  games.forEach(i => { sources[i.source || 'Other'] = (sources[i.source || 'Other'] || 0) + 1; });
  ha.page({
    title: 'Library stats',
    blocks: [
      { stats: [{ label: 'Games', value: games.length }, { label: 'Apps', value: apps.length }, { label: 'Hours played', value: hours }] },
      { h: 'Most played' },
      top.length ? { list: top.map(i => ({ title: i.name, sub: i.source || '', right: Math.round(i.playtime / 60 * 10) / 10 + ' h', item: i.id })) } : { p: 'Play a few games from Arcade and they show up here.' },
      { h: 'Games by launcher' },
      { list: Object.entries(sources).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ title: k, right: String(v) })) }
    ]
  });
}
ha.on('ready', update);
ha.on('view', update);
ha.on('game.closed', update);

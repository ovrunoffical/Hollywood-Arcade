// Shows your most played games as a shelf on Home. Arcade keeps the play time, this plugin only reads it.
async function update() {
  const lib = await ha.library();
  const items = lib.filter(i => i.category === 'game' && i.playtime > 0)
    .sort((a, b) => b.playtime - a.playtime).slice(0, 10)
    .map(i => ({ title: i.name, sub: Math.round(i.playtime / 60 * 10) / 10 + ' h', item: i.id }));
  if (items.length) ha.shelf('most-played', { title: 'Most played', items });
}
ha.on('ready', update);
ha.on('view', update);
ha.on('game.closed', update);

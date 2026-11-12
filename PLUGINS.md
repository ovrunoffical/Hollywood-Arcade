# Writing a plugin for Hollywood Arcade

A plugin is a folder inside Arcade's `plugins` folder (Settings, Plugins, Open folder). It needs two files.

## `plugin.json`

```json
{
  "name": "My plugin",
  "version": "1.0.0",
  "author": "You",
  "description": "One sentence about what it does.",
  "main": "main.js",
  "permissions": ["ui", "library.read"],
  "net": []
}
```

The folder name must be lowercase letters, numbers, dots, dashes or underscores.

| Permission | What it lets the plugin do |
| --- | --- |
| `ui` | Add a shelf to Home, a page to the sidebar, and pop-up messages |
| `library.read` | Read the game and app list (name, source, play time, achievements) |
| `events` | Hear when a game starts or closes |
| `net` | Fetch from the websites listed in `net` (https only, those sites only) |
| `storage` | Keep a small settings file (up to 256 KB) |

A plugin that asks for `launch` is refused: plugins cannot start programs in this version.
Plugins start **off**. The person using Arcade sees what you ask for and turns it on.

## `main.js`

Your script runs in a sandbox with no network and no access to Arcade's page. Everything goes through the `ha` object.

```js
ha.on('ready', update);        // the plugin has loaded
ha.on('view', update);         // the person opened Home or your page
ha.on('game.launched', g => {});  // needs "events": { name, source }
ha.on('game.closed', g => {});    // needs "events"

const lib = await ha.library();            // needs "library.read"
// [{ id, name, category: 'game'|'app', source, playtime (minutes), ach: { unlocked, total } | null }]

const r = await ha.fetch('https://example.com/data.json');   // needs "net"
const data = await r.json();

const saved = await ha.storage.get();      // needs "storage"
await ha.storage.set({ any: 'json' });

ha.shelf('id', { title: 'My shelf', items: [{ title, sub, item: libraryId, image: 'https://…' }] });   // needs "ui"
ha.page({ title: 'My page', blocks: [
  { h: 'Heading' }, { p: 'Some text' },
  { stats: [{ label: 'Games', value: 12 }] },
  { list: [{ title: 'Row', sub: 'smaller', right: '3 h', item: libraryId }] }
] });
ha.toast('Hello');
```

Notes
- `item` is the `id` of something in the library. A shelf card with an `item` is the normal tile and opens like any other.
- `image` only works for sites listed in `net`.
- Everything you pass in is drawn as plain text. HTML is never interpreted.
- Look at the two examples (Settings, Plugins, Add examples) for complete working code.

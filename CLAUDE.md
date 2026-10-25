# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for KNX installations: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
and to the KNX bus through a KNX IP interface or router with
[KNXUltimate](https://github.com/Supergiovane/KNXUltimate) (MIT). Local only
(`transports: ["local"]`).

A **device integration** (`type: "device"`, Gladys 5.3.0+). KNX has no device
discovery: the user declares each device with a configuration button
(`add_<kind>` actions) and its group addresses, the declarations are stored
with `setConfig` under `knx_devices` (outside the config_schema, so in the
Gladys backups), and every declared device is offered in the Discover tab.

## Commands

```bash
npm install
npm test                                  # node --test, never touches the network
node --test test/app.test.js              # one file
node --test --test-name-pattern "widget"  # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check
docs/illustrations/render.sh              # widget illustrations (Chrome, ImageMagick, Pillow)
scripts/build-cover.sh                    # cover.jpg from cover.svg (Inkscape, ImageMagick)
```

## Architecture

```
index.js                     SDK wiring only: createApp(gladys) + connect + start
src/app.js                   every handler: telegrams, commands, buttons, widget, scenes, connection
src/config.js                config_schema -> connection (mode, host, secure), sync, scene patterns
src/devices.js               kinds (light, switch, cover, sensor, binary_sensor, climate) -> features
src/registry.js              declared devices, saved with setConfig (one change at a time)
src/states.js                state publication: created devices only, coalesced, 240/min, 429 pause
src/monitor.js               last telegrams and telegrams per minute (widget, test button)
src/scenes.js                trigger / action keys, telegram event data, event limiter
src/widgets.js               the `bus` widget (pure, reused by docs/illustrations/gen.mjs)
src/i18n.js                  runtime texts in en / fr / de / es
src/knx/address.js           group / individual addresses, patterns ("1/0/*:9.001")
src/knx/dpt.js               datapoint types over KNXUltimate's dptlib (never throws)
src/knx/discovery.js         KNXnet/IP SEARCH request / response (scan through the Gladys core)
src/knx/bus.js               KNXClient wrapper: reconnection loop, telegrams, read / write
.github/scripts/release.mjs  version, changelog, version files, PR title checks
```

## Rules

- **External ids are forever**: `ext:<selector>:<kind>:<main group address
with dashes>` and `…:<feature key>`. Never change a kind key, a feature key
  or the main address of a kind (`KINDS[kind].main`). Config, action, field,
  widget, trigger, variable and output keys too.
- **Feature fields** compared by the Discover tab "Update" (category, type,
  unit, min, max, step, features added or removed): changing them forces users
  to delete and recreate their devices. `min`, `max`, `read_only` and
  `has_feedback` on EVERY feature (test/devices.test.js).
- **States**: only for the devices the user created, through
  `src/states.js` (300 states a minute at most on the Gladys side). Republish
  everything known in `onDeviceCreated`. After a command on a feature without
  feedback, forget the published value (Gladys saved the command itself).
- **Scene events** on transitions only, flat scalar data, at most 250 a
  minute; never for a telegram this integration sent (`isOwn` in app.js).
- **The bus**: one KNXClient per connection attempt, our own reconnection
  loop (5 s doubling to 2 min); reads are queued and spaced (KNX TP is slow).
- **The container rootfs is read-only**: the only writable folder is /data.
- **Widget content**: after any change, run `docs/illustrations/render.sh` and
  look at the four images.
- **User-facing text** exists in en, fr, de and es: manifest, `src/i18n.js`,
  `docs/*.md`, `README*.md`. `test/i18n.test.js` checks it. Use the words of
  the Gladys UI (Discover / Découverte / Entdecken / Descubrir…) and of ETS
  (group address, individual address, datapoint type).
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, `package-lock.json` or the manifest, nor the `docker_image`
  tag.
- **Changelog**: Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Style**: Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.

## Pitfalls

- KNXUltimate loads `serialport` (native) at startup: the CI smoke test
  starts the image read-only to catch a binary that does not load.
- KNX positions: 0 % = open; Gladys: 100 = open. KNX contacts: 1 = open;
  Gladys opening sensors: 1 = closed.
- Gladys light temperatures are in mireds, KNX sends kelvins (DPT 7.600).
- A 2-byte float (DPT 9) keeps about 3 significant digits: 101325 Pa reads
  1012.5 hPa.
- The container is in a bridge network: routing (multicast 224.0.23.12)
  usually does not reach it; tunnelling uses the NAT mode of KNXnet/IP.
- Running the validator of the Gladys core outside its repository creates a
  `gladys-development.duckdb` file in the current folder (ignored by git).

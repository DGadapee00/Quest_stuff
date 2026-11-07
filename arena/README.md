# Yu-Gi-Oh! VR Duel Arena

Private fan prototype, v0.5. A life-size card arena for Meta Quest Browser, built with TypeScript, Three.js, WebXR and Vite. Play against Yami Yugi using actual Yu-Gi-Oh card fronts, printed monster statistics, physical cards and textured, rigged character assets adapted from Duel Links and The Duelists of the Roses.

This is an expanded playable foundation for an immersive duel game. Presentation, input, rules and assets can grow independently. It is not a complete official TCG simulator or a finished AAA production.

## Run and build

```sh
npm ci
npm run dev
npm test
npm run build
```

Vite serves desktop development. Immersive WebXR requires HTTPS or a trusted local origin. On Quest, open the private deployed HTTPS URL in Quest Browser and select **Enter VR**. The private Site keeps its existing owner-only audience; this session does not publish the repository to public GitHub. The Sites project binding is in `.openai/hosting.json`.

## Play

- Desktop: choose a hand card, then click an empty matching zone. Monsters use the front row; Spells and Traps use the back row. Hover a card or monster to inspect it. Drag the scene to orbit; scroll to zoom.
- Quest controllers: reach near a hand card or point at one, hold trigger or grip, then release over a zone. Distance placement also works by pointing at a field zone before releasing. Green previews indicate a legal placement; red previews explain blocked moves. Both controllers have independent grab state.
- Battle: enter battle, select your attacking monster, then an opposing monster. If their field is empty, selecting your attacker makes a direct attack. Each eligible monster attacks once.
- Defense: in Main Phase, select your own monster and use **Switch stance** or the physical **STANCE** button. A defending monster uses DEF and cannot attack.
- Rush Recklessly: select or grab the Spell. It initially targets your strongest monster. Select another friendly monster to change that target, then place the Spell in an empty back-row zone. In VR, the other controller can select the target while one hand holds the card.
- The table also provides **BATTLE**, **END TURN**, **NEW DUEL**, **SOUND**, **HAPTICS** and **RECENTER**. Recenter is an explicit user action; combat never moves the headset viewpoint.
- Keyboard: **1–7** selects a hand card, **B** enters battle, **E** ends the turn, **F** switches the selected monster's stance, **Esc** clears selection, and **?** opens help.

Optional WebXR hand tracking is requested, and browser-provided pinch/select events use the same interaction path. Hand rendering uses instanced primitive joints. This still needs a real Quest hand-tracking test; controllers remain the primary input.

## Cards and Quick Duel rules

| Card | Printed data | Implemented behavior |
| --- | --- | --- |
| Blue-Eyes White Dragon | LIGHT / Dragon / Level 8 / 3000 ATK / 2500 DEF | Normal Monster; textured silver-blue dragon with expanded wings, articulated neck, jaw and tail. |
| Dark Magician | DARK / Spellcaster / Level 7 / 2500 ATK / 2100 DEF | Normal Monster; textured armored spellcaster, detailed face, pointed hat and articulated staff. |
| Celtic Guardian | EARTH / Warrior / Level 4 / 1400 ATK / 1200 DEF | Normal Monster; textured elf warrior with armor, cape and a two-handed sword guard. |
| Dian Keto the Cure Master | Normal Spell | Gain 1,000 LP. LP can exceed the starting 8,000. |
| Negate Attack | Counter Trap | Set face-down. Automatically negate the next opposing attack and end the rest of that Battle Phase. The attack destroys no monsters and deals no damage. |
| Rush Recklessly | Quick-Play Spell | One selected friendly face-up monster gains 700 ATK until the current turn ends. Other monsters are unaffected. |

Each duelist starts with 8,000 LP and a 16-card deck. The human opening hand is fixed to the three monsters and Dian Keto; the remainder is shuffled with a fresh seed for each new game. Yami Yugi starts with Dark Magician in the middle monster zone. Each side has three Monster Zones and three Spell/Trap Zones. Draw one card on each subsequent turn while below the seven-card hand limit. Reaching zero LP or starting a draw with an empty deck loses the duel.

Higher ATK destroys an attacking-position opponent and deals the difference to its owner. Equal ATK destroys both. Against defense, ATK greater than DEF destroys the defender without battle damage. ATK below DEF deals the difference to the attacker without destroying either monster; equal ATK and DEF destroys neither.

The prototype uses a simplified Quick Duel format: one monster summon and one Spell/Trap play per turn, no level-based tribute requirements, no second Main Phase, no manual chain engine, no discard phase, and a once-per-turn stance change also allowed on a newly summoned monster. Rush Recklessly is limited to your own Main Phase and friendly targets. Negate Attack resolves automatically at the first opposing attack; only one pending copy per player can be set. Spent Spell/Trap visuals clear at the next own turn; a pending trap stays set until triggered. These restrictions are visible in help and are separate from printed card data.

**Yami Yugi / tactical** prioritizes strong summons, chooses useful Spell/Trap plays, uses defense and avoids losing attacks when possible. **Training / predictable** follows a simpler sequence. Difficulty applies to the next new duel. The log, clash forecast, LP changes and summary explain the battle. Wins, losses and best winning turn count are saved locally; there is no outgoing gameplay telemetry.

## Presentation and physical interaction

The arena includes a circular stone coliseum, instanced columns and arches, engraved brass trim, an animated sky, portal crystal, star field, brazier crystals and a reflective duel table. Yami Yugi appears across the field as a 2.5D holographic projection, rather than a skeletal 3D human avatar.

Each monster has independent Idle, Attack, Hit and Defeat clips and an actor state machine. Textured weighted skins replace the earlier geometric figures. Blue-Eyes has a larger wing silhouette and breath anticipation; Dark Magician plants his feet and brings his staff into a casting pose; Celtic Guardian retains a natural two-handed guard with a controlled weapon strike. Source proportions and painted face/clothing details are preserved. Characters no longer bob above the field while idling. Ranged effects originate at the jaw or staff control, and figures are framed in their guard poses so bind-pose wings do not distort summon scale. Summons use expanding glyph rings and rising particles; Blue-Eyes uses icy blue projectiles, Dark Magician uses purple magic and Celtic Guardian uses a curved blade effect. Impacts add bounded sparks, a brief local light, flying shards, floating LP text and trap/defense feedback. A cancellable presentation queue reveals opponent actions and changes visible LP at impact; authoritative rules remain synchronous and renderer-independent.

Cards have shared printed-face textures, physical materials and persistent meshes that travel between hand and field. A fixed 120 Hz card simulation provides gravity, bounded throw velocity, angular momentum, table/floor contacts, restitution, friction and airborne card separation. Legal drops spring into their zones. Invalid drops remain in inventory, briefly fall or bounce, then return to their hand position. This is a lightweight card simulation, not a general rigid-body engine or a physics solver for monster figures.

Spatial synth cues cover card handling, selection, summoning, Spell/Trap play, attack launch, impact, turns, victory and defeat. A quiet generated ambient chord bed, volume control and echo are included; no official soundtrack or recorded character voices are bundled. Haptics provide grab, placement, blocked-move and combat feedback when supported.

Help/settings and a hidden page pause presentation. Reset cancels queued effects and old snapshots. Leaving XR settles the committed rules result without replaying queued attacks. Tracking loss returns held cards. Preferences and records tolerate corrupt or unavailable storage.

## Quest performance and comfort

- Balanced is the default. Quest uses direct rendering, fixed foveation where supported and a stationary rig. Desktop Cinematic adds bloom and key-light shadows; those passes are disabled in XR.
- Performance lowers desktop pixel density and requests a smaller XR framebuffer **before the next XR session**. A running XR framebuffer is not resized. Sustained slow frames reduce secondary effect/environment detail; sustained recovery restores it.
- Effects have fixed limits: 480 pooled points in one draw, 72 instanced shards, 10 reusable rings, eight floating labels, six transient projectiles and eight overlapping spatial cue voices.
- Three model templates are cached; geometry/materials are shared while animation mixers remain independent. Shipped GLBs total about 1.55 MB, including embedded textures and skeletons: 4,982–7,831 triangles and two to six rendered primitives per model. Import validation caps each file at 1 MiB, 8,000 triangles, 12 meshes and 1,048,576 texture pixels. Static animation channels are removed; the game skeletons and shared source textures are retained.
- The six card-face canvases are shared at 512×768. Front/cropped JPEGs and the Yugi image are bundled locally. No external card service is contacted during play. Card meshes use three material groups. Previews and text resources are reused or disposed when replaced.
- Reduce Motion suppresses ambient drift, monster travel and presentation motion where practical. There is no forced camera shake or locomotion. Follow the device boundary and test seated/standing reach before extended play.
- The optional meter reports rendered FPS, elapsed frame interval and draw calls, including desktop postprocessing. These are diagnostics, not a guarantee of headset performance.

The initial v0.1 Quest test was reported as passing by the user. v0.5 has substantially different rendering, assets, input and effects and has not been measured on Quest here. The target remains stable 72 FPS. Validate both controllers, simultaneous holds, legal/invalid throws, Rush target selection, trap activation, stance rotation, repeated reset, tracking loss, interruption, repeated XR entry/exit, hand pinch input, text legibility, seated reach and prolonged frame/GPU memory behavior on the headset.

## Source layout

```text
src/game/duel.ts                    Rules, snapshots, seeded decks and opponent logic
src/game/combat.ts                  Shared ATK/DEF battle forecast
src/game/placement.ts               Shared placement validation
src/presentation/duel-presentation.ts  Cancellable action sequencing
src/physics/card-body.ts            Fixed-step card motion and contacts
src/input/interaction.ts            Desktop, two-controller grab/drop, haptics
src/world/arena.ts                  XR rig, field, cards, actors and quality modes
src/world/environment.ts            Instanced coliseum, sky and procedural textures
src/world/creature-actor.ts          Per-monster animation and presentation state
src/world/models.ts                 Cached GLB loading, budgets and fallbacks
src/world/effects.ts                Pooled particles, rings, shards and projectiles
src/world/art.ts                    Shared card textures and procedural fallbacks
src/world/card-images.ts            Bundled Yu-Gi-Oh image mapping
src/audio/spatial.ts                Bounded spatial Web Audio synthesis
src/ui/                            Shell, settings and local preference validation
scripts/generate-models.mjs         Reproducible character conversion pipeline
scripts/import-duel-links.mjs       COLLADA skin/UV bridge
scripts/convert-duel-links.py       Source materials, mobile mesh and rigged poses
scripts/convert-celtic.py           Sword-guard skin and weighted animation
scripts/compact-glb.mjs             Remove redundant animation channels
tests/                             Rules, input, physics, effects and asset regressions
```

The shipped GLBs are ready to use. To reproduce the adaptations, install Blender 4.3+, run `python scripts/fetch-model-sources.py`, then `npm run assets:generate`. Source archive pages, hashes, attribution and conversion details are in [ASSET_SOURCES.md](ASSET_SOURCES.md). Replace models through `MODEL_URLS` while keeping named clips, guard-pose normalization and mobile budgets. Rules do not depend on a particular rendering asset.

## Asset provenance and validation

Names, passcodes and printed statistics were verified with the [YGOPRODeck card database API](https://ygoprodeck.com/api-guide/). Bundled fronts and cropped art came from `images.ygoprodeck.com/images/cards/{passcode}.jpg` and `images.ygoprodeck.com/images/cards_cropped/{passcode}.jpg` for passcodes **89631139**, **46986414**, **91152256**, **84257640**, **14315573** and **70046172**. These are actual Yu-Gi-Oh printed card images used for the requested private fan prototype. Inspection text summarizes the implemented effects and Quick Duel restrictions.

Blue-Eyes and Dark Magician use adapted Duel Links meshes, painted textures and skeletons; Celtic Guardian uses an adapted The Duelists of the Roses mesh and textures. Guard poses and four animation clips are project-authored. See [ASSET_SOURCES.md](ASSET_SOURCES.md) for exact source pages and conversion provenance. Yami Yugi remains an AI-generated fan-art projection. Environment geometry, procedural materials, effects and synthesized audio are project-authored.

Validation includes the TypeScript/Vite production build and tests for card data/effects, legal/illegal actions, defense, hidden traps, targeted temporary bonuses, seeded tactical games, snapshot ownership, cancelled/paused sequences, independent controller grabs, current-pose placement, optional haptics, card collisions, fixed-step consistency, stance rotation, bounded effects, local storage, GLB/texture budgets, grounded guard poses, planted casting, texture reuse after disposal and independent skeleton/animation instances. The model lineup and attack poses were also rendered in Blender for asset inspection. Managed cloud browser preview was unavailable during this session, so end-to-end browser visuals and the new Quest frame budget remain device-test items.

# Private character asset sources

This project uses the Yu-Gi-Oh characters and printed cards requested for the owner's private fan prototype. The three summoned character meshes and their painted textures now come from the game assets below. They replace the earlier procedural geometric figures.

| Arena character | Mesh and texture source | Source page |
| --- | --- | --- |
| Blue-Eyes White Dragon | Yu-Gi-Oh! Duel Links, Konami | https://models.spriters-resource.com/mobile/yugiohduellinks/asset/304698/ |
| Dark Magician | Yu-Gi-Oh! Duel Links, Konami | https://models.spriters-resource.com/mobile/yugiohduellinks/asset/304700/ |
| Celtic Guardian | Yu-Gi-Oh! The Duelists of the Roses, Konami; Models Resource upload by 3D Mage | https://models.spriters-resource.com/playstation_2/yugiohtheduelistsoftheroses/asset/478114/ |

The Duel Links assets retain their game skeletons and weighted skins. Celtic Guardian retains its original two-handed sword-guard mesh and UVs, with an added weighted torso/head/weapon/cape rig. Guard poses and Idle, Attack, Hit and Defeat animations are project-authored adaptations. Blue-Eyes has an expanded wing silhouette and a reduced mesh for mobile rendering. The materials retain the painted source details with restrained PBR highlights and fill; source shader masks are not applied as body transparency.

Texture UV orientation is corrected in the COLLADA-to-glTF bridge. The shipped GLBs embed their images and skeletons, so play makes no requests to the source archive sites. Constant bind-transform animation channels are removed to reduce mixer work. Instances share geometry, materials and textures, while each summon owns its skeleton and mixer.

`model-sources.json` records source pages and the SHA-256 digests of the verified public source ZIPs. Source archives are downloaded to ignored `work/model-research/` and are not committed. To reproduce the adaptations, install the development dependencies and Blender 4.3+, then run:

```sh
python scripts/fetch-model-sources.py
npm run assets:generate
npm test
```

The fetch script follows the public download link supplied by each source page, verifies the recorded digest and checks archive paths before extraction. It does not use credentials or bypass access controls. The conversion scripts preserve source attribution in GLB extras.

The six printed card fronts/cropped illustrations come from the YGOPRODeck image service, with card names, passcodes and printed statistics checked against its [database API](https://ygoprodeck.com/api-guide/):

- Blue-Eyes White Dragon — 89631139
- Dark Magician — 46986414
- Celtic Guardian — 91152256
- Dian Keto the Cure Master — 84257640
- Negate Attack — 14315573
- Rush Recklessly — 70046172

Image paths were `https://images.ygoprodeck.com/images/cards/{passcode}.jpg` and `https://images.ygoprodeck.com/images/cards_cropped/{passcode}.jpg`. These images are bundled locally in the build.

Yami Yugi's character projection is AI-generated fan art. Arena geometry, procedural textures, effects, synthesized audio and application code are project-authored. The build remains owner-private, and this session does not push these assets to public GitHub.

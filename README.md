# Quest_stuff

A private Yu-Gi-Oh VR duel arena for Meta Quest, built with Three.js, TypeScript and WebXR.

The application lives in [`arena/`](arena/README.md). It includes physical cards, textured animated monster summons, a Yami Yugi opponent, simplified turn-based combat, spatial audio and Quest quality settings.

```sh
cd arena
npm ci
npm run dev
```

Run `npm test` for automated checks and `npm run build` for a production build. Quest immersive sessions require HTTPS or a trusted local origin.

See the [application guide](arena/README.md) for controls and prototype rules, and [asset sources](arena/ASSET_SOURCES.md) for the private character conversion pipeline and provenance. Deployment preserves the existing owner-only Site audience.

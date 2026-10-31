Three.js 0.187.0 — MIT License (see LICENSE).
Source: https://registry.npmjs.org/three/-/three-0.187.0.tgz
Documentation: https://threejs.org/docs/

three.module.js is a minified ES module containing the Three.js exports used by
christmas-scene.js, plus the official RoundedBoxGeometry addon.
Rebuild: list the THREE.* names used by christmas-scene.js in an entry file that
re-exports them from three@0.187.0, then run
`esbuild entry.js --bundle --format=esm --minify --legal-comments=eof`. Bundled with
esbuild from the official package; no runtime CDN or build step is needed.

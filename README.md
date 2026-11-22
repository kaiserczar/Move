# Move

Webcam movement games that use body tracking as controls. Runs entirely in the browser: no backend, no build step, and video never leaves the machine.

The first demo is **Avatar Studio**: up to 4 people are tracked at once, each with a skeleton (head, neck, torso, both arms and legs, with elbows and knees highlighted), hand tracking with open/closed detection, and a customizable cartoon avatar that follows their movements.

## Run it

```sh
npm start        # or: node server.mjs
```

Open http://localhost:5173 and allow camera access.

Webcam access requires a secure context, so the page must be served from `localhost` or https. Opening `index.html` directly as a file will not work. Any static server is fine, for example `python -m http.server 5173`.

The pose model (about 5–30 MB depending on quality) and the MediaPipe runtime are fetched from public CDNs on first load, so the first run needs an internet connection.

## Using it

- Stand far enough back that your whole body, head to feet, is in frame. Four people standing side by side need a wide room and a landscape camera.
- Players are numbered P1–P4 left to right as they enter the frame, and keep their number while they move around.
- Pick the player to edit with the tabs, by pressing keys 1–4, or by clicking their avatar on screen. Then choose a head, top, bottom and skin tone.
- Display toggles: camera feed, background removal, avatar, skeleton, hand tracking, elbow and knee angle readouts, mirror mode.
- Hands: the avatar's hands copy your real hand shape. In skeleton view a hollow dashed ring means open and a filled disc means a fist; the player tabs show ✋ / ✊ for each hand. Hands are hardest to read when far away, small in frame, moving fast or in dim light.
- Remove background: shows the real people cut out of the camera image over a chosen background (stage, blurred room, solid dark, or green screen for streaming/recording software). Turn Avatar off to see just the people; skeletons, hand markers and tags still draw on top. Edges are softest with even lighting and a background that contrasts with clothing.
- Tracking model: Lite is fastest; Full and Heavy track better, especially with several people, but need a faster GPU.

## Project layout

```
index.html            page shell
css/style.css
js/main.js            camera, frame loop, rendering, canvas click-to-select
js/state.js           player configs and display settings (saved to localStorage)
js/ui.js              customization panel
js/core/
  vision.js           loads MediaPipe pose, hand and person-segmentation models (GPU, falls back to CPU)
  hands.js            per-wrist crop hand tracking, open/closed detection
  cutout.js           background removal (person mask smoothing and compositing)
  tracker.js          stable P1–P4 identities across frames, plus landmark smoothing
  landmarks.js        landmark names, visibility threshold, elbow/knee angle helper
  body.js             joints -> body geometry (head, torso, limbs, scale)
  skeleton.js         skeleton renderer
  geom.js             vector math
js/avatar/
  avatar.js           avatar renderer and thumbnail renderer
  parts.js            the head, top, bottom and skin catalogues
  draw.js             canvas drawing helpers
server.mjs            zero-dependency static server
```

## Building games on top

Each frame, `main.js` has a `players` array:

```js
{ id: 0..3, joints: { nose, leftShoulder, leftElbow, leftWrist, leftHip, leftKnee, leftAnkle, ... }, body,
  hands: { left, right } }   // each null, or { state: 'open' | 'closed', openness: 0..1, points: [21 x {x, y}] }
```

Each joint is `{ x, y, v }`: pixel coordinates on the canvas (already mirrored if mirror mode is on) and visibility from 0 to 1. Use `isVisible(joints, name)` and `jointAngles(joints)` from `js/core/landmarks.js`; for example, a squat is both knee angles below about 110°.

To add an avatar part, append an entry to `HEADS`, `TOPS` or `BOTTOMS` in `js/avatar/parts.js`. The panel picks it up automatically.

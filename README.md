# MapCut — Technical Plan (Client-Side Only)

A web app for creating cinematic travel story videos: animated 3D globe transitions between locations, with media (photos, videos, text) attached to each destination. Runs entirely in the browser — no backend, no server, no account required.

**Reference product**: mult.dev (animated map video creator), extended with per-destination rich media/notes editing.

---

## 1. Product Vision

The user builds a "journey" by:
1. Dropping waypoints on an interactive 3D globe
2. Attaching photos, videos, and notes to each waypoint
3. Playing back a cinematic animation that flies between waypoints and reveals the media at each stop
4. Exporting the result as an MP4 video (encoded entirely in the browser)
5. Sharing via a `.mapcut` project file (JSON + media bundled as a ZIP)

**No login. No cloud. Everything lives on the user's device.**

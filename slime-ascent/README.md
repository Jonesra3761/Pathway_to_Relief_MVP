# Slime Ascent
Playable 3D browser proof of concept. Requires Node.js 20+.

```bash
npm install
npm run dev
```

Drag the slime backward and release to launch. Drag the background to peek around the tower. Select Light, Medium, or Dense to change launch physics. Reach the highest pin and beat your time. Misses return you to your last attached pin.

This is an early physics prototype: flight uses a custom gravity integrator, not Rapier. For production, migrate to Rapier rigid bodies and collision shapes, add genuine slime deformation, save-state checkpoints, touch aiming polish, and accessibility options.

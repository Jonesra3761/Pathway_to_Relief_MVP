# Slime Ascent
Playable 3D browser proof of concept. Requires Node.js 20+.

```bash
npm install
npm run dev
```

Press anywhere and pull back like a slingshot, then release to fling the slime. The dotted line previews your flight. Catch a pin to hang from it; a miss returns you to your last pin.

The tower is viewed side-on and built in five stacked layers. Each layer's ceiling has a gap on a different side, and blocks and a sweeping ledge sit in the way, so you have to swing around obstacles above you to climb. Reach the gold pin at the top as fast as you can. Light, Medium and Dense change launch speed, gravity and how easily pins catch. Your best time is saved in the browser.

This is an early physics prototype: flight uses a custom integrator with circle-versus-box collisions, not Rapier. For production, migrate to Rapier rigid bodies, add genuine slime deformation, more levels, touch aiming polish, and accessibility options.

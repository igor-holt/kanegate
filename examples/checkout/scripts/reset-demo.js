// Put the seeded bugs back so the demo can be replayed from scratch.
import fs from 'node:fs';
fs.copyFileSync('seed/cart.buggy.js', 'public/cart.js');
fs.rmSync('dist', { recursive: true, force: true });
console.log('demo reset: public/cart.js has the two seeded bugs again');

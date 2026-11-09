// Procedural canvas scenes. Each one is drawn in code: no image or video files are shipped.
export type FxParams = { color: string; speed: number; density: number; direction: number };
type Scene = { draw: (c: CanvasRenderingContext2D, w: number, h: number, t: number, dt: number) => void };
type Make = (w: number, h: number, p: FxParams) => Scene;

const R = Math.random;
const rnd = (a: number, b: number) => a + R() * (b - a);
const count = (w: number, h: number, per: number, p: FxParams, max = 260) => Math.max(4, Math.min(max, Math.round(w * h / 100000 * per * p.density)));
const alpha = (hex: string, a: number) => hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0");
const vec = (deg: number) => { const r = deg * Math.PI / 180; return [Math.sin(r), Math.cos(r)] as const; };

/** Things that fall or drift along the chosen direction and wrap around the edges. */
function drifters(w: number, h: number, p: FxParams, per: number, size: [number, number], vel: [number, number], paint: (c: CanvasRenderingContext2D, o: any, t: number) => void): Scene {
  const [dx, dy] = vec(p.direction);
  const items = Array.from({ length: count(w, h, per, p) }, () => ({ x: R() * w, y: R() * h, s: rnd(...size), v: rnd(...vel), ph: R() * 6.28, hue: Math.floor(R() * 5) }));
  return { draw(c, W, H, t, dt) {
    for (const o of items) {
      o.x += dx * o.v * dt; o.y += dy * o.v * dt;
      if (o.x < -40) o.x = W + 30; else if (o.x > W + 40) o.x = -30;
      if (o.y < -40) o.y = H + 30; else if (o.y > H + 40) o.y = -30;
      paint(c, o, t);
    }
  } };
}

const scenes: Record<string, Make> = {
  rain: (w, h, p) => {
    const [dx, dy] = vec(p.direction);
    return drifters(w, h, p, 34, [8, 22], [420, 760], (c, o) => {
      c.strokeStyle = alpha(p.color, .35 + o.s / 60); c.lineWidth = 1.1; c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(o.x - dx * o.s, o.y - dy * o.s); c.stroke();
    });
  },
  snow: (w, h, p) => drifters(w, h, p, 16, [1.2, 3.6], [22, 60], (c, o, t) => {
    c.fillStyle = alpha(p.color, .8); c.beginPath(); c.arc(o.x + Math.sin(t + o.ph) * 10, o.y, o.s, 0, 6.28); c.fill();
  }),
  petals: (w, h, p) => drifters(w, h, p, 7, [5, 11], [30, 70], (c, o, t) => {
    c.save(); c.translate(o.x + Math.sin(t * .8 + o.ph) * 22, o.y); c.rotate(t * .9 + o.ph); c.scale(1, .55 + .4 * Math.sin(t * 1.4 + o.ph));
    c.fillStyle = alpha(p.color, .85); c.beginPath(); c.ellipse(0, 0, o.s, o.s * .55, 0, 0, 6.28); c.fill(); c.restore();
  }),
  confetti: (w, h, p) => {
    const cols = ["#ff4d6d", "#ffd400", "#3ddc97", "#4cc9f0", "#b388ff"];
    return drifters(w, h, p, 9, [4, 9], [60, 130], (c, o, t) => {
      c.save(); c.translate(o.x + Math.sin(t + o.ph) * 14, o.y); c.rotate(t * 2 + o.ph); c.scale(1, Math.cos(t * 3 + o.ph));
      c.fillStyle = cols[o.hue]; c.fillRect(-o.s / 2, -o.s / 4, o.s, o.s / 2); c.restore();
    });
  },
  embers: (w, h, p) => drifters(w, h, { ...p, direction: 180 }, 10, [1, 3.2], [26, 80], (c, o, t) => {
    const a = .45 + .55 * Math.sin(t * 3 + o.ph); c.shadowColor = p.color; c.shadowBlur = 8;
    c.fillStyle = alpha(p.color, a); c.beginPath(); c.arc(o.x + Math.sin(t * 1.3 + o.ph) * 9, o.y, o.s, 0, 6.28); c.fill(); c.shadowBlur = 0;
  }),
  bubbles: (w, h, p) => drifters(w, h, { ...p, direction: 180 }, 5, [6, 26], [16, 46], (c, o, t) => {
    c.strokeStyle = alpha(p.color, .55); c.lineWidth = 1.4; c.beginPath(); c.arc(o.x + Math.sin(t * .7 + o.ph) * 12, o.y, o.s, 0, 6.28); c.stroke();
    c.fillStyle = alpha(p.color, .08); c.fill();
  }),
  fireflies: (w, h, p) => {
    const f = Array.from({ length: count(w, h, 5, p, 70) }, () => ({ x: R() * w, y: R() * h, ph: R() * 6.28, r: rnd(1.2, 2.6), a: R() * 6.28 }));
    return { draw(c, W, H, t, dt) {
      for (const o of f) {
        o.a += (R() - .5) * .5; o.x += Math.cos(o.a) * 16 * dt; o.y += Math.sin(o.a) * 16 * dt;
        if (o.x < 0) o.x = W; if (o.x > W) o.x = 0; if (o.y < 0) o.y = H; if (o.y > H) o.y = 0;
        const a = Math.max(0, Math.sin(t * 1.6 + o.ph));
        c.shadowColor = p.color; c.shadowBlur = 12; c.fillStyle = alpha(p.color, a); c.beginPath(); c.arc(o.x, o.y, o.r, 0, 6.28); c.fill();
      }
      c.shadowBlur = 0;
    } };
  },
  starfield: (w, h, p) => {
    const stars = Array.from({ length: count(w, h, 26, p, 320) }, () => ({ x: R(), y: R(), r: rnd(.4, 1.6), ph: R() * 6.28 }));
    let shoot: { x: number; y: number; life: number } | null = null;
    return { draw(c, W, H, t, dt) {
      for (const s of stars) { c.fillStyle = alpha(p.color, .35 + .65 * Math.abs(Math.sin(t * .9 + s.ph))); c.beginPath(); c.arc(s.x * W, s.y * H, s.r, 0, 6.28); c.fill(); }
      if (!shoot && R() < dt * .18) shoot = { x: rnd(.1, .8) * W, y: rnd(0, .4) * H, life: 0 };
      if (shoot) {
        shoot.life += dt; shoot.x += 520 * dt; shoot.y += 190 * dt;
        const g = c.createLinearGradient(shoot.x, shoot.y, shoot.x - 90, shoot.y - 33); g.addColorStop(0, alpha(p.color, 1 - shoot.life)); g.addColorStop(1, alpha(p.color, 0));
        c.strokeStyle = g; c.lineWidth = 1.6; c.beginPath(); c.moveTo(shoot.x, shoot.y); c.lineTo(shoot.x - 90, shoot.y - 33); c.stroke();
        if (shoot.life > 1) shoot = null;
      }
    } };
  },
  clouds: (w, h, p) => {
    const clouds = Array.from({ length: Math.max(3, Math.round(5 * p.density)) }, (_, i) => ({
      x: R() * w, y: rnd(.05, .7) * h, v: rnd(6, 20), s: rnd(.6, 1.4), puffs: Array.from({ length: 6 }, (_, k) => [k * 26 - 65 + rnd(-8, 8), rnd(-12, 10), rnd(22, 40)]), a: .16 + (i % 3) * .08,
    }));
    return { draw(c, W) {
      for (const cl of clouds) {
        cl.x += cl.v / 60; if (cl.x - 150 * cl.s > W) cl.x = -150 * cl.s;
        c.fillStyle = alpha(p.color, cl.a);
        for (const [px, py, pr] of cl.puffs) { c.beginPath(); c.arc(cl.x + px * cl.s, cl.y + py * cl.s, pr * cl.s, 0, 6.28); c.fill(); }
      }
    } };
  },
  "neon-skyline": (w, h, p) => {
    type B = { x: number; w: number; h: number; win: boolean[][] };
    const row = (scale: number, min: number, max: number): B[] => {
      const out: B[] = []; let x = -10;
      while (x < w + 10) { const bw = rnd(26, 64) * scale, bh = rnd(min, max) * h; out.push({ x, w: bw, h: bh, win: Array.from({ length: Math.floor(bh / 12) }, () => Array.from({ length: Math.max(1, Math.floor(bw / 10)) }, () => R() < .35)) }); x += bw + rnd(0, 6); }
      return out;
    };
    const far = row(.8, .25, .6), near = row(1.1, .12, .42);
    let tick = 0;
    return { draw(c, W, H, t, dt) {
      tick += dt;
      const flip = tick > .5; if (flip) tick = 0;
      for (const [set, fill, wa] of [[far, alpha("#0a0612", .85), .5], [near, alpha("#030208", .95), .9]] as const) {
        for (const b of set) {
          c.fillStyle = fill; c.fillRect(b.x, H - b.h, b.w, b.h);
          c.strokeStyle = alpha(p.color, .5 * wa); c.lineWidth = 1; c.strokeRect(b.x + .5, H - b.h + .5, b.w - 1, b.h);
          if (flip && R() < .5) { const r = b.win[Math.floor(R() * b.win.length)]; if (r) { const k = Math.floor(R() * r.length); r[k] = !r[k]; } }
          c.fillStyle = alpha(p.color, .8 * wa);
          b.win.forEach((r, y) => r.forEach((on, x) => { if (on) c.fillRect(b.x + 4 + x * 10, H - b.h + 6 + y * 12, 4, 6); }));
        }
      }
      const g = c.createLinearGradient(0, H - 30, 0, H); g.addColorStop(0, alpha(p.color, 0)); g.addColorStop(1, alpha(p.color, .35 + .1 * Math.sin(t)));
      c.fillStyle = g; c.fillRect(0, H - 30, W, 30);
    } };
  },
  "sunset-sky": (_w, _h, p) => ({ draw(c, W, H, t) {
    const k = (Math.sin(t * .12) + 1) / 2;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `hsl(${255 - 25 * k} 60% ${22 + 8 * k}%)`); g.addColorStop(.55, `hsl(${330 + 20 * k} 70% 52%)`); g.addColorStop(1, `hsl(${28 + 12 * k} 95% 62%)`);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const sy = H * (.72 + .05 * Math.sin(t * .1)), r = Math.min(W, H) * .22;
    const sun = c.createRadialGradient(W * .5, sy, 0, W * .5, sy, r * 2.2); sun.addColorStop(0, alpha(p.color, .95)); sun.addColorStop(.35, alpha(p.color, .5)); sun.addColorStop(1, alpha(p.color, 0));
    c.fillStyle = sun; c.fillRect(0, 0, W, H);
    c.fillStyle = "#00000022"; for (let i = 0; i < 5; i++) c.fillRect(W * .5 - r, sy + i * r * .2 + ((t * 6) % (r * .2)), r * 2, 2 + i);
  } }),
  "speed-lines": (_w, _h, p) => {
    let lines: number[][] = []; let hold = 0;
    return { draw(c, W, H, _t, dt) {
      hold -= dt;
      if (hold <= 0) { hold = .09; lines = Array.from({ length: Math.round(46 * p.density) }, () => [R() * 6.28, rnd(.28, .6), rnd(.004, .02)]); }
      const cx = W / 2, cy = H / 2, far = Math.hypot(W, H);
      c.fillStyle = alpha(p.color, .8);
      for (const [a, inner, wd] of lines) {
        c.beginPath(); c.moveTo(cx + Math.cos(a) * inner * far * .5, cy + Math.sin(a) * inner * far * .5);
        c.lineTo(cx + Math.cos(a - wd) * far, cy + Math.sin(a - wd) * far); c.lineTo(cx + Math.cos(a + wd) * far, cy + Math.sin(a + wd) * far); c.fill();
      }
    } };
  },
  "data-stream": (w, h, p) => {
    const size = 15; const cols = Array.from({ length: Math.ceil(w / size) }, () => ({ y: R() * h, v: rnd(50, 150), on: R() < .55 * p.density }));
    const glyphs = "01アカサタナハマヤラ<>/{}=+*";
    return { draw(c, W, H, _t, dt) {
      c.font = `${size - 2}px ui-monospace, monospace`;
      cols.forEach((col, i) => {
        if (!col.on) return;
        col.y += col.v * dt; if (col.y - 14 * size > H) { col.y = -rnd(0, 80); col.v = rnd(50, 150); }
        for (let k = 0; k < 14; k++) { c.fillStyle = alpha(p.color, k === 0 ? 1 : .7 - k * .05); c.fillText(glyphs[(i * 7 + k * 3 + Math.floor(col.y / size)) % glyphs.length], i * size, col.y - k * size); }
      });
    } };
  },
  "aurora-ribbons": (_w, _h, p) => ({ draw(c, W, H, t) {
    for (let r = 0; r < 3; r++) {
      const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, alpha(p.color, 0)); g.addColorStop(.5, alpha(p.color, .32 - r * .07)); g.addColorStop(1, alpha(p.color, 0));
      c.fillStyle = g; c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W; x += 16) c.lineTo(x, H * (.38 + r * .14) + Math.sin(x * .006 + t * (.5 + r * .2) + r) * H * .13 + Math.sin(x * .013 - t * .3) * H * .05);
      c.lineTo(W, H); c.fill();
    }
  } }),
  lightning: (_w, _h, p) => {
    let bolt: [number, number][] = []; let life = 0; let wait = rnd(.6, 2.5);
    return { draw(c, W, H, _t, dt) {
      wait -= dt;
      if (wait <= 0) {
        wait = rnd(1.6, 5) ; life = .45; bolt = [[rnd(.15, .85) * W, 0]];
        while (bolt[bolt.length - 1][1] < H * rnd(.6, .95)) { const [x, y] = bolt[bolt.length - 1]; bolt.push([x + rnd(-34, 34), y + rnd(12, 34)]); }
      }
      if (life > 0) {
        life -= dt; const a = Math.max(0, life / .45);
        c.fillStyle = alpha(p.color, a * .12); c.fillRect(0, 0, W, H);
        c.strokeStyle = alpha("#ffffff", a); c.shadowColor = p.color; c.shadowBlur = 18; c.lineWidth = 2; c.beginPath();
        bolt.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); c.shadowBlur = 0;
      }
    } };
  },
};
export const CANVAS_SCENES = Object.keys(scenes);

/** Starts a scene on a canvas. The returned handle pauses it (off screen, hidden tab) and stops it. */
export function startCanvas(canvas: HTMLCanvasElement, slug: string, p: FxParams) {
  const make = scenes[slug]; const c = canvas.getContext("2d");
  if (!make || !c) return { pause() {}, stop() {} };
  let w = 0, h = 0, scene: Scene | null = null, raf = 0, last = 0, t = 0, paused = false;
  const fit = () => {
    const r = canvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const nw = Math.max(1, Math.round(r.width)), nh = Math.max(1, Math.round(r.height));
    if (nw === w && nh === h) return;
    w = nw; h = nh; canvas.width = w * dpr; canvas.height = h * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0); scene = make(w, h, p);
  };
  const ro = new ResizeObserver(fit); ro.observe(canvas); fit();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - (last || now)) / 1000) * p.speed; last = now; t += dt;
    c.clearRect(0, 0, w, h); scene?.draw(c, w, h, t, dt);
  };
  raf = requestAnimationFrame(frame);
  return {
    pause(v: boolean) { if (v === paused) return; paused = v; if (v) cancelAnimationFrame(raf); else { last = 0; raf = requestAnimationFrame(frame); } },
    stop() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}

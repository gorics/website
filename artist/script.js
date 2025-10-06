const canvas = document.getElementById("dream-canvas");
const ctx = canvas.getContext("2d", { alpha: true });
const form = document.getElementById("seed-form");
const seedInput = document.getElementById("seed-input");
const randomButton = document.getElementById("random-seed");
const paletteContainer = document.getElementById("palette-swatches");

let width = 0;
let height = 0;
let dpr = Math.min(window.devicePixelRatio || 1, 2.5);

let animationId = null;
let particles = [];
let cosmicBursts = [];
let palette = [];
let flowLayers = [];
let auraSeeds = [];
let currentSeed = 0;
let baseTempo = 1;
let time = 0;

const pointer = {
  x: 0.5,
  y: 0.5,
  active: false,
  strength: 0,
  rhythm: 0,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function createMulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(colorA, colorB, t) {
  const parse = (color) => {
    const match = /hsla?\(([^)]+)\)/.exec(color);
    if (!match) return [0, 0, 0, 1];
    const parts = match[1].split(/[,\s]+/).filter(Boolean);
    const h = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    const l = parseFloat(parts[2]);
    const a = parts.length > 3 ? parseFloat(parts[3]) : 1;
    return [h, s, l, a];
  };
  const [h1, s1, l1, a1] = parse(colorA);
  const [h2, s2, l2, a2] = parse(colorB);
  const hueDiff = ((((h2 - h1 + 540) % 360) - 180) / 360) * t;
  const h = (h1 + hueDiff * 360 + 360) % 360;
  const s = mix(s1, s2, t);
  const l = mix(l1, l2, t);
  const a = mix(a1, a2, t);
  return `hsla(${h.toFixed(2)}, ${s.toFixed(2)}%, ${l.toFixed(2)}%, ${a.toFixed(3)})`;
}

function generatePalette(rng) {
  const baseHue = rng() * 360;
  const spread = mix(30, 120, rng());
  const saturation = mix(65, 95, rng());
  const lightnessBase = mix(40, 70, rng());

  const colors = Array.from({ length: 5 }, (_, i) => {
    const offset = (i / 5 - 0.5) * spread + rng() * 10;
    const hue = (baseHue + offset + 360) % 360;
    const sat = clamp(saturation + rng() * 10 - 5, 55, 100);
    const light = clamp(lightnessBase + rng() * 20 - 10, 25, 85);
    const alpha = mix(0.55, 0.9, rng());
    return `hsla(${hue.toFixed(2)}, ${sat.toFixed(2)}%, ${light.toFixed(2)}%, ${alpha.toFixed(3)})`;
  });

  return colors;
}

function updatePaletteSwatches() {
  paletteContainer.innerHTML = "";
  palette.forEach((color) => {
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = color;
    paletteContainer.appendChild(swatch);
  });
}

function createFlowLayers(rng) {
  const layers = Array.from({ length: 4 }, () => ({
    amp: mix(0.2, 1.6, rng()),
    freqX: mix(0.4, 1.5, rng()),
    freqY: mix(0.4, 1.5, rng()),
    twist: mix(-Math.PI, Math.PI, rng()),
    pulse: mix(0.2, 1.6, rng()),
    offset: rng() * Math.PI * 2,
  }));
  return layers;
}

function createAuraSeeds(rng) {
  return Array.from({ length: 3 }, () => ({
    hueShift: rng(),
    radius: mix(0.15, 0.45, rng()),
    pulse: mix(0.5, 1.5, rng()),
    phase: rng() * Math.PI * 2,
  }));
}

function createParticles(rng) {
  const count = Math.floor(180 + rng() * 160);
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push({
      x: rng(),
      y: rng(),
      drift: rng(),
      glow: rng(),
      scale: mix(0.25, 1.3, rng()),
      layer: i % palette.length,
      phase: rng() * Math.PI * 2,
      sway: mix(0.5, 1.6, rng()),
    });
  }
  return list;
}

function createBursts(rng) {
  const count = 12 + Math.floor(rng() * 8);
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push({
      x: rng(),
      y: rng(),
      radius: mix(0.1, 0.35, rng()),
      pulse: mix(0.5, 1.4, rng()),
      delay: rng() * 1000,
      layer: Math.floor(rng() * palette.length),
    });
  }
  return list;
}

function resizeCanvas() {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function flowField(x, y, t) {
  let value = 0;
  for (const layer of flowLayers) {
    const angle =
      Math.sin((x * layer.freqX + y * layer.freqY) * Math.PI * 2 + t * layer.amp + layer.offset) +
      Math.cos((x * layer.freqY - y * layer.freqX) * Math.PI + t * layer.pulse + layer.offset * 1.3);
    value += angle * layer.twist;
  }
  return value;
}

function applyPointerInfluence(particle) {
  if (!pointer.active) return;
  const dx = pointer.x - particle.x;
  const dy = pointer.y - particle.y;
  const distSq = dx * dx + dy * dy;
  const influence = Math.exp(-distSq * 12) * pointer.strength;
  if (influence > 0.001) {
    particle.x -= dy * influence * 0.35;
    particle.y += dx * influence * 0.35;
  }
}

function updateParticles(dt) {
  const fade = 0.12 * clamp(baseTempo, 0.35, 2.4);
  ctx.fillStyle = `rgba(3, 2, 12, ${fade.toFixed(3)})`;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = "lighter";

  const tempo = baseTempo * mix(0.8, 1.4, Math.sin(time * 0.2) * 0.5 + 0.5);

  particles.forEach((particle) => {
    const angle = flowField(particle.x, particle.y, time + particle.phase) * 0.6;
    const speed = mix(0.0003, 0.0028, particle.scale) * tempo;

    particle.x += Math.cos(angle) * speed + Math.sin(time * 0.4 + particle.phase) * 0.0004;
    particle.y += Math.sin(angle) * speed + Math.cos(time * 0.37 + particle.phase) * 0.0004;

    applyPointerInfluence(particle);

    particle.x += (Math.sin(time * particle.sway + particle.phase) * 0.0006) / tempo;
    particle.y += (Math.cos(time * particle.sway + particle.phase) * 0.0006) / tempo;

    if (particle.x < -0.2 || particle.x > 1.2 || particle.y < -0.2 || particle.y > 1.2) {
      particle.x = (particle.x + 1.2) % 1.2;
      particle.y = (particle.y + 1.2) % 1.2;
    }

    const px = particle.x * width;
    const py = particle.y * height;
    const baseColor = palette[particle.layer % palette.length];
    const nextColor = palette[(particle.layer + 1) % palette.length];
    const colorMix = (Math.sin(time * 0.8 + particle.phase) * 0.5 + 0.5) ** 1.5;
    ctx.fillStyle = lerpColor(baseColor, nextColor, colorMix);
    const r = mix(0.5, 2.4, particle.scale) * (1 + Math.sin(time * 0.9 + particle.phase) * 0.35);
    const gradient = ctx.createRadialGradient(px, py, 0, px, py, r * 40);
    gradient.addColorStop(0, ctx.fillStyle.replace(/\d?\.\d+\)/, "1)"));
    gradient.addColorStop(1, ctx.fillStyle.replace(/\d?\.\d+\)/, "0)"));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(px, py, r * mix(18, 48, particle.glow), 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.globalCompositeOperation = "screen";

  cosmicBursts.forEach((burst) => {
    const pulse = Math.sin((time + burst.delay) * burst.pulse) * 0.5 + 0.5;
    const radius = mix(120, Math.max(width, height) * burst.radius, pulse);
    const cx = burst.x * width;
    const cy = burst.y * height;
    const color = palette[burst.layer % palette.length];
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, color.replace(/\d?\.\d+\)/, "0.95)"));
    gradient.addColorStop(0.6, color.replace(/\d?\.\d+\)/, "0.35)"));
    gradient.addColorStop(1, color.replace(/\d?\.\d+\)/, "0)"));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  });

  renderAuras();

  ctx.globalCompositeOperation = "source-over";
}

function updatePointerDecay(dt) {
  if (!pointer.active && pointer.strength > 0.001) {
    pointer.strength = Math.max(0, pointer.strength - dt * 0.35);
  }
}

function animate(timestamp) {
  if (!animationId) {
    animationId = timestamp;
  }
  const deltaMs = timestamp - animationId;
  animationId = timestamp;
  const dt = deltaMs / 1000;
  time += dt * baseTempo * mix(0.8, 1.4, Math.sin(time * 0.12) * 0.5 + 0.5);

  updateParticles(dt);
  updatePointerDecay(dt);

  requestAnimationFrame(animate);
}

function setSeed(seed) {
  const normalized = Math.abs(Math.floor(seed)) || 1;
  currentSeed = normalized;
  const url = new URL(window.location.href);
  url.searchParams.set("seed", normalized);
  history.replaceState(null, "Dreamseed", url.toString());

  const rng = createMulberry32(normalized);
  palette = generatePalette(rng);
  flowLayers = createFlowLayers(rng);
  auraSeeds = createAuraSeeds(rng);
  particles = createParticles(rng);
  cosmicBursts = createBursts(rng);
  baseTempo = mix(0.6, 1.8, rng());
  time = rng() * Math.PI * 2;

  updatePaletteSwatches();
  seedInput.value = normalized;
}

function parseInitialSeed() {
  const url = new URL(window.location.href);
  const paramSeed = url.searchParams.get("seed");
  if (paramSeed && /^-?\d+$/.test(paramSeed)) {
    return parseInt(paramSeed, 10);
  }
  if (window.location.hash && /^#-?\d+$/.test(window.location.hash)) {
    return parseInt(window.location.hash.slice(1), 10);
  }
  const segments = window.location.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (last && /^-?\d+$/.test(last)) {
    return parseInt(last, 10);
  }
  return Math.floor(Math.random() * 10 ** 9);
}

function handleFormSubmit(event) {
  event.preventDefault();
  const value = seedInput.value.trim();
  if (!value || !/^-?\d+$/.test(value)) {
    seedInput.focus();
    return;
  }
  setSeed(parseInt(value, 10));
}

function handleRandomSeed() {
  const randomSeed = Math.floor(Math.random() * 10 ** 9);
  setSeed(randomSeed);
}

function handlePointer(event) {
  pointer.active = true;
  const bounds = canvas.getBoundingClientRect();
  pointer.x = (event.clientX - bounds.left) / bounds.width;
  pointer.y = (event.clientY - bounds.top) / bounds.height;
  pointer.strength = clamp(pointer.strength + 0.35, 0, 2);
  pointer.rhythm = event.pressure || 1;
}

function handlePointerEnd() {
  pointer.active = false;
}

function handleWheel(event) {
  event.preventDefault();
  const delta = clamp(event.deltaY / 120, -1, 1);
  baseTempo = clamp(baseTempo - delta * 0.12, 0.25, 3.2);
  pointer.strength = clamp(pointer.strength + Math.abs(delta) * 0.15, 0, 2);
}

function installEventListeners() {
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("wheel", handleWheel, { passive: false });
  window.addEventListener("pointermove", handlePointer, { passive: true });
  window.addEventListener("pointerdown", handlePointer, { passive: true });
  window.addEventListener("pointerup", handlePointerEnd, { passive: true });
  window.addEventListener("pointercancel", handlePointerEnd, { passive: true });
  window.addEventListener("touchmove", (event) => {
    if (event.touches && event.touches[0]) {
      handlePointer(event.touches[0]);
    }
  }, { passive: true });

  form.addEventListener("submit", handleFormSubmit);
  randomButton.addEventListener("click", handleRandomSeed);
}

function renderAuras() {
  if (!auraSeeds.length) return;
  ctx.globalCompositeOperation = "screen";
  auraSeeds.forEach((aura, index) => {
    const cx = Math.sin(time * 0.2 + index) * 0.3 + 0.5;
    const cy = Math.cos(time * 0.25 + aura.phase) * 0.3 + 0.5;
    const radius = mix(0.2, aura.radius + pointer.strength * 0.05, Math.sin(time * aura.pulse + aura.phase) * 0.5 + 0.5);
    const px = cx * width;
    const py = cy * height;
    const color = palette[index % palette.length];
    const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius * Math.max(width, height));
    gradient.addColorStop(0, color.replace(/\d?\.\d+\)/, "0.4)"));
    gradient.addColorStop(1, color.replace(/\d?\.\d+\)/, "0)"));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(px, py, radius * Math.max(width, height), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalCompositeOperation = "source-over";
}

function start() {
  resizeCanvas();
  installEventListeners();
  const seed = parseInitialSeed();
  setSeed(seed);
  renderAuras();
  requestAnimationFrame(animate);
}

start();


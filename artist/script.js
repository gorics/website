const canvas = document.getElementById("dream-canvas");
const ctx = canvas.getContext("2d", { alpha: true });
const form = document.getElementById("seed-form");
const seedInput = document.getElementById("seed-input");
const randomButton = document.getElementById("random-seed");
const paletteContainer = document.getElementById("palette-swatches");
const toggleUIButton = document.getElementById("toggle-ui");
const fullscreenButton = document.getElementById("fullscreen-toggle");
const overlay = document.querySelector(".overlay");

const body = document.body;

let revealButton = null;
let uiHidden = false;

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

let dynamicRng = createMulberry32(1);
let mutationTimer = 0;
let mutationInterval = 9;
let chaosStep = 0;
let paletteNext = [];
let paletteTransition = 0;
let paletteTransitionSpeed = 0;
let paletteSwatchTimer = 0;
let tempoTarget = 1;

let strands = [];

const pointer = {
  x: 0.5,
  y: 0.5,
  active: false,
  strength: 0,
  rhythm: 0,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function ensureRevealButton() {
  if (revealButton) return;
  revealButton = document.createElement("button");
  revealButton.id = "reveal-ui";
  revealButton.type = "button";
  revealButton.textContent = "UI 표시";
  revealButton.setAttribute("aria-label", "UI 다시 표시");
  revealButton.addEventListener("click", () => setUIHidden(false));
  document.body.appendChild(revealButton);
}

function setUIHidden(hidden) {
  ensureRevealButton();
  if (uiHidden === hidden) return;
  uiHidden = hidden;
  body.classList.toggle("ui-hidden", hidden);
  if (toggleUIButton) {
    toggleUIButton.textContent = hidden ? "UI 표시" : "UI 숨기기";
    toggleUIButton.setAttribute("aria-pressed", hidden ? "true" : "false");
  }
  if (overlay) {
    if (hidden) {
      overlay.setAttribute("aria-hidden", "true");
    } else {
      overlay.removeAttribute("aria-hidden");
    }
  }
  if (!hidden && revealButton) {
    revealButton.blur();
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    const target = document.documentElement;
    if (target.requestFullscreen) {
      const result = target.requestFullscreen();
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
    }
  } else if (document.exitFullscreen) {
    const exitResult = document.exitFullscreen();
    if (exitResult && typeof exitResult.catch === "function") {
      exitResult.catch(() => {});
    }
  }
}

function handleFullscreenChange() {
  const isFullscreen = Boolean(document.fullscreenElement);
  if (fullscreenButton) {
    fullscreenButton.textContent = isFullscreen ? "전체 화면 종료" : "전체 화면";
    fullscreenButton.setAttribute("aria-pressed", isFullscreen ? "true" : "false");
  }
  if (isFullscreen && !uiHidden) {
    setTimeout(() => {
      if (!uiHidden) {
        setUIHidden(true);
      }
    }, 220);
  }
}

function handleKeydown(event) {
  if (event.defaultPrevented) return;
  if (event.key === "h" || event.key === "H") {
    event.preventDefault();
    setUIHidden(!uiHidden);
  } else if (event.key === "f" || event.key === "F") {
    event.preventDefault();
    toggleFullscreen();
  } else if (event.key === "Escape" && uiHidden) {
    setUIHidden(false);
  }
}

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

function getPaletteColor(index) {
  const select = (array, i) => array[((i % array.length) + array.length) % array.length];
  if (!palette.length && !paletteNext.length) {
    return "hsla(240, 60%, 60%, 0.6)";
  }
  const base = palette.length ? select(palette, index) : select(paletteNext, index);
  if (!paletteNext.length) {
    return base;
  }
  const target = select(paletteNext, index);
  return lerpColor(base, target, paletteTransition);
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
  if (!paletteContainer) return;
  paletteContainer.innerHTML = "";
  const count = Math.max(palette.length, paletteNext.length);
  for (let i = 0; i < count; i++) {
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = getPaletteColor(i);
    paletteContainer.appendChild(swatch);
  }
}

function createFlowLayers(rng) {
  return Array.from({ length: 4 }, () => {
    const layer = {
      amp: mix(0.2, 1.6, rng()),
      freqX: mix(0.4, 1.5, rng()),
      freqY: mix(0.4, 1.5, rng()),
      twist: mix(-Math.PI, Math.PI, rng()),
      pulse: mix(0.2, 1.6, rng()),
      offset: rng() * Math.PI * 2,
    };
    return {
      ...layer,
      target: { ...layer },
      drift: mix(-1.1, 1.1, rng()),
      morphRate: mix(0.15, 0.6, rng()),
      warp: mix(0.4, 1.4, rng()),
    };
  });
}

function createAuraSeeds(rng) {
  return Array.from({ length: 3 }, () => {
    const radius = mix(0.15, 0.45, rng());
    const pulse = mix(0.5, 1.5, rng());
    return {
      hueShift: rng(),
      radius,
      pulse,
      phase: rng() * Math.PI * 2,
      targetRadius: radius,
      targetPulse: pulse,
      spin: mix(-0.6, 0.6, rng()),
      morphRate: mix(0.18, 0.45, rng()),
    };
  });
}

function createParticles(rng) {
  const count = Math.floor(180 + rng() * 160);
  const list = [];
  for (let i = 0; i < count; i++) {
    const layerIndex = i % Math.max(palette.length, 1);
    list.push({
      x: rng(),
      y: rng(),
      drift: rng(),
      glow: rng(),
      scale: mix(0.25, 1.3, rng()),
      layer: layerIndex,
      phase: rng() * Math.PI * 2,
      sway: mix(0.5, 1.6, rng()),
      chaos: rng(),
      pulse: mix(0.6, 1.8, rng()),
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
      drift: mix(-0.4, 0.4, rng()),
      spin: mix(0.2, 1.4, rng()),
    });
  }
  return list;
}

function spawnStrand(rng, layerIndex = null) {
  const pointCount = 3 + Math.floor(rng() * 4);
  return {
    points: Array.from({ length: pointCount }, () => ({
      x: rng(),
      y: rng(),
      offset: rng() * Math.PI * 2,
    })),
    speed: mix(0.02, 0.08, rng()),
    wobble: mix(0.4, 2.2, rng()),
    layer: layerIndex ?? Math.floor(rng() * Math.max(palette.length, 1)),
    age: 0,
    life: mix(8, 18, rng()),
    arc: mix(0.3, 1.2, rng()),
    pulse: mix(0.3, 1.1, rng()),
    scatter: mix(0.0002, 0.0012, rng()),
  };
}

function createStrands(rng) {
  const count = 6 + Math.floor(rng() * 6);
  return Array.from({ length: count }, () => spawnStrand(rng));
}

function renderStrands(dt) {
  if (!strands.length) return;
  const previousComposite = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "color-dodge";
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  strands.forEach((strand, strandIndex) => {
    strand.age += dt;
    if (strand.age > strand.life) {
      strands[strandIndex] = spawnStrand(dynamicRng);
      return;
    }

    const velocity = strand.speed * (1 + pointer.strength * 0.4);
    strand.points.forEach((point) => {
      const angle = flowField(point.x, point.y, time + point.offset * strand.arc);
      point.x += Math.cos(angle) * velocity * dt * 60 + Math.sin(time * strand.wobble + point.offset) * strand.scatter;
      point.y += Math.sin(angle) * velocity * dt * 60 + Math.cos(time * strand.wobble + point.offset) * strand.scatter;

      if (pointer.active) {
        const dx = pointer.x - point.x;
        const dy = pointer.y - point.y;
        const distSq = dx * dx + dy * dy;
        const influence = Math.exp(-distSq * 8) * pointer.strength * 0.05;
        if (influence > 0.0001) {
          point.x -= dy * influence;
          point.y += dx * influence;
        }
      }

      if (point.x < -0.25 || point.x > 1.25) {
        point.x = (point.x + 1.25) % 1.25;
      }
      if (point.y < -0.25 || point.y > 1.25) {
        point.y = (point.y + 1.25) % 1.25;
      }
    });

    const first = strand.points[0];
    const intensity = Math.sin(time * strand.pulse + strand.age * 0.8 + strandIndex) * 0.5 + 0.5;
    ctx.beginPath();
    ctx.moveTo(first.x * width, first.y * height);
    for (let i = 1; i < strand.points.length; i++) {
      const prev = strand.points[i - 1];
      const current = strand.points[i];
      const ctrl1x = mix(prev.x, current.x, 0.35) + Math.sin(time * strand.wobble + current.offset) * 0.05 * strand.arc;
      const ctrl1y = mix(prev.y, current.y, 0.35) + Math.cos(time * strand.wobble + current.offset) * 0.05 * strand.arc;
      const ctrl2x = mix(prev.x, current.x, 0.65) + Math.cos(time * strand.wobble + current.offset) * 0.05 * strand.arc;
      const ctrl2y = mix(prev.y, current.y, 0.65) + Math.sin(time * strand.wobble + current.offset) * 0.05 * strand.arc;
      ctx.bezierCurveTo(ctrl1x * width, ctrl1y * height, ctrl2x * width, ctrl2y * height, current.x * width, current.y * height);
    }

    ctx.lineWidth = mix(0.6, 3.2, intensity + pointer.strength * 0.2);
    ctx.globalAlpha = clamp(0.22 + intensity * 0.4 + pointer.strength * 0.1, 0.15, 0.85);
    const strokeColor = getPaletteColor(strand.layer + strandIndex);
    ctx.strokeStyle = strokeColor;
    ctx.shadowColor = getPaletteColor(strand.layer + strandIndex + 1).replace(/\d?\.\d+\)/, "0.5)");
    ctx.shadowBlur = 30 * (intensity + 0.2);
    ctx.stroke();
  });

  ctx.restore();
  ctx.globalCompositeOperation = previousComposite;
}

function mutateDynamics() {
  chaosStep += 1;
  const rng = createMulberry32((currentSeed + chaosStep * 1777) >>> 0);

  if (flowLayers.length) {
    const layer = flowLayers[Math.floor(rng() * flowLayers.length)];
    layer.target = {
      amp: mix(0.2, 1.9, rng()),
      freqX: mix(0.3, 2.4, rng()),
      freqY: mix(0.3, 2.4, rng()),
      twist: mix(-Math.PI * 1.6, Math.PI * 1.6, rng()),
      pulse: mix(0.2, 2.2, rng()),
      offset: rng() * Math.PI * 2,
      warp: mix(0.3, 2.1, rng()),
    };
    layer.morphRate = mix(0.2, 1.1, rng());
    layer.drift = mix(-1.6, 1.6, rng());
    layer.warp = mix(0.3, 2.1, rng());
  }

  if (auraSeeds.length) {
    const aura = auraSeeds[Math.floor(rng() * auraSeeds.length)];
    aura.targetRadius = mix(0.12, 0.5, rng());
    aura.targetPulse = mix(0.4, 2.4, rng());
    aura.morphRate = mix(0.18, 0.55, rng());
    aura.spin = mix(-1.4, 1.4, rng());
  }

  if (particles.length) {
    const swaps = Math.floor(particles.length * 0.12);
    for (let i = 0; i < swaps; i++) {
      const particle = particles[Math.floor(rng() * particles.length)];
      particle.phase = rng() * Math.PI * 2;
      particle.scale = mix(0.2, 1.6, rng());
      particle.chaos = rng();
      particle.pulse = mix(0.6, 1.9, rng());
    }
  }

  if (cosmicBursts.length && rng() > 0.35) {
    const burst = cosmicBursts[Math.floor(rng() * cosmicBursts.length)];
    burst.x = (burst.x + rng() * 0.6 - 0.3 + 1) % 1;
    burst.y = (burst.y + rng() * 0.6 - 0.3 + 1) % 1;
    burst.radius = mix(0.08, 0.45, rng());
    burst.pulse = mix(0.4, 2.4, rng());
    burst.layer = Math.floor(rng() * Math.max(palette.length, 1));
    burst.drift = mix(-0.6, 0.6, rng());
    burst.spin = mix(0.2, 2, rng());
  }

  if (rng() > 0.55 || !paletteNext.length) {
    paletteNext = generatePalette(rng);
    paletteTransition = 0;
    paletteTransitionSpeed = mix(0.15, 0.35, rng());
    updatePaletteSwatches();
  }

  if (strands.length) {
    const index = Math.floor(rng() * strands.length);
    strands[index] = spawnStrand(rng, strands[index]?.layer);
  }

  if (rng() > 0.7 || cosmicBursts.length < 16) {
    cosmicBursts.push({
      x: rng(),
      y: rng(),
      radius: mix(0.1, 0.42, rng()),
      pulse: mix(0.4, 2.2, rng()),
      delay: time * rng() * 120,
      layer: Math.floor(rng() * Math.max(palette.length, 1)),
      drift: mix(-0.5, 0.5, rng()),
      spin: mix(0.2, 1.8, rng()),
    });
    if (cosmicBursts.length > 28) {
      cosmicBursts.shift();
    }
  }

  tempoTarget = clamp(mix(0.4, 2.6, rng()), 0.25, 3.2);
  mutationInterval = mix(5, 13, rng());
  paletteSwatchTimer = 0;
}

function updateChaos(dt) {
  if (!flowLayers.length) return;
  mutationTimer += dt * (1 + pointer.strength * 0.6 + Math.abs(pointer.rhythm - 1) * 0.3);
  paletteSwatchTimer += dt;

  flowLayers.forEach((layer) => {
    layer.offset += dt * (layer.drift + Math.sin(time * 0.3 + layer.offset) * 0.4);
    layer.amp = mix(layer.amp, layer.target.amp, dt * layer.morphRate);
    layer.freqX = mix(layer.freqX, layer.target.freqX, dt * layer.morphRate);
    layer.freqY = mix(layer.freqY, layer.target.freqY, dt * layer.morphRate);
    layer.pulse = mix(layer.pulse, layer.target.pulse, dt * layer.morphRate);
    layer.twist = mix(layer.twist, layer.target.twist, dt * layer.morphRate);
    layer.warp = mix(layer.warp, layer.target.warp ?? layer.warp, dt * 0.3);
    layer.offset = mix(layer.offset, layer.target.offset ?? layer.offset, dt * 0.2);
  });

  auraSeeds.forEach((aura) => {
    aura.phase += dt * (aura.spin || 0);
    aura.radius = mix(aura.radius, aura.targetRadius, dt * aura.morphRate);
    aura.pulse = mix(aura.pulse, aura.targetPulse, dt * aura.morphRate);
  });

  if (paletteNext.length) {
    paletteTransition = Math.min(1, paletteTransition + dt * (paletteTransitionSpeed || 0.2));
    if (paletteTransition >= 1) {
      palette = paletteNext;
      paletteNext = [];
      paletteTransition = 0;
      paletteTransitionSpeed = 0;
      updatePaletteSwatches();
    }
  }

  baseTempo = mix(baseTempo, tempoTarget, dt * 0.5);

  if (paletteSwatchTimer >= 0.35) {
    paletteSwatchTimer = 0;
    updatePaletteSwatches();
  }

  if (mutationTimer >= mutationInterval) {
    mutationTimer = 0;
    mutateDynamics();
  }
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
    const base =
      Math.sin((x * layer.freqX + y * layer.freqY) * Math.PI * 2 + t * layer.amp + layer.offset) +
      Math.cos((x * layer.freqY - y * layer.freqX) * Math.PI + t * layer.pulse + layer.offset * 1.3);
    const turbulence =
      Math.sin((x + y + layer.offset) * layer.warp * Math.PI + time * layer.drift * 0.3) +
      Math.cos((x - y - layer.offset) * (layer.warp + 0.4) * Math.PI + t * 0.5);
    value += base * layer.twist + turbulence * layer.amp * 0.35;
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

  const tempo = baseTempo * mix(0.8, 1.4, Math.sin(time * 0.2 + pointer.rhythm * 0.3) * 0.5 + 0.5);

  particles.forEach((particle, index) => {
    const flowAngle = flowField(
      particle.x,
      particle.y,
      time + particle.phase * (0.6 + particle.chaos)
    ) * (0.5 + particle.chaos * 0.6);
    const speed = mix(0.00028, 0.0034, particle.scale) * tempo * (1 + particle.chaos * 0.4);

    particle.x += Math.cos(flowAngle) * speed + Math.sin(time * particle.pulse + particle.phase) * 0.0006;
    particle.y += Math.sin(flowAngle) * speed + Math.cos(time * (particle.pulse + 0.2) + particle.phase) * 0.0006;

    const jitterX = Math.sin(time * 1.3 + particle.phase * 1.7) * 0.0005 * (particle.chaos + 0.3);
    const jitterY = Math.cos(time * 0.9 + particle.phase * 0.8) * 0.0005 * (particle.chaos + 0.3);
    particle.x += jitterX;
    particle.y += jitterY;

    applyPointerInfluence(particle);

    const tempoSafe = Math.max(0.35, tempo);
    particle.x += (Math.sin(time * particle.sway + particle.phase) * 0.0006) / tempoSafe;
    particle.y += (Math.cos(time * (particle.sway + 0.35) + particle.phase) * 0.0006) / tempoSafe;

    if (particle.x < -0.2 || particle.x > 1.2 || particle.y < -0.2 || particle.y > 1.2) {
      particle.x = (particle.x + 1.2) % 1.2;
      particle.y = (particle.y + 1.2) % 1.2;
    }

    const px = particle.x * width;
    const py = particle.y * height;
    const baseColor = getPaletteColor(particle.layer + Math.floor(particle.chaos * 3));
    const nextColor = getPaletteColor(particle.layer + 1 + Math.floor(particle.pulse * 2));
    const colorMix = (Math.sin(time * (0.8 + particle.chaos * 0.4) + particle.phase) * 0.5 + 0.5) ** 1.5;
    const blended = lerpColor(baseColor, nextColor, colorMix);
    const r = mix(0.5, 2.8, particle.scale) * (1 + Math.sin(time * (0.6 + particle.chaos) + particle.phase) * 0.4);
    const gradient = ctx.createRadialGradient(px, py, 0, px, py, r * 42);
    gradient.addColorStop(0, blended.replace(/\d?\.\d+\)/, "1)"));
    gradient.addColorStop(0.45, blended.replace(/\d?\.\d+\)/, "0.6)"));
    gradient.addColorStop(1, blended.replace(/\d?\.\d+\)/, "0)"));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(px, py, r * mix(18, 52, particle.glow), 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.globalCompositeOperation = "screen";

  cosmicBursts.forEach((burst, index) => {
    burst.x += Math.sin(time * burst.spin + burst.delay) * 0.0003 * burst.drift;
    burst.y += Math.cos(time * burst.spin + burst.delay) * 0.0003 * burst.drift;
    if (burst.x < -0.2 || burst.x > 1.2) {
      burst.x = (burst.x + 1.2) % 1.2;
    }
    if (burst.y < -0.2 || burst.y > 1.2) {
      burst.y = (burst.y + 1.2) % 1.2;
    }
    const pulse = Math.sin((time + burst.delay) * burst.pulse) * 0.5 + 0.5;
    const radius = mix(120, Math.max(width, height) * burst.radius, pulse);
    const cx = burst.x * width;
    const cy = burst.y * height;
    const color = getPaletteColor(burst.layer + index);
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, color.replace(/\d?\.\d+\)/, "0.95)"));
    gradient.addColorStop(0.55, color.replace(/\d?\.\d+\)/, "0.4)"));
    gradient.addColorStop(1, color.replace(/\d?\.\d+\)/, "0)"));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  });

  renderStrands(dt);

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

  updateChaos(dt);
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
  tempoTarget = baseTempo;
  time = rng() * Math.PI * 2;

  dynamicRng = createMulberry32((normalized ^ 0xa511e9b9) >>> 0);
  mutationInterval = mix(6, 14, dynamicRng());
  mutationTimer = mutationInterval * 0.4;
  chaosStep = 0;
  paletteNext = [];
  paletteTransition = 0;
  paletteTransitionSpeed = 0;
  paletteSwatchTimer = 0;
  strands = createStrands(dynamicRng);

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
  pointer.strength = clamp(pointer.strength + 0.35, 0, 2.6);
  pointer.rhythm = event.pressure || 1;
  mutationTimer = Math.min(mutationInterval, mutationTimer + 0.05 + pointer.strength * 0.02);
  if (typeof event.movementY === "number") {
    tempoTarget = clamp(tempoTarget + event.movementY * 0.0006, 0.25, 3.2);
  }
}

function handlePointerEnd() {
  pointer.active = false;
}

function handleWheel(event) {
  event.preventDefault();
  const delta = clamp(event.deltaY / 120, -1, 1);
  const adjustedTempo = clamp(baseTempo - delta * 0.12, 0.25, 3.2);
  baseTempo = adjustedTempo;
  tempoTarget = adjustedTempo;
  pointer.strength = clamp(pointer.strength + Math.abs(delta) * 0.15, 0, 2.6);
  mutationTimer = Math.min(mutationInterval, mutationTimer + Math.abs(delta) * 0.2);
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
  window.addEventListener("touchend", handlePointerEnd, { passive: true });
  window.addEventListener("touchcancel", handlePointerEnd, { passive: true });

  form.addEventListener("submit", handleFormSubmit);
  randomButton.addEventListener("click", handleRandomSeed);
  if (toggleUIButton) {
    toggleUIButton.addEventListener("click", () => setUIHidden(!uiHidden));
  }
  if (fullscreenButton) {
    fullscreenButton.addEventListener("click", toggleFullscreen);
  }
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
}

function renderAuras() {
  if (!auraSeeds.length) return;
  ctx.globalCompositeOperation = "screen";
  auraSeeds.forEach((aura, index) => {
    const cx = Math.sin(time * 0.2 + index + aura.hueShift * 6) * (0.25 + aura.hueShift * 0.2) + 0.5;
    const cy = Math.cos(time * 0.25 + aura.phase + aura.hueShift * 4) * (0.25 + aura.hueShift * 0.2) + 0.5;
    const radius = mix(
      0.18,
      aura.radius + pointer.strength * 0.08,
      Math.sin(time * aura.pulse + aura.phase) * 0.5 + 0.5
    );
    const px = cx * width;
    const py = cy * height;
    const color = getPaletteColor(index + Math.floor(aura.hueShift * 7));
    const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius * Math.max(width, height));
    gradient.addColorStop(0, color.replace(/\d?\.\d+\)/, "0.45)"));
    gradient.addColorStop(0.7, color.replace(/\d?\.\d+\)/, "0.2)"));
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
  ensureRevealButton();
  setUIHidden(false);
  handleFullscreenChange();
  const seed = parseInitialSeed();
  setSeed(seed);
  renderAuras();
  requestAnimationFrame(animate);
}

start();


/* =========================================================================
   AZERITEK — 3D AI Core scene (Three.js, ES module)
   Renders: glass/metal AI core, circuit nodes, particle field, orbiting
   integration modules connected to the core with animated data streams.
   Scroll position blends camera framing between three "focus zones":
   hero -> ecosystem -> final-cta. Elsewhere the canvas gently fades out.
   ========================================================================= */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";

// Small safety polyfill for older canvas implementations without roundRect.
if (typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const rad = typeof r === "number" ? r : (r && r[0]) || 0;
    this.moveTo(x + rad, y);
    this.arcTo(x + w, y, x + w, y + h, rad);
    this.arcTo(x + w, y + h, x, y + h, rad);
    this.arcTo(x, y + h, x, y, rad);
    this.arcTo(x, y, x + w, y, rad);
    this.closePath();
    return this;
  };
}

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const IS_MOBILE = window.matchMedia("(max-width: 760px)").matches || window.matchMedia("(hover: none)").matches;

const canvas = document.getElementById("gl-canvas");
const labelsRoot = document.getElementById("node-labels");

function boot() {
  if (!canvas) {
    // Nothing to do — page markup missing the canvas host.
    console.warn("Azeritek scene: #gl-canvas not found.");
    return;
  }
  initScene(canvas, labelsRoot).catch((err) => {
    console.error("Azeritek 3D scene failed to start:", err);
    canvas.style.display = "none";
    document.body.classList.add("no-webgl");
    document.dispatchEvent(new CustomEvent("azeritek:ready"));
  });
}

// The 3D scene is a background enhancement, not critical content: start it
// once the browser is idle (i.e. after it has finished more urgent work
// like laying out and painting the hero) instead of competing with that
// work the instant this module finishes downloading.
if ("requestIdleCallback" in window) {
  requestIdleCallback(boot, { timeout: 1500 });
} else {
  setTimeout(boot, 200);
}

async function initScene(canvas, labelsRoot) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !IS_MOBILE,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch (e) {
    throw new Error("WebGL unavailable");
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 8.5);

  // ---------------- Lighting ----------------
  scene.add(new THREE.AmbientLight(0x0a1830, 1.1));
  const keyLight = new THREE.PointLight(0x4fc3ff, 14, 40, 2);
  keyLight.position.set(4, 3, 6);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(0x1a6fff, 8, 40, 2);
  rimLight.position.set(-5, -2, -4);
  scene.add(rimLight);
  const fillLight = new THREE.PointLight(0xffffff, 2.2, 30, 2);
  fillLight.position.set(0, 4, 3);
  scene.add(fillLight);

  // ---------------- Root groups ----------------
  const world = new THREE.Group(); // pan/offset per zone
  scene.add(world);

  const coreGroup = new THREE.Group(); // rotates (auto + mouse parallax)
  world.add(coreGroup);

  const loadingManager = new THREE.LoadingManager();
  loadingManager.onProgress = (_url, loaded, total) => {
    document.dispatchEvent(
      new CustomEvent("azeritek:load-progress", { detail: { progress: loaded / Math.max(total, 1) } })
    );
  };
  const textureLoader = new THREE.TextureLoader(loadingManager);

  // ---------------- Core: glass/metal icosahedron ----------------
  const CORE_R = 1.15;
  const icoGeo = new THREE.IcosahedronGeometry(CORE_R, 2);

  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x0a1626,
    metalness: 0.88,
    roughness: 0.3,
    transparent: true,
    opacity: 0.72,
  });
  const coreMesh = new THREE.Mesh(icoGeo, coreMat);
  coreGroup.add(coreMesh);

  // Fresnel-ish rim glow (cheap trick: slightly larger backside shell, additive)
  const rimGeo = new THREE.IcosahedronGeometry(CORE_R * 1.08, 2);
  const rimMat = new THREE.MeshBasicMaterial({
    color: 0x00a3ff,
    transparent: true,
    opacity: 0.22,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  coreGroup.add(new THREE.Mesh(rimGeo, rimMat));

  // Wireframe edges — "circuit" skeleton
  const edgesGeo = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(CORE_R * 1.002, 1));
  const edgesMat = new THREE.LineBasicMaterial({ color: 0x5fc9ff, transparent: true, opacity: 0.5 });
  const edges = new THREE.LineSegments(edgesGeo, edgesMat);
  coreGroup.add(edges);

  // Soft inner glow sprite
  const glowTex = makeRadialGlowTexture();
  const coreGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTex, color: 0x2fa8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  coreGlow.scale.set(CORE_R * 4.6, CORE_R * 4.6, 1);
  coreGroup.add(coreGlow);

  // Circuit node dots on the low-poly vertices
  const vertPositions = new THREE.IcosahedronGeometry(CORE_R * 1.0, 1).attributes.position;
  const nodeMat = new THREE.MeshBasicMaterial({ color: 0xcdeeff });
  const nodeGeo = new THREE.SphereGeometry(0.028, 8, 8);
  const seenNodes = new Set();
  for (let i = 0; i < vertPositions.count; i += 3) {
    const key = `${vertPositions.getX(i).toFixed(2)}_${vertPositions.getY(i).toFixed(2)}`;
    if (seenNodes.has(key)) continue;
    seenNodes.add(key);
    const dot = new THREE.Mesh(nodeGeo, nodeMat);
    dot.position.set(vertPositions.getX(i), vertPositions.getY(i), vertPositions.getZ(i));
    coreGroup.add(dot);
  }

  // Rotating accent rings
  const ring1 = new THREE.Mesh(
    new THREE.TorusGeometry(CORE_R * 1.55, 0.006, 8, 96),
    new THREE.MeshBasicMaterial({ color: 0x00a3ff, transparent: true, opacity: 0.4 })
  );
  ring1.rotation.x = Math.PI / 2.3;
  coreGroup.add(ring1);
  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(CORE_R * 1.8, 0.005, 8, 96),
    new THREE.MeshBasicMaterial({ color: 0x6fd1ff, transparent: true, opacity: 0.28 })
  );
  ring2.rotation.x = Math.PI / 2;
  ring2.rotation.y = Math.PI / 3;
  coreGroup.add(ring2);

  // AZERITEK emblem at the heart of the core
  let emblem = null;
  try {
    const emblemTex = await loadTexture(textureLoader, "assets/logo/logo-mark-3d.webp");
    emblemTex.colorSpace = THREE.SRGBColorSpace;
    emblem = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: emblemTex, transparent: true, depthWrite: false, opacity: 0.96 })
    );
    emblem.scale.set(CORE_R * 1.5, CORE_R * 1.5, 1);
    emblem.position.z = 0.02;
    // The emblem is the brand's highest-priority element — it must always
    // read clearly at the heart of the core, regardless of rotation, so it
    // ignores the depth buffer and always draws on top of the core mesh.
    emblem.material.depthTest = false;
    emblem.renderOrder = 999;
    coreGroup.add(emblem);
  } catch (e) {
    /* logo optional — scene still works without it */
  }

  // ---------------- Particle field ----------------
  const particleGroup = new THREE.Group();
  world.add(particleGroup);
  const PARTICLE_COUNT = REDUCED_MOTION ? 200 : IS_MOBILE ? 260 : 650;
  const particlePos = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const r = 6 + Math.random() * 9;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    particlePos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    particlePos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
    particlePos[i * 3 + 2] = r * Math.cos(phi) - 4;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePos, 3));
  const dotTex = makeDotTexture();
  const particleMat = new THREE.PointsMaterial({
    size: 0.055,
    map: dotTex,
    color: 0x8fd4ff,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  particleGroup.add(new THREE.Points(particleGeo, particleMat));

  // ---------------- Integration modules ----------------
  const MODULES = [
    { key: "whatsapp", label: "WhatsApp", tiers: ["hero", "ecosystem"] },
    { key: "crm", label: "CRM", tiers: ["hero", "ecosystem"] },
    { key: "calendar", label: "Calendario", tiers: ["hero", "ecosystem"] },
    { key: "email", label: "Email", tiers: ["hero", "ecosystem"] },
    { key: "leads", label: "Leads", tiers: ["hero"] },
    { key: "bookings", label: "Reservas", tiers: ["hero"] },
    { key: "instagram", label: "Instagram", tiers: ["ecosystem"] },
    { key: "website", label: "Web", tiers: ["ecosystem"] },
    { key: "reviews", label: "Google Reviews", tiers: ["ecosystem"] },
    { key: "analytics", label: "Analytics", tiers: ["ecosystem"] },
  ];
  const N = MODULES.length;
  const packetTex = makeDotTexture();

  MODULES.forEach((m, i) => {
    const angle = (i / N) * Math.PI * 2;
    const radius = 3.0 + (i % 3) * 0.16;
    const y = Math.sin(i * 2.4) * 0.55;
    m.basePos = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius * 0.62 - 0.4);

    const tex = makeModuleTexture(m.key);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 })
    );
    sprite.position.copy(m.basePos);
    sprite.scale.set(0.62, 0.62, 1);
    sprite.userData.key = m.key;
    coreGroup.add(sprite);
    m.sprite = sprite;

    // data-stream curve from module -> core
    const mid = m.basePos.clone().multiplyScalar(0.45);
    mid.y += 0.5;
    const curve = new THREE.QuadraticBezierCurve3(m.basePos.clone(), mid, new THREE.Vector3(0, 0, 0));
    const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.008, 6, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0x1f8fff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    coreGroup.add(tube);
    m.line = tube;
    m.curve = curve;

    // traveling data packets
    m.packets = [0, 1].map((p) => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: packetTex, color: 0xbfe6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      s.scale.set(0.11, 0.11, 1);
      s.userData.phase = p * 0.5 + i * 0.07;
      coreGroup.add(s);
      return s;
    });

    // DOM label
    if (labelsRoot) {
      const el = document.createElement("div");
      el.className = "node-label";
      el.innerHTML = `<span class="dot"></span>${m.label}`;
      labelsRoot.appendChild(el);
      m.labelEl = el;
    }
  });

  // ---------------- Zones ----------------
  const zoneEls = {
    hero: document.getElementById("hero"),
    ecosystem: document.getElementById("ecosistema"),
    final: document.getElementById("cta-final"),
  };
  const ZONE_PARAMS = {
    // On narrow viewports the hero copy stacks and fills most of the
    // screen, so the core is pushed down + shrunk to sit below the text
    // instead of competing with it; on wide viewports it sits beside it.
    hero: {
      camZ: 8.6,
      offsetX: () => (window.innerWidth > 980 ? 2.0 : 0),
      offsetY: () => (window.innerWidth > 980 ? 0 : -2.15),
      scale: () => (window.innerWidth > 980 ? 1 : 0.6),
      opacity: 1,
      showLabels: true,
    },
    ecosystem: { camZ: 10.6, offsetX: () => 0, offsetY: () => 0, scale: () => (window.innerWidth > 680 ? 1.08 : 0.82), opacity: 1, showLabels: true },
    final: { camZ: 9.0, offsetX: () => 0, offsetY: () => 0, scale: () => (window.innerWidth > 680 ? 1.32 : 0.9), opacity: 1, showLabels: false },
    none: { camZ: 8.6, offsetX: () => 0, offsetY: () => 0, scale: () => 1, opacity: 0, showLabels: false },
  };

  function sectionWeight(el, vh) {
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const center = r.top + r.height / 2;
    const dist = Math.abs(center - vh / 2);
    // Fixed falloff radius (not tied to the section's own height) — a very
    // tall section like the hero or ecosystem must not stay "in focus" for
    // a full screen-height after it has scrolled out, or the canvas never
    // fades out behind the sections in between.
    const maxDist = vh * 0.85;
    return Math.max(0, 1 - dist / maxDist);
  }

  function computeZone() {
    const vh = window.innerHeight || 1;
    let best = "none";
    let bestW = 0.001;
    for (const key of Object.keys(zoneEls)) {
      const w = sectionWeight(zoneEls[key], vh);
      if (w > bestW) {
        bestW = w;
        best = key;
      }
    }
    return { zone: best, weight: bestW };
  }

  // currentZone() used to call getBoundingClientRect() from inside the
  // render loop — a forced synchronous layout read on every single frame,
  // forever, even while the page isn't scrolling. Instead, recompute it
  // only when scroll/resize actually happen (rAF-throttled), and have the
  // render loop just read the cached result.
  let cachedZone = computeZone();
  let zoneUpdateQueued = false;
  function scheduleZoneUpdate() {
    if (zoneUpdateQueued) return;
    zoneUpdateQueued = true;
    requestAnimationFrame(() => {
      cachedZone = computeZone();
      zoneUpdateQueued = false;
    });
  }
  window.addEventListener("scroll", scheduleZoneUpdate, { passive: true });
  window.addEventListener("resize", scheduleZoneUpdate);

  // ---------------- Interaction state ----------------
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener("mousemove", (e) => {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  });
  window.addEventListener(
    "touchmove",
    (e) => {
      if (!e.touches[0]) return;
      mouse.tx = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
      mouse.ty = (e.touches[0].clientY / window.innerHeight) * 2 - 1;
    },
    { passive: true }
  );

  const state = {
    camZ: camera.position.z,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    opacity: 0,
    activeTiers: new Set(["hero"]),
  };

  // ---------------- Resize ----------------
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------------- Render loop ----------------
  const clock = new THREE.Clock();
  let readyFired = false;
  let rafId = null;

  // Don't burn CPU/battery rendering a background scene nobody can see:
  // pause the loop entirely while the tab is in the background, and resume
  // (with a fresh delta so nothing "jumps") when it comes back.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    } else if (rafId === null) {
      clock.getDelta(); // discard the paused-time gap
      rafId = requestAnimationFrame(tick);
    }
  });

  function tick() {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // Auto rotation (slow, cinematic)
    if (!REDUCED_MOTION) {
      coreGroup.rotation.y += dt * 0.065;
      coreGroup.rotation.x = Math.sin(t * 0.15) * 0.06;
      particleGroup.rotation.y += dt * 0.012;
      ring1.rotation.z += dt * 0.09;
      ring2.rotation.z -= dt * 0.06;
    }

    // Mouse parallax (damped)
    mouse.x += (mouse.tx - mouse.x) * 0.04;
    mouse.y += (mouse.ty - mouse.y) * 0.04;
    coreGroup.rotation.y += mouse.x * 0.0009;
    coreGroup.rotation.x += -mouse.y * 0.0006;

    // pulse
    const pulse = 0.85 + Math.sin(t * 1.6) * 0.12;
    coreGlow.material.opacity = 0.7 * pulse;

    // ---- Scroll zone blend (cached — see scheduleZoneUpdate above) ----
    const { zone, weight } = cachedZone;
    const target = ZONE_PARAMS[zone] || ZONE_PARAMS.none;
    const targetOpacity = zone === "none" ? 0 : Math.min(1, weight * 1.3) * target.opacity;

    state.camZ += (target.camZ - state.camZ) * 0.045;
    state.offsetX += (target.offsetX() - state.offsetX) * 0.045;
    state.offsetY += (target.offsetY() - state.offsetY) * 0.045;
    state.scale += (target.scale() - state.scale) * 0.045;
    state.opacity += (targetOpacity - state.opacity) * 0.06;

    camera.position.z = state.camZ;
    world.position.x = state.offsetX;
    world.position.y = state.offsetY;
    world.scale.setScalar(state.scale);

    canvas.style.opacity = Math.max(0, Math.min(1, state.opacity)).toFixed(3);
    if (!readyFired && state.opacity > 0.05) {
      readyFired = true;
      canvas.classList.add("is-ready");
      document.dispatchEvent(new CustomEvent("azeritek:ready"));
    }

    // The scene is fully faded out for most of the page (services, metrics,
    // sectors, FAQ...). Skip the per-module math (label projection, packet
    // curve sampling, material lerps) and the actual WebGL draw call while
    // it's invisible and not currently transitioning — this is where most
    // of the scroll-time CPU cost was going for content nobody could see.
    const isVisible = state.opacity > 0.01 || targetOpacity > 0.01;
    if (!isVisible) return;

    // active tiers for module reveal
    const activeTierName = zone === "final" ? "all" : zone === "none" ? null : zone;

    MODULES.forEach((m) => {
      const shouldShow = activeTierName === "all" || (activeTierName && m.tiers.includes(activeTierName));
      const baseOpacity = shouldShow ? state.opacity : 0;
      m.sprite.material.opacity += (baseOpacity - m.sprite.material.opacity) * 0.08;
      m.line.material.opacity += ((shouldShow ? 0.28 : 0) * state.opacity - m.line.material.opacity) * 0.08;

      m.packets.forEach((p) => {
        const targetPOpacity = shouldShow ? 0.9 * state.opacity : 0;
        p.material.opacity += (targetPOpacity - p.material.opacity) * 0.08;
        if (!REDUCED_MOTION) {
          const tt = (t * 0.22 + p.userData.phase) % 1;
          const pos = m.curve.getPointAt(tt);
          p.position.copy(pos);
        }
      });

      // project label
      if (m.labelEl) {
        const showLabel = shouldShow && target.showLabels && state.opacity > 0.4;
        if (showLabel) {
          const worldPos = new THREE.Vector3();
          m.sprite.getWorldPosition(worldPos);
          worldPos.project(camera);
          const x = (worldPos.x * 0.5 + 0.5) * window.innerWidth;
          const y = (-worldPos.y * 0.5 + 0.5) * window.innerHeight + 40;
          m.labelEl.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%)`;
          m.labelEl.classList.add("is-visible");
        } else {
          m.labelEl.classList.remove("is-visible");
        }
      }
    });

    renderer.render(scene, camera);
  }

  tick();

  // Safety net: if scene never reaches visible opacity (e.g. hero not in viewport
  // at load for some reason), still signal ready so the preloader doesn't hang.
  setTimeout(() => {
    if (!readyFired) {
      readyFired = true;
      canvas.classList.add("is-ready");
      document.dispatchEvent(new CustomEvent("azeritek:ready"));
    }
  }, 2500);
}

/* ---------------- Texture helpers ---------------- */

function loadTexture(loader, url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

function makeRadialGlowTexture() {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.25, "rgba(120,200,255,0.55)");
  g.addColorStop(1, "rgba(0,80,180,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeDotTexture() {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(180,225,255,0.8)");
  g.addColorStop(1, "rgba(0,120,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function drawIcon(ctx, key, cx, cy, r) {
  ctx.save();
  ctx.strokeStyle = "#bfe9ff";
  ctx.fillStyle = "#bfe9ff";
  ctx.lineWidth = r * 0.11;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (key) {
    case "whatsapp": {
      // Exact WhatsApp glyph (ring bubble + tail + handset), drawn from real
      // SVG path data via Path2D so it's pixel-accurate — same shape used in
      // the floating contact widget, just re-scaled to this icon's radius.
      ctx.save();
      ctx.translate(cx - r * 0.62, cy - r * 0.62);
      const s = (r * 1.24) / 24;
      ctx.scale(s, s);
      const p = new Path2D(
        "M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3.1.8.8-3-.2-.3A8 8 0 1 1 12 20Zm4.4-5.9c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-1.9-1.2 7 7 0 0 1-1.3-1.6c-.1-.2 0-.4.1-.5l.4-.5c.1-.1.2-.3.2-.4a.5.5 0 0 0 0-.5c-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.6 1.1 2.8.1.2 2 3 4.7 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.4-.3Z"
      );
      ctx.fill(p);
      ctx.restore();
      break;
    }
    case "crm": {
      const pts = [
        [cx, cy - r * 0.55],
        [cx - r * 0.55, cy + r * 0.35],
        [cx + r * 0.55, cy + r * 0.35],
      ];
      ctx.beginPath();
      pts.forEach((p) => ctx.lineTo(p[0], p[1]));
      ctx.closePath();
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      pts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p[0], p[1], r * 0.14, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }
    case "calendar": {
      ctx.strokeRect(cx - r * 0.6, cy - r * 0.5, r * 1.2, r * 1.05);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.6, cy - r * 0.15);
      ctx.lineTo(cx + r * 0.6, cy - r * 0.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.28, cy - r * 0.62);
      ctx.lineTo(cx - r * 0.28, cy - r * 0.38);
      ctx.moveTo(cx + r * 0.28, cy - r * 0.62);
      ctx.lineTo(cx + r * 0.28, cy - r * 0.38);
      ctx.stroke();
      ctx.fillRect(cx - r * 0.06, cy + r * 0.05, r * 0.32, r * 0.28);
      break;
    }
    case "email": {
      ctx.strokeRect(cx - r * 0.62, cy - r * 0.42, r * 1.24, r * 0.86);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.6, cy - r * 0.38);
      ctx.lineTo(cx, cy + r * 0.12);
      ctx.lineTo(cx + r * 0.6, cy - r * 0.38);
      ctx.stroke();
      break;
    }
    case "leads": {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.62, cy - r * 0.5);
      ctx.lineTo(cx + r * 0.62, cy - r * 0.5);
      ctx.lineTo(cx + r * 0.16, cy + r * 0.12);
      ctx.lineTo(cx + r * 0.16, cy + r * 0.58);
      ctx.lineTo(cx - r * 0.16, cy + r * 0.42);
      ctx.lineTo(cx - r * 0.16, cy + r * 0.12);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case "bookings": {
      ctx.strokeRect(cx - r * 0.5, cy - r * 0.6, r * 1.0, r * 1.2);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.22, cy - r * 0.68);
      ctx.lineTo(cx + r * 0.22, cy - r * 0.68);
      ctx.lineTo(cx + r * 0.22, cy - r * 0.5);
      ctx.lineTo(cx - r * 0.22, cy - r * 0.5);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.25, cy);
      ctx.lineTo(cx - r * 0.05, cy + r * 0.22);
      ctx.lineTo(cx + r * 0.3, cy - r * 0.22);
      ctx.stroke();
      break;
    }
    case "instagram": {
      ctx.beginPath();
      ctx.roundRect(cx - r * 0.6, cy - r * 0.6, r * 1.2, r * 1.2, r * 0.32);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + r * 0.38, cy - r * 0.38, r * 0.06, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "website": {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.28, r * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.6, cy);
      ctx.lineTo(cx + r * 0.6, cy);
      ctx.stroke();
      break;
    }
    case "reviews": {
      const spikes = 5;
      const outer = r * 0.62;
      const inner = r * 0.26;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const rad = i % 2 === 0 ? outer : inner;
        const ang = (Math.PI / spikes) * i - Math.PI / 2;
        const x = cx + Math.cos(ang) * rad;
        const y = cy + Math.sin(ang) * rad;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case "analytics": {
      const bars = [0.3, 0.6, 0.45, 0.75];
      const bw = r * 0.24;
      const startX = cx - r * 0.6;
      bars.forEach((h, i) => {
        const x = startX + i * (bw + r * 0.12);
        ctx.strokeRect(x, cy + r * 0.5 - r * h, bw, r * h);
      });
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function makeModuleTexture(key) {
  const size = 220;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42;

  // glass tile
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cx - radius, cy - radius, radius * 2, radius * 2, radius * 0.34);
  const bg = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  bg.addColorStop(0, "rgba(20,32,52,0.92)");
  bg.addColorStop(1, "rgba(6,10,18,0.92)");
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,163,255,0.45)";
  ctx.stroke();

  // top highlight
  const hl = ctx.createLinearGradient(cx, cy - radius, cx, cy);
  hl.addColorStop(0, "rgba(255,255,255,0.10)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hl;
  ctx.fill();
  ctx.restore();

  drawIcon(ctx, key, cx, cy - size * 0.02, radius * 0.62);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

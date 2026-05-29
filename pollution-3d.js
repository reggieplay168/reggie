import * as THREE from "./vendor/three.module.js";
import { POLLUTION_CELLS, POLLUTION_META } from "./pollution-data.js";

const FIELD_INFO = {
  total_risk: {
    index: 2,
    zh: "总风险",
    en: "Total risk",
    ramp: ["#2ea66f", "#d6d356", "#ef8846", "#c73555"],
  },
  hydrocarbon: {
    index: 3,
    zh: "烃类",
    en: "Hydrocarbon",
    ramp: ["#36c7a1", "#d5d24f", "#ed7b45", "#bd3850"],
  },
  metals: {
    index: 4,
    zh: "重金属",
    en: "Metals",
    ramp: ["#52d6e8", "#85e66c", "#e1d64c", "#ff705d"],
  },
  asbestos_rubble: {
    index: 5,
    zh: "石棉/瓦砾",
    en: "Asbestos / rubble",
    ramp: ["#8f96a8", "#c2b6d8", "#f0a3b3", "#e05b71"],
  },
  water_mobility: {
    index: 6,
    zh: "水迁移",
    en: "Water mobility",
    ramp: ["#2d80c8", "#55d8e4", "#a8ef75", "#f4d650"],
  },
  ground_gas: {
    index: 7,
    zh: "地下气",
    en: "Ground gas",
    ramp: ["#6d72dd", "#ba6eee", "#ff6da8", "#ff7656"],
  },
  confidence: {
    index: 8,
    zh: "证据置信",
    en: "Confidence",
    ramp: ["#5e7ed9", "#70dae5", "#f1df68", "#ffffff"],
  },
};

const FAMILY_COLORS = ["#f18463", "#89ea61", "#c9c3d7", "#67d6ee", "#ff6f9e", "#f2e676"];
const FIELD_KEYS = Object.keys(FIELD_INFO);
const METER_TO_WORLD = 0.058;
const CELL_WORLD = POLLUTION_META.cellSizeMeters * METER_TO_WORLD;
const bounds = POLLUTION_META.bounds;
const centerX = (bounds.xMin + bounds.xMax) / 2;
const centerY = (bounds.yMin + bounds.yMax) / 2;
const widthWorld = (bounds.xMax - bounds.xMin + POLLUTION_META.cellSizeMeters) * METER_TO_WORLD;
const depthWorld = (bounds.yMax - bounds.yMin + POLLUTION_META.cellSizeMeters) * METER_TO_WORLD;

const canvas = document.querySelector("#scene");
const tooltip = document.querySelector("#tooltip");
const ui = {
  field: document.querySelector("#field"),
  heightScale: document.querySelector("#heightScale"),
  heightScaleValue: document.querySelector("#heightScaleValue"),
  threshold: document.querySelector("#threshold"),
  thresholdValue: document.querySelector("#thresholdValue"),
  opacity: document.querySelector("#opacity"),
  opacityValue: document.querySelector("#opacityValue"),
  view: document.querySelector("#view"),
  showGrid: document.querySelector("#showGrid"),
  showPlane: document.querySelector("#showPlane"),
  autoRotate: document.querySelector("#autoRotate"),
  resetCamera: document.querySelector("#resetCamera"),
  exportPng: document.querySelector("#exportPng"),
  cellCount: document.querySelector("#cellCount"),
  visibleCount: document.querySelector("#visibleCount"),
  peakValue: document.querySelector("#peakValue"),
  formula: document.querySelector("#formula"),
  legendTitle: document.querySelector("#legendTitle"),
  ramp: document.querySelector("#ramp"),
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x061129, 52, 120);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 220);
const target = new THREE.Vector3(0, 2.2, 0);
let orbit = { radius: 58, theta: -0.82, phi: 0.92 };

const ambient = new THREE.AmbientLight(0xdffaff, 0.58);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
keyLight.position.set(-24, 34, 18);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x64f2ff, 0.72);
fillLight.position.set(30, 16, -22);
scene.add(fillLight);

const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(widthWorld, depthWorld),
  new THREE.MeshBasicMaterial({
    color: 0x0c2332,
    transparent: true,
    opacity: 0.48,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
);
plane.rotation.x = -Math.PI / 2;
plane.position.y = -0.018;
scene.add(plane);

const gridGroup = new THREE.Group();
scene.add(gridGroup);
buildSiteGrid();

const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
const blockMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.54,
  metalness: 0.03,
  transparent: true,
  opacity: 0.88,
});

const blockMesh = new THREE.InstancedMesh(blockGeometry, blockMaterial, POLLUTION_CELLS.length);
blockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(blockMesh);

const dummy = new THREE.Object3D();
const colorA = new THREE.Color();
const colorB = new THREE.Color();
const colorOut = new THREE.Color();
const activeSourceIndices = [];
let visibleCount = POLLUTION_CELLS.length;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let isDragging = false;
let lastX = 0;
let lastY = 0;

function buildSiteGrid() {
  const material = new THREE.LineBasicMaterial({
    color: 0x5fe9ff,
    transparent: true,
    opacity: 0.18,
  });
  const borderMaterial = new THREE.LineBasicMaterial({
    color: 0xbcefff,
    transparent: true,
    opacity: 0.5,
  });

  const halfW = widthWorld / 2;
  const halfD = depthWorld / 2;
  const border = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-halfW, 0.02, -halfD),
    new THREE.Vector3(halfW, 0.02, -halfD),
    new THREE.Vector3(halfW, 0.02, halfD),
    new THREE.Vector3(-halfW, 0.02, halfD),
    new THREE.Vector3(-halfW, 0.02, -halfD),
  ]);
  gridGroup.add(new THREE.Line(border, borderMaterial));

  const step = 50 * METER_TO_WORLD;
  for (let x = -halfW; x <= halfW + 0.001; x += step) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0.018, -halfD),
      new THREE.Vector3(x, 0.018, halfD),
    ]);
    gridGroup.add(new THREE.Line(geometry, material));
  }
  for (let z = -halfD; z <= halfD + 0.001; z += step) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-halfW, 0.018, z),
      new THREE.Vector3(halfW, 0.018, z),
    ]);
    gridGroup.add(new THREE.Line(geometry, material));
  }
}

function normalize(value, fieldKey) {
  const range = POLLUTION_META.ranges[fieldKey];
  if (!range || range.max === range.min) return 0;
  return THREE.MathUtils.clamp((value - range.min) / (range.max - range.min), 0, 1);
}

function colorFromRamp(t, ramp) {
  const scaled = THREE.MathUtils.clamp(t, 0, 1) * (ramp.length - 1);
  const i = Math.min(Math.floor(scaled), ramp.length - 2);
  const local = scaled - i;
  colorA.set(ramp[i]);
  colorB.set(ramp[i + 1]);
  colorOut.copy(colorA).lerp(colorB, local);
  return colorOut;
}

function updateBlocks() {
  const fieldKey = ui.field.value;
  const field = FIELD_INFO[fieldKey];
  const heightScale = Number(ui.heightScale.value);
  const threshold = Number(ui.threshold.value) / 100;
  const useFamilyColor = false;
  let active = 0;
  let peak = 0;

  activeSourceIndices.length = 0;

  for (let sourceIndex = 0; sourceIndex < POLLUTION_CELLS.length; sourceIndex += 1) {
    const cell = POLLUTION_CELLS[sourceIndex];
    const value = cell[field.index];
    const n = normalize(value, fieldKey);

    if (n < threshold) continue;

    const height = 0.07 + Math.pow(n, 1.18) * heightScale;
    const x = (cell[0] - centerX) * METER_TO_WORLD;
    const z = -(cell[1] - centerY) * METER_TO_WORLD;
    const footprint = CELL_WORLD * 0.86;
    const riskClassIndex = cell[10];
    const familyIndex = cell[9];

    dummy.position.set(x, height / 2, z);
    dummy.scale.set(footprint, height, footprint);
    dummy.rotation.y = ((riskClassIndex % 4) - 1.5) * 0.018;
    dummy.updateMatrix();
    blockMesh.setMatrixAt(active, dummy.matrix);

    if (useFamilyColor) {
      colorOut.set(FAMILY_COLORS[familyIndex] || FAMILY_COLORS[5]);
    } else {
      colorFromRamp(n, field.ramp);
    }
    blockMesh.setColorAt(active, colorOut);
    activeSourceIndices.push(sourceIndex);
    peak = Math.max(peak, value);
    active += 1;
  }

  visibleCount = active;
  blockMesh.count = active;
  blockMesh.instanceMatrix.needsUpdate = true;
  if (blockMesh.instanceColor) blockMesh.instanceColor.needsUpdate = true;
  blockMaterial.opacity = Number(ui.opacity.value) / 100;
  plane.visible = ui.showPlane.checked;
  gridGroup.visible = ui.showGrid.checked;

  updatePanel(fieldKey, peak);
}

function updatePanel(fieldKey, peak) {
  const field = FIELD_INFO[fieldKey];
  const range = POLLUTION_META.ranges[fieldKey];

  ui.heightScaleValue.textContent = ui.heightScale.value;
  ui.thresholdValue.textContent = `${ui.threshold.value}%`;
  ui.opacityValue.textContent = `${ui.opacity.value}%`;
  ui.cellCount.textContent = POLLUTION_META.count.toLocaleString("en-US");
  ui.visibleCount.textContent = visibleCount.toLocaleString("en-US");
  ui.peakValue.textContent = peak.toFixed(3);
  ui.legendTitle.textContent = `${field.zh} / ${field.en}`;
  ui.ramp.style.background = `linear-gradient(90deg, ${field.ramp.join(", ")})`;
  ui.formula.textContent =
    `footprint = 5m x 5m\n` +
    `height = normalize(${fieldKey}) ^ 1.18 x ${ui.heightScale.value}\n` +
    `range = ${range.min.toFixed(3)} -> ${range.max.toFixed(3)}\n` +
    `visible = cells where normalized value >= ${ui.threshold.value}%`;
}

function updateCamera() {
  const sinPhi = Math.sin(orbit.phi);
  camera.position.set(
    orbit.radius * sinPhi * Math.sin(orbit.theta),
    orbit.radius * Math.cos(orbit.phi),
    orbit.radius * sinPhi * Math.cos(orbit.theta),
  );
  camera.lookAt(target);
}

function setView(view) {
  if (view === "top") {
    orbit = { radius: 70, theta: 0.001, phi: 0.18 };
  } else if (view === "section") {
    orbit = { radius: 52, theta: -Math.PI / 2, phi: 1.18 };
  } else {
    orbit = { radius: 58, theta: -0.82, phi: 0.92 };
  }
  updateCamera();
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function getPointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
}

function showTooltip(event, sourceIndex) {
  const cell = POLLUTION_CELLS[sourceIndex];
  const family = POLLUTION_META.familyLabels[cell[9]] || "mixed";
  const riskClass = POLLUTION_META.riskClasses[cell[10]] || "unknown";
  const fieldKey = ui.field.value;
  const field = FIELD_INFO[fieldKey];
  tooltip.innerHTML = `
    <strong>${field.zh} / ${field.en}</strong><br>
    x: ${cell[0]}m, y: ${cell[1]}m<br>
    value: ${cell[field.index].toFixed(4)}<br>
    family: ${family}<br>
    risk: ${riskClass}
  `;
  tooltip.style.left = `${event.clientX + 14}px`;
  tooltip.style.top = `${event.clientY + 14}px`;
  tooltip.style.display = "block";
}

function updateHover(event) {
  getPointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(blockMesh, false)[0];
  if (hit && hit.instanceId !== undefined) {
    const sourceIndex = activeSourceIndices[hit.instanceId];
    if (sourceIndex !== undefined) {
      showTooltip(event, sourceIndex);
      return;
    }
  }
  tooltip.style.display = "none";
}

function onPointerDown(event) {
  isDragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
  tooltip.style.display = "none";
}

function onPointerMove(event) {
  if (!isDragging) {
    updateHover(event);
    return;
  }

  const dx = event.clientX - lastX;
  const dy = event.clientY - lastY;
  lastX = event.clientX;
  lastY = event.clientY;
  orbit.theta -= dx * 0.006;
  orbit.phi = THREE.MathUtils.clamp(orbit.phi + dy * 0.006, 0.16, 1.48);
  updateCamera();
}

function onPointerUp(event) {
  isDragging = false;
  canvas.releasePointerCapture(event.pointerId);
}

function onWheel(event) {
  event.preventDefault();
  orbit.radius = THREE.MathUtils.clamp(orbit.radius + event.deltaY * 0.025, 22, 105);
  updateCamera();
}

function exportPng() {
  renderer.render(scene, camera);
  const link = document.createElement("a");
  link.download = `barking-reach-pollution-3d-${ui.field.value}.png`;
  link.href = renderer.domElement.toDataURL("image/png");
  link.click();
}

function animate() {
  if (ui.autoRotate.checked) {
    orbit.theta -= 0.0022;
    updateCamera();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

for (const id of ["field", "heightScale", "threshold", "opacity", "showGrid", "showPlane"]) {
  ui[id].addEventListener("input", updateBlocks);
}

ui.view.addEventListener("change", () => setView(ui.view.value));
ui.resetCamera.addEventListener("click", () => {
  ui.view.value = "oblique";
  setView("oblique");
});
ui.exportPng.addEventListener("click", exportPng);

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerleave", () => {
  tooltip.style.display = "none";
});
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("wheel", onWheel, { passive: false });
window.addEventListener("resize", resize);

resize();
setView("oblique");
updateBlocks();
animate();

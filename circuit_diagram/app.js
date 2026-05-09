const SVG_NS = "http://www.w3.org/2000/svg";
const EXPORT_WIDTH = 1280;
const EXPORT_HEIGHT = 760;
const SNAP = 16;
const LABEL_FONT_SIZE = 32;
const VALUE_FONT_SIZE = 28;
const SUBSCRIPT_FONT_SCALE = 0.7;
const PDF_TEXT_BASELINE = -0.34;
const PDF_SUBSCRIPT_DROP = 0.28;

const parts = [
  { type: "resistor", name: "抵抗", prefix: "R", value: "1kΩ" },
  { type: "variable-resistor", name: "可変抵抗", prefix: "VR", value: "10kΩ" },
  { type: "capacitor", name: "コンデンサ", prefix: "C", value: "10µF" },
  { type: "inductor", name: "コイル", prefix: "L", value: "100µH" },
  { type: "diode", name: "ダイオード", prefix: "D", value: "1N4148" },
  { type: "led", name: "LED", prefix: "LED", value: "赤" },
  { type: "switch", name: "スイッチ", prefix: "SW", value: "SPST" },
  { type: "battery", name: "電池", prefix: "B", value: "9V" },
  { type: "vsource", name: "電源", prefix: "V", value: "5V" },
  { type: "ground", name: "GND", prefix: "GND", value: "" },
  { type: "ammeter", name: "電流計", prefix: "A", value: "" },
  { type: "voltmeter", name: "電圧計", prefix: "VM", value: "" },
  { type: "galvanometer", name: "検流計", prefix: "G", value: "" },
];

const state = {
  components: [],
  wires: [],
  selected: null,
  mode: "select",
  wireStart: null,
  history: [],
  future: [],
  counters: {},
  grid: true,
  snap: true,
  hideCircuitNames: true,
  hideCircuitValues: true,
  title: "Untitled Circuit",
  note: "",
};

const els = {};
let dragState = null;
let draftWire = null;
let paletteDrag = null;
let selectionDrag = null;
let toastTimer = null;
let historyInputTimer = null;
let suppressHistory = false;

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheElements();
  renderPalette();
  bindEvents();
  pushHistory();
  render();
}

function cacheElements() {
  els.svg = document.querySelector("#schematic");
  els.palette = document.querySelector("#palette");
  els.componentLayer = document.querySelector("#componentLayer");
  els.wireLayer = document.querySelector("#wireLayer");
  els.overlayLayer = document.querySelector("#overlayLayer");
  els.modeStatus = document.querySelector("#modeStatus");
  els.selectModeBtn = document.querySelector("#selectModeBtn");
  els.wireModeBtn = document.querySelector("#wireModeBtn");
  els.gridToggle = document.querySelector("#gridToggle");
  els.snapToggle = document.querySelector("#snapToggle");
  els.hideNameToggle = document.querySelector("#hideNameToggle") || document.querySelector("#hideTextToggle");
  els.hideValueToggle = document.querySelector("#hideValueToggle") || document.querySelector("#hideTextToggle");
  els.emptyInspector = document.querySelector("#emptyInspector");
  els.componentInspector = document.querySelector("#componentInspector");
  els.multiInspector = document.querySelector("#multiInspector");
  els.wireInspector = document.querySelector("#wireInspector");
  els.wireMeta = document.querySelector("#wireMeta");
  els.multiMeta = document.querySelector("#multiMeta");
  els.labelInput = document.querySelector("#labelInput");
  els.valueInput = document.querySelector("#valueInput");
  els.titleInput = document.querySelector("#titleInput");
  els.noteInput = document.querySelector("#noteInput");
  els.rotateBtn = document.querySelector("#rotateBtn");
  els.duplicateBtn = document.querySelector("#duplicateBtn");
  els.deleteBtn = document.querySelector("#deleteBtn");
  els.rotateMultiBtn = document.querySelector("#rotateMultiBtn");
  els.duplicateMultiBtn = document.querySelector("#duplicateMultiBtn");
  els.deleteMultiBtn = document.querySelector("#deleteMultiBtn");
  els.deleteWireBtn = document.querySelector("#deleteWireBtn");
  els.undoBtn = document.querySelector("#undoBtn");
  els.redoBtn = document.querySelector("#redoBtn");
  els.clearBtn = document.querySelector("#clearBtn");
  els.pngBtn = document.querySelector("#pngBtn");
  els.pdfBtn = document.querySelector("#pdfBtn");
}

function bindEvents() {
  els.selectModeBtn.addEventListener("click", () => setMode("select"));
  els.wireModeBtn.addEventListener("click", () => setMode("wire"));

  els.gridToggle.addEventListener("change", () => {
    state.grid = els.gridToggle.checked;
    render();
  });
  els.snapToggle.addEventListener("change", () => {
    state.snap = els.snapToggle.checked;
  });
  els.hideNameToggle.addEventListener("change", () => {
    state.hideCircuitNames = els.hideNameToggle.checked;
    pushHistory();
    render();
  });
  els.hideValueToggle.addEventListener("change", () => {
    state.hideCircuitValues = els.hideValueToggle.checked;
    pushHistory();
    render();
  });

  els.svg.addEventListener("pointermove", onSvgPointerMove);
  els.svg.addEventListener("pointerup", endDrag);
  els.svg.addEventListener("pointerleave", endDrag);
  els.svg.addEventListener("pointerdown", onSvgPointerDown);

  els.labelInput.addEventListener("input", updateSelectedComponent);
  els.valueInput.addEventListener("input", updateSelectedComponent);
  els.titleInput.addEventListener("input", () => {
    state.title = els.titleInput.value;
  });
  els.noteInput.addEventListener("input", () => {
    state.note = els.noteInput.value;
  });

  els.rotateBtn.addEventListener("click", rotateSelected);
  els.duplicateBtn.addEventListener("click", duplicateSelected);
  els.deleteBtn.addEventListener("click", deleteSelected);
  els.rotateMultiBtn.addEventListener("click", rotateSelected);
  els.duplicateMultiBtn.addEventListener("click", duplicateSelected);
  els.deleteMultiBtn.addEventListener("click", deleteSelected);
  els.deleteWireBtn.addEventListener("click", deleteSelected);
  els.undoBtn.addEventListener("click", undo);
  els.redoBtn.addEventListener("click", redo);
  els.clearBtn.addEventListener("click", clearCircuit);
  els.pngBtn.addEventListener("click", exportPng);
  els.pdfBtn.addEventListener("click", exportPdf);

  document.addEventListener("pointermove", onPalettePointerMove);
  document.addEventListener("pointerup", endPaletteDrag);
  document.addEventListener("pointercancel", cancelPaletteDrag);
  document.addEventListener("keydown", onKeyDown);
}

function renderPalette() {
  els.palette.replaceChildren();
  parts.forEach((part) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "part-button";
    button.title = `${part.name}を追加`;
    button.innerHTML = `
      <span class="part-icon">${iconMarkup(part.type)}</span>
      <span class="part-name">${part.name}</span>
    `;
    button.addEventListener("pointerdown", (event) => startPaletteDrag(event, part, button));
    button.addEventListener("click", (event) => {
      if (button.dataset.suppressClick === "true") {
        event.preventDefault();
        button.dataset.suppressClick = "false";
        return;
      }
      addPartFromPalette(part);
    });
    els.palette.append(button);
  });
}

function addPartFromPalette(part) {
  const count = nextPartCount(part.prefix);
  addComponent({
    type: part.type,
    x: 460 + (count % 4) * 48,
    y: 240 + (count % 5) * 40,
    rotation: 0,
    label: defaultComponentLabel(part.prefix, count),
    value: part.value,
  });
}

function addPartAt(part, position) {
  const count = nextPartCount(part.prefix);
  addComponent({
    type: part.type,
    x: position.x,
    y: position.y,
    rotation: 0,
    label: defaultComponentLabel(part.prefix, count),
    value: part.value,
  });
}

function nextPartCount(prefix) {
  const count = (state.counters[prefix] || 0) + 1;
  state.counters[prefix] = count;
  return count;
}

function defaultComponentLabel(prefix, count) {
  return prefix === "GND" ? prefix : `${prefix}_${count}`;
}

function addComponent(input) {
  const component = {
    id: makeId("cmp"),
    labelOffset: { x: 0, y: 0 },
    valueOffset: { x: 0, y: 0 },
    ...input,
  };
  component.x = snap(component.x);
  component.y = snap(component.y);
  state.components.push(component);
  state.selected = { kind: "component", id: component.id };
  setMode("select", false);
  pushHistory();
  render();
}

function render() {
  els.svg.classList.toggle("grid-hidden", !state.grid);
  els.svg.classList.toggle("wire-mode", state.mode === "wire");
  els.gridToggle.checked = state.grid;
  els.snapToggle.checked = state.snap;
  els.hideNameToggle.checked = state.hideCircuitNames;
  els.hideValueToggle.checked = state.hideCircuitValues;
  els.selectModeBtn.classList.toggle("active", state.mode === "select");
  els.wireModeBtn.classList.toggle("active", state.mode === "wire");
  els.modeStatus.textContent = state.mode === "wire" ? "配線モード" : "選択モード";

  renderWires();
  renderComponents();
  renderOverlay();
  renderInspector();
  updateUndoRedo();
}

function renderWires() {
  els.wireLayer.replaceChildren();
  state.wires.forEach((wire) => {
    const start = endpointPosition(wire.from);
    const end = endpointPosition(wire.to);
    if (!start || !end) return;

    const group = svgEl("g", { class: "wire-group", "data-id": wire.id });
    const pathData = makeWirePath(start, end);
    const hit = svgEl("path", { class: "wire-hit", d: pathData });
    const line = svgEl("path", {
      d: pathData,
      class: `wire ${isSelected("wire", wire.id) ? "selected" : ""}`,
    });
    group.append(hit, line);
    group.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      if (state.mode === "wire") {
        const pointOnWire = nearestPointOnWire(wire, getSvgPoint(event));
        if (pointOnWire) handleWireCanvasPoint(pointOnWire);
        return;
      }
      state.selected = { kind: "wire", id: wire.id };
      clearWireDraft();
      render();
    });
    els.wireLayer.append(group);
  });
}

function renderComponents() {
  els.componentLayer.replaceChildren();
  state.components.forEach((component) => {
    const group = svgEl("g", {
      class: "component",
      transform: `translate(${component.x} ${component.y})`,
      "data-id": component.id,
    });
    group.addEventListener("pointerdown", (event) => onComponentPointerDown(event, component.id));
    drawComponent(group, component);
    els.componentLayer.append(group);
  });
}

function renderOverlay() {
  els.overlayLayer.replaceChildren();
  draftWire = null;

  getSelectedComponents().forEach((component) => {
    const box = componentBounds(component);
    els.overlayLayer.append(svgEl("rect", {
      class: "selected-ring",
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      rx: 8,
    }));
  });

  const selectedText = getSelectedText();
  if (selectedText && !isCircuitTextHidden(selectedText.field)) {
    const box = componentTextBox(selectedText.component, selectedText.field, { forPdf: false });
    els.overlayLayer.append(svgEl("rect", {
      class: "selected-text-ring",
      x: box.minX,
      y: box.minY,
      width: box.maxX - box.minX,
      height: box.maxY - box.minY,
      rx: 6,
    }));
  }

  if (selectionDrag?.active) {
    const box = normalizedRect(selectionDrag.start, selectionDrag.current);
    els.overlayLayer.append(svgEl("rect", {
      class: "selection-box",
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      rx: 4,
    }));
  }

  if (state.wireStart) {
    const start = endpointPosition(state.wireStart);
    if (start) {
      const path = svgEl("path", {
        class: "wire-draft",
        d: makeWirePath(start, start),
      });
      els.overlayLayer.append(path);
      draftWire = { start: { ...state.wireStart }, path };
    }
  }
}

function renderInspector() {
  const component = getSelectedComponent();
  const selectedComponents = getSelectedComponents();
  const isMulti = selectedComponents.length > 1;
  const wire = getSelectedWire();
  els.emptyInspector.classList.toggle("hidden", Boolean(component || isMulti || wire));
  els.componentInspector.classList.toggle("hidden", !component || isMulti);
  els.multiInspector.classList.toggle("hidden", !isMulti);
  els.wireInspector.classList.toggle("hidden", !wire);

  if (component && !isMulti) {
    els.labelInput.value = component.label;
    els.valueInput.value = component.value;
  }

  if (isMulti) {
    els.multiMeta.textContent = `${selectedComponents.length}個の部品を選択しています。`;
  }

  if (wire) {
    const from = endpointName(wire.from);
    const to = endpointName(wire.to);
    els.wireMeta.textContent = `${from} から ${to} へ配線しています。`;
  }
}

function drawComponent(group, component) {
  group.append(svgEl("rect", {
    class: "component-hit",
    x: -96,
    y: -76,
    width: 192,
    height: 152,
    rx: 8,
  }));

  const shape = svgEl("g", {
    transform: `rotate(${component.rotation})`,
  });
  drawShape(shape, component.type);

  terminalDefs(component.type).forEach((terminal) => {
    const classes = terminalDotClass(component.id, terminal.id);
    shape.append(svgEl("circle", {
      class: "terminal-hit",
      cx: terminal.x,
      cy: terminal.y,
      r: 15,
      "data-component-id": component.id,
      "data-terminal-id": terminal.id,
    }));
    const dot = svgEl("circle", {
      class: classes,
      cx: terminal.x,
      cy: terminal.y,
      r: 5,
    });
    shape.append(dot);
    shape.lastChild.previousSibling.addEventListener("pointerdown", (event) => {
      onTerminalPointerDown(event, component.id, terminal.id);
    });
  });

  group.append(shape);

  if (!state.hideCircuitNames) {
    const labelPosition = componentTextLocalPosition(component, "label");
    appendFormattedSvgText(group, "component-label", labelPosition.x, labelPosition.y, component.label, {
      componentId: component.id,
      field: "label",
      italicAlpha: true,
    });
  }
  if (!state.hideCircuitValues && component.value) {
    const valuePosition = componentTextLocalPosition(component, "value");
    appendFormattedSvgText(group, "component-value", valuePosition.x, valuePosition.y, component.value, {
      componentId: component.id,
      field: "value",
      italicAlpha: false,
    });
  }
}

function appendFormattedSvgText(parent, className, x, y, value, options = {}) {
  const italicAlpha = options.italicAlpha ?? true;
  const size = className === "component-value" ? VALUE_FONT_SIZE : LABEL_FONT_SIZE;
  const segments = formatTextSegments(value, { italicAlpha });
  const textGroup = svgEl("g", {
    class: "component-text-group",
    transform: `translate(${x} ${y})`,
    "data-component-id": options.componentId,
    "data-text-field": options.field,
  });
  if (options.componentId && options.field) {
    const width = Math.max(size * 1.75, estimateFormattedTextWidth(segments, size));
    textGroup.append(svgEl("rect", {
      class: "text-hit",
      x: -width / 2 - 10,
      y: -size * 0.85,
      width: width + 20,
      height: size * 1.9,
      rx: 6,
    }));
    textGroup.addEventListener("pointerdown", (event) => onTextPointerDown(event, options.componentId, options.field));
  }

  const text = svgEl("text", { class: className, x: 0, y: 0 });
  segments.forEach((segment) => {
    const classes = [formattedSegmentClass(segment)];
    const attrs = { class: classes.join(" ") };
    if (segment.subscript) {
      attrs.class += " math-sub";
      attrs["baseline-shift"] = "sub";
      attrs["font-size"] = `${SUBSCRIPT_FONT_SCALE * 100}%`;
    }
    text.append(svgEl("tspan", attrs, segment.text));
  });
  textGroup.append(text);
  parent.append(textGroup);
}

function drawShape(group, type) {
  if (type === "resistor" || type === "variable-resistor") {
    group.append(svgEl("line", { class: "component-body", x1: -64, y1: 0, x2: -34, y2: 0 }));
    group.append(svgEl("rect", { class: "component-body component-fill", x: -34, y: -16, width: 68, height: 32 }));
    group.append(svgEl("line", { class: "component-body", x1: 34, y1: 0, x2: 64, y2: 0 }));
    if (type === "variable-resistor") {
      group.append(svgEl("path", { class: "component-body", d: "M -38 32 L 42 -36 L 22 -34 M 42 -36 L 36 -16", fill: "none" }));
    }
  } else if (type === "capacitor") {
    group.append(svgEl("line", { class: "component-body", x1: -64, y1: 0, x2: -12, y2: 0 }));
    group.append(svgEl("line", { class: "component-body", x1: -12, y1: -25, x2: -12, y2: 25 }));
    group.append(svgEl("line", { class: "component-body", x1: 12, y1: -25, x2: 12, y2: 25 }));
    group.append(svgEl("line", { class: "component-body", x1: 12, y1: 0, x2: 64, y2: 0 }));
  } else if (type === "inductor") {
    group.append(svgEl("line", { class: "component-body", x1: -64, y1: 0, x2: -42, y2: 0 }));
    for (let i = 0; i < 4; i += 1) {
      group.append(svgEl("path", {
        class: "component-body",
        d: `M ${-42 + i * 21} 0 A 10.5 16 0 0 1 ${-21 + i * 21} 0`,
        fill: "none",
      }));
    }
    group.append(svgEl("line", { class: "component-body", x1: 42, y1: 0, x2: 64, y2: 0 }));
  } else if (type === "diode" || type === "led") {
    group.append(svgEl("line", { class: "component-body", x1: -64, y1: 0, x2: -24, y2: 0 }));
    group.append(svgEl("polygon", { class: "component-body component-fill", points: "-24,-25 -24,25 16,0" }));
    group.append(svgEl("line", { class: "component-body", x1: 20, y1: -25, x2: 20, y2: 25 }));
    group.append(svgEl("line", { class: "component-body", x1: 20, y1: 0, x2: 64, y2: 0 }));
    if (type === "led") {
      group.append(svgEl("line", { class: "component-accent", x1: 30, y1: -31, x2: 48, y2: -49 }));
      group.append(svgEl("polyline", { class: "component-accent", points: "43,-49 48,-49 48,-44" }));
      group.append(svgEl("line", { class: "component-accent", x1: 18, y1: -34, x2: 36, y2: -52 }));
      group.append(svgEl("polyline", { class: "component-accent", points: "31,-52 36,-52 36,-47" }));
    }
  } else if (type === "switch") {
    group.append(svgEl("polyline", { class: "component-body", points: "-64,0 -22,0 30,-24", fill: "none" }));
    group.append(svgEl("line", { class: "component-body", x1: 34, y1: 0, x2: 64, y2: 0 }));
    group.append(svgEl("line", { class: "component-body", x1: 28, y1: 0, x2: 38, y2: 0 }));
  } else if (type === "battery") {
    group.append(svgEl("line", { class: "component-body", x1: -64, y1: 0, x2: -7, y2: 0 }));
    group.append(svgEl("line", { class: "component-body", x1: -7, y1: -28, x2: -7, y2: 28 }));
    group.append(svgEl("line", { class: "component-body", x1: 7, y1: -18, x2: 7, y2: 18 }));
    group.append(svgEl("line", { class: "component-body", x1: 7, y1: 0, x2: 64, y2: 0 }));
  } else if (type === "vsource") {
    group.append(svgEl("line", { class: "component-body", x1: -74, y1: 0, x2: -34, y2: 0 }));
    group.append(svgEl("circle", { class: "component-body component-fill", cx: 0, cy: 0, r: 34 }));
    group.append(svgEl("path", { class: "component-accent", d: "M -18 0 C -8 -20 8 20 18 0" }));
    group.append(svgEl("line", { class: "component-body", x1: 34, y1: 0, x2: 74, y2: 0 }));
  } else if (type === "ground") {
    group.append(svgEl("line", { class: "component-body", x1: 0, y1: -52, x2: 0, y2: -14 }));
    group.append(svgEl("line", { class: "component-body", x1: -32, y1: -14, x2: 32, y2: -14 }));
    group.append(svgEl("line", { class: "component-body", x1: -22, y1: -1, x2: 22, y2: -1 }));
    group.append(svgEl("line", { class: "component-body", x1: -12, y1: 12, x2: 12, y2: 12 }));
  } else if (isMeterType(type)) {
    group.append(svgEl("line", { class: "component-body", x1: -74, y1: 0, x2: -34, y2: 0 }));
    group.append(svgEl("circle", { class: "component-body component-fill", cx: 0, cy: 0, r: 34 }));
    if (type === "galvanometer") {
      drawMeterArrow(group);
    } else {
      group.append(svgEl("text", { class: "meter-letter", x: 0, y: 0 }, meterLetter(type)));
    }
    group.append(svgEl("line", { class: "component-body", x1: 34, y1: 0, x2: 74, y2: 0 }));
  }
}

function isMeterType(type) {
  return type === "meter" || type === "ammeter" || type === "voltmeter" || type === "galvanometer";
}

function meterLetter(type) {
  return type === "voltmeter" ? "V" : "A";
}

function drawMeterArrow(group) {
  group.append(svgEl("line", { class: "meter-arrow", x1: 0, y1: 18, x2: 0, y2: -7 }));
  group.append(svgEl("polygon", { class: "meter-arrow-head", points: "0,-25 -12,-6 12,-6" }));
}

function iconMarkup(type) {
  const temp = svgEl("svg", { viewBox: "-80 -52 160 104", "aria-hidden": "true" });
  const group = svgEl("g", {});
  drawShape(group, type);
  temp.append(group);
  return temp.outerHTML;
}

function startPaletteDrag(event, part, button) {
  if (event.button !== 0) return;
  paletteDrag = {
    part,
    button,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    active: false,
    ghost: null,
  };
  button.setPointerCapture?.(event.pointerId);
}

function onPalettePointerMove(event) {
  if (!paletteDrag || event.pointerId !== paletteDrag.pointerId) return;
  const dx = event.clientX - paletteDrag.startClientX;
  const dy = event.clientY - paletteDrag.startClientY;
  if (!paletteDrag.active && Math.hypot(dx, dy) > 7) {
    paletteDrag.active = true;
    paletteDrag.ghost = createDragGhost(paletteDrag.part);
  }
  if (paletteDrag.active) {
    event.preventDefault();
    moveDragGhost(paletteDrag.ghost, event.clientX, event.clientY);
  }
}

function endPaletteDrag(event) {
  if (!paletteDrag || event.pointerId !== paletteDrag.pointerId) return;
  const drag = paletteDrag;
  paletteDrag = null;
  drag.button.releasePointerCapture?.(event.pointerId);

  if (!drag.active) return;
  drag.button.dataset.suppressClick = "true";
  drag.ghost?.remove();

  if (isClientPointInSvg(event.clientX, event.clientY)) {
    addPartAt(drag.part, normalizedPoint(svgPointFromClient(event.clientX, event.clientY)));
  }
}

function cancelPaletteDrag(event) {
  if (!paletteDrag || event.pointerId !== paletteDrag.pointerId) return;
  paletteDrag.ghost?.remove();
  paletteDrag = null;
}

function createDragGhost(part) {
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.innerHTML = `<span>${iconMarkup(part.type)}</span><strong>${part.name}</strong>`;
  document.body.append(ghost);
  return ghost;
}

function moveDragGhost(ghost, clientX, clientY) {
  if (!ghost) return;
  ghost.style.transform = `translate(${clientX + 14}px, ${clientY + 14}px)`;
}

function isClientPointInSvg(clientX, clientY) {
  const rect = els.svg.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function onSvgPointerDown(event) {
  if (event.button !== 0) return;
  const point = normalizedPoint(getSvgPoint(event));
  if (state.mode === "wire") {
    event.stopPropagation();
    handleWireCanvasPoint(point);
    return;
  }

  const clickedCanvas = event.target === els.svg || event.target.classList.contains("grid-bg");
  if (!clickedCanvas) return;

  selectionDrag = {
    start: point,
    current: point,
    additive: event.metaKey || event.ctrlKey,
    active: false,
  };
  clearWireDraft();
}

function onComponentPointerDown(event, id) {
  if (event.button !== 0) return;
  if (state.mode === "wire") return;
  event.stopPropagation();

  const component = state.components.find((item) => item.id === id);
  if (!component) return;

  if (event.metaKey || event.ctrlKey) {
    toggleComponentSelection(id);
    clearWireDraft();
    render();
    return;
  }

  const point = getSvgPoint(event);
  const selectedIds = getSelectedComponentIds();
  const dragIds = selectedIds.includes(id) ? selectedIds : [id];
  state.selected = dragIds.length > 1 ? { kind: "components", ids: dragIds } : { kind: "component", id };
  dragState = {
    kind: "components",
    ids: dragIds,
    startX: point.x,
    startY: point.y,
    origins: dragIds.map((componentId) => {
      const item = state.components.find((candidate) => candidate.id === componentId);
      return { id: componentId, x: item.x, y: item.y };
    }),
    moved: false,
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  render();
}

function onTextPointerDown(event, componentId, field) {
  if (event.button !== 0) return;
  if (state.mode === "wire") return;
  event.stopPropagation();

  const component = state.components.find((item) => item.id === componentId);
  if (!component) return;

  const point = getSvgPoint(event);
  const offset = componentTextOffset(component, field);
  state.selected = { kind: "componentText", componentId, field };
  dragState = {
    kind: "text",
    componentId,
    field,
    startX: point.x,
    startY: point.y,
    origin: { ...offset },
    moved: false,
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  clearWireDraft();
  render();
}

function onTerminalPointerDown(event, componentId, terminalId) {
  if (event.button !== 0) return;
  event.stopPropagation();
  const endpoint = { kind: "terminal", componentId, terminalId };

  if (state.mode !== "wire") {
    state.selected = { kind: "component", id: componentId };
    render();
    return;
  }

  if (!state.wireStart) {
    state.wireStart = endpoint;
    state.selected = null;
    render();
    return;
  }

  addWireFromStart(endpoint, { keepDrawing: false });
}

function handleWireCanvasPoint(point) {
  const endpoint = { kind: "point", x: point.x, y: point.y };
  if (!state.wireStart) {
    state.wireStart = endpoint;
    state.selected = null;
    render();
    return;
  }
  addWireFromStart(endpoint, { keepDrawing: true, constrain: true });
}

function addWireFromStart(endpoint, options = {}) {
  const start = endpointPosition(state.wireStart);
  const rawEnd = endpointPosition(endpoint);
  if (!start || !rawEnd) return;

  const end = options.constrain ? constrainPoint(start, rawEnd) : rawEnd;
  const finalEndpoint = endpoint.kind === "point" || options.constrain
    ? { kind: "point", x: end.x, y: end.y }
    : endpoint;

  if (pointsEqual(start, end)) {
    clearWireDraft();
    render();
    return;
  }

  if (!wireExists(state.wireStart, finalEndpoint)) {
    const wire = {
      id: makeId("wire"),
      from: { ...state.wireStart },
      to: { ...finalEndpoint },
    };
    state.wires.push(wire);
    state.selected = { kind: "wire", id: wire.id };
    pushHistory();
  }

  state.wireStart = options.keepDrawing ? { ...finalEndpoint } : null;
  render();
}

function onSvgPointerMove(event) {
  const point = getSvgPoint(event);
  if (dragState) {
    const dx = point.x - dragState.startX;
    const dy = point.y - dragState.startY;
    if (dragState.kind === "text") {
      const component = state.components.find((item) => item.id === dragState.componentId);
      if (component) {
        setComponentTextOffset(component, dragState.field, {
          x: dragState.origin.x + dx,
          y: dragState.origin.y + dy,
        });
      }
    } else {
      dragState.origins.forEach((origin) => {
        const component = state.components.find((item) => item.id === origin.id);
        if (!component) return;
        component.x = state.snap ? snap(origin.x + dx) : origin.x + dx;
        component.y = state.snap ? snap(origin.y + dy) : origin.y + dy;
      });
    }
    dragState.moved = true;
    render();
  }

  if (selectionDrag) {
    selectionDrag.current = normalizedPoint(point);
    selectionDrag.active = distanceBetween(selectionDrag.start, selectionDrag.current) > 6;
    render();
  }

  if (draftWire) {
    const start = endpointPosition(draftWire.start);
    if (!start) return;
    const end = constrainPoint(start, normalizedPoint(point));
    draftWire.path.setAttribute("d", makeWirePath(start, end));
  }
}

function endDrag() {
  if (dragState) {
    if (dragState.moved) pushHistory();
    dragState = null;
  }

  if (selectionDrag) {
    if (selectionDrag.active) {
      selectComponentsInRect(normalizedRect(selectionDrag.start, selectionDrag.current), selectionDrag.additive);
    } else if (!selectionDrag.additive) {
      state.selected = null;
    }
    selectionDrag = null;
    render();
  }
}

function clearWireDraft() {
  state.wireStart = null;
  if (draftWire?.path) draftWire.path.remove();
  draftWire = null;
}

function updateSelectedComponent() {
  const component = getSelectedComponent();
  if (!component) return;
  component.label = els.labelInput.value;
  component.value = els.valueInput.value;
  pushHistoryDebounced();
  render();
}

function pushHistoryDebounced() {
  window.clearTimeout(historyInputTimer);
  historyInputTimer = window.setTimeout(() => pushHistory(), 260);
}

function rotateSelected() {
  const components = getSelectedComponents();
  if (!components.length) return;
  components.forEach((component) => {
    component.rotation = (component.rotation + 90) % 360;
  });
  pushHistory();
  render();
}

function duplicateSelected() {
  const selectedComponents = getSelectedComponents();
  if (!selectedComponents.length) return;

  const idMap = new Map();
  const duplicated = selectedComponents.map((component) => {
    const part = partByType(component.type);
    const next = nextPartCount(part?.prefix || component.label.replace(/\d+$/, "") || "X");
    const duplicate = {
      ...component,
      id: makeId("cmp"),
      x: snap(component.x + 48),
      y: snap(component.y + 48),
      labelOffset: { ...componentTextOffset(component, "label") },
      valueOffset: { ...componentTextOffset(component, "value") },
      label: part ? defaultComponentLabel(part.prefix, next) : `${component.label}${next}`,
    };
    idMap.set(component.id, duplicate.id);
    return duplicate;
  });

  const duplicatedWires = state.wires
    .filter((wireItem) => bothEndpointsInSelection(wireItem, idMap))
    .map((wireItem) => ({
      id: makeId("wire"),
      from: remapEndpoint(wireItem.from, idMap),
      to: remapEndpoint(wireItem.to, idMap),
    }));

  state.components.push(...duplicated);
  state.wires.push(...duplicatedWires);
  state.selected = duplicated.length > 1
    ? { kind: "components", ids: duplicated.map((component) => component.id) }
    : { kind: "component", id: duplicated[0].id };
  pushHistory();
  render();
}

function deleteSelected() {
  if (!state.selected) return;
  const selectedIds = getSelectedComponentIds();
  if (selectedIds.length) {
    const selectedSet = new Set(selectedIds);
    state.components = state.components.filter((component) => !selectedSet.has(component.id));
    state.wires = state.wires.filter((wire) => !selectedIds.some((id) => wireTouchesComponent(wire, id)));
  } else if (state.selected.kind === "wire") {
    state.wires = state.wires.filter((wire) => wire.id !== state.selected.id);
  }
  state.selected = null;
  clearWireDraft();
  pushHistory();
  render();
}

function setMode(mode, doRender = true) {
  state.mode = mode;
  if (mode !== "wire") clearWireDraft();
  if (doRender) render();
}

function onKeyDown(event) {
  const editing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
  if (editing) return;

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
  } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
    event.preventDefault();
    duplicateSelected();
  } else if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelected();
  } else if (event.key.toLowerCase() === "r") {
    event.preventDefault();
    rotateSelected();
  } else if (event.key.toLowerCase() === "w") {
    event.preventDefault();
    setMode("wire");
  } else if (event.key.toLowerCase() === "v") {
    event.preventDefault();
    setMode("select");
  } else if (event.key === "Escape") {
    clearWireDraft();
    state.selected = null;
    render();
  }
}

function clearCircuit() {
  if (!state.components.length && !state.wires.length) return;
  state.components = [];
  state.wires = [];
  state.counters = {};
  state.selected = null;
  clearWireDraft();
  pushHistory();
  render();
}

function pushHistory() {
  if (suppressHistory) return;
  const snapshot = serializeState();
  const latest = state.history[state.history.length - 1];
  if (latest === snapshot) return;
  state.history.push(snapshot);
  if (state.history.length > 80) state.history.shift();
  state.future = [];
  updateUndoRedo();
}

function undo() {
  if (state.history.length <= 1) return;
  const current = state.history.pop();
  state.future.push(current);
  restoreState(state.history[state.history.length - 1]);
}

function redo() {
  if (!state.future.length) return;
  const snapshot = state.future.pop();
  state.history.push(snapshot);
  restoreState(snapshot);
}

function serializeState() {
  return JSON.stringify({
    components: state.components,
    wires: state.wires,
    counters: state.counters,
    hideCircuitNames: state.hideCircuitNames,
    hideCircuitValues: state.hideCircuitValues,
    title: state.title,
    note: state.note,
  });
}

function restoreState(snapshot) {
  suppressHistory = true;
  const data = JSON.parse(snapshot);
  state.components = data.components;
  state.wires = data.wires;
  state.counters = data.counters || {};
  const legacyHideText = data.hideCircuitText ?? true;
  state.hideCircuitNames = data.hideCircuitNames ?? legacyHideText;
  state.hideCircuitValues = data.hideCircuitValues ?? legacyHideText;
  state.title = data.title || "";
  state.note = data.note || "";
  state.selected = null;
  clearWireDraft();
  els.titleInput.value = state.title;
  els.noteInput.value = state.note;
  render();
  suppressHistory = false;
}

function updateUndoRedo() {
  els.undoBtn.disabled = state.history.length <= 1;
  els.redoBtn.disabled = state.future.length === 0;
}

async function exportPng() {
  try {
    const blob = await svgToImageBlob("image/png");
    downloadBlob(blob, fileBaseName() + ".png");
    showToast("PNGを書き出しました");
  } catch (error) {
    showToast("PNG出力に失敗しました");
    console.error(error);
  }
}

async function exportPdf() {
  try {
    const pdf = buildVectorPdf();
    downloadBlob(new Blob([pdf], { type: "application/pdf" }), fileBaseName() + ".pdf");
    showToast("PDFを書き出しました");
  } catch (error) {
    showToast("PDF出力に失敗しました");
    console.error(error);
  }
}

async function svgToImageBlob(type, quality) {
  const svgText = exportSvgMarkup();
  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  URL.revokeObjectURL(url);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas export failed"));
    }, type, quality);
  });
}

function exportSvgMarkup() {
  const clone = els.svg.cloneNode(true);
  clone.querySelector("#overlayLayer")?.replaceChildren();
  clone.querySelectorAll(".component-hit,.terminal-hit,.wire-hit,.terminal-dot,.text-hit").forEach((node) => node.remove());
  clone.querySelectorAll(".selected").forEach((node) => node.classList.remove("selected"));
  clone.querySelector(".grid-bg")?.setAttribute("display", state.grid ? "block" : "none");
  const style = svgEl("style", {}, `
    .component-body{fill:#fff;stroke:#0f172a;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
    .component-fill{fill:#fff}
    .component-accent{stroke:#0f766e;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;fill:none}
    .component-label{fill:#111827;font-family:Inter,Arial,sans-serif;font-size:${LABEL_FONT_SIZE}px;font-weight:400;text-anchor:middle;dominant-baseline:central}
    .component-value{fill:#475569;font-family:Inter,Arial,sans-serif;font-size:${VALUE_FONT_SIZE}px;text-anchor:middle;dominant-baseline:central}
    .math-alpha{font-family:"Times New Roman","STIX Two Text","Cambria Math",serif;font-style:italic;font-weight:400}
    .math-roman{font-family:"Times New Roman","STIX Two Text","Cambria Math",serif;font-style:normal;font-weight:400}
    .math-plain{font-style:normal;font-weight:400}
    .math-sub{font-size:70%;baseline-shift:sub}
    .meter-letter{fill:#111827;font-family:Inter,Arial,sans-serif;font-size:48px;font-weight:400;text-anchor:middle;dominant-baseline:central}
    .meter-arrow{stroke:#111827;stroke-width:4;stroke-linecap:round;fill:none}
    .meter-arrow-head{fill:#111827;stroke:none}
    .wire{fill:none;stroke:#1e293b;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
    .junction-dot{fill:#0f172a;stroke:none}
  `);
  clone.insertBefore(style, clone.firstChild);
  const junctionLayer = svgEl("g", { class: "junction-layer" });
  computeJunctionDots().forEach((dot) => {
    junctionLayer.append(svgEl("circle", {
      class: "junction-dot",
      cx: dot.x,
      cy: dot.y,
      r: 4.6,
    }));
  });
  clone.querySelector("#wireLayer")?.append(junctionLayer);
  const title = escapeXml(state.title || "Untitled Circuit");
  const note = escapeXml(state.note || "");
  const titleGroup = `
    <g font-family="Inter, Arial, sans-serif">
      <rect x="24" y="24" width="440" height="${note ? 74 : 46}" rx="8" fill="#ffffff" stroke="#cbd5e1"/>
      <text x="44" y="54" font-size="19" font-weight="700" fill="#111827">${title}</text>
      ${note ? `<text x="44" y="82" font-size="13" fill="#475569">${note}</text>` : ""}
    </g>
  `;
  clone.insertAdjacentHTML("beforeend", titleGroup);
  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("width", String(EXPORT_WIDTH));
  clone.setAttribute("height", String(EXPORT_HEIGHT));
  return `<?xml version="1.0" encoding="UTF-8"?>${clone.outerHTML}`;
}

function buildVectorPdf() {
  const bounds = computeCircuitBounds();
  const width = Math.max(96, Math.ceil(bounds.width));
  const height = Math.max(96, Math.ceil(bounds.height));
  const commands = [];

  commands.push("q");
  commands.push(`1 0 0 -1 0 ${fmt(height)} cm`);
  commands.push(`1 0 0 1 ${fmt(-bounds.x)} ${fmt(-bounds.y)} cm`);
  commands.push("1 J 1 j");
  drawPdfWires(commands);
  drawPdfComponents(commands);
  drawPdfJunctionDots(commands);
  commands.push("Q");

  return buildPdfDocument(commands.join("\n"), width, height);
}

function computeCircuitBounds() {
  const boxes = [];

  state.components.forEach((component) => {
    boxes.push(componentPdfBounds(component));
  });

  state.wires.forEach((wireItem) => {
    const start = endpointPosition(wireItem.from);
    const end = endpointPosition(wireItem.to);
    if (!start || !end) return;
    boxes.push(pointsBounds(routePoints(start, end), 4));
  });

  computeJunctionDots().forEach((dot) => {
    boxes.push({ minX: dot.x - 5, minY: dot.y - 5, maxX: dot.x + 5, maxY: dot.y + 5 });
  });

  if (!boxes.length) {
    return { x: 0, y: 0, width: 96, height: 96 };
  }

  const padding = 10;
  const minX = Math.min(...boxes.map((box) => box.minX)) - padding;
  const minY = Math.min(...boxes.map((box) => box.minY)) - padding;
  const maxX = Math.max(...boxes.map((box) => box.maxX)) + padding;
  const maxY = Math.max(...boxes.map((box) => box.maxY)) + padding;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function componentPdfBounds(component) {
  const symbol = rotatedLocalBounds(symbolLocalBounds(component.type), component);
  const boxes = [symbol];
  if (!state.hideCircuitNames) {
    boxes.push(componentTextBox(component, "label", { forPdf: true }));
  }
  if (!state.hideCircuitValues) {
    if (component.value) boxes.push(componentTextBox(component, "value", { forPdf: true }));
  }
  return mergeBounds(boxes);
}

function symbolLocalBounds(type) {
  if (type === "ground") return { minX: -34, minY: -54, maxX: 34, maxY: 15 };
  if (type === "vsource" || isMeterType(type)) return { minX: -76, minY: -38, maxX: 76, maxY: 38 };
  if (type === "variable-resistor") return { minX: -68, minY: -40, maxX: 68, maxY: 36 };
  if (type === "led") return { minX: -66, minY: -56, maxX: 66, maxY: 28 };
  if (type === "diode") return { minX: -66, minY: -28, maxX: 66, maxY: 28 };
  if (type === "switch") return { minX: -66, minY: -28, maxX: 66, maxY: 6 };
  if (type === "battery") return { minX: -66, minY: -31, maxX: 66, maxY: 31 };
  if (type === "inductor") return { minX: -66, minY: -18, maxX: 66, maxY: 6 };
  return { minX: -66, minY: -30, maxX: 66, maxY: 30 };
}

function rotatedLocalBounds(localBounds, component) {
  const corners = [
    { x: localBounds.minX, y: localBounds.minY },
    { x: localBounds.maxX, y: localBounds.minY },
    { x: localBounds.maxX, y: localBounds.maxY },
    { x: localBounds.minX, y: localBounds.maxY },
  ].map((pointValue) => transformComponentPoint(component, pointValue));
  return pointsBounds(corners, 3);
}

function pointsBounds(points, pad = 0) {
  return {
    minX: Math.min(...points.map((pointValue) => pointValue.x)) - pad,
    minY: Math.min(...points.map((pointValue) => pointValue.y)) - pad,
    maxX: Math.max(...points.map((pointValue) => pointValue.x)) + pad,
    maxY: Math.max(...points.map((pointValue) => pointValue.y)) + pad,
  };
}

function formattedTextBounds(text, x, y, size, options = {}) {
  const segments = formatTextSegments(text, {
    forPdf: options.forPdf ?? true,
    italicAlpha: options.italicAlpha ?? true,
  });
  const width = estimateFormattedTextWidth(segments, size);
  const hasSubscript = segments.some((segment) => segment.subscript);
  return {
    minX: x - width / 2,
    minY: y - size * 0.65,
    maxX: x + width / 2,
    maxY: y + size * (hasSubscript ? 0.9 : 0.65),
  };
}

function mergeBounds(boxes) {
  return {
    minX: Math.min(...boxes.map((box) => box.minX)),
    minY: Math.min(...boxes.map((box) => box.minY)),
    maxX: Math.max(...boxes.map((box) => box.maxX)),
    maxY: Math.max(...boxes.map((box) => box.maxY)),
  };
}

function drawPdfWires(commands) {
  setPdfStroke(commands, "#1e293b", 3);
  state.wires.forEach((wireItem) => {
    const start = endpointPosition(wireItem.from);
    const end = endpointPosition(wireItem.to);
    if (!start || !end) return;
    pdfPolyline(commands, routePoints(start, end));
  });
}

function drawPdfJunctionDots(commands) {
  setPdfFill(commands, "#0f172a");
  computeJunctionDots().forEach((dot) => {
    pdfCircle(commands, dot.x, dot.y, 4.6, "f");
  });
}

function drawPdfComponents(commands) {
  state.components.forEach((component) => {
    drawPdfShape(commands, component);
    if (!state.hideCircuitNames) {
      const labelPosition = componentTextPosition(component, "label");
      pdfFormattedText(commands, component.label, labelPosition.x, labelPosition.y, LABEL_FONT_SIZE, "#111827", { italicAlpha: true });
    }
    if (!state.hideCircuitValues && component.value) {
      const valuePosition = componentTextPosition(component, "value");
      pdfFormattedText(commands, component.value, valuePosition.x, valuePosition.y, VALUE_FONT_SIZE, "#475569", { italicAlpha: false });
    }
  });
}

function drawPdfShape(commands, component) {
  const type = component.type;
  const p = (x, y) => transformComponentPoint(component, { x, y });
  const line = (x1, y1, x2, y2, color = "#0f172a", width = 2.6) => {
    setPdfStroke(commands, color, width);
    pdfLine(commands, p(x1, y1), p(x2, y2));
  };

  if (type === "resistor" || type === "variable-resistor") {
    line(-64, 0, -34, 0);
    setPdfStroke(commands, "#0f172a", 2.6);
    setPdfFill(commands, "#ffffff");
    pdfPolygon(commands, [p(-34, -16), p(34, -16), p(34, 16), p(-34, 16)], "B");
    line(34, 0, 64, 0);
    if (type === "variable-resistor") {
      line(-38, 32, 42, -36);
      pdfPolylineWithStyle(commands, [p(22, -34), p(42, -36), p(36, -16)], "#0f172a", 2.6);
    }
  } else if (type === "capacitor") {
    line(-64, 0, -12, 0);
    line(-12, -25, -12, 25);
    line(12, -25, 12, 25);
    line(12, 0, 64, 0);
  } else if (type === "inductor") {
    line(-64, 0, -42, 0);
    setPdfStroke(commands, "#0f172a", 2.6);
    for (let i = 0; i < 4; i += 1) {
      const x0 = -42 + i * 21;
      const x1 = -21 + i * 21;
      pdfBezier(commands, p(x0, 0), p(x0 + 5, -16), p(x1 - 5, -16), p(x1, 0));
    }
    line(42, 0, 64, 0);
  } else if (type === "diode" || type === "led") {
    line(-64, 0, -24, 0);
    setPdfStroke(commands, "#0f172a", 2.6);
    setPdfFill(commands, "#ffffff");
    pdfPolygon(commands, [p(-24, -25), p(-24, 25), p(16, 0)], "B");
    line(20, -25, 20, 25);
    line(20, 0, 64, 0);
    if (type === "led") {
      line(30, -31, 48, -49, "#0f766e");
      pdfPolylineWithStyle(commands, [p(43, -49), p(48, -49), p(48, -44)], "#0f766e", 2.6);
      line(18, -34, 36, -52, "#0f766e");
      pdfPolylineWithStyle(commands, [p(31, -52), p(36, -52), p(36, -47)], "#0f766e", 2.6);
    }
  } else if (type === "switch") {
    pdfPolylineWithStyle(commands, [p(-64, 0), p(-22, 0), p(30, -24)], "#0f172a", 2.6);
    line(34, 0, 64, 0);
    line(28, 0, 38, 0);
  } else if (type === "battery") {
    line(-64, 0, -7, 0);
    line(-7, -28, -7, 28);
    line(7, -18, 7, 18);
    line(7, 0, 64, 0);
  } else if (type === "vsource") {
    line(-74, 0, -34, 0);
    setPdfStroke(commands, "#0f172a", 2.6);
    setPdfFill(commands, "#ffffff");
    pdfCircle(commands, component.x, component.y, 34, "B");
    setPdfStroke(commands, "#0f766e", 2.6);
    pdfBezier(commands, p(-18, 0), p(-8, -20), p(8, 20), p(18, 0));
    line(34, 0, 74, 0);
  } else if (type === "ground") {
    line(0, -52, 0, -14);
    line(-32, -14, 32, -14);
    line(-22, -1, 22, -1);
    line(-12, 12, 12, 12);
  } else if (isMeterType(type)) {
    line(-74, 0, -34, 0);
    setPdfStroke(commands, "#0f172a", 2.6);
    setPdfFill(commands, "#ffffff");
    pdfCircle(commands, component.x, component.y, 34, "B");
    if (type === "galvanometer") {
      drawPdfMeterArrow(commands, p);
    } else {
      pdfText(commands, meterLetter(type), component.x, component.y, 48, "#111827");
    }
    line(34, 0, 74, 0);
  }
}

function transformComponentPoint(component, pointValue) {
  const angle = (component.rotation * Math.PI) / 180;
  return {
    x: component.x + pointValue.x * Math.cos(angle) - pointValue.y * Math.sin(angle),
    y: component.y + pointValue.x * Math.sin(angle) + pointValue.y * Math.cos(angle),
  };
}

function pdfLine(commands, a, b) {
  commands.push(`${fmt(a.x)} ${fmt(a.y)} m ${fmt(b.x)} ${fmt(b.y)} l S`);
}

function pdfPolylineWithStyle(commands, points, color, width) {
  setPdfStroke(commands, color, width);
  pdfPolyline(commands, points);
}

function pdfPolyline(commands, points) {
  if (points.length < 2) return;
  const [first, ...rest] = points;
  commands.push(`${fmt(first.x)} ${fmt(first.y)} m`);
  rest.forEach((pointValue) => commands.push(`${fmt(pointValue.x)} ${fmt(pointValue.y)} l`));
  commands.push("S");
}

function pdfPolygon(commands, points, op = "S") {
  if (points.length < 2) return;
  commands.push(`${fmt(points[0].x)} ${fmt(points[0].y)} m`);
  points.slice(1).forEach((pointValue) => commands.push(`${fmt(pointValue.x)} ${fmt(pointValue.y)} l`));
  commands.push(`h ${op}`);
}

function pdfBezier(commands, start, c1, c2, end) {
  commands.push(
    `${fmt(start.x)} ${fmt(start.y)} m ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(end.x)} ${fmt(end.y)} c S`,
  );
}

function pdfCircle(commands, x, y, r, op = "S") {
  const k = 0.5522847498;
  commands.push(`${fmt(x + r)} ${fmt(y)} m`);
  commands.push(`${fmt(x + r)} ${fmt(y + k * r)} ${fmt(x + k * r)} ${fmt(y + r)} ${fmt(x)} ${fmt(y + r)} c`);
  commands.push(`${fmt(x - k * r)} ${fmt(y + r)} ${fmt(x - r)} ${fmt(y + k * r)} ${fmt(x - r)} ${fmt(y)} c`);
  commands.push(`${fmt(x - r)} ${fmt(y - k * r)} ${fmt(x - k * r)} ${fmt(y - r)} ${fmt(x)} ${fmt(y - r)} c`);
  commands.push(`${fmt(x + k * r)} ${fmt(y - r)} ${fmt(x + r)} ${fmt(y - k * r)} ${fmt(x + r)} ${fmt(y)} c ${op}`);
}

function drawPdfMeterArrow(commands, p) {
  setPdfStroke(commands, "#111827", 4);
  pdfLine(commands, p(0, 18), p(0, -7));
  setPdfFill(commands, "#111827");
  pdfPolygon(commands, [p(0, -25), p(-12, -6), p(12, -6)], "f");
}

function pdfFormattedText(commands, text, x, y, size, color, options = {}) {
  const segments = formatTextSegments(text, {
    forPdf: true,
    italicAlpha: options.italicAlpha ?? true,
  });
  if (!segments.length) return;
  const width = estimateFormattedTextWidth(segments, size);
  let cursor = -width / 2;
  setPdfFill(commands, color);
  commands.push("q");
  commands.push(`1 0 0 -1 ${fmt(x)} ${fmt(y)} cm`);
  segments.forEach((segment) => {
    const segmentSize = segment.subscript ? size * SUBSCRIPT_FONT_SCALE : size;
    const yOffset = size * (PDF_TEXT_BASELINE - (segment.subscript ? PDF_SUBSCRIPT_DROP : 0));
    const font = pdfFontForSegment(segment);
    const pdfTextValue = pdfSegmentText(segment);
    commands.push(
      `BT ${font} ${fmt(segmentSize)} Tf ${fmt(cursor)} ${fmt(yOffset)} Td (${escapePdfString(pdfTextValue)}) Tj ET`,
    );
    cursor += estimateTextSegmentWidth(segment, size);
  });
  commands.push("Q");
}

function pdfText(commands, text, x, y, size, color, weight = "normal") {
  const safeText = displayPdfText(text);
  if (!safeText) return;
  const font = weight === "bold" ? "/F2" : "/F1";
  const width = estimateTextWidth(safeText, size);
  setPdfFill(commands, color);
  commands.push("q");
  commands.push(`1 0 0 -1 ${fmt(x)} ${fmt(y)} cm`);
  commands.push(`BT ${font} ${fmt(size)} Tf ${fmt(-width / 2)} ${fmt(-size * 0.34)} Td (${escapePdfString(safeText)}) Tj ET`);
  commands.push("Q");
}

function setPdfStroke(commands, color, width) {
  const rgb = hexToRgb(color);
  commands.push(`${fmt(rgb.r)} ${fmt(rgb.g)} ${fmt(rgb.b)} RG ${fmt(width)} w`);
}

function setPdfFill(commands, color) {
  const rgb = hexToRgb(color);
  commands.push(`${fmt(rgb.r)} ${fmt(rgb.g)} ${fmt(rgb.b)} rg`);
}

function hexToRgb(color) {
  const hex = color.replace("#", "");
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255,
  };
}

function displayPdfText(value) {
  return pdfSourceText(value).replace(/Ω/g, "ohm");
}

function pdfSourceText(value) {
  return String(value || "")
    .replace(/µ/g, "u")
    .replace(/赤/g, "red")
    .replace(/青/g, "blue")
    .replace(/緑/g, "green")
    .replace(/黄/g, "yellow")
    .replace(/白/g, "white")
    .replace(/黒/g, "black")
    .replace(/[^\x20-\x7eΩ]/g, "");
}

function formatTextSegments(value, options = {}) {
  const forPdf = options.forPdf ?? false;
  const italicAlpha = options.italicAlpha ?? true;
  const source = forPdf ? pdfSourceText(value) : String(value || "");
  const segments = [];
  let index = 0;

  while (index < source.length) {
    if (source[index] === '"') {
      const end = source.indexOf('"', index + 1);
      if (end > index) {
        pushTextSegments(segments, source.slice(index + 1, end), false, { italicAlpha, quoted: true });
        index = end + 1;
        continue;
      }
      pushTextSegments(segments, source[index], false, { italicAlpha, quoted: false });
      index += 1;
      continue;
    }

    if (source[index] === "_") {
      const subscript = parseSubscriptToken(source, index);
      if (subscript) {
        pushTextSegments(segments, subscript.text, true, { italicAlpha, quoted: subscript.quoted });
        index = subscript.end;
        continue;
      }
    }

    const start = index;
    index += 1;
    while (index < source.length && source[index] !== "_" && source[index] !== '"') index += 1;
    pushTextSegments(segments, source.slice(start, index), false, { italicAlpha, quoted: false });
  }

  return segments;
}

function formatPdfTextSegments(value) {
  return formatTextSegments(value, { forPdf: true });
}

function parseSubscriptToken(source, index) {
  const next = source[index + 1];
  if (!next) return null;
  if (next === '"') {
    const end = source.indexOf('"', index + 2);
    if (end > index + 2) return { text: source.slice(index + 2, end), end: end + 1, quoted: true };
    return null;
  }
  if (next === "{") {
    const end = source.indexOf("}", index + 2);
    if (end > index + 2) return { text: source.slice(index + 2, end), end: end + 1, quoted: false };
    return null;
  }
  const match = source.slice(index + 1).match(/^[A-Za-z0-9]+/);
  if (!match) return null;
  return { text: match[0], end: index + 1 + match[0].length, quoted: false };
}

function pushTextSegments(segments, text, subscript, options = {}) {
  let index = 0;
  while (index < text.length) {
    if (text[index] === "Ω") {
      segments.push({ text: "Ω", pdfText: "W", alpha: false, subscript, style: "symbol" });
      index += 1;
      continue;
    }
    const alpha = /[A-Za-z]/.test(text[index]);
    const start = index;
    index += 1;
    while (index < text.length && text[index] !== "Ω" && /[A-Za-z]/.test(text[index]) === alpha) index += 1;
    const segmentText = text.slice(start, index);
    if (segmentText) {
      const style = alpha && options.italicAlpha
        ? (options.quoted ? "roman" : "italic")
        : "plain";
      segments.push({ text: segmentText, alpha, subscript, style });
    }
  }
}

function formattedSegmentClass(segment) {
  if (segment.style === "italic") return "math-alpha";
  if (segment.style === "roman") return "math-roman";
  return "math-plain";
}

function pdfFontForSegment(segment) {
  if (segment.style === "symbol") return "/F5";
  if (segment.style === "italic") return "/F3";
  if (segment.style === "roman") return "/F4";
  return "/F1";
}

function pdfSegmentText(segment) {
  return segment.pdfText || segment.text;
}

function estimateTextWidth(text, size) {
  return displayPdfText(text).length * size * 0.56;
}

function estimateFormattedTextWidth(segments, size) {
  return segments.reduce((total, segment) => total + estimateTextSegmentWidth(segment, size), 0);
}

function estimateTextSegmentWidth(segment, size) {
  const segmentSize = segment.subscript ? size * SUBSCRIPT_FONT_SCALE : size;
  const factor = segment.style === "symbol" ? 0.72 : segment.alpha ? 0.58 : 0.56;
  return segment.text.length * segmentSize * factor;
}

function escapePdfString(text) {
  return displayPdfText(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdfDocument(contentStream, width, height) {
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [0];
  let length = 0;

  function add(data) {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  }

  function object(id, content) {
    offsets[id] = length;
    add(`${id} 0 obj\n`);
    add(content);
    add("\nendobj\n");
  }

  add("%PDF-1.4\n% Vector Circuit Diagram\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(width)} ${fmt(height)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R /F4 7 0 R /F5 8 0 R >> >> /Contents 9 0 R >>`,
  );
  object(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  object(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  object(6, "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>");
  object(7, "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>");
  object(8, "<< /Type /Font /Subtype /Type1 /BaseFont /Symbol >>");
  object(9, `<< /Length ${encoder.encode(contentStream).length} >>\nstream\n${contentStream}\nendstream`);

  const xrefStart = length;
  add("xref\n0 10\n0000000000 65535 f \n");
  for (let id = 1; id <= 9; id += 1) {
    add(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  add(`trailer\n<< /Size 10 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const output = new Uint8Array(length);
  let cursor = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, cursor);
    cursor += chunk.length;
  });
  return output;
}

function terminalDefs(type) {
  if (type === "ground") return [{ id: "top", x: 0, y: -52 }];
  if (type === "vsource" || isMeterType(type)) {
    return [
      { id: "left", x: -74, y: 0 },
      { id: "right", x: 74, y: 0 },
    ];
  }
  return [
    { id: "left", x: -64, y: 0 },
    { id: "right", x: 64, y: 0 },
  ];
}

function endpointPosition(endpoint) {
  if (!endpoint) return null;
  if (endpoint.kind === "point") return { x: endpoint.x, y: endpoint.y };
  return terminalPosition(endpoint.componentId, endpoint.terminalId);
}

function terminalPosition(componentId, terminalId) {
  const component = state.components.find((item) => item.id === componentId);
  if (!component) return null;
  const terminal = terminalDefs(component.type).find((item) => item.id === terminalId);
  if (!terminal) return null;
  const angle = (component.rotation * Math.PI) / 180;
  const x = terminal.x * Math.cos(angle) - terminal.y * Math.sin(angle);
  const y = terminal.x * Math.sin(angle) + terminal.y * Math.cos(angle);
  return { x: component.x + x, y: component.y + y };
}

function componentBounds(component) {
  const points = terminalDefs(component.type).map((terminal) => terminalPosition(component.id, terminal.id));
  const xs = points.map((point) => point.x).concat(component.x - 96, component.x + 96);
  const ys = points.map((point) => point.y).concat(component.y - 76, component.y + 76);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX - 8, y: minY - 8, width: maxX - minX + 16, height: maxY - minY + 16 };
}

function componentTextBaseY(component, field) {
  if (field === "label") return component.type === "ground" ? -86 : -82;
  return component.type === "ground" ? 56 : 78;
}

function componentTextOffset(component, field) {
  const offset = component[`${field}Offset`];
  return {
    x: Number.isFinite(offset?.x) ? offset.x : 0,
    y: Number.isFinite(offset?.y) ? offset.y : 0,
  };
}

function setComponentTextOffset(component, field, offset) {
  component[`${field}Offset`] = {
    x: Math.round(offset.x * 10) / 10,
    y: Math.round(offset.y * 10) / 10,
  };
}

function componentTextLocalPosition(component, field) {
  const offset = componentTextOffset(component, field);
  return {
    x: offset.x,
    y: componentTextBaseY(component, field) + offset.y,
  };
}

function componentTextPosition(component, field) {
  const local = componentTextLocalPosition(component, field);
  return {
    x: component.x + local.x,
    y: component.y + local.y,
  };
}

function componentTextBox(component, field, options = {}) {
  const position = componentTextPosition(component, field);
  const text = field === "value" ? component.value : component.label;
  const size = field === "value" ? VALUE_FONT_SIZE : LABEL_FONT_SIZE;
  const italicAlpha = field !== "value";
  return formattedTextBounds(text, position.x, position.y, size, {
    forPdf: options.forPdf ?? true,
    italicAlpha,
  });
}

function terminalDotClass(componentId, terminalId) {
  const endpoint = { kind: "terminal", componentId, terminalId };
  const classes = ["terminal-dot"];
  if (state.wireStart && sameEndpoint(state.wireStart, endpoint)) classes.push("hot");
  if (state.wires.some((item) => sameEndpoint(item.from, endpoint) || sameEndpoint(item.to, endpoint))) {
    classes.push("connected");
  }
  return classes.join(" ");
}

function makeWirePath(start, end) {
  const points = routePoints(start, end);
  return points
    .map((pointValue, index) => `${index === 0 ? "M" : "L"} ${pointValue.x} ${pointValue.y}`)
    .join(" ");
}

function routePoints(start, end) {
  if (Math.abs(start.x - end.x) < 0.1 || Math.abs(start.y - end.y) < 0.1) {
    return [start, end];
  }
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  if (dx > dy) {
    const midX = (start.x + end.x) / 2;
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }
  const midY = (start.y + end.y) / 2;
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}

function computeJunctionDots() {
  const segments = state.wires.flatMap((wireItem, wireIndex) => wireSegments(wireItem, wireIndex));
  const candidates = new Map();
  state.wires.forEach((wireItem) => {
    [wireItem.from, wireItem.to].forEach((endpoint) => {
      if (endpoint.kind !== "point") return;
      const position = endpointPosition(endpoint);
      if (position) candidates.set(pointKey(position), position);
    });
  });

  return Array.from(candidates.values()).filter((candidate) => {
    const directions = new Set();
    segments.forEach((segment) => {
      if (!segmentContainsPoint(segment, candidate)) return;
      segmentDirectionsAtPoint(segment, candidate).forEach((direction) => directions.add(direction));
    });
    return directions.size >= 3;
  });
}

function wireSegments(wireItem, wireIndex) {
  const start = endpointPosition(wireItem.from);
  const end = endpointPosition(wireItem.to);
  if (!start || !end) return [];
  const points = routePoints(start, end);
  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (pointsEqual(a, b)) continue;
    const horizontal = Math.abs(a.y - b.y) < 0.1;
    segments.push({
      wireIndex,
      orientation: horizontal ? "h" : "v",
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      minX: Math.min(a.x, b.x),
      maxX: Math.max(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxY: Math.max(a.y, b.y),
    });
  }
  return segments;
}

function nearestPointOnWire(wireItem, rawPoint) {
  const segments = wireSegments(wireItem, 0);
  let best = null;
  segments.forEach((segment) => {
    const pointValue = nearestPointOnSegment(segment, rawPoint);
    const distance = Math.hypot(pointValue.x - rawPoint.x, pointValue.y - rawPoint.y);
    if (!best || distance < best.distance) best = { ...pointValue, distance, segment };
  });
  if (!best) return null;
  if (!state.snap) return { x: best.x, y: best.y };
  if (best.segment.orientation === "h") {
    return {
      x: clamp(snap(best.x), best.segment.minX, best.segment.maxX),
      y: best.segment.y1,
    };
  }
  return {
    x: best.segment.x1,
    y: clamp(snap(best.y), best.segment.minY, best.segment.maxY),
  };
}

function nearestPointOnSegment(segment, rawPoint) {
  if (segment.orientation === "h") {
    return {
      x: clamp(rawPoint.x, segment.minX, segment.maxX),
      y: segment.y1,
    };
  }
  return {
    x: segment.x1,
    y: clamp(rawPoint.y, segment.minY, segment.maxY),
  };
}

function segmentContainsPoint(segment, pointValue) {
  if (segment.orientation === "h") {
    return (
      Math.abs(pointValue.y - segment.y1) < 0.5 &&
      pointValue.x >= segment.minX - 0.5 &&
      pointValue.x <= segment.maxX + 0.5
    );
  }
  return (
    Math.abs(pointValue.x - segment.x1) < 0.5 &&
    pointValue.y >= segment.minY - 0.5 &&
    pointValue.y <= segment.maxY + 0.5
  );
}

function segmentDirectionsAtPoint(segment, pointValue) {
  const directions = [];
  if (segment.orientation === "h") {
    if (pointValue.x > segment.minX + 0.5) directions.push("left");
    if (pointValue.x < segment.maxX - 0.5) directions.push("right");
  } else {
    if (pointValue.y > segment.minY + 0.5) directions.push("up");
    if (pointValue.y < segment.maxY - 0.5) directions.push("down");
  }
  return directions;
}

function pointKey(pointValue) {
  return `${Math.round(pointValue.x * 10)},${Math.round(pointValue.y * 10)}`;
}

function constrainPoint(start, rawEnd) {
  const end = normalizedPoint(rawEnd);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) >= Math.abs(dy)) return { x: end.x, y: start.y };
  return { x: start.x, y: end.y };
}

function normalizedPoint(pointValue) {
  return {
    x: state.snap ? snap(pointValue.x) : pointValue.x,
    y: state.snap ? snap(pointValue.y) : pointValue.y,
  };
}

function getSvgPoint(event) {
  return svgPointFromClient(event.clientX, event.clientY);
}

function svgPointFromClient(clientX, clientY) {
  const pointValue = els.svg.createSVGPoint();
  pointValue.x = clientX;
  pointValue.y = clientY;
  return pointValue.matrixTransform(els.svg.getScreenCTM().inverse());
}

function getSelectedComponent() {
  if (!state.selected) return null;
  if (state.selected.kind === "component") {
    return state.components.find((component) => component.id === state.selected.id) || null;
  }
  if (state.selected.kind === "componentText") {
    return state.components.find((component) => component.id === state.selected.componentId) || null;
  }
  return null;
}

function getSelectedComponentIds() {
  if (!state.selected) return [];
  if (state.selected.kind === "component") return [state.selected.id];
  if (state.selected.kind === "componentText") return [state.selected.componentId];
  if (state.selected.kind === "components") return state.selected.ids.filter((id) => state.components.some((component) => component.id === id));
  return [];
}

function getSelectedComponents() {
  const ids = new Set(getSelectedComponentIds());
  return state.components.filter((component) => ids.has(component.id));
}

function getSelectedWire() {
  if (!state.selected || state.selected.kind !== "wire") return null;
  return state.wires.find((wireItem) => wireItem.id === state.selected.id) || null;
}

function getSelectedText() {
  if (state.selected?.kind !== "componentText") return null;
  const component = state.components.find((item) => item.id === state.selected.componentId);
  if (!component) return null;
  return { component, field: state.selected.field };
}

function isCircuitTextHidden(field) {
  if (field === "label") return state.hideCircuitNames;
  if (field === "value") return state.hideCircuitValues;
  return false;
}

function isSelected(kind, id) {
  if (kind === "component" && state.selected?.kind === "components") {
    return state.selected.ids.includes(id);
  }
  if (kind === "component" && state.selected?.kind === "componentText") {
    return state.selected.componentId === id;
  }
  return state.selected?.kind === kind && state.selected?.id === id;
}

function toggleComponentSelection(id) {
  const ids = getSelectedComponentIds();
  const nextIds = ids.includes(id) ? ids.filter((componentId) => componentId !== id) : [...ids, id];
  if (!nextIds.length) state.selected = null;
  else if (nextIds.length === 1) state.selected = { kind: "component", id: nextIds[0] };
  else state.selected = { kind: "components", ids: nextIds };
}

function selectComponentsInRect(rect, additive) {
  const idsInRect = state.components
    .filter((component) => rectsIntersect(rect, componentBounds(component)))
    .map((component) => component.id);
  const ids = additive ? Array.from(new Set([...getSelectedComponentIds(), ...idsInRect])) : idsInRect;
  if (!ids.length) state.selected = null;
  else if (ids.length === 1) state.selected = { kind: "component", id: ids[0] };
  else state.selected = { kind: "components", ids };
}

function normalizedRect(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

function rectsIntersect(a, b) {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function endpointName(endpoint) {
  if (endpoint.kind === "point") return `空白点 (${Math.round(endpoint.x)}, ${Math.round(endpoint.y)})`;
  return state.components.find((component) => component.id === endpoint.componentId)?.label || "部品";
}

function wireExists(a, b) {
  return state.wires.some(
    (wireItem) =>
      (sameEndpoint(wireItem.from, a) && sameEndpoint(wireItem.to, b)) ||
      (sameEndpoint(wireItem.from, b) && sameEndpoint(wireItem.to, a)),
  );
}

function partByType(type) {
  return parts.find((part) => part.type === type) || null;
}

function bothEndpointsInSelection(wireItem, idMap) {
  return endpointInSelection(wireItem.from, idMap) && endpointInSelection(wireItem.to, idMap);
}

function endpointInSelection(endpoint, idMap) {
  return endpoint.kind === "terminal" && idMap.has(endpoint.componentId);
}

function remapEndpoint(endpoint, idMap) {
  if (endpoint.kind !== "terminal") return { ...endpoint };
  return { ...endpoint, componentId: idMap.get(endpoint.componentId) };
}

function wireTouchesComponent(wireItem, componentId) {
  return (
    (wireItem.from.kind === "terminal" && wireItem.from.componentId === componentId) ||
    (wireItem.to.kind === "terminal" && wireItem.to.componentId === componentId)
  );
}

function sameEndpoint(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "point") return Math.abs(a.x - b.x) < 0.1 && Math.abs(a.y - b.y) < 0.1;
  return a.componentId === b.componentId && a.terminalId === b.terminalId;
}

function pointsEqual(a, b) {
  return Math.abs(a.x - b.x) < 0.1 && Math.abs(a.y - b.y) < 0.1;
}

function snap(value) {
  return Math.round(value / SNAP) * SNAP;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fmt(value) {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 1000) / 1000);
}

function svgEl(name, attrs = {}, text) {
  const el = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== undefined && value !== null) el.setAttribute(key, String(value));
  });
  if (text !== undefined) el.textContent = text;
  return el;
}

function makeId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileBaseName() {
  return (state.title || "circuit-diagram")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "circuit-diagram";
}

function escapeXml(value) {
  return value.replace(/[<>&'"]/g, (char) => {
    const map = { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" };
    return map[char];
  });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 4200);
}

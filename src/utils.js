/**
 * FXMaster: Utilities
 * Helpers for flags, math, colors, geometry, masks, and render-texture pooling.
 */

import { packageId } from "./constants.js";

/**
 * Add a "delete this key" operator to an update object in a way which is compatible
 * with both legacy (V12/V13) and newer (V14+) Foundry.
 *
 * In V14+, Foundry deprecated legacy "-=key": null syntax in favor of explicit
 * DataFieldOperator values, e.g. {key: foundry.data.operators.ForcedDeletion.create()}.
 *
 * @param {object} update     The update object to mutate.
 * @param {string} key        The key to delete.
 * @returns {object}          The same update object.
 */
export function addDeletionKey(update, key) {
  const op = getForcedDeletionOperator();
  if (op) update[key] = op;
  else update[`-=${key}`] = null;
  return update;
}

/**
 * Add a "replace this key" operator to an update object in a way which is compatible
 * with both legacy (V12/V13) and newer (V14+) Foundry.
 *
 * In V14+, Foundry deprecated legacy "==key": value syntax in favor of explicit
 * DataFieldOperator values, e.g. {key: foundry.data.operators.ForcedReplacement.create(value)}.
 *
 * @param {object} update        The update object to mutate.
 * @param {string} key           The key to replace.
 * @param {*} replacement        The replacement value.
 * @returns {object}             The same update object.
 */
export function addReplacementKey(update, key, replacement) {
  const op = getForcedReplacementOperator(replacement);
  if (op) update[key] = op;
  else update[`==${key}`] = replacement;
  return update;
}

/**
 * Create an update object which replaces a specific key.
 * @param {string} key
 * @param {*} replacement
 * @returns {object}
 */
export function replacementUpdate(key, replacement) {
  return addReplacementKey({}, key, replacement);
}

/**
 * Check whether a key name is one of Foundry's legacy "special keys".
 * @param {string} key
 * @returns {boolean}
 */
function isLegacyOperatorKey(key) {
  return typeof key === "string" && (key.startsWith("-=") || key.startsWith("=="));
}

/**
 * Get a V14+ ForcedDeletion operator instance.
 * @returns {foundry.data.operators.ForcedDeletion|null}
 */
function getForcedDeletionOperator() {
  const ForcedDeletion = foundry?.data?.operators?.ForcedDeletion;
  if (!ForcedDeletion) return null;

  const del = globalThis?._del;
  if (del) return del;

  if (typeof ForcedDeletion.create === "function") return ForcedDeletion.create();
  try {
    return new ForcedDeletion();
  } catch {
    return null;
  }
}

/**
 * Get a V14+ ForcedReplacement operator instance for a replacement value.
 * @param {*} replacement
 * @returns {foundry.data.operators.ForcedReplacement|null}
 */
function getForcedReplacementOperator(replacement) {
  const ForcedReplacement = foundry?.data?.operators?.ForcedReplacement;
  if (!ForcedReplacement) return null;

  const rep = globalThis?._replace;
  if (typeof rep === "function") {
    try {
      return rep(replacement);
    } catch {}
  }

  if (typeof ForcedReplacement.create === "function") {
    try {
      return ForcedReplacement.create(replacement);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Create an update object which deletes a specific key.
 * @param {string} key
 * @returns {object}
 */
export function deletionUpdate(key) {
  return addDeletionKey({}, key);
}

/**
 * Reset a namespaced flag on a document, removing stale keys.
 * @param {foundry.abstract.Document} document
 * @param {string} key
 * @param {*} value
 * @returns {Promise<foundry.abstract.Document>}
 */
export async function resetFlag(document, key, value) {
  if (typeof value === "object" && !Array.isArray(value) && value !== null) {
    const oldFlags = document.getFlag(packageId, key);
    const keys = oldFlags ? Object.keys(oldFlags) : [];
    for (const k of keys) {
      if (isLegacyOperatorKey(k)) continue;
      if (Object.prototype.hasOwnProperty.call(value, k)) continue;
      addDeletionKey(value, k);
    }
  }
  return document.setFlag(packageId, key, value);
}

/**
 * Round a number to a fixed number of decimals.
 * @param {number} number
 * @param {number} decimals
 * @returns {number}
 */
export function roundToDecimals(number, decimals) {
  return Number(Math.round(number + "e" + decimals) + "e-" + decimals);
}

/**
 * Return a copy of an object without a given key.
 * @param {object} object
 * @param {string|number|symbol} key
 * @returns {object}
 */
export function omit(object, key) {
  const { [key]: _omitted, ...rest } = object;
  return rest;
}

/**
 * Resolve module dialog colors from CSS variables.
 * @returns {{baseColor:string, highlightColor:string}}
 */
export function getDialogColors() {
  const rgbColor = getCssVarValue("--color-warm-2");
  const rgbColorHighlight = getCssVarValue("--color-warm-3");
  const baseColor = addAlphaToRgb(rgbColor, 1);
  const highlightColor = addAlphaToRgb(rgbColorHighlight, 1);
  return { baseColor, highlightColor };
}

/**
 * Resolve a CSS variable to a computed color value.
 * @param {string} varName
 * @returns {string}
 * @private
 */
function getCssVarValue(varName) {
  const el = document.createElement("div");
  el.style.color = `var(${varName})`;
  el.style.display = "none";
  document.body.appendChild(el);
  const computed = getComputedStyle(el).color;
  document.body.removeChild(el);
  return computed;
}

/**
 * Convert an rgb() string to rgba() with custom alpha.
 * @param {string} rgbString
 * @param {number} alpha
 * @returns {string}
 * @private
 */
function addAlphaToRgb(rgbString, alpha) {
  const m = rgbString.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})` : rgbString;
}

/**
 * Toggle a named particle effect in the current scene.
 * @param {{name:string,type:string,options:object}} parameters
 * @returns {Promise<void>}
 */
export async function onSwitchParticleEffects(parameters) {
  if (!canvas.scene) return;
  const current = canvas.scene.getFlag(packageId, "effects") ?? {};
  const key = `core_${parameters.type}`;
  const disable = key in current;
  const effects = disable
    ? omit(current, key)
    : { ...current, [key]: { type: parameters.type, options: parameters.options } };

  if (Object.keys(effects).length === 0) await canvas.scene.unsetFlag(packageId, "effects");
  else await resetFlag(canvas.scene, "effects", effects);
}

/**
 * Replace current scene particle effects with a new set.
 * @param {Array<object>} parametersArray
 * @returns {Promise<void>}
 */
export async function onUpdateParticleEffects(parametersArray) {
  if (!canvas.scene) return;
  const scene = canvas.scene;
  const old = scene.getFlag(packageId, "effects") || {};
  const added = Object.fromEntries(parametersArray.map((p) => [foundry.utils.randomID(), p]));
  const merged = foundry.utils.mergeObject(old, added, { inplace: false });
  await resetFlag(canvas.scene, "effects", merged);
}

/**
 * Cleanup filter effects for a deleted region.
 * @param {string} regionId
 */
export function cleanupRegionFilterEffects(regionId) {
  try {
    canvas.filtereffects?.destroyRegionFilterEffects?.(regionId);
  } catch {}
}

/**
 * Cleanup particle effects for a deleted region.
 * @param {string} regionId
 */
export function cleanupRegionParticleEffects(regionId) {
  try {
    canvas.particleeffects?.destroyRegionParticleEffects?.(regionId);
  } catch {}
}

/**
 * Parse and cache special FX definitions.
 * @returns {Promise<void>}
 */
export async function parseSpecialEffects() {
  let effectsMap = game.settings.get(packageId, "dbSpecialEffects") || {};
  if (!effectsMap || typeof effectsMap !== "object") effectsMap = {};

  CONFIG.fxmaster.userSpecials = effectsMap;
}

/**
 * Get the renderer pixel rectangle.
 * @returns {PIXI.Rectangle}
 */
export function pixelsArea() {
  const r = canvas?.app?.renderer;
  if (!r) return new PIXI.Rectangle(0, 0, 0, 0);
  const { width, height } = r.view;
  return new PIXI.Rectangle(0, 0, width | 0, height | 0);
}

export const clampRange = (v, lo, hi, def) => (Number.isFinite((v = Number(v))) ? Math.min(Math.max(v, lo), hi) : def);
export const clamp01 = (v, def) => clampRange(v, 0, 1, def);
export const clampNonNeg = (v, def = 0) => (Number.isFinite((v = Number(v))) ? Math.max(0, v) : def);
export const clampMin = (v, m = 1e-4, def) => (Number.isFinite((v = Number(v))) ? Math.max(v, m) : def);
export const num = (v, d = 0) => (v === undefined || v === null || Number.isNaN(Number(v)) ? d : Number(v));
export const asFloat3 = (arr) => new Float32Array([arr[0], arr[1], arr[2]]);

const TAU = Math.PI * 2;

/** @type {PIXI.Sprite|null} */
let _tmpRTCopySprite = null;
let _tmpTokensEraseSprite = null;

/** @type {{ solids: PIXI.Graphics, holes: PIXI.Graphics }|null} */
let _regionMaskGfx = null;

/** @returns {{ solids: PIXI.Graphics, holes: PIXI.Graphics }} */
function _getRegionMaskGfx() {
  if (_regionMaskGfx?.solids && _regionMaskGfx?.holes) return _regionMaskGfx;
  _regionMaskGfx = { solids: new PIXI.Graphics(), holes: new PIXI.Graphics() };
  return _regionMaskGfx;
}

/** @type {{ bg: PIXI.Graphics, scene: PIXI.Graphics, solids: PIXI.Graphics, holes: PIXI.Graphics }|null} */
let _sceneAllowMaskGfx = null;

/** @returns {{ bg: PIXI.Graphics, scene: PIXI.Graphics, solids: PIXI.Graphics, holes: PIXI.Graphics }} */
function _getSceneAllowMaskGfx() {
  if (_sceneAllowMaskGfx?.bg && _sceneAllowMaskGfx?.scene && _sceneAllowMaskGfx?.solids && _sceneAllowMaskGfx?.holes)
    return _sceneAllowMaskGfx;
  _sceneAllowMaskGfx = {
    bg: new PIXI.Graphics(),
    scene: new PIXI.Graphics(),
    solids: new PIXI.Graphics(),
    holes: new PIXI.Graphics(),
  };
  return _sceneAllowMaskGfx;
}

/**
 * Interpret a belowTokens option consistently.
 * Supports:
 * - boolean
 * - { value: boolean }
 * @param {*} v
 * @returns {boolean}
 * @private
 */
function _belowTokensEnabled(v) {
  if (v === true) return true;
  if (v && typeof v === "object" && "value" in v) return !!v.value;
  return !!v;
}

/**
 * Rotate a point around a center by radians.
 * @param {number} px
 * @param {number} py
 * @param {number} cx
 * @param {number} cy
 * @param {number} angleRad
 * @returns {{x:number,y:number}}
 * @private
 */
function rotatePoint(px, py, cx, cy, angleRad) {
  if (!angleRad) return { x: px, y: py };
  const s = Math.sin(angleRad),
    c = Math.cos(angleRad);
  const dx = px - cx,
    dy = py - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

/**
 * Centroid of a set of points.
 * @param {{x:number,y:number}[]} points
 * @returns {{x:number,y:number}}
 * @private
 */
function centroid(points) {
  if (!points?.length) return { x: 0, y: 0 };

  if (typeof points[0] === "number") {
    const n = (points.length / 2) | 0;
    if (n <= 0) return { x: 0, y: 0 };
    let sx = 0,
      sy = 0;
    for (let i = 0; i < n; i++) {
      sx += points[2 * i];
      sy += points[2 * i + 1];
    }
    return { x: sx / n, y: sy / n };
  }

  let sx = 0,
    sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

/**
 * Convert a rotated rectangle to polygon points.
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} rotRad
 * @returns {{x:number,y:number}[]}
 * @private
 */
function rectToPolygon(x, y, w, h, rotRad) {
  if (!rotRad)
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  const cx = x + w / 2,
    cy = y + h / 2;
  const corners = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  return corners.map((p) => rotatePoint(p.x, p.y, cx, cy, rotRad));
}

/**
 * Approximate a rotated ellipse by a polygon.
 * @param {number} cx
 * @param {number} cy
 * @param {number} rx
 * @param {number} ry
 * @param {number} rotRad
 * @param {number} [segments=48]
 * @returns {{x:number,y:number}[]}
 * @private
 */
function ellipseToPolygon(cx, cy, rx, ry, rotRad, segments = 48) {
  if (!segments || segments < 8) segments = 8;
  const poly = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * TAU;
    const px = cx + rx * Math.cos(a);
    const py = cy + ry * Math.sin(a);
    poly.push(rotRad ? rotatePoint(px, py, cx, cy, rotRad) : { x: px, y: py });
  }
  return poly;
}

/**
 * Trace a region shape into a PIXI.Graphics path.
 * @param {PIXI.Graphics} g
 * @param {object} s
 * @param {{ ellipseSegments?: number }} [opts]
 */
function traceRegionShapePIXI(g, s, opts = {}) {
  if (!g || !s) return;

  if (typeof s.drawShape === "function") {
    try {
      s.drawShape(g);
      return;
    } catch {}
  }

  if (Array.isArray(s?.polygons) && s.polygons.length) {
    for (const poly of s.polygons) {
      if (!poly) continue;
      g.drawShape(poly);
    }
    return;
  }

  const type = s?.type;
  const rotRad = ((s?.rotation || 0) * Math.PI) / 180;
  const ellipseSegments = Number.isFinite(opts.ellipseSegments) ? Math.max(8, opts.ellipseSegments | 0) : 48;

  if (type === "polygon") {
    const pts = s.points ?? [];
    if (!pts.length) return;
    if (!rotRad) {
      g.drawShape(new PIXI.Polygon(pts));
      return;
    }
    const c = centroid(pts);
    /**
     * Region polygons may represent points as either an array of {x, y} objects or as a flat
     * number array [x0, y0, x1, y1, ...].
     */
    if (typeof pts[0] === "number") {
      const rotFlat = [];
      for (let i = 0; i + 1 < pts.length; i += 2) {
        const rp = rotatePoint(pts[i], pts[i + 1], c.x, c.y, rotRad);
        rotFlat.push(rp.x, rp.y);
      }
      g.drawShape(new PIXI.Polygon(rotFlat));
      return;
    }
    const rotPts = pts.map((p) => rotatePoint(p.x, p.y, c.x, c.y, rotRad));
    g.drawShape(new PIXI.Polygon(rotPts));
    return;
  }

  if (type === "ellipse" || type === "circle") {
    const cx = s.x ?? 0,
      cy = s.y ?? 0;
    const rx = Math.max(0, type === "circle" ? s.radius ?? 0 : s.radiusX ?? 0);
    const ry = Math.max(0, type === "circle" ? s.radius ?? 0 : s.radiusY ?? 0);
    if (!rotRad) {
      g.drawEllipse(cx, cy, rx, ry);
      return;
    }
    const poly = ellipseToPolygon(cx, cy, rx, ry, rotRad, ellipseSegments);
    g.drawShape(new PIXI.Polygon(poly));
    return;
  }

  if (type === "rectangle") {
    const x = s.x ?? 0,
      y = s.y ?? 0,
      w = s.width ?? 0,
      h = s.height ?? 0;
    if (!rotRad) {
      g.drawRect(x, y, w, h);
      return;
    }
    const poly = rectToPolygon(x, y, w, h, rotRad);
    g.drawShape(new PIXI.Polygon(poly));
    return;
  }

  if (Array.isArray(s?.points) && s.points.length) {
    g.drawShape(new PIXI.Polygon(s.points));
  }
}

/**
 * Trace a region shape into a Canvas2D path.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} s
 */
export function traceRegionShapePath2D(ctx, s) {
  if (!ctx || !s) return;

  const polys = s?.polygons;
  if (Array.isArray(polys) && polys.length) {
    for (const poly of polys) {
      const pts = poly?.points ?? poly;
      if (!pts || pts.length < 6) continue;
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath();
    }
    return;
  }

  const type = s?.type;
  const rotRad = ((s?.rotation || 0) * Math.PI) / 180;

  ctx.save();
  if (rotRad) {
    let cx = 0,
      cy = 0;
    if (type === "polygon") {
      const c = centroid(s.points ?? []);
      cx = c.x;
      cy = c.y;
    } else if (type === "ellipse" || type === "circle") {
      cx = s.x ?? 0;
      cy = s.y ?? 0;
    } else if (type === "rectangle") {
      const x = s.x ?? 0,
        y = s.y ?? 0,
        w = s.width ?? 0,
        h = s.height ?? 0;
      cx = x + w / 2;
      cy = y + h / 2;
    }
    ctx.translate(cx, cy);
    ctx.rotate(rotRad);
    ctx.translate(-cx, -cy);
  }

  if (type === "polygon") {
    const pts = s.points ?? [];
    if (!pts.length) {
      ctx.restore();
      return;
    }
    ctx.beginPath();
    /**
     * Region polygons may represent points as either an array of {x, y} objects or as a flat
     * number array [x0, y0, x1, y1, ...].
     */
    if (typeof pts[0] === "number") {
      if (pts.length < 4) {
        ctx.restore();
        return;
      }
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    } else {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.restore();
    return;
  }

  if (type === "ellipse" || type === "circle") {
    const cx = s.x ?? 0,
      cy = s.y ?? 0;
    const rx = Math.max(0, type === "circle" ? s.radius ?? 0 : s.radiusX ?? 0);
    const ry = Math.max(0, type === "circle" ? s.radius ?? 0 : s.radiusY ?? 0);
    ctx.beginPath();
    if (typeof ctx.ellipse === "function") ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    else {
      const pts = ellipseToPolygon(cx, cy, rx, ry, 0, 48);
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
    }
    ctx.restore();
    return;
  }

  if (type === "rectangle") {
    const x = s.x ?? 0,
      y = s.y ?? 0,
      w = s.width ?? 0,
      h = s.height ?? 0;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.closePath();
    ctx.restore();
    return;
  }

  if (Array.isArray(s?.points) && s.points.length) {
    const pts = s.points;
    ctx.beginPath();
    /** Some shapes provide points as a flat number array [x0, y0, ...]. */
    if (typeof pts[0] === "number") {
      if (pts.length >= 4) {
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      }
    } else {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.restore();
  }
}

/**
 * Return snapped camera translation in CSS space and fractional offset.
 * @returns {{ txCss: number, tyCss: number, txSnapCss: number, tySnapCss: number, camFracX: number, camFracY: number }}
 */
export function getSnappedCameraCss() {
  const r = canvas?.app?.renderer;
  const res = r?.resolution || window.devicePixelRatio || 1;
  const stageM = canvas.stage?.worldTransform ?? PIXI.Matrix.IDENTITY;

  const txCss = stageM.tx;
  const tyCss = stageM.ty;

  const txSnapCss = Math.round(txCss * res) / res;
  const tySnapCss = Math.round(tyCss * res) / res;

  const camFracX = txCss - txSnapCss;
  const camFracY = tyCss - tySnapCss;

  return { txCss, tyCss, txSnapCss, tySnapCss, camFracX, camFracY };
}

/**
 * Return a pixel-snapped stage matrix (device px), aligned to CSS grid.
 */
export function snappedStageMatrix(stage = canvas.stage) {
  const M = stage.worldTransform.clone();

  const { txSnapCss, tySnapCss } = getSnappedCameraCss();

  M.tx = txSnapCss;
  M.ty = tySnapCss;

  return M;
}

/**
 * Convert a PIXI.Matrix to a column-major 3x3 matrix.
 * @param {PIXI.Matrix} M
 * @returns {Float32Array}
 */
export function mat3FromPixi(M) {
  return new Float32Array([M.a, M.b, 0, M.c, M.d, 0, M.tx, M.ty, 1]);
}

/**
 * Estimate tessellation steps for an ellipse under a given transform.
 * @param {number} rx
 * @param {number} ry
 * @param {PIXI.Matrix} [stageMatrix]
 * @returns {number}
 */
export function ellipseSteps(rx, ry, stageMatrix = canvas.stage.worldTransform) {
  const sx = Math.hypot(stageMatrix.a, stageMatrix.b);
  const sy = Math.hypot(stageMatrix.c, stageMatrix.d);
  const rxS = Math.max(1, rx * sx);
  const ryS = Math.max(1, ry * sy);
  const p = Math.PI * (3 * (rxS + ryS) - Math.sqrt((3 * rxS + ryS) * (rxS + 3 * ryS)));
  return Math.ceil(Math.max(64, Math.min(512, p / 2)));
}

/**
 * Compute world-space AABB of a region's non-hole shapes.
 * @param {PlaceableObject} placeable
 * @returns {{minX:number,minY:number,maxX:number,maxY:number}|null}
 */
export function regionWorldBounds(placeable) {
  const shapes = placeable?.document?.shapes ?? [];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const include = (x, y) => {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  };
  for (const s of shapes) {
    if (!s || s.hole) continue;

    const b = s?.bounds;
    if (b && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.width) && Number.isFinite(b.height)) {
      include(b.x, b.y);
      include(b.x + b.width, b.y + b.height);
      continue;
    }

    const polys = s?.polygons;
    if (Array.isArray(polys) && polys.length) {
      for (const poly of polys) {
        const pts = poly?.points ?? poly;
        if (!pts || pts.length < 2) continue;
        for (let i = 0; i + 1 < pts.length; i += 2) include(pts[i], pts[i + 1]);
      }
      continue;
    }

    if (s.type === "rectangle") {
      include(s.x, s.y);
      include(s.x + s.width, s.y + s.height);
    } else if (s.type === "ellipse" || s.type === "circle") {
      const rx = Math.max(0, s.type === "circle" ? s.radius ?? 0 : s.radiusX ?? 0);
      const ry = Math.max(0, s.type === "circle" ? s.radius ?? 0 : s.radiusY ?? 0);
      include(s.x - rx, s.y - ry);
      include(s.x + rx, s.y + ry);
    } else {
      const pts = s.points || [];
      if (typeof pts[0] === "object") for (const p of pts) include(p.x, p.y);
      else for (let i = 0; i + 1 < pts.length; i += 2) include(pts[i], pts[i + 1]);
    }
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Compute a CSS-aligned world AABB (holes ignored).
 * @param {PlaceableObject} placeable
 * @returns {{minX:number,minY:number,maxX:number,maxY:number}|null}
 */
export function regionWorldBoundsAligned(placeable) {
  const Ms = snappedStageMatrix();
  const Minv = Ms.clone().invert();
  const toCss = (x, y) => ({ x: Ms.a * x + Ms.c * y + Ms.tx, y: Ms.b * x + Ms.d * y + Ms.ty });
  const toWorld = (x, y) => ({ x: Minv.a * x + Minv.c * y + Minv.tx, y: Minv.b * x + Minv.d * y + Minv.ty });

  let cssMinX = Infinity,
    cssMinY = Infinity,
    cssMaxX = -Infinity,
    cssMaxY = -Infinity;
  const includeCss = (X, Y) => {
    cssMinX = Math.min(cssMinX, X);
    cssMaxX = Math.max(cssMaxX, X);
    cssMinY = Math.min(cssMinY, Y);
    cssMaxY = Math.max(cssMaxY, Y);
  };

  for (const s of placeable?.document?.shapes ?? []) {
    if (!s || s.hole) continue;

    const b = s?.bounds;
    if (b && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.width) && Number.isFinite(b.height)) {
      const a = toCss(b.x, b.y);
      const b2 = toCss(b.x + b.width, b.y);
      const c = toCss(b.x + b.width, b.y + b.height);
      const d = toCss(b.x, b.y + b.height);
      includeCss(a.x, a.y);
      includeCss(b2.x, b2.y);
      includeCss(c.x, c.y);
      includeCss(d.x, d.y);
      continue;
    }

    const polys = s?.polygons;
    if (Array.isArray(polys) && polys.length) {
      for (const poly of polys) {
        const pts = poly?.points ?? poly;
        if (!pts || pts.length < 2) continue;
        for (let i = 0; i + 1 < pts.length; i += 2) {
          const q = toCss(pts[i], pts[i + 1]);
          includeCss(q.x, q.y);
        }
      }
      continue;
    }
    if (s.type === "rectangle") {
      const a = toCss(s.x, s.y),
        b = toCss(s.x + s.width, s.y),
        c = toCss(s.x + s.width, s.y + s.height),
        d = toCss(s.x, s.y + s.height);
      includeCss(a.x, a.y);
      includeCss(b.x, b.y);
      includeCss(c.x, c.y);
      includeCss(d.x, d.y);
    } else if (s.type === "ellipse" || s.type === "circle") {
      const rx = Math.max(0, s.type === "circle" ? s.radius ?? 0 : s.radiusX ?? 0);
      const ry = Math.max(0, s.type === "circle" ? s.radius ?? 0 : s.radiusY ?? 0);
      const steps = ellipseSteps(rx, ry, Ms);
      for (let i = 0; i < steps; i++) {
        const t = (i / steps) * TAU;
        const p = toCss(s.x + rx * Math.cos(t), s.y + ry * Math.sin(t));
        includeCss(p.x, p.y);
      }
    } else {
      const pts = s.points || [];
      if (typeof pts[0] === "object")
        for (const p of pts) {
          const q = toCss(p.x, p.y);
          includeCss(q.x, q.y);
        }
      else
        for (let i = 0; i + 1 < pts.length; i += 2) {
          const q = toCss(pts[i], pts[i + 1]);
          includeCss(q.x, q.y);
        }
    }
  }
  if (!Number.isFinite(cssMinX)) return null;
  const wTL = toWorld(cssMinX, cssMinY),
    wTR = toWorld(cssMaxX, cssMinY),
    wBR = toWorld(cssMaxX, cssMaxY),
    wBL = toWorld(cssMinX, cssMaxY);
  const eps = 1e-3;
  return {
    minX: Math.min(wTL.x, wTR.x, wBR.x, wBL.x) + eps,
    minY: Math.min(wTL.y, wTR.y, wBR.y, wBL.y) + eps,
    maxX: Math.max(wTL.x, wTR.x, wBR.x, wBL.x) - eps,
    maxY: Math.max(wTL.y, wTR.y, wBR.y, wBL.y) - eps,
  };
}

/**
 * Convert bounds to a rectangle object.
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} rb
 * @returns {{x:number,y:number,width:number,height:number}}
 */
export function rectFromAligned(rb) {
  const x = rb.minX,
    y = rb.minY,
    w = rb.maxX - rb.minX,
    h = rb.maxY - rb.minY;
  if (!(w > 0 && h > 0)) throw new Error("invalid bounds");
  return { x, y, width: w, height: h };
}

/**
 * Compute a rectangle from raw shapes.
 * @param {Array<object>} shapes
 * @returns {{x:number,y:number,width:number,height:number}}
 */
export function rectFromShapes(shapes) {
  const b = regionWorldBounds({ document: { shapes } });
  if (!b) throw new Error("no shapes");
  return { x: b.minX, y: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY };
}

/**
 * Build polygon edges (Ax,Ay,Bx,By)* for SDF or fades.
 * @param {PlaceableObject} placeable
 * @returns {Float32Array}
 */
export function buildPolygonEdges(placeable, { maxEdges = Infinity } = {}) {
  const polys = [];

  const toFlat = (pts) => {
    if (!pts) return null;

    if (typeof pts[0] === "number") return Array.from(pts);
    if (typeof pts[0] === "object") {
      const out = [];
      for (const p of pts) {
        if (!p) continue;
        out.push(p.x, p.y);
      }
      return out;
    }
    return null;
  };

  const normalizeFlat = (flat) => {
    if (!Array.isArray(flat) || flat.length < 6) return null;
    const n = (flat.length / 2) | 0;
    if (n < 3) return null;

    let m = n;

    const lx = flat[2 * (n - 1)];
    const ly = flat[2 * (n - 1) + 1];
    if (lx === flat[0] && ly === flat[1]) m = n - 1;
    if (m < 3) return null;

    return flat.slice(0, m * 2);
  };

  const addPoly = (pts) => {
    const flat = normalizeFlat(toFlat(pts));
    if (!flat) return;
    const m = (flat.length / 2) | 0;
    polys.push({ flat, m });
  };

  const isEmptyShape = (s) => {
    try {
      if (typeof s?.isEmpty === "function") return !!s.isEmpty();
      return !!s?.isEmpty;
    } catch {
      return false;
    }
  };

  for (const s of placeable?.document?.shapes ?? []) {
    if (!s) continue;
    if (isEmptyShape(s)) continue;

    if (Array.isArray(s?.polygons) && s.polygons.length) {
      for (const poly of s.polygons) {
        if (!poly) continue;
        addPoly(poly?.points ?? poly);
      }
      continue;
    }

    const type = s?.type;
    const rotRad = ((s?.rotation || 0) * Math.PI) / 180;

    if (type === "polygon") {
      const pts = s.points ?? [];
      if (!pts?.length) continue;
      if (!rotRad) {
        addPoly(pts);
        continue;
      }

      if (typeof pts[0] === "object") {
        const c = centroid(pts);
        const rotPts = pts.map((p) => rotatePoint(p.x, p.y, c.x, c.y, rotRad));
        addPoly(rotPts);
      } else {
        const c = centroid(pts);
        const rotPts = [];
        const n = (pts.length / 2) | 0;
        for (let i = 0; i < n; i++) {
          const rp = rotatePoint(pts[2 * i], pts[2 * i + 1], c.x, c.y, rotRad);
          rotPts.push(rp);
        }
        addPoly(rotPts);
      }
      continue;
    }

    if (type === "rectangle") {
      const x = s.x ?? 0,
        y = s.y ?? 0,
        w = s.width ?? 0,
        h = s.height ?? 0;
      addPoly(rectToPolygon(x, y, w, h, rotRad));
      continue;
    }

    if (type === "ellipse" || type === "circle") {
      const cx = s.x ?? 0,
        cy = s.y ?? 0;
      const rx = Math.max(0, type === "circle" ? s.radius ?? 0 : s.radiusX ?? 0);
      const ry = Math.max(0, type === "circle" ? s.radius ?? 0 : s.radiusY ?? 0);
      addPoly(ellipseToPolygon(cx, cy, rx, ry, rotRad, 48));
      continue;
    }

    if (Array.isArray(s?.points) && s.points.length) addPoly(s.points);
  }

  if (!polys.length) return new Float32Array();

  const totalEdges = polys.reduce((a, p) => a + p.m, 0) || 0;
  if (totalEdges <= 0) return new Float32Array();

  let cap = Number(maxEdges);
  if (!Number.isFinite(cap) || cap <= 0) cap = totalEdges;
  cap = Math.min(totalEdges, cap);

  const polyCount = polys.length;
  let minPer = 3;
  if (polyCount * minPer > cap) minPer = 2;
  if (polyCount * minPer > cap) minPer = 1;

  const alloc = polys.map((p) => {
    const share = (cap * p.m) / totalEdges;
    let a = Math.round(share);
    a = Math.max(minPer, a);
    a = Math.min(p.m, a);
    return a;
  });

  let sumAlloc = alloc.reduce((a, b) => a + b, 0);

  while (sumAlloc > cap) {
    let idx = -1;
    let best = -1;
    for (let i = 0; i < alloc.length; i++) {
      const slack = alloc[i] - minPer;
      if (slack > best) {
        best = slack;
        idx = i;
      }
    }
    if (idx < 0 || alloc[idx] <= minPer) break;
    alloc[idx] -= 1;
    sumAlloc -= 1;
  }

  while (sumAlloc < cap) {
    let idx = -1;
    let bestScore = -1;
    for (let i = 0; i < alloc.length; i++) {
      if (alloc[i] >= polys[i].m) continue;

      const score = polys[i].m / Math.max(1, alloc[i]);
      if (score > bestScore) {
        bestScore = score;
        idx = i;
      }
    }
    if (idx < 0) break;
    alloc[idx] += 1;
    sumAlloc += 1;
  }

  const edges = [];

  const emitEdges = (flat, m, want) => {
    if (m < 2 || want < 2) return;

    let idxs;
    if (want >= m) {
      idxs = Array.from({ length: m }, (_, i) => i);
    } else {
      idxs = [];
      const step = m / want;
      let last = -1;
      for (let i = 0; i < want; i++) {
        let k = Math.floor(i * step);
        if (k <= last) k = last + 1;
        if (k >= m) k = m - 1;
        idxs.push(k);
        last = k;
      }

      if (idxs.length >= 2 && idxs[0] == idxs[idxs.length - 1]) idxs.pop();
      if (idxs.length < 2) return;
    }

    const L = idxs.length;
    for (let i = 0; i < L; i++) {
      const a = idxs[i];
      const b = idxs[(i + 1) % L];
      edges.push(flat[2 * a], flat[2 * a + 1], flat[2 * b], flat[2 * b + 1]);
    }
  };

  for (let i = 0; i < polys.length; i++) {
    emitEdges(polys[i].flat, polys[i].m, alloc[i]);
  }

  return new Float32Array(edges);
}

/**
 * Determine if a region has multiple non-hole shapes.
 * @param {PlaceableObject} placeable
 * @returns {boolean}
 */
export function hasMultipleNonHoleShapes(placeable) {
  let n = 0;
  for (const s of placeable?.document?.shapes ?? []) {
    if (!s || s.hole) continue;

    const empty = typeof s.isEmpty === "function" ? s.isEmpty() : !!s.isEmpty;
    if (empty) continue;
    if (!s.type) continue;
    if (++n > 1) return true;
  }
  return false;
}

/**
 * Convert a percentage to a world fade width based on region min-side.
 * @param {PlaceableObject} placeable
 * @param {number} pctLike
 * @returns {number}
 */
export function edgeFadeWorldWidth(placeable, pctLike) {
  const b = regionWorldBounds(placeable) ?? regionWorldBoundsAligned(placeable);
  if (!b) return 1e-6;
  const w = Math.max(1e-6, b.maxX - b.minX);
  const h = Math.max(1e-6, b.maxY - b.minY);
  const frac = Math.max(0, Number(pctLike) || 0);
  const f = frac > 1 ? Math.min(1, frac / 100) : frac;
  return Math.max(1e-6, Math.min(w, h) * f);
}

/**
 * Estimate the maximum interior distance ("inradius") for a single region shape.
 *
 * This value is used to scale Edge Fade % for polygon-based shapes where there's no cheap analytic inradius (e.g. line, cone, ring, emanation, token, polygon).
 *
 * The estimate is intentionally conservative, because an over-estimate can cause Edge Fade % to completely fade out small shapes.
 *
 * @param {object} shape
 * @returns {number}
 */
export function estimateShapeInradiusWorld(shape) {
  if (!shape) return 0;

  const raw = shape;
  const data = typeof raw?.toObject === "function" ? raw.toObject() : raw;
  const type = raw?.type ?? data?.type;

  const num = (v, d = NaN) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const pos = (v) => {
    const n = num(v);
    return Number.isFinite(n) ? Math.max(0, n) : NaN;
  };

  const b = raw?.bounds ?? data?.bounds;
  const bw = Number.isFinite(b?.width) ? Math.max(0, b.width) : NaN;
  const bh = Number.isFinite(b?.height) ? Math.max(0, b.height) : NaN;
  const minSide = Number.isFinite(bw) && Number.isFinite(bh) ? Math.min(bw, bh) : NaN;

  if (type === "circle") {
    const r = pos(raw?.radius ?? data?.radius);
    if (Number.isFinite(r)) return r;
    if (Number.isFinite(minSide)) return 0.5 * minSide;
  }
  if (type === "ellipse") {
    const rx = pos(raw?.radiusX ?? data?.radiusX);
    const ry = pos(raw?.radiusY ?? data?.radiusY);
    if (Number.isFinite(rx) && Number.isFinite(ry)) return Math.min(rx, ry);
    if (Number.isFinite(minSide)) return 0.25 * minSide;
  }
  if (type === "rectangle" || type === "token") {
    const w = pos(raw?.width ?? data?.width);
    const h = pos(raw?.height ?? data?.height);
    if (Number.isFinite(w) && Number.isFinite(h)) return 0.5 * Math.min(w, h);
    if (Number.isFinite(minSide)) return 0.5 * minSide;
  }

  if (type === "ring") {
    const thick = pos(raw?.width ?? data?.width ?? raw?.thickness ?? data?.thickness);
    if (Number.isFinite(thick) && thick > 0) return 0.5 * thick;

    const outer = pos(raw?.outerRadius ?? data?.outerRadius ?? raw?.radius ?? data?.radius);
    const inner = pos(raw?.innerRadius ?? data?.innerRadius);
    if (Number.isFinite(outer) && Number.isFinite(inner)) return Math.max(0, 0.5 * (outer - inner));

    const R = Number.isFinite(outer) ? outer : Number.isFinite(minSide) ? 0.5 * minSide : NaN;
    const A = pos(raw?.area ?? data?.area);
    if (Number.isFinite(R) && Number.isFinite(A) && A > 0) {
      const ri2 = Math.max(0, R * R - A / Math.PI);
      const ri = Math.sqrt(ri2);
      return Math.max(0, 0.5 * (R - ri));
    }

    if (Number.isFinite(minSide)) return 0.125 * minSide;
  }

  if (type === "line") {
    const A = pos(raw?.area ?? data?.area);

    const thick = pos(raw?.width ?? data?.width ?? raw?.thickness ?? data?.thickness);
    if (Number.isFinite(thick) && thick > 0) return 0.5 * thick;

    const L = pos(raw?.length ?? data?.length ?? raw?.distance ?? data?.distance);
    const major = Number.isFinite(bw) && Number.isFinite(bh) ? Math.max(bw, bh) : NaN;
    const len = Number.isFinite(L) && L > 0 ? L : major;
    if (Number.isFinite(A) && A > 0 && Number.isFinite(len) && len > 0) {
      const approxT = A / len;
      if (Number.isFinite(approxT) && approxT > 0) return 0.5 * approxT;
    }

    if (Number.isFinite(minSide)) return 0.5 * minSide;
  }

  if (type === "cone") {
    const R = pos(raw?.radius ?? data?.radius ?? raw?.distance ?? data?.distance);
    const angleDeg = pos(raw?.angle ?? data?.angle);
    if (Number.isFinite(R) && Number.isFinite(angleDeg) && angleDeg > 0) {
      const theta = (angleDeg * Math.PI) / 180;
      const s = Math.sin(theta / 2);
      const rin = (R * s) / (1 + s);
      if (Number.isFinite(rin) && rin > 0) return rin;
    }
    if (Number.isFinite(minSide)) return 0.25 * minSide;
  }

  if (type === "emanation") {
    const base = raw?.shape ?? raw?.base ?? raw?.sourceShape ?? raw?.source ?? data?.shape ?? data?.base;
    const dist = pos(raw?.distance ?? data?.distance ?? raw?.padding ?? data?.padding ?? raw?.offset ?? data?.offset);
    if (base && Number.isFinite(dist)) {
      const r0 = estimateShapeInradiusWorld(base);
      if (Number.isFinite(r0) && r0 > 0) return r0 + dist;
    }
    if (Number.isFinite(minSide)) return 0.25 * minSide;
  }

  if (Number.isFinite(minSide)) return 0.25 * minSide;

  const w = pos(raw?.width ?? data?.width);
  const h = pos(raw?.height ?? data?.height);
  if (Number.isFinite(w) && Number.isFinite(h)) return 0.25 * Math.min(w, h);

  return 0;
}

/**
 * Estimate the region inradius used to scale Edge Fade % for polygon-based fades.
 *
 * For Regions composed of multiple shapes, Edge Fade % should not completely fade
 * out smaller sub-shapes. Use the minimum per-shape inradius as the scaling reference.
 *
 * @param {PlaceableObject} placeable
 * @returns {number}
 */
export function estimateRegionInradius(placeable) {
  const shapes = placeable?.document?.shapes ?? [];

  let minR = Infinity;
  let maxR = 0;
  for (const s of shapes) {
    if (!s || s.hole) continue;
    const empty = typeof s.isEmpty === "function" ? s.isEmpty() : !!s.isEmpty;
    if (empty) continue;
    const r = estimateShapeInradiusWorld(s);
    if (Number.isFinite(r) && r > 0) {
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
    }
  }

  if (minR !== Infinity) {
    const CAP_RATIO = 3.0;
    const ref = Math.min(maxR || minR, minR * CAP_RATIO);
    return Math.max(1e-6, ref);
  }

  const b = regionWorldBounds(placeable) ?? regionWorldBoundsAligned(placeable);
  if (b && [b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite)) {
    const w = Math.max(1e-6, b.maxX - b.minX);
    const h = Math.max(1e-6, b.maxY - b.minY);
    return Math.max(1e-6, 0.25 * Math.min(w, h));
  }

  return 1e-6;
}

/**
 * Get the event gate settings for a region behavior.
 * @param {PlaceableObject} placeable
 * @param {string} behaviorType
 * @returns {{mode:string,latched:boolean}}
 */
export function getEventGate(placeable, behaviorType) {
  const fxBeh = placeable?.document?.behaviors?.find((b) => b.type === behaviorType && !b.disabled);
  if (!fxBeh) return { mode: "none", latched: false };
  const eg = fxBeh.getFlag?.("fxmaster", "eventGate");
  return { mode: eg?.mode ?? "none", latched: !!eg?.latched };
}

/**
 * Get the elevation window for a region.
 * @param {foundry.abstract.Document} doc
 * @returns {{min:number,max:number}|null}
 */
export function getRegionElevationWindow(doc) {
  const top = doc?.elevation?.top,
    bottom = doc?.elevation?.bottom;
  const hasTop = top !== undefined && top !== null && `${top}`.trim() !== "";
  const hasBottom = bottom !== undefined && bottom !== null && `${bottom}`.trim() !== "";
  if (!hasTop && !hasBottom) return null;
  return { min: hasBottom ? Number(bottom) : -Infinity, max: hasTop ? Number(top) : +Infinity };
}

/**
 * Test whether an elevation lies within a window.
 * @param {number} elev
 * @param {{min:number,max:number}} win
 * @returns {boolean}
 */
export const inRangeElev = (elev, win) => elev >= win.min && elev <= win.max;

/**
 * RenderTexture pool.
 */
export class RTPool {
  /**
   * @param {{maxPerKey?:number}} [opts]
   */
  constructor({ maxPerKey = 8 } = {}) {
    this._pool = new Map();
    this._maxPerKey = Math.max(1, maxPerKey | 0);
  }
  /**
   * @param {number} w
   * @param {number} h
   * @param {number} [res=1]
   * @returns {string}
   * @private
   */
  _key(w, h, res = 1) {
    return `${w | 0}x${h | 0}@${res || 1}`;
  }

  /**
   * Acquire a RenderTexture.
   * @param {number} w
   * @param {number} h
   * @param {number} [res=1]
   * @returns {PIXI.RenderTexture}
   */
  acquire(w, h, res = 1) {
    const key = this._key(w, h, res);
    const list = this._pool.get(key);
    if (list && list.length) {
      const rt = list.pop();
      if (list.length) this._pool.set(key, list);
      else this._pool.delete(key);
      return rt;
    }
    return PIXI.RenderTexture.create({ width: w | 0, height: h | 0, resolution: res || 1 });
  }

  /**
   * Release a RenderTexture back to the pool.
   * @param {PIXI.RenderTexture} rt
   */
  release(rt) {
    if (!rt) return;
    try {
      const key = this._key(rt.width | 0, rt.height | 0, rt.resolution || 1);
      const list = this._pool.get(key) || [];
      list.push(rt);
      this._pool.set(key, list);
      while (list.length > this._maxPerKey) {
        const old = list.shift();
        try {
          old.destroy(true);
        } catch {}
      }
    } catch {
      try {
        rt.destroy(true);
      } catch {}
    }
  }

  /**
   * Destroy all pooled textures and clear the pool.
   */
  drain() {
    try {
      for (const list of this._pool.values())
        for (const rt of list)
          try {
            rt.destroy(true);
          } catch {}
    } finally {
      this._pool.clear();
    }
  }
}

/**
 * Collect token sprites in world space for alpha masking.
 * @param {{ respectOcclusion?: boolean, shouldIncludeToken?: (t: Token) => boolean }} [opts]
 * @returns {PIXI.Sprite[]}
 */
export function collectTokenAlphaSprites(opts = {}) {
  const respectOcc = !!opts.respectOcclusion;
  const shouldInclude = typeof opts.shouldIncludeToken === "function" ? opts.shouldIncludeToken : null;

  const out = [];
  for (const t of canvas.tokens?.placeables ?? []) {
    if (!t.visible || t.document.hidden) continue;

    if (t.hasDynamicRing) continue;

    if (respectOcc && _isTokenOccludedByOverhead(t)) continue;
    if (shouldInclude && !shouldInclude(t)) continue;

    const icon = t.mesh ?? t;
    const tex = icon?.texture;
    if (!tex?.baseTexture?.valid) continue;

    const spr = new PIXI.Sprite(tex);
    try {
      spr.anchor.set(icon.anchor?.x ?? 0.5, icon.anchor?.y ?? 0.5);
    } catch {}
    try {
      const stageLocal = stageLocalMatrixOf(icon);
      const vals = [stageLocal.a, stageLocal.b, stageLocal.c, stageLocal.d, stageLocal.tx, stageLocal.ty];
      if (!vals.every(Number.isFinite)) {
        spr.destroy(true);
        continue;
      }
      if (vals.some((v) => Math.abs(v) > 1e7)) {
        spr.destroy(true);
        continue;
      }
      spr.transform.setFromMatrix(stageLocal);
    } catch {
      try {
        spr.destroy(true);
      } catch {}
      continue;
    }
    out.push(spr);
  }
  return out;
}

export function stageLocalMatrixOf(displayObject) {
  const chain = [];
  let obj = displayObject;
  while (obj && obj !== canvas.stage) {
    chain.push(obj);
    obj = obj.parent;
  }
  const M = new PIXI.Matrix();
  for (let i = chain.length - 1; i >= 0; i--) {
    const lt = chain[i]?.transform?.localTransform || PIXI.Matrix.IDENTITY;
    M.append(lt);
  }
  return M;
}

/**
 * Return true if an overhead tile or something at higher elevation covers the token
 */
function _isTokenOccludedByOverhead(token) {
  if (token.controlled) return false;

  const candidates = canvas.primary.quadtree.getObjects(token.bounds);

  for (let candidate of candidates) {
    if (!candidate?.isOccludable) continue;
    const tElev = Number(token.elevation ?? 0);
    const candElev = Number(candidate.elevation ?? 0);
    if (Number.isFinite(candElev) && Number.isFinite(tElev) && candElev <= tElev) continue;
    const corners = candidate.restrictsLight && candidate.restrictsWeather;
    if (!candidate.testOcclusion?.(token, { corners })) continue;
    return true;
  }

  return false;
}

/**
 * Compose a cutout mask by subtracting token silhouettes from a base mask.
 * @param {PIXI.RenderTexture} baseRT
 * @param {{outRT?: PIXI.RenderTexture}} [opts]
 * @returns {PIXI.RenderTexture}
 */
export function composeMaskMinusTokens(baseRT, { outRT } = {}) {
  const r = canvas?.app?.renderer;
  if (!r || !baseRT) return baseRT;

  const out =
    outRT ??
    PIXI.RenderTexture.create({
      width: baseRT.width | 0,
      height: baseRT.height | 0,
      resolution: baseRT.resolution || 1,
    });

  const spr = (_tmpRTCopySprite ??= new PIXI.Sprite());
  spr.texture = baseRT;
  spr.blendMode = PIXI.BLEND_MODES.NORMAL;
  spr.alpha = 1;
  spr.position.set(0, 0);
  spr.scale.set(1, 1);
  spr.rotation = 0;
  r.render(spr, { renderTexture: out, clear: true });

  const Msnap = snappedStageMatrix();
  const c = new PIXI.Container();
  c.transform.setFromMatrix(Msnap);
  c.roundPixels = false;
  for (const s of collectTokenAlphaSprites({ respectOcclusion: true })) {
    s.blendMode = PIXI.BLEND_MODES.DST_OUT;
    s.roundPixels = false;
    c.addChild(s);
  }
  if (c.children.length) r.render(c, { renderTexture: out, clear: false, skipUpdateTransform: false });

  subtractDynamicRingsFromRT(out);
  try {
    c.destroy({ children: true, texture: false, baseTexture: false });
  } catch {}

  try {
    out.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
    out.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
  } catch {}
  return out;
}

/**
 * Compose a cutout mask by subtracting an existing tokens silhouette RT from a base mask.
 *
 * This is a cheaper alternative to {@link composeMaskMinusTokens} because it avoids
 * re-collecting and re-rendering token sprites for each cutout. It assumes both RTs
 * are in the same CSS-space viewport coordinates (e.g. produced by {@link buildSceneAllowMaskRT}
 * and {@link repaintTokensMaskInto}).
 *
 * @param {PIXI.RenderTexture} baseRT
 * @param {PIXI.RenderTexture} tokensRT
 * @param {{outRT?: PIXI.RenderTexture}} [opts]
 * @returns {PIXI.RenderTexture|null}
 */
export function composeMaskMinusTokensRT(baseRT, tokensRT, { outRT } = {}) {
  const r = canvas?.app?.renderer;
  if (!r || !baseRT || !tokensRT) return baseRT;

  const out =
    outRT ??
    PIXI.RenderTexture.create({
      width: baseRT.width | 0,
      height: baseRT.height | 0,
      resolution: baseRT.resolution || 1,
    });

  try {
    const spr = (_tmpRTCopySprite ??= new PIXI.Sprite());
    spr.texture = baseRT;
    spr.blendMode = PIXI.BLEND_MODES.NORMAL;
    spr.alpha = 1;
    spr.position.set(0, 0);
    spr.scale.set(1, 1);
    spr.rotation = 0;
    r.render(spr, { renderTexture: out, clear: true });
  } catch {}

  try {
    const spr = (_tmpTokensEraseSprite ??= new PIXI.Sprite());
    spr.texture = tokensRT;
    spr.blendMode = PIXI.BLEND_MODES.ERASE;
    spr.alpha = 1;
    spr.position.set(0, 0);
    spr.scale.set(1, 1);
    spr.rotation = 0;
    r.render(spr, { renderTexture: out, clear: false });
  } catch {}

  return out;
}

/**
 * Ensure a CSS-space sprite mask exists under a node and is projected locally.
 * @param {PIXI.Container} node
 * @param {PIXI.Texture|PIXI.RenderTexture|null} texture
 * @param {string} [name="fxmaster:css-mask"]
 * @returns {PIXI.Sprite|null}
 */
export function ensureCssSpaceMaskSprite(node, texture, name = "fxmaster:css-mask") {
  if (!node) return null;
  let spr = node.children?.find?.((c) => c?.name === name) || null;

  if (!spr || spr.destroyed) {
    spr = new PIXI.Sprite(safeMaskTexture(texture));
    spr.name = name;
    spr.renderable = true;
    spr.eventMode = "none";
    spr.interactive = false;
    spr.cursor = null;
    node.addChildAt(spr, 0);
  } else {
    spr.texture = safeMaskTexture(texture);
  }

  const { cssW, cssH } = getCssViewportMetrics();
  spr.x = 0;
  spr.y = 0;
  spr.width = cssW;
  spr.height = cssH;

  applyMaskSpriteTransform(node, spr);
  node.mask = spr;
  return spr;
}

/**
 * Render a tokens-only silhouette into a given RT.
 * @param {PIXI.RenderTexture} outRT
 */
export function repaintTokensMaskInto(outRT) {
  const r = canvas?.app?.renderer;
  if (!r || !outRT) return;
  const Msnap = snappedStageMatrix();
  const cont = new PIXI.Container();
  cont.transform.setFromMatrix(Msnap);
  cont.roundPixels = false;
  for (const s of collectTokenAlphaSprites()) {
    s.blendMode = PIXI.BLEND_MODES.NORMAL;
    s.roundPixels = false;
    cont.addChild(s);
  }
  r.render(cont, { renderTexture: outRT, clear: true, skipUpdateTransform: false });
  paintDynamicRingsInto(outRT);
  try {
    cont.destroy({ children: true, texture: false, baseTexture: false });
  } catch {}
}

/**
 * Return a non-null texture suitable for sprite masks.
 * Falls back to {@link PIXI.Texture.WHITE} when the input is null, destroyed, or missing
 * required metadata (for example, a missing {@code orig} after texture destruction).
 *
 * @param {PIXI.Texture|PIXI.RenderTexture|null} tex
 * @returns {PIXI.Texture|PIXI.RenderTexture}
 */
export function safeMaskTexture(tex) {
  try {
    if (!tex) return PIXI.Texture.WHITE;
    if (tex.destroyed) return PIXI.Texture.WHITE;
    if (tex.baseTexture?.destroyed) return PIXI.Texture.WHITE;
    if (!tex.orig) return PIXI.Texture.WHITE;
    return tex;
  } catch {
    return PIXI.Texture.WHITE;
  }
}

/**
 * Build a CSS-space alpha mask RenderTexture for a region.
 * White = inside (allowed), transparent = outside (suppressed).
 * - Camera-aligned via snappedStageMatrix() to avoid seams.
 * - Renders solids first, then ERASEs holes.
 * - Uses the provided RTPool when available.
 *
 * @param {PlaceableObject} region
 * @param {{rtPool?: import('./utils.js').RTPool, resolution?: number}} [opts]
 * @returns {PIXI.RenderTexture}
 */
export function buildRegionMaskRT(region, { rtPool, resolution } = {}) {
  const r = canvas?.app?.renderer;
  if (!r) return null;

  const { cssW, cssH } = getCssViewportMetrics();
  const VW = Math.max(1, cssW | 0);
  const VH = Math.max(1, cssH | 0);

  const res = resolution ?? safeMaskResolutionForCssArea(VW, VH, 1);

  const rt = rtPool
    ? rtPool.acquire(VW, VH, res)
    : PIXI.RenderTexture.create({ width: VW, height: VH, resolution: res });

  const { solids: solidsGfx, holes: holesGfx } = _getRegionMaskGfx();
  solidsGfx.clear();
  holesGfx.clear();

  const M = snappedStageMatrix();
  solidsGfx.transform.setFromMatrix(M);
  holesGfx.transform.setFromMatrix(M);

  const shapes = region?.document?.shapes ?? [];

  solidsGfx.beginFill(0xffffff, 1.0);
  for (const s of shapes) {
    if (!s?.hole) traceRegionShapePIXI(solidsGfx, s);
  }
  solidsGfx.endFill();

  holesGfx.beginFill(0xffffff, 1.0);
  for (const s of shapes) {
    if (s?.hole) traceRegionShapePIXI(holesGfx, s);
  }
  holesGfx.endFill();
  holesGfx.blendMode = PIXI.BLEND_MODES.ERASE;

  r.render(solidsGfx, { renderTexture: rt, clear: true });
  r.render(holesGfx, { renderTexture: rt, clear: false });

  try {
    rt.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
    rt.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
  } catch {}

  return rt;
}

/**
 * Project a CSS-space mask sprite into a container's local space (pixel-snapped).
 * Keeps the existing "roundPixels" behavior mirrored from the particle layer.
 *
 * @param {PIXI.Container} container
 * @param {PIXI.Sprite} spr
 */
export function applyMaskSpriteTransform(container, spr) {
  const r = canvas?.app?.renderer;
  const Minv = container.worldTransform.clone().invert();
  const res = r.resolution || window.devicePixelRatio || 1;
  Minv.tx = Math.round(Minv.tx * res) / res;
  Minv.ty = Math.round(Minv.ty * res) / res;
  spr.transform.setFromMatrix(Minv);
  spr.roundPixels = false;
  container.roundPixels = false;
}

/**
 * Compute whether a region should be "passed through" by elevation + viewer-gating.
 *
 * @param {PlaceableObject} placeable
 * @param {{behaviorType:string}} options
 * - behaviorType: e.g. `${packageId}.particleEffectsRegion` or `${packageId}.filterEffectsRegion`
 * @returns {boolean}
 */
export function computeRegionGatePass(placeable, { behaviorType }) {
  const doc = placeable?.document;
  if (!doc) return true;

  const fxBeh = (doc.behaviors ?? []).find((b) => b.type === behaviorType && !b.disabled);
  if (!fxBeh) return true;

  const gmAlways = !!fxBeh.getFlag?.(packageId, "gmAlwaysVisible");
  if (gmAlways && game.user?.isGM) return true;

  const { mode, latched } = getEventGate(placeable, behaviorType);
  if (mode === "enterExit") return !!latched;
  if (mode === "enter" && !latched) return false;

  const win = getRegionElevationWindow(doc);
  const gateMode = fxBeh.getFlag?.(packageId, "gateMode");

  const tokenElevation = (t) => {
    const d = Number(t?.document?.elevation);
    if (Number.isFinite(d)) return d;
    const e = Number(t?.elevation);
    return Number.isFinite(e) ? e : NaN;
  };

  if (gateMode === "pov") {
    const selected = canvas.tokens?.controlled ?? [];
    if (!selected?.length) return false;
    if (!win) return true;
    for (const t of selected) {
      const elev = tokenElevation(t);
      if (Number.isFinite(elev) && inRangeElev(elev, win)) return true;
    }
    return false;
  }

  if (gateMode === "targets") {
    const targets = fxBeh.getFlag?.(packageId, "tokenTargets");
    const ids = Array.isArray(targets) ? targets : targets ? [targets] : [];
    if (!ids.length) return false;

    const selected = canvas.tokens?.controlled ?? [];
    if (!selected.length) return false;

    const inList = (t) => {
      const id = t?.document?.id;
      const uuid = t?.document?.uuid;
      return ids.includes(id) || ids.includes(uuid);
    };
    const pool = selected.filter(inList);
    if (!pool.length) return false;

    if (!win) return true;
    for (const t of pool) {
      const elev = tokenElevation(t);
      if (Number.isFinite(elev) && inRangeElev(elev, win)) return true;
    }
    return false;
  }

  return true;
}

/**
 * Coalesce calls to the next animation frame.
 * Multiple invocations within the same frame result in a single callback,
 * executed with the latest arguments and the last call-site `this`.
 *
 * Usage:
 * const oncePerFrame = coalesceNextFrame(fn, { key: "unique-key" });
 * oncePerFrame(arg1, arg2);
 * oncePerFrame.cancel();
 * oncePerFrame.flush();
 *
 * @template {(...args:any[]) => any} F
 * @param {F} fn - The function to call once per frame.
 * @param {{ key?: any }} [opts] - Optional grouping key for coalescing.
 * @returns {F & { cancel: () => void, flush: () => void }}
 */
export function coalesceNextFrame(fn, { key } = {}) {
  const stateMap = (coalesceNextFrame._map ??= new Map());
  const k = key ?? fn;

  const getState = () => {
    let s = stateMap.get(k);
    if (!s) {
      s = { raf: null, args: null, ctx: null, pending: false };
      stateMap.set(k, s);
    }
    return s;
  };

  const schedule = () => {
    const s = getState();
    if (s.pending) return;
    s.pending = true;

    const _raf = globalThis.requestAnimationFrame ?? ((cb) => setTimeout(cb, 16));
    s.raf = _raf(() => {
      s.pending = false;
      s.raf = null;
      try {
        fn.apply(s.ctx, s.args || []);
      } finally {
        s.args = s.ctx = null;
      }
    });
  };

  /** @type {any} */
  function wrapper(...args) {
    const s = getState();
    s.args = args;
    s.ctx = this;
    schedule();
  }

  wrapper.cancel = () => {
    const s = getState();
    if (s.raf != null) {
      try {
        const cancel = globalThis.cancelAnimationFrame ?? clearTimeout;
        cancel(s.raf);
      } catch {}
      s.raf = null;
    }
    s.pending = false;
    s.args = s.ctx = null;
  };

  wrapper.flush = () => {
    const s = getState();
    if (!s.pending) return;
    if (s.raf != null) {
      try {
        const cancel = globalThis.cancelAnimationFrame ?? clearTimeout;
        cancel(s.raf);
      } catch {}
      s.raf = null;
    }
    s.pending = false;
    try {
      fn.apply(s.ctx, s.args || []);
    } finally {
      s.args = s.ctx = null;
    }
  };

  return wrapper;
}

/**
 * Return viewport metrics in CSS pixels.
 * @returns {{cssW:number, cssH:number, deviceToCss:number, rect: PIXI.Rectangle, deviceRect: PIXI.Rectangle}}
 */
export function getCssViewportMetrics() {
  const r = canvas?.app?.renderer;
  const res = r?.resolution || window.devicePixelRatio || 1;

  const deviceW = Math.max(1, (r?.view?.width ?? r?.screen?.width ?? 1) | 0);
  const deviceH = Math.max(1, (r?.view?.height ?? r?.screen?.height ?? 1) | 0);
  const deviceRect = new PIXI.Rectangle(0, 0, deviceW, deviceH);

  const cssW = Math.max(1, (r?.screen?.width ?? Math.round(deviceW / res)) | 0);
  const cssH = Math.max(1, (r?.screen?.height ?? Math.round(deviceH / res)) | 0);
  const rect = new PIXI.Rectangle(0, 0, cssW, cssH);

  return { cssW, cssH, deviceToCss: 1 / res, rect, deviceRect };
}

/**
 * Build a scene-allow alpha mask RT in CSS space:
 * - Black background (suppressed)
 * - White scene rect (allowed)
 * - Optionally subtract regions (solids erase, holes add back)
 *
 * @param {{regions?: PlaceableObject[], reuseRT?: PIXI.RenderTexture|null}} [opts]
 * @returns {PIXI.RenderTexture|null}
 */
export function buildSceneAllowMaskRT({ regions = [], reuseRT = null } = {}) {
  const r = canvas?.app?.renderer;
  if (!r) return null;

  const { cssW, cssH } = getCssViewportMetrics();

  const res = safeMaskResolutionForCssArea(cssW, cssH);

  let rt = reuseRT ?? null;
  const needsNew =
    !rt || (rt.width | 0) !== (cssW | 0) || (rt.height | 0) !== (cssH | 0) || (rt.resolution || 1) !== res;

  if (needsNew) {
    try {
      reuseRT?.destroy(true);
    } catch {}
    rt = PIXI.RenderTexture.create({
      width: cssW | 0,
      height: cssH | 0,
      resolution: res,
      multisample: 0,
    });
    try {
      rt.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
      rt.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
    } catch {}
  }

  /** Paint background black (suppressed by default). */
  {
    const { bg } = _getSceneAllowMaskGfx();
    bg.clear();
    bg.beginFill(0x000000, 1).drawRect(0, 0, cssW, cssH).endFill();
    r.render(bg, { renderTexture: rt, clear: true });
  }

  /** Paint scene area white (allowed inside scene dimensions). */
  const M = snappedStageMatrix();
  const d = canvas.dimensions;
  if (d) {
    const { scene } = _getSceneAllowMaskGfx();
    scene.clear();

    scene.transform.setFromMatrix(new PIXI.Matrix());

    const x0w = d.sceneRect.x;
    const y0w = d.sceneRect.y;
    const x1w = x0w + d.sceneRect.width;
    const y1w = y0w + d.sceneRect.height;

    const p0 = new PIXI.Point();
    const p1 = new PIXI.Point();
    M.apply({ x: x0w, y: y0w }, p0);
    M.apply({ x: x1w, y: y1w }, p1);

    const minX = Math.min(p0.x, p1.x);
    const minY = Math.min(p0.y, p1.y);
    const maxX = Math.max(p0.x, p1.x);
    const maxY = Math.max(p0.y, p1.y);

    /**
     * Seam prevention: avoid rounding to the nearest pixel.
     * Rounding can shrink the transformed scene rect by 1px depending on fractional camera
     * alignment, producing a 1px transparent seam that appears to jump between edges at
     * different zoom levels. Bounds are expanded to cover the transformed scene rect.
     */
    const left = Math.floor(minX);
    const top = Math.floor(minY);
    const right = Math.ceil(maxX);
    const bottom = Math.ceil(maxY);

    const x = Math.max(0, Math.min(cssW, left));
    const y = Math.max(0, Math.min(cssH, top));
    const w = Math.max(0, Math.min(cssW, right) - x);
    const h = Math.max(0, Math.min(cssH, bottom) - y);

    if (w > 0 && h > 0) {
      scene.beginFill(0xffffff, 1.0);
      scene.drawRect(x, y, w, h);
      scene.endFill();
      r.render(scene, { renderTexture: rt, clear: false });
    }
  }

  /** Subtract suppression-region solids (ERASE) and add back holes (NORMAL). */
  if (Array.isArray(regions) && regions.length) {
    const { solids: solidsGfx, holes: holesGfx } = _getSceneAllowMaskGfx();
    solidsGfx.clear();
    holesGfx.clear();

    solidsGfx.transform.setFromMatrix(M);
    holesGfx.transform.setFromMatrix(M);

    solidsGfx.beginFill(0xffffff, 1);
    holesGfx.beginFill(0xffffff, 1);

    for (const region of regions) {
      const shapes = region?.document?.shapes ?? [];
      for (const s of shapes) {
        if (s?.hole) traceRegionShapePIXI(holesGfx, s);
        else traceRegionShapePIXI(solidsGfx, s);
      }
    }

    solidsGfx.endFill();
    holesGfx.endFill();

    solidsGfx.blendMode = PIXI.BLEND_MODES.ERASE;
    holesGfx.blendMode = PIXI.BLEND_MODES.NORMAL;

    r.render(solidsGfx, { renderTexture: rt, clear: false });
    r.render(holesGfx, { renderTexture: rt, clear: false });
  }

  return rt;
}

/**
 * Ensure (or rebuild) the below-tokens artifacts for a given base allow-mask RT:
 * - a "cutout" RT = base minus token silhouettes
 * - a tokens-only RT (alpha mask)
 *
 * Returns updated RTs (existing ones are destroyed/replaced if dimension/res changed).
 *
 * @param {PIXI.RenderTexture} baseRT
 * @param {{ cutoutRT?: PIXI.RenderTexture|null, tokensMaskRT?: PIXI.RenderTexture|null }} [state]
 * @returns {{ cutoutRT: PIXI.RenderTexture, tokensMaskRT: PIXI.RenderTexture }}
 */
export function ensureBelowTokensArtifacts(baseRT, state = {}) {
  const r = canvas?.app?.renderer;
  if (!r || !baseRT) return { cutoutRT: null, tokensMaskRT: null };

  const W = Math.max(1, baseRT.width | 0);
  const H = Math.max(1, baseRT.height | 0);
  const res = baseRT.resolution || 1;

  let cutoutRT = state.cutoutRT;
  const cutoutBad = !cutoutRT || cutoutRT.width !== W || cutoutRT.height !== H || (cutoutRT.resolution || 1) !== res;
  if (cutoutBad) {
    try {
      cutoutRT?.destroy(true);
    } catch {}
    cutoutRT = PIXI.RenderTexture.create({ width: W, height: H, resolution: res, multisample: 0 });
  }
  composeMaskMinusTokens(baseRT, { outRT: cutoutRT });
  try {
    cutoutRT.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
    cutoutRT.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
  } catch {}

  let tokensMaskRT = state.tokensMaskRT;
  const tokensBad =
    !tokensMaskRT || tokensMaskRT.width !== W || tokensMaskRT.height !== H || (tokensMaskRT.resolution || 1) !== res;
  if (tokensBad) {
    try {
      tokensMaskRT?.destroy(true);
    } catch {}
    tokensMaskRT = PIXI.RenderTexture.create({ width: W, height: H, resolution: res, multisample: 0 });
  }
  repaintTokensMaskInto(tokensMaskRT);
  try {
    tokensMaskRT.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
    tokensMaskRT.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
  } catch {}

  return { cutoutRT, tokensMaskRT };
}

/**
 * Apply scene-mask uniforms to a list of FXMaster filters.
 * Honors per-filter "belowTokens" option by swapping the sampler and providing token silhouettes.
 * @param {PIXI.Filter[]} filters
 * @param {{
 * baseMaskRT: PIXI.RenderTexture,
 * cutoutRT?: PIXI.RenderTexture|null,
 * tokensMaskRT?: PIXI.RenderTexture|null,
 * cssW: number,
 * cssH: number,
 * deviceToCss: number
 * }} cfg
 */
export function applyMaskUniformsToFilters(
  filters,
  { baseMaskRT, cutoutRT = null, tokensMaskRT = null, cssW, cssH, deviceToCss },
) {
  const rtCssW = baseMaskRT ? Math.max(1, baseMaskRT.width | 0) : Math.max(1, cssW | 0);
  const rtCssH = baseMaskRT ? Math.max(1, baseMaskRT.height | 0) : Math.max(1, cssH | 0);

  for (const f of filters) {
    if (!f) continue;
    const u = f.uniforms || {};
    const wantBelow = _belowTokensEnabled(f?.__fxmBelowTokens ?? f?.options?.belowTokens);
    const rt = wantBelow ? cutoutRT || baseMaskRT : baseMaskRT;

    if ("maskSampler" in u) u.maskSampler = rt;
    if ("hasMask" in u) u.hasMask = rt ? 1.0 : 0.0;
    if ("maskReady" in u) u.maskReady = rt ? 1.0 : 0.0;

    if ("viewSize" in u) {
      const arr = u.viewSize instanceof Float32Array && u.viewSize.length >= 2 ? u.viewSize : new Float32Array(2);
      arr[0] = rtCssW;
      arr[1] = rtCssH;
      u.viewSize = arr;
    }

    if ("deviceToCss" in u) u.deviceToCss = deviceToCss;

    if (wantBelow && tokensMaskRT) {
      if ("tokenSampler" in u) u.tokenSampler = tokensMaskRT;
      if ("hasTokenMask" in u) u.hasTokenMask = 1.0;
    } else {
      if ("tokenSampler" in u) u.tokenSampler = PIXI.Texture.EMPTY;
      if ("hasTokenMask" in u) u.hasTokenMask = 0.0;
    }
  }
}

/**
 * Subtract dynamic token rings from a render texture via DST_OUT.
 * Safe: temporarily flips mesh.blendMode and restores it.
 * @param {PIXI.RenderTexture} outRT
 */
export function subtractDynamicRingsFromRT(outRT) {
  const r = canvas?.app?.renderer;
  if (!r || !outRT) return;
  const M = snappedStageMatrix();
  for (const t of canvas.tokens?.placeables ?? []) {
    if (!t?.visible || t.document?.hidden) continue;
    if (!t?.mesh || !t?.hasDynamicRing) continue;
    const oldBM = t.mesh.blendMode;
    const oldAlph = t.mesh.worldAlpha;
    try {
      t.mesh.blendMode = PIXI.BLEND_MODES.DST_OUT;
      t.mesh.worldAlpha = 1;
      r.render(t.mesh, { renderTexture: outRT, clear: false, transform: M, skipUpdateTransform: false });
    } finally {
      t.mesh.blendMode = oldBM;
      t.mesh.worldAlpha = oldAlph;
    }
  }
}

/**
 * Paint dynamic token rings (normal blend) into a tokens-only RT.
 * @param {PIXI.RenderTexture} outRT
 */
export function paintDynamicRingsInto(outRT) {
  const r = canvas?.app?.renderer;
  if (!r || !outRT) return;
  const M = snappedStageMatrix();
  for (const t of canvas.tokens?.placeables ?? []) {
    if (!t?.visible || t.document?.hidden) continue;
    if (!t?.mesh || !t?.hasDynamicRing) continue;
    const oldBM = t.mesh.blendMode;
    const oldAlph = t.mesh.worldAlpha;
    try {
      t.mesh.blendMode = PIXI.BLEND_MODES.NORMAL;
      t.mesh.worldAlpha = 1;
      r.render(t.mesh, { renderTexture: outRT, clear: false, transform: M, skipUpdateTransform: false });
    } finally {
      t.mesh.blendMode = oldBM;
      t.mesh.worldAlpha = oldAlph;
    }
  }
}

/**
 * Compute a safe render resolution for a given CSS-sized area,
 * respecting both renderer.resolution and MAX_TEXTURE_SIZE.
 *
 * @param {number} cssW
 * @param {number} cssH
 * @returns {number}
 */
export function safeResolutionForCssArea(cssW, cssH) {
  const r = canvas?.app?.renderer;
  if (!r) return 1;

  const gl = r.gl;
  const max = gl?.getParameter?.(gl.MAX_TEXTURE_SIZE) || 8192;
  const base = r.resolution || window.devicePixelRatio || 1;

  const span = Math.max(1, cssW | 0, cssH | 0);
  const texLimited = max / span;

  const safe = Math.max(0.5, Math.min(base, texLimited));
  return safe;
}

/**
 * Compute a safe resolution for alpha/binary mask render textures.
 * This function delegates to {@link safeResolutionForCssArea} and additionally caps the
 * returned resolution to a maximum (default 1.0).
 *
 * @param {number} cssW - Viewport width in CSS pixels.
 * @param {number} cssH - Viewport height in CSS pixels.
 * @param {number} [max=1] - Maximum allowed resolution.
 * @returns {number}
 */
export function safeMaskResolutionForCssArea(cssW, cssH, max = 1) {
  const safe = safeResolutionForCssArea(cssW, cssH);
  const cap = Number.isFinite(max) ? max : 1;
  return Math.max(0.5, Math.min(cap, safe));
}

export function updateSceneControlHighlights() {
  const scene = canvas?.scene;
  if (!scene) return;

  const effects = scene.getFlag(packageId, "effects") ?? {};
  const filters = scene.getFlag(packageId, "filters") ?? {};

  const isDeletionKey = isLegacyOperatorKey;
  const isCoreKey = (id) => typeof id === "string" && id.startsWith("core_");

  const hasCoreParticles = Object.entries(effects).some(([id, v]) => !isDeletionKey(id) && isCoreKey(id) && v);
  const hasApiParticles = Object.entries(effects).some(([id, v]) => !isDeletionKey(id) && !isCoreKey(id) && v);

  const hasCoreFilters = Object.entries(filters).some(([id, v]) => !isDeletionKey(id) && isCoreKey(id) && v);
  const hasApiFilters = Object.entries(filters).some(([id, v]) => !isDeletionKey(id) && !isCoreKey(id) && v);

  const hasApiEffects = hasApiParticles || hasApiFilters;
  const hasAnyEffects = hasCoreParticles || hasCoreFilters || hasApiEffects;

  CONFIG.fxmaster.FXMasterBaseFormV2.setToolButtonHighlight("particle-effects", hasCoreParticles);
  CONFIG.fxmaster.FXMasterBaseFormV2.setToolButtonHighlight("filters", hasCoreFilters);
  CONFIG.fxmaster.FXMasterBaseFormV2.setToolButtonHighlight("api-effects", hasApiEffects);

  const controlBtn = document.querySelector(`#scene-controls-layers button.control[data-control="effects"]`);

  const controlEl = controlBtn?.matches?.("li") ? controlBtn.querySelector?.("button") ?? controlBtn : controlBtn;

  if (controlEl) {
    if (hasAnyEffects) {
      controlEl.style.setProperty("background-color", "var(--color-warm-2)");
      controlEl.style.setProperty("border-color", "var(--color-warm-3)");
    } else {
      controlEl.style.removeProperty("background-color");
      controlEl.style.removeProperty("border-color");
    }
  }
}

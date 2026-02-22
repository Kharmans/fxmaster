/**
 * FXMaster Preset API
 * -------------------
 * Provides an integration API for other modules/macros to apply. Predefined preset effects by name.
 *
 * Presets are defined in ./api-effects.js
 *
 * Usage:
 *   await FXMASTER.api.presets.play("sunshower", { topDown: false, direction: "north", belowTokens: false, soundFx: false}); //Turns on a given effect, passing play for an effect already on with a change in parameters will update the effect. Options are optional, passing none plays the effect in its default configuration.
 *   await FXMASTER.api.presets.stop("blizzard"); //Turns off a given effect
 *   await FXMASTER.api.presets.toggle("blizzard", { topDown: true}); //Toggles a given effect on/off. Options are optional, passing none plays the effect in its default configuration.
 *   await FXMASTER.api.presets.switch("sunshower", { topDown: true }); //Stops any active presets and plays the passed-in preset
 *   console.log(FXMASTER.api.presets.list()) //Returns an array of all presets
 *   console.log(FXMASTER.api.presets.listValid()) //Returns an array of presets that are currently valid for this world
 *   console.log(FXMASTER.api.presets.listActive()) //Returns an array of currently active preset(s) on the current scene
 *   console.log(FXMASTER.api.presets.listActive({ scene: "<sceneUuid>" })) //Returns an array of currently active preset(s) on a given scene
 */

import { packageId } from "./constants.js";
import { API_EFFECTS, API_EFFECT_NAMES } from "./api-effects.js";
import { addDeletionKey } from "./utils.js";
import { logger } from "./logger.js";

const FXMASTER_PLUS_ID = "fxmaster-plus";
const KEY_PREFIX = "apiPreset_";

const ACTIVE_KEY_RE = /^apiPreset_(.+)_(?:p|f)\d+$/;

/**
 * Resolve a Scene from a Scene or a Scene UUID.
 *
 * Supported:
 * - Scene Instance
 * - UUID string (e.g. "Scene.abc123")
 *
 * @param {any} sceneRef
 * @returns {any|null}
 */
function resolveScene(sceneRef) {
  if (!sceneRef) return null;

  if (sceneRef?.collectionName === "scenes") return sceneRef;

  if (typeof sceneRef !== "string") return null;
  const ref = sceneRef.trim();
  if (!ref) return null;

  const checkUuid = fromUuidSync(ref);
  if (checkUuid && checkUuid.collectionName === "scenes") return checkUuid;

  return null;
}

/**
 * Check whether a preset variant references only currently-registered FXMaster effect types.
 *
 * If CONFIG.fxmaster is not yet populated, this returns true (best-effort).
 *
 * @param {*} variant
 * @returns {boolean}
 */
function isVariantCompatible(variant) {
  const particleDB = CONFIG?.fxmaster?.particleEffects;
  const filterDB = CONFIG?.fxmaster?.filterEffects;

  if (!particleDB || !filterDB) return true;

  const ps = variant?.particles ?? [];
  const fs = variant?.filters ?? [];

  for (const p of ps) {
    const t = p?.type;
    if (t && !(t in particleDB)) return false;
  }
  for (const f of fs) {
    const t = f?.type;
    if (t && !(t in filterDB)) return false;
  }
  return true;
}

/**
 * @returns {boolean}
 */
export function hasFxmasterPlus() {
  try {
    const mod = game?.modules?.get?.(FXMASTER_PLUS_ID);
    return !!(mod && mod.active);
  } catch {
    return false;
  }
}

/**
 * @returns {boolean}
 */
export function hasFxmaster() {
  try {
    const mod = game?.modules?.get?.(packageId);
    return !!(mod && mod.active);
  } catch {
    return false;
  }
}

/**
 * Normalize a user-provided preset name for lookup and keying.
 * @param {string} name
 * @returns {string}
 */
export function normalizePresetName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

/**
 * Convert a compass direction string into FXMaster degrees.
 * FXMaster particle direction is screen-space degrees where:
 *   0   = east (→)
 *   90  = south (↓)
 *   180 = west (←)
 *   270 = north (↑)
 *
 * @param {string|number|null|undefined} dir
 * @returns {number|null}
 */
export function parseDirectionDegrees(dir) {
  if (dir === null || dir === undefined) return null;

  if (typeof dir === "number" && Number.isFinite(dir)) {
    const d = ((dir % 360) + 360) % 360;
    return d;
  }

  const s = String(dir).trim().toLowerCase();
  if (!s) return null;

  const norm = s.replace(/[\s_-]+/g, "");

  const map = {
    e: 0,
    east: 0,
    se: 45,
    southeast: 45,
    s: 90,
    south: 90,
    sw: 135,
    southwest: 135,
    w: 180,
    west: 180,
    nw: 225,
    northwest: 225,
    n: 270,
    north: 270,
    ne: 315,
    northeast: 315,
    up: 270,
    down: 90,
    left: 180,
    right: 0,
  };

  if (norm in map) return map[norm];
  return null;
}

/**
 * Normalize degrees into the range [-180, 180], mapping 180 => -180.
 *
 * @param {number} deg
 * @returns {number}
 */
function normalizeAngle180(deg) {
  let d = ((deg % 360) + 360) % 360;
  if (d > 180) d -= 360;
  if (d === 180) d = -180;
  return d;
}

/**
 * Convert API direction (FXMaster degrees: 0=east, 90=south, 180=west, 270=north) into the FXMaster+ Sunlight filter's angle parameter.
 *
 * Sunlight: Angle is effectively an emission point, and the mapping differs depending on whether the filter is in parallel mode.
 *
 * Mappings:
 * - parallel (sunshower): -180=north, -90=east, 0=south, 90=west
 * - non-parallel (black-sun/twilight-sun): -180=east, -90=south, 0=west, 90=north
 *
 * @param {number} directionDeg
 * @param {boolean} parallel
 * @returns {number}
 */
function sunlightAngleFromDirection(directionDeg, parallel) {
  const d = Number(directionDeg);
  if (!Number.isFinite(d)) return 0;
  return parallel ? normalizeAngle180(d - 90) : normalizeAngle180(d - 180);
}

/**
 * @typedef {object} PresetVariant
 * @property {Array<{type:string, options?:object}>} [particles]
 * @property {Array<{type:string, options?:object}>} [filters]
 */

/**
 * Resolve the preset variant for a given name and options.
 *
 * @param {string} name
 * @param {{topDown?: boolean}} [opts]
 * @returns {{presetName: string, tier: "plus"|"free", variant: PresetVariant}|null}
 */
export function resolvePresetVariant(name, { topDown = false } = {}) {
  const presetName = normalizePresetName(name);
  const preset = API_EFFECTS?.[presetName] ?? null;
  if (!preset) return null;

  const plusActive = hasFxmasterPlus();
  const freeActive = hasFxmaster();

  const hasPlusTier = preset.plus && Object.keys(preset.plus).length > 0;
  const hasFreeTier = preset.free && Object.keys(preset.free).length > 0;

  const want = topDown ? "topDown" : "normal";
  const fallback = topDown ? "normal" : "topDown";

  /** @type {Array<{tier:"plus"|"free", variant: PresetVariant}>} */
  const candidates = [];

  if (plusActive && hasPlusTier) {
    const pt = preset.plus ?? {};
    const v = pt?.[want] ?? pt?.[fallback] ?? null;
    if (v) candidates.push({ tier: "plus", variant: v });
  }

  if (freeActive && hasFreeTier) {
    const ft = preset.free ?? {};
    const v = ft?.[want] ?? ft?.[fallback] ?? null;
    if (v) candidates.push({ tier: "free", variant: v });
  }

  if (!candidates.length) return null;

  const chosen = candidates.find((c) => isVariantCompatible(c.variant)) ?? candidates[0];
  return { presetName, tier: chosen.tier, variant: chosen.variant };
}

/**
 * Deep clone helper
 * @template T
 * @param {T} v
 * @returns {T}
 */
function deepClone(v) {
  if (foundry?.utils?.deepClone) return foundry.utils.deepClone(v);
  return JSON.parse(JSON.stringify(v));
}

/**
 * Apply top-level overrides to a (particle/filter) options object.
 * @param {object} options
 * @param {{
 *   topDown?: boolean,
 *   belowTokens?: boolean,
 *   directionDeg?: number|null,
 *   soundFx?: boolean,
 * }} overrides
 * @param {{ plusActive: boolean }} ctx
 * @returns {object}
 */
function applyOptionOverrides(options = {}, overrides = {}, { plusActive } = {}, meta = {}) {
  const out = options && typeof options === "object" ? options : {};

  if (typeof overrides.topDown === "boolean") out.topDown = overrides.topDown;
  if (typeof overrides.belowTokens === "boolean") out.belowTokens = overrides.belowTokens;

  if (typeof overrides.soundFx === "boolean") {
    out.soundFxEnabled = plusActive ? overrides.soundFx : false;
  } else if (!plusActive && "soundFxEnabled" in out) {
    out.soundFxEnabled = false;
  }

  if (typeof overrides.directionDeg === "number" && Number.isFinite(overrides.directionDeg)) {
    const dir = overrides.directionDeg;

    // Sunlight filter handling
    if (meta.kind === "filters" && meta.type === "sunlight") {
      const parallel = typeof out.parallel === "boolean" ? out.parallel : true;
      out.angle = sunlightAngleFromDirection(dir, parallel);
      return out;
    }
    // Glitch filter handling
    if (meta.kind === "filters" && meta.type === "glitch") {
      out.direction = dir;
      out.glyphDirection = dir;
      return out;
    }

    // Default handling
    out.direction = dir;
  }

  return out;
}

/**
 * Build stable scene-flag keys for a preset.
 * @param {string} presetName normalized preset name
 * @returns {{ particlePrefix: string, filterPrefix: string }}
 */
function keyPrefixesForPreset(presetName) {
  const safe = normalizePresetName(presetName).replace(/[^a-z0-9_-]/g, "-");
  return {
    particlePrefix: `${KEY_PREFIX}${safe}_p`,
    filterPrefix: `${KEY_PREFIX}${safe}_f`,
  };
}

/**
 * Determine if a stored scene flag entry looks like a valid FXMaster effect info object.
 * @param {*} info
 * @returns {boolean}
 */
function isValidEffectInfo(info) {
  return !!(info && typeof info === "object" && typeof info.type === "string" && info.type.trim());
}

/**
 * Remove all scene FX created by this preset API for the given preset name.
 *
 * @param {string} name
 * @param {{ scene?: any }} [opts]
 * @returns {Promise<boolean>}
 */
export async function stopPreset(name, { scene = null } = {}) {
  const presetName = normalizePresetName(name);
  const sc = scene ? resolveScene(scene) : canvas?.scene;
  if (!sc) return false;

  const { particlePrefix, filterPrefix } = keyPrefixesForPreset(presetName);

  const curParticles = sc.getFlag?.(packageId, "effects") ?? {};
  const curFilters = sc.getFlag?.(packageId, "filters") ?? {};

  const particleUpdate = {};
  const filterUpdate = {};

  for (const k of Object.keys(curParticles)) {
    if (
      k.startsWith(particlePrefix) ||
      ((k.startsWith("-=") || k.startsWith("==")) && k.slice(2).startsWith(particlePrefix))
    ) {
      addDeletionKey(particleUpdate, k);
    }
  }
  for (const k of Object.keys(curFilters)) {
    if (
      k.startsWith(filterPrefix) ||
      ((k.startsWith("-=") || k.startsWith("==")) && k.slice(2).startsWith(filterPrefix))
    ) {
      addDeletionKey(filterUpdate, k);
    }
  }

  const promises = [];
  if (Object.keys(particleUpdate).length) promises.push(sc.setFlag(packageId, "effects", particleUpdate));
  if (Object.keys(filterUpdate).length) promises.push(sc.setFlag(packageId, "filters", filterUpdate));

  if (!promises.length) return true;
  await Promise.all(promises);
  return true;
}

/**
 * Play (apply) a preset by name onto the current scene.
 * This only manages keys created by this preset API (KEY_PREFIX) and will not touch core FXMaster "core_*" effects.
 *
 * @param {string} name
 * @param {{
 *   topDown?: boolean,
 *   direction?: string|number,
 *   belowTokens?: boolean,
 *   soundFx?: boolean,
 *   scene?: any,
 *   silent?: boolean,
 * }} [opts]
 * @returns {Promise<boolean>}
 */
export async function playPreset(
  name,
  {
    topDown = false,
    direction = undefined,
    belowTokens = undefined,
    soundFx = undefined,
    scene = null,
    silent = false,
  } = {},
) {
  const sc = scene ? resolveScene(scene) : canvas?.scene;
  if (!sc) return false;

  const resolved = resolvePresetVariant(name, { topDown });
  if (!resolved) {
    const msg = `Preset '${name}' not found.`;
    logger.warn(msg);
    if (!silent) ui?.notifications?.warn?.(msg);
    return false;
  }

  const plusActive = hasFxmasterPlus();

  const particles = deepClone(resolved.variant?.particles ?? []);
  const filters = deepClone(resolved.variant?.filters ?? []);

  const directionDeg = parseDirectionDegrees(direction);

  const overrides = { topDown, belowTokens, directionDeg, soundFx };
  for (const p of particles) {
    if (!p || typeof p !== "object") continue;
    p.options = applyOptionOverrides(p.options ?? {}, overrides, { plusActive }, { kind: "particles", type: p.type });
  }
  for (const f of filters) {
    if (!f || typeof f !== "object") continue;
    f.options = applyOptionOverrides(f.options ?? {}, overrides, { plusActive }, { kind: "filters", type: f.type });
  }

  const presetName = resolved.presetName;
  const { particlePrefix, filterPrefix } = keyPrefixesForPreset(presetName);

  const curParticles = sc.getFlag?.(packageId, "effects") ?? {};
  const curFilters = sc.getFlag?.(packageId, "filters") ?? {};

  const particleUpdate = {};
  const filterUpdate = {};

  const nextParticleKeys = new Set(particles.map((_, i) => `${particlePrefix}${i}`));
  const nextFilterKeys = new Set(filters.map((_, i) => `${filterPrefix}${i}`));

  for (const k of Object.keys(curParticles)) {
    if ((k.startsWith("-=") || k.startsWith("==")) && k.slice(2).startsWith(particlePrefix)) {
      addDeletionKey(particleUpdate, k);
      continue;
    }

    if (!k.startsWith(particlePrefix)) continue;

    if (!nextParticleKeys.has(k) || !isValidEffectInfo(curParticles[k])) addDeletionKey(particleUpdate, k);
  }
  for (const k of Object.keys(curFilters)) {
    if ((k.startsWith("-=") || k.startsWith("==")) && k.slice(2).startsWith(filterPrefix)) {
      addDeletionKey(filterUpdate, k);
      continue;
    }

    if (!k.startsWith(filterPrefix)) continue;
    if (!nextFilterKeys.has(k) || !isValidEffectInfo(curFilters[k])) addDeletionKey(filterUpdate, k);
  }

  for (let i = 0; i < particles.length; i++) {
    const key = `${particlePrefix}${i}`;
    particleUpdate[key] = particles[i];
  }
  for (let i = 0; i < filters.length; i++) {
    const key = `${filterPrefix}${i}`;
    filterUpdate[key] = filters[i];
  }

  const promises = [];
  if (Object.keys(particleUpdate).length) promises.push(sc.setFlag(packageId, "effects", particleUpdate));
  if (Object.keys(filterUpdate).length) promises.push(sc.setFlag(packageId, "filters", filterUpdate));

  await Promise.all(promises);

  if (resolved.tier === "plus" && !plusActive) {
    const msg = `Preset '${presetName}' is an FXMaster+ preset, but FXMaster+ is not active. Some effects may not load.`;
    logger.warn(msg);
    if (!silent) ui?.notifications?.warn?.(msg);
  }

  return true;
}

/**
 * Toggle a preset by name.
 *
 * - If the preset is currently active (any API-managed keys exist), stop it.
 * - Otherwise, play it.
 *
 * @param {string} name
 * @param {object} [opts]
 * @returns {Promise<boolean>} new enabled state (true=enabled, false=disabled)
 */
export async function togglePreset(name, opts = {}) {
  const sc = opts.scene ? resolveScene(opts.scene) : canvas?.scene;
  if (!sc) return false;

  const presetName = normalizePresetName(name);
  const { particlePrefix, filterPrefix } = keyPrefixesForPreset(presetName);

  const curParticles = sc.getFlag?.(packageId, "effects") ?? {};
  const curFilters = sc.getFlag?.(packageId, "filters") ?? {};

  const hasParticles = Object.keys(curParticles).some((k) => k.startsWith(particlePrefix));
  const hasFilters = Object.keys(curFilters).some((k) => k.startsWith(filterPrefix));
  const enabled = hasParticles || hasFilters;

  if (enabled) {
    await stopPreset(name, { scene: sc });
    return false;
  }

  await playPreset(name, { ...opts, scene: sc });
  return true;
}

/**
 * List all known preset names.
 * @returns {string[]}
 */
export function listPresets() {
  return [...(API_EFFECT_NAMES ?? [])];
}

/**
 * Return the preset names currently active on a scene (created by this preset API).
 *
 * @param {{ scene?: any }} [opts]
 * @returns {string[]} active preset names (normalized)
 */
export function listActivePresets({ scene = null } = {}) {
  const sc = scene ? resolveScene(scene) : canvas?.scene;
  if (!sc) return [];

  const curParticles = sc.getFlag?.(packageId, "effects") ?? {};
  const curFilters = sc.getFlag?.(packageId, "filters") ?? {};

  const names = new Set();

  const collect = (obj) => {
    for (const rawKey of Object.keys(obj ?? {})) {
      const key = rawKey.startsWith("-=") || rawKey.startsWith("==") ? rawKey.slice(2) : rawKey;
      const m = ACTIVE_KEY_RE.exec(key);
      if (m?.[1]) names.add(m[1]);
    }
  };

  collect(curParticles);
  collect(curFilters);

  return [...names].sort();
}

/**
 * List preset names that are currently valid for this world.
 *
 * A preset is considered "valid" if it can be resolved for the current module tier (free/plus) AND all referenced effect types are registered in CONFIG.fxmaster.
 *
 * By default this checks both normal and top-down variants; a preset is included if either is valid.
 *
 * @param {{ topDown?: boolean|null }} [opts]
 * @returns {string[]}
 */
export function listValidPresets({ topDown = null } = {}) {
  const names = new Set();
  const all = API_EFFECT_NAMES ?? Object.keys(API_EFFECTS ?? {});

  const isValidFor = (name, td) => {
    const resolved = resolvePresetVariant(name, { topDown: !!td });
    return !!(resolved && isVariantCompatible(resolved.variant));
  };

  for (const n of all) {
    const presetName = normalizePresetName(n);
    if (topDown === null) {
      if (isValidFor(presetName, false) || isValidFor(presetName, true)) names.add(presetName);
    } else {
      if (isValidFor(presetName, !!topDown)) names.add(presetName);
    }
  }

  return [...names].sort();
}

/**
 * Stop any active presets (created by this preset API) and then play the given preset.
 *
 * @param {string} name
 * @param {object} [opts] Same options as {@link playPreset}. If name is falsy, this will only stop active presets.
 * @returns {Promise<boolean>}
 */
export async function switchPreset(name, opts = {}) {
  const sc = opts.scene ? resolveScene(opts.scene) : canvas?.scene;
  if (!sc) return false;

  if (name) {
    const topDown = !!opts.topDown;
    const resolved = resolvePresetVariant(name, { topDown });
    if (!resolved) {
      const msg = `Preset '${name}' not found.`;
      logger.warn(msg);
      if (!opts.silent) ui?.notifications?.warn?.(msg);
      return false;
    }
  }

  const curParticles = sc.getFlag?.(packageId, "effects") ?? {};
  const curFilters = sc.getFlag?.(packageId, "filters") ?? {};

  const particleUpdate = {};
  const filterUpdate = {};

  for (const rawKey of Object.keys(curParticles)) {
    const key = rawKey.startsWith("-=") || rawKey.startsWith("==") ? rawKey.slice(2) : rawKey;
    if (ACTIVE_KEY_RE.test(key)) addDeletionKey(particleUpdate, rawKey);
  }
  for (const rawKey of Object.keys(curFilters)) {
    const key = rawKey.startsWith("-=") || rawKey.startsWith("==") ? rawKey.slice(2) : rawKey;
    if (ACTIVE_KEY_RE.test(key)) addDeletionKey(filterUpdate, rawKey);
  }

  const promises = [];
  if (Object.keys(particleUpdate).length) promises.push(sc.setFlag(packageId, "effects", particleUpdate));
  if (Object.keys(filterUpdate).length) promises.push(sc.setFlag(packageId, "filters", filterUpdate));
  if (promises.length) await Promise.all(promises);

  if (!name) return true;

  return await playPreset(name, { ...opts, scene: sc });
}

/**
 * Register this API onto the fxmaster module and global FXMASTER object.
 * Call during init.
 */
export function registerPresetApi() {
  try {
    const mod = game?.modules?.get?.(packageId);
    if (!mod) return;

    mod.api ||= {};
    mod.api.presets ||= {};

    Object.assign(mod.api.presets, {
      play: playPreset,
      stop: stopPreset,
      toggle: togglePreset,
      switch: switchPreset,
      list: listPresets,
      listActive: listActivePresets,
      listValid: listValidPresets,
      hasFxmasterPlus,
      hasFxmaster,
    });

    try {
      globalThis.FXMASTER ||= {};
      globalThis.FXMASTER.api ||= {};
      globalThis.FXMASTER.api.presets = mod.api.presets;
    } catch {}
  } catch (err) {
    logger.error("Failed to register preset API", err);
  }
}

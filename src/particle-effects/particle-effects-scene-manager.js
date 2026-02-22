/**
 * FXMaster: Particle Scene Suppression Manager
 * Builds and applies a CSS-space allow-mask to scene-level particle containers.
 *
 * Container Masks Approach:
 * - SceneMaskManager produces two RTs for particles: { base, cutout }.
 * - ParticleEffectsLayer owns 4 scene buckets (below/above - base/cutout)
 */

import { logger } from "../logger.js";
import { SceneMaskManager } from "../common/base-effects-scene-manager.js";
import { coalesceNextFrame } from "../utils.js";

/**
 * Apply particle scene suppression masks on the next animation frame.
 *
 * {@link SceneMaskManager.refresh} is animation-frame coalesced and may destroy and recreate render textures when it runs. Deferring mask binding until after the refresh executes prevents sprites from holding references to destroyed textures.
 *
 * @type {(layer: any) => void}
 */
const applySceneParticleMasksNextFrame = coalesceNextFrame(
  (layer) => {
    try {
      if (!layer || layer.destroyed) return;

      const liveFx = [];
      try {
        const map = layer?.particleEffects;
        if (map?.values) for (const fx of map.values()) liveFx.push(fx);
      } catch {}

      const dyingFx = [];
      try {
        for (const fx of layer?._dyingSceneEffects ?? []) dyingFx.push(fx);
      } catch {}

      const hasAny = liveFx.length > 0 || dyingFx.length > 0;
      if (!hasAny) {
        try {
          SceneMaskManager.instance.setBelowTokensNeeded?.("particles", false);
          SceneMaskManager.instance.setKindActive?.("particles", false);
        } catch {}
        try {
          layer.setSceneMaskTextures?.({ base: null, cutout: null });
        } catch {}
        return;
      }

      const allFx = [...liveFx, ...dyingFx];
      const anyBelow = allFx.some((fx) => {
        const bt = fx?._fxmOptsCache?.belowTokens ?? fx?.options?.belowTokens ?? fx?.__fxmBelowTokens;
        if (bt && typeof bt === "object" && "value" in bt) return !!bt.value;
        return !!bt;
      });

      const hasSuppression = !!SceneMaskManager.instance.hasSuppressionRegions?.("particles");
      const needsMasking = anyBelow || hasSuppression;

      try {
        SceneMaskManager.instance.setKindActive?.("particles", needsMasking);
        SceneMaskManager.instance.setBelowTokensNeeded?.("particles", anyBelow);
      } catch {}

      if (!needsMasking) {
        try {
          layer.setSceneMaskTextures?.({ base: null, cutout: null });
        } catch {}
        try {
          layer._sanitizeSceneMasks?.();
        } catch {}
        return;
      }

      let { base, cutout } = SceneMaskManager.instance.getMasks("particles");
      if (!base || base.destroyed) {
        try {
          SceneMaskManager.instance.refreshSync("particles");
        } catch {}
        ({ base, cutout } = SceneMaskManager.instance.getMasks("particles"));
      }

      if (!base || base.destroyed) {
        try {
          layer.setSceneMaskTextures?.({ base: null, cutout: null });
        } catch {}
        return;
      }

      try {
        layer._ensureSceneContainers?.();
      } catch {}

      try {
        layer.setSceneMaskTextures?.({ base, cutout: anyBelow ? cutout : null });
      } catch {}

      try {
        layer._sanitizeSceneMasks?.();
      } catch {}
    } catch (err) {
      logger?.error?.(err);
    }
  },
  { key: "fxm:sceneParticlesApplySceneMasks" },
);

/**
 * Recompute and attach suppression masks for scene-level particles.
 */
export function refreshSceneParticlesSuppressionMasks({ sync = false } = {}) {
  try {
    const layer = canvas.particleeffects;
    if (!layer) return;

    layer._dyingSceneEffects ??= new Set();

    const liveFx = [];
    try {
      const map = layer?.particleEffects;
      if (map?.values) for (const fx of map.values()) liveFx.push(fx);
    } catch {}

    const dyingFx = [];
    try {
      for (const fx of layer._dyingSceneEffects ?? []) dyingFx.push(fx);
    } catch {}

    const hasAny = liveFx.length > 0 || dyingFx.length > 0;

    if (!hasAny) {
      try {
        SceneMaskManager.instance.setBelowTokensNeeded?.("particles", false);
        SceneMaskManager.instance.setKindActive?.("particles", false);
      } catch {}

      try {
        layer.setSceneMaskTextures?.({ base: null, cutout: null });
      } catch {}

      return;
    }

    const allFx = [...liveFx, ...dyingFx];
    const anyBelow = allFx.some((fx) => {
      const bt = fx?._fxmOptsCache?.belowTokens ?? fx?.options?.belowTokens ?? fx?.__fxmBelowTokens;
      if (bt && typeof bt === "object" && "value" in bt) return !!bt.value;
      return !!bt;
    });

    const hasSuppression = !!SceneMaskManager.instance.hasSuppressionRegions?.("particles");
    const needsMasking = anyBelow || hasSuppression;

    try {
      SceneMaskManager.instance.setKindActive?.("particles", needsMasking);
      SceneMaskManager.instance.setBelowTokensNeeded?.("particles", anyBelow);
    } catch {}

    if (!needsMasking) {
      try {
        layer.setSceneMaskTextures?.({ base: null, cutout: null });
      } catch {}

      try {
        layer._sanitizeSceneMasks?.();
      } catch {}

      return;
    }

    const r = canvas?.app?.renderer;
    const hiDpi = (r?.resolution ?? window.devicePixelRatio ?? 1) !== 1;

    const wantSync = sync || (anyBelow && hiDpi);

    try {
      if (wantSync) {
        SceneMaskManager.instance.refreshSync("particles");
      } else {
        SceneMaskManager.instance.refresh("particles");
        applySceneParticleMasksNextFrame(layer);
        return;
      }
    } catch {}

    let { base, cutout } = SceneMaskManager.instance.getMasks("particles");

    if (!base) {
      try {
        SceneMaskManager.instance.refreshSync("particles");
      } catch {}
      ({ base, cutout } = SceneMaskManager.instance.getMasks("particles"));
    }

    try {
      layer._ensureSceneContainers?.();
    } catch {}

    try {
      layer.setSceneMaskTextures?.({ base, cutout: anyBelow ? cutout : null });
    } catch {}

    try {
      layer._sanitizeSceneMasks?.();
    } catch {}
  } catch (err) {
    logger?.error?.(err);
  }
}

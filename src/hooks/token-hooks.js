/**
 * FXMaster: Token & Tile Hooks
 *
 * Registers Foundry hooks for token and tile create/update/delete events that trigger mask refreshes for below-object rendering pipelines.
 *
 * @module hooks/token-hooks
 */

import { isEnabled } from "../settings.js";

/**
 * Register token and tile lifecycle hooks.
 *
 * @param {object} ctx - Shared hook context from {@link createHookContext}.
 */
export function registerTokenHooks(ctx) {
  const requestTokenMaskRefreshIfNeeded = () => {
    if (ctx.tokenMaskRefreshDemand?.().any !== true) return;
    ctx.requestTokenMaskRefresh();
  };

  Hooks.on("createToken", (tokenDoc) => {
    if (tokenDoc?.parent !== canvas.scene) return;
    if (!isEnabled()) return;
    requestTokenMaskRefreshIfNeeded();
  });

  Hooks.on("updateToken", (tokenDoc, changed, _options, userId) => {
    if (tokenDoc?.parent !== canvas.scene) return;
    if (!isEnabled()) return;
    if (canvas.particleeffects?.hasParticleBackgroundMovementConsumers?.()) {
      canvas.particleeffects.noteParticleTrailTokenMovement?.(tokenDoc, { changed, userId });
    }
    requestTokenMaskRefreshIfNeeded();
  });

  Hooks.on("controlToken", (placeable) => {
    if (placeable?.document?.parent !== canvas.scene) return;
    if (!isEnabled()) return;
    if (canvas.particleeffects?.hasParticleBackgroundMovementConsumers?.()) {
      canvas.particleeffects.noteParticleTrailTokenControl?.(placeable);
    }
    requestTokenMaskRefreshIfNeeded();
  });

  Hooks.on("deleteToken", (tokenDoc) => {
    if (tokenDoc?.parent !== canvas.scene) return;
    if (!isEnabled()) return;
    canvas.particleeffects?.forgetParticleTrailToken?.(tokenDoc);
    requestTokenMaskRefreshIfNeeded();
  });

  Hooks.on("refreshToken", (placeable) => {
    if (placeable?.document?.parent !== canvas.scene) return;
    if (!isEnabled()) return;
    requestTokenMaskRefreshIfNeeded();
  });

  Hooks.on("createTile", (tileDoc) => {
    if (tileDoc?.parent !== canvas.scene) return;
    if (!isEnabled()) return;
    requestTokenMaskRefreshIfNeeded();
  });

  Hooks.on("updateTile", (tileDoc) => {
    if (tileDoc?.parent !== canvas.scene) return;
    if (!isEnabled()) return;
    requestTokenMaskRefreshIfNeeded();
  });

  Hooks.on("deleteTile", (tileDoc) => {
    if (tileDoc?.parent !== canvas.scene) return;
    if (!isEnabled()) return;
    requestTokenMaskRefreshIfNeeded();
  });
  Hooks.on("refreshTile", (placeable) => {
    if (placeable?.document?.parent !== canvas.scene) return;
    if (!isEnabled()) return;
    requestTokenMaskRefreshIfNeeded();
  });
}

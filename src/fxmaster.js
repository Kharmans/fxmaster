import { isEnabled, registerSettings } from "./settings.js";
import { registerHooks } from "./hooks.js";
import { FXMASTER } from "./config.js";
import { ParticleEffectsLayer } from "./particle-effects/particle-effects-layer.js";
import { registeDrawingsMaskFunctionality } from "./particle-effects/drawings-mask.js";
import { FilterManager } from "./filter-effects/filter-manager.js";
import { isOnTargetMigration, migrate, migration } from "./migration/migration.js";
import { SpecialEffectsManagement } from "./special-effects/applications/special-effects-management.js";
import { SpecialEffectsLayer } from "./special-effects/special-effects-layer.js";
import { registerHandlebarsHelpers } from "./handlebars-helpers.js";
import { registerGetSceneControlButtonsHook } from "./controls.js";
import { format } from "./logger.js";

import "../css/common.css";

window.FXMASTER = {
  filters: FilterManager.instance,
  migration,
};

function registerLayers() {
  CONFIG.Canvas.layers.fxmaster = { layerClass: ParticleEffectsLayer, group: "primary" };
  CONFIG.Canvas.layers.specials = { layerClass: SpecialEffectsLayer, group: "interface" };
}

function parseSpecialEffects() {
  const effectData = game.settings.get("fxmaster", "specialEffects");
  const specialEffects = foundry.utils.deepClone(CONFIG.fxmaster.specialEffects);
  effectData.reduce((acc, cur) => {
    if (!cur.folder) cur.folder = "Custom";
    const normalizedFolder = cur.folder.toLowerCase().replace(/ /g, "");
    if (!acc[normalizedFolder]) acc[normalizedFolder] = { label: cur.folder, effects: [] };
    acc[normalizedFolder].effects.push(cur);
    return acc;
  }, specialEffects);
  Object.keys(specialEffects).forEach((k) => {
    specialEffects[k].effects.sort((a, b) => ("" + a.label).localeCompare(b.label));
  });
  CONFIG.fxmaster.userSpecials = specialEffects;
}

Hooks.once("init", function () {
  registerSettings();
  registerHooks();
  registerLayers();
  registerHandlebarsHelpers();

  if (!CONFIG.fxmaster) CONFIG.fxmaster = {};

  const configDeprecations = {
    weather: "particleEffects",
    filters: "filterEffects",
    specials: "specialEffects",
  };

  const getConfigDeprecationMessage = (old, replacement) =>
    format(`CONFIG#fxmaster#${old} is deprecated in favor of CONFIG#fxmaster#${replacement}'`);

  for (const [old, replacement] of Object.entries(configDeprecations)) {
    if (CONFIG.fxmaster[old]) {
      CONFIG.fxmaster[replacement] = CONFIG.fxmaster[old];
      delete CONFIG.fxmaster[old];
      const msg = getConfigDeprecationMessage(old, replacement);
      foundry.utils.logCompatibilityWarning(msg, {
        mod: foundry.CONST.COMPATIBILITY_MODES.WARNING,
        since: "FXMaster v3.0.0",
        until: "FXMaster v4.0.0",
        stack: false,
      });
    }
  }

  foundry.utils.mergeObject(CONFIG.fxmaster, {
    filterEffects: FXMASTER.filterEffects,
    particleEffects: FXMASTER.particleEffects,
    specialEffects: FXMASTER.specialEffects,
  });

  for (const [old, replacement] of Object.entries(configDeprecations)) {
    Object.defineProperty(CONFIG.fxmaster, old, {
      get: () => {
        const msg = getConfigDeprecationMessage(old, replacement);
        foundry.utils.logCompatibilityWarning(msg, {
          mod: foundry.CONST.COMPATIBILITY_MODES.WARNING,
          since: "FXMaster v3.0.0",
          until: "FXMaster v4.0.0",
          stack: false,
        });
        return CONFIG.fxmaster[replacement];
      },
    });
  }

  const weatherEffects = Object.fromEntries(
    Object.entries(CONFIG.fxmaster.particleEffects).map(([id, effectClass]) => [
      `fxmaster.${id}`,
      {
        id: `fxmaster.${id}`,
        label: `${effectClass.label}WeatherEffectsConfig`,
        effects: [{ id: `${id}Particles`, effectClass }],
      },
    ]),
  );

  CONFIG.originalWeatherEffects = CONFIG.weatherEffects;
  CONFIG.weatherEffects = { ...CONFIG.weatherEffects, ...weatherEffects };
});

Hooks.once("ready", () => {
  migrate();
});

Hooks.on("canvasInit", () => {
  if (isEnabled()) {
    parseSpecialEffects();
  }
});

Hooks.on("updateScene", (scene, data) => {
  if (!isEnabled() || !isOnTargetMigration() || scene !== canvas.scene) {
    return;
  }
  if (
    foundry.utils.hasProperty(data, "flags.fxmaster.effects") ||
    foundry.utils.hasProperty(data, "flags.fxmaster.-=effects")
  ) {
    canvas.fxmaster.drawParticleEffects({ soft: true });
  }
});

Hooks.on("dropCanvasData", async (canvas, data) => {
  if (!(canvas.activeLayer instanceof SpecialEffectsLayer) || !canvas.scene)
    return ui.notifications.warn("You must be on the Effect Controls tab on a scene to drag and drop an effect.");
  if (data.type !== "SpecialEffect") return;

  await new Promise((resolve) => {
    const vid = document.createElement("video");
    vid.addEventListener(
      "loadedmetadata",
      () => {
        data.width = vid.videoWidth * data.scale.x;
        data.height = vid.videoHeight * data.scale.y;
        resolve();
      },
      false,
    );
    vid.src = data.file;
  });

  const tileData = {
    alpha: 1,
    flags: {},
    height: data.height,
    hidden: false,
    texture: { src: data.file },
    locked: false,
    occlusion: { mode: 1, alpha: 0 },
    overHead: false,
    rotation: 0,
    tileSize: 100,
    video: { loop: true, autoplay: true, volume: 0 },
    width: data.width,
    x: data.x - data.anchor.x * data.width,
    y: data.y - data.anchor.y * data.height,
    z: 100,
  };
  ui.notifications.info(`A new Tile was created for effect ${data.label}`);
  canvas.scene.createEmbeddedDocuments("Tile", [tileData]).then(() => {});
});

Hooks.on("hotbarDrop", (hotbar, data) => {
  if (data.type !== "SpecialEffect") return;
  const macroCommand = SpecialEffectsLayer._createMacro(data);
  data.type = "Macro";
  data.data = {
    command: macroCommand,
    name: data.label,
    type: "script",
    author: game.user.id,
  };
});

Hooks.on("updateSetting", (setting) => {
  if (setting.key === "fxmaster.specialEffects") {
    parseSpecialEffects();
    Object.values(ui.windows).forEach((w) => {
      if (w instanceof SpecialEffectsManagement) {
        w.render(false);
      }
    });
  }
});

Hooks.on("renderDrawingHUD", (hud, html) => {
  // Normalize raw DOM element for v13
  const container = html instanceof jQuery ? html[0] : html;
  if (!(container instanceof HTMLElement)) return;

  const leftCol = container.querySelector(".col.left");
  if (!leftCol) return;

  const maskToggle = document.createElement("div");
  maskToggle.classList.add("control-icon");
  if (hud.object.document.flags?.fxmaster?.masking) maskToggle.classList.add("active");
  maskToggle.title = game.i18n.localize("FXMASTER.MaskParticleEffects");
  maskToggle.dataset.action = "mask";
  maskToggle.innerHTML = `<div style="text-align:center;"><i class="fas fa-cloud fa-xs"></i></div>`;

  leftCol.appendChild(maskToggle);
  maskToggle.addEventListener("click", (evt) => {
    evt.preventDefault();
    const isMask = hud.object.document.flags?.fxmaster?.masking;
    const updates = hud.layer.controlled.map((o) => ({
      _id: o.id,
      "flags.fxmaster.masking": !isMask,
    }));
    maskToggle.classList.toggle("active", !isMask);
    canvas.scene.updateEmbeddedDocuments(hud.object.document.documentName, updates);
  });
});

registerGetSceneControlButtonsHook();
registeDrawingsMaskFunctionality();

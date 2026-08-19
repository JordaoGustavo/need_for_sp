import "./styles.css";
import { startApp } from "./ui/app";
import { toggleMute } from "./audio/audioEngine";
import { preloadCarModels } from "./rendering/three/carMesh";
import { CARS } from "./content/cars";

const container = document.getElementById("app");
if (!container) {
  throw new Error("#app root element not found");
}

// Global mute toggle. Ignores key presses inside inputs (e.g. the room link box).
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() !== "m") return;
  if (event.target instanceof HTMLInputElement) return;
  toggleMute();
});

// Warm the GLB car-model cache so garage/race meshes clone instantly.
preloadCarModels(CARS.map((car) => car.visual));

startApp(container);

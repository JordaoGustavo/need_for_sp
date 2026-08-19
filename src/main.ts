import "./styles.css";
import { startApp } from "./ui/app";

const container = document.getElementById("app");
if (!container) {
  throw new Error("#app root element not found");
}

startApp(container);

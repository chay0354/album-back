/**
 * node-canvas pulls Fontconfig on Linux; Vercel has no default config → stderr spam.
 * Point FONTCONFIG_FILE at a minimal conf bundled under fonts/.
 */
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const conf = path.resolve(__dirname, "../fonts/fontconfig-minimal.conf");
if (existsSync(conf)) {
  process.env.FONTCONFIG_FILE = conf;
}

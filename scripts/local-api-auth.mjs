import { readFile } from "node:fs/promises";
import path from "node:path";
import { localAuthorityTokenFilePath } from "../server/local-authority.mjs";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function resolveLocalDataDirectory(environment, rootDirectory) {
  const configured = environment.FRAMEPILOT_DATA_DIR;
  return path.resolve(configured || path.join(rootDirectory, ".framepilot", "data"));
}

export async function readLocalAuthorityToken({ environment = process.env, rootDirectory, suppliedToken } = {}) {
  const token = suppliedToken || await readFile(
    localAuthorityTokenFilePath(resolveLocalDataDirectory(environment, rootDirectory)),
    "utf8"
  ).then((value) => value.trim()).catch((error) => {
    if (error?.code === "ENOENT") {
      throw new Error("CutSteward authority is not initialized. Start the local server once, then retry.");
    }
    throw error;
  });
  if (!TOKEN_PATTERN.test(token)) throw new Error("CutSteward local authority credential is invalid.");
  return token;
}

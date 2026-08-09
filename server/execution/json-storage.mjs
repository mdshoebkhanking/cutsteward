import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, realpath, rename } from "node:fs/promises";
import path from "node:path";

export const EXECUTION_SNAPSHOT_FILE = "execution.snapshot.json";
export const EXECUTION_JOURNAL_FILE = "execution.journal.ndjson";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const NO_FOLLOW = constants.O_NOFOLLOW || 0;

function storageError(message, code = "EXECUTION_STORAGE_PATH_INVALID") {
  return Object.assign(new Error(message), { code });
}

function validateDirectory(directory, label) {
  if (typeof directory !== "string" || !path.isAbsolute(directory)) {
    throw new TypeError(`${label} must be an absolute path supplied by the caller.`);
  }
  const resolved = path.resolve(directory);
  if (resolved === path.parse(resolved).root) {
    throw new TypeError(`${label} cannot be a filesystem root.`);
  }
  return resolved;
}

function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function ensurePrivateRoot(rootDirectory) {
  await mkdir(rootDirectory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  const rootStats = await lstat(rootDirectory);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw storageError("Execution storage root must be a real directory.");
  }
  await chmod(rootDirectory, PRIVATE_DIRECTORY_MODE);
  return realpath(rootDirectory);
}

async function existingPrivateDirectory(directory, privateRoot) {
  let directoryStats;
  try {
    directoryStats = await lstat(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    throw storageError("Execution state path must be a real directory.");
  }
  const resolved = await realpath(directory);
  if (privateRoot && !contained(privateRoot, resolved)) {
    throw storageError("Execution state path leaves the private storage root.");
  }
  await chmod(resolved, PRIVATE_DIRECTORY_MODE);
  return resolved;
}

async function ensureStateDirectory(directory, privateRoot) {
  if (privateRoot) await ensurePrivateRoot(privateRoot);
  try {
    await mkdir(directory, { recursive: !privateRoot, mode: PRIVATE_DIRECTORY_MODE });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const resolved = await existingPrivateDirectory(directory, privateRoot);
  if (!resolved) throw storageError("Execution state directory could not be created.");
  return resolved;
}

async function readPrivateText(filePath) {
  let fileStats;
  try {
    fileStats = await lstat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
    throw storageError("Execution state files must be regular files.");
  }

  const handle = await open(filePath, constants.O_RDONLY | NO_FOLLOW);
  try {
    await handle.chmod(PRIVATE_FILE_MODE);
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

async function readJson(filePath) {
  const contents = await readPrivateText(filePath);
  return contents === null ? null : JSON.parse(contents);
}

async function readJournalTail(filePath) {
  const contents = await readPrivateText(filePath);
  if (contents === null) return null;

  const lines = contents.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].trim()) continue;
    try {
      const envelope = JSON.parse(lines[index]);
      if (envelope?.snapshot && Number.isInteger(envelope.snapshot.revision)) return envelope.snapshot;
    } catch {
      // A process can die during the final append. Earlier complete entries are durable.
    }
  }
  return null;
}

async function appendDurably(filePath, value) {
  const handle = await open(
    filePath,
    constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | NO_FOLLOW,
    PRIVATE_FILE_MODE,
  );
  try {
    await handle.chmod(PRIVATE_FILE_MODE);
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function replaceDurably(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(
    temporaryPath,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | NO_FOLLOW,
    PRIVATE_FILE_MODE,
  );
  try {
    await handle.chmod(PRIVATE_FILE_MODE);
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, filePath);
  await chmod(filePath, PRIVATE_FILE_MODE);
}

/**
 * JSON snapshot + append-only journal storage. Each journal envelope contains
 * the full resulting snapshot. A restart therefore recovers the newest
 * revision even if the process stopped between journal fsync and snapshot
 * replacement.
 */
export function createJsonExecutionStorage({ rootDirectory } = {}) {
  const queues = new Map();
  const privateRoot = rootDirectory === undefined
    ? null
    : validateDirectory(rootDirectory, "rootDirectory");

  const validateStateDirectory = (runDirectory) => {
    const directory = validateDirectory(runDirectory, "runDirectory");
    if (!privateRoot) return directory;
    if (!contained(privateRoot, directory) || path.dirname(directory) !== privateRoot) {
      throw storageError("Execution state directory must be a direct child of the private storage root.");
    }
    return directory;
  };

  const unlockedLoad = async (runDirectory) => {
    const directory = validateStateDirectory(runDirectory);
    if (privateRoot) {
      const root = await ensurePrivateRoot(privateRoot);
      const existing = await existingPrivateDirectory(directory, root);
      if (!existing) return null;
    }
    const [snapshot, journalSnapshot] = await Promise.all([
      readJson(path.join(directory, EXECUTION_SNAPSHOT_FILE)),
      readJournalTail(path.join(directory, EXECUTION_JOURNAL_FILE)),
    ]);
    if (!snapshot) return journalSnapshot ? structuredClone(journalSnapshot) : null;
    if (!journalSnapshot) return structuredClone(snapshot);
    return structuredClone(
      journalSnapshot.revision > snapshot.revision ? journalSnapshot : snapshot,
    );
  };

  const withQueue = async (runDirectory, operation) => {
    const key = validateStateDirectory(runDirectory);
    const prior = queues.get(key) || Promise.resolve();
    let release;
    const next = new Promise((resolve) => {
      release = resolve;
    });
    const tail = prior.then(() => next);
    queues.set(key, tail);
    await prior;
    try {
      return await operation(key);
    } finally {
      release();
      if (queues.get(key) === tail) queues.delete(key);
    }
  };

  return {
    async load(runDirectory) {
      return withQueue(runDirectory, () => unlockedLoad(runDirectory));
    },

    async commit({ runDirectory, expectedRevision, snapshot, event }) {
      return withQueue(runDirectory, async (directory) => {
        const current = await unlockedLoad(directory);
        const actualRevision = current?.revision ?? -1;
        if (actualRevision !== expectedRevision) {
          const error = new Error(
            `Execution snapshot revision conflict: expected ${expectedRevision}, found ${actualRevision}.`,
          );
          error.code = "EXECUTION_REVISION_CONFLICT";
          throw error;
        }
        if (snapshot.revision !== expectedRevision + 1) {
          throw new TypeError("The committed snapshot must advance revision by exactly one.");
        }

        const privateRootReal = privateRoot ? await ensurePrivateRoot(privateRoot) : null;
        await ensureStateDirectory(directory, privateRootReal);
        const envelope = {
          schemaVersion: 1,
          sequence: snapshot.revision,
          at: snapshot.updatedAt,
          event: structuredClone(event),
          snapshot: structuredClone(snapshot),
        };
        await appendDurably(
          path.join(directory, EXECUTION_JOURNAL_FILE),
          `${JSON.stringify(envelope)}\n`,
        );
        await replaceDurably(
          path.join(directory, EXECUTION_SNAPSHOT_FILE),
          `${JSON.stringify(snapshot, null, 2)}\n`,
        );
        return structuredClone(snapshot);
      });
    },
  };
}

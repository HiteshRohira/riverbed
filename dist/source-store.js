import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { posix } from "node:path";
import { randomUUID } from "node:crypto";
function normalizePath(path) {
    return path.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}
async function readDirectory(rootDir, dir = rootDir, files = new Map()) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const isRootBinding = dir === rootDir && entry.name === "lakebed.json";
        if (entry.name === "node_modules" || entry.name === ".lakebed" || entry.name === ".DS_Store" || isRootBinding) {
            continue;
        }
        const absolutePath = join(dir, entry.name);
        if (entry.isDirectory()) {
            await readDirectory(rootDir, absolutePath, files);
            continue;
        }
        if (!entry.isFile()) {
            continue;
        }
        const storePath = normalizePath(relative(rootDir, absolutePath).split(sep).join("/"));
        files.set(storePath, await readFile(absolutePath, "utf8"));
    }
    return files;
}
export class MemorySourceStore {
    files;
    snapshots;
    archived;
    constructor(files = new Map(), snapshots = new Map()) {
        this.files = new Map(files);
        this.snapshots = new Map(snapshots);
        this.archived = false;
    }
    clone() {
        return new MemorySourceStore(this.files, this.snapshots);
    }
    hasFile(path) {
        return this.files.has(normalizePath(path));
    }
    async readFile(path) {
        const normalized = normalizePath(path);
        const contents = this.files.get(normalized);
        if (contents === undefined) {
            throw new Error(`Source file not found: ${normalized}`);
        }
        return contents;
    }
    async writeFile(path, contents) {
        if (this.archived) {
            throw new Error("Cannot write to an archived source store.");
        }
        this.files.set(normalizePath(path), contents);
    }
    async listFiles(root = "") {
        const normalizedRoot = normalizePath(root);
        return Array.from(this.files.keys())
            .filter((path) => path === normalizedRoot || path.startsWith(normalizedRoot ? `${normalizedRoot}/` : ""))
            .sort();
    }
    async snapshot(message = "") {
        const id = randomUUID();
        this.snapshots.set(id, {
            id,
            message,
            at: new Date().toISOString(),
            files: new Map(this.files)
        });
        return id;
    }
    async fork(snapshotId) {
        const snapshot = this.snapshots.get(snapshotId);
        if (!snapshot) {
            throw new Error(`Unknown source snapshot: ${snapshotId}`);
        }
        return new MemorySourceStore(snapshot.files, this.snapshots);
    }
    async archive() {
        this.archived = true;
    }
}
export async function createMemorySourceStoreFromDirectory(rootDir) {
    return new MemorySourceStore(await readDirectory(rootDir));
}
export function sourcePathJoin(...parts) {
    return normalizePath(posix.join(...parts));
}
export function sourcePathDirname(path) {
    return normalizePath(posix.dirname(normalizePath(path)));
}
//# sourceMappingURL=source-store.js.map
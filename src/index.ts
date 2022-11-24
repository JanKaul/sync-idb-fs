import { match } from "ts-pattern";
import { nullable, pattern, variant, Variant } from "variant-ts";
import { File, Metadata, Storage } from "./storage";

type StatLike = {
    type: 'file' | 'dir' | 'symlink';
    mode: number;
    size: number;
    ino: number | string | BigInt;
    mtimeMs: number;
    ctimeMs?: number;
}

export class FS {
    storage: Storage
    constructor() {
        this.storage = new Storage();
    }
    static async construct() {
        let fs = new FS();
        await fs.storage.sync();
        return fs
    }
    readFileSync(filepath: string, opts?: any): Uint8Array {
        return match(nullable(this.storage.get(filepath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("File"), res => {
                        return res.value[0]
                    })
                    .with(pattern("Symlink"), res => {
                        return this.readFileSync(res.value[0], opts)
                    })
                    .otherwise(() => {
                        throw 'ENOENT';
                    })
            })
            .otherwise(() => {
                throw 'ENOENT';
            })

    }
    writeFileSync(filepath: string, data: Uint8Array, opts?: any): void {
        let metadata: Metadata = { mode: 0o777, size: data.byteLength }
        let file = variant<File>("File", [data, metadata]);
        this.storage.setSync(filepath, file)
        this.#addFileToDir(filepath)
    }
    unlinkSync(filepath: string, opts?: any): void {
        this.storage.deleteSync(filepath)
        this.#removeFileFromDir(filepath)
    }
    readdirSync(filepath: string, opts?: any): string[] {
        return match(nullable(this.storage.get(filepath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("Directory"), res => {
                        return res.value[0]
                    })
                    .otherwise(() => {
                        throw 'ENOTDIR';
                    })
            })
            .otherwise(() => {
                throw 'ENOENT';
            })
    }
    mkdirSync(filepath: string, opts?: any): void {
        let metadata: Metadata = { mode: 0o777, size: 0 }
        let file = variant<File>("Directory", [[], metadata]);
        this.storage.setSync(filepath, file)
        this.#addFileToDir(filepath)
    }
    rmdirSync(filepath: string, opts?: any): void {
        this.storage.deleteSync(filepath)
        this.#removeFileFromDir(filepath)
    }
    statSync(filepath: string, opts?: any): StatLike {
        return match(nullable(this.storage.get(filepath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("File"), res => {
                        return {
                            type: 'file' as 'file',
                            mode: res.value[1].mode,
                            size: res.value[1].size,
                            ino: 0,
                            mtimeMs: 0
                        }
                    })
                    .with(pattern("Directory"), res => {
                        return {
                            type: 'dir' as 'dir',
                            mode: res.value[1].mode,
                            size: res.value[1].size,
                            ino: 0,
                            mtimeMs: 0
                        }
                    })
                    .with(pattern("Symlink"), res => {
                        return this.statSync(res.value[0], opts)
                    })
                    .exhaustive()
            })
            .otherwise(() => {
                throw 'ENOENT';
            })
    }
    lstatSync(filepath: string, opts?: any): StatLike {
        return match(nullable(this.storage.get(filepath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("File"), res => {
                        return {
                            type: 'file' as 'file',
                            mode: res.value[1].mode,
                            size: res.value[1].size,
                            ino: 0,
                            mtimeMs: 0
                        }
                    })
                    .with(pattern("Directory"), res => {
                        return {
                            type: 'dir' as 'dir',
                            mode: res.value[1].mode,
                            size: res.value[1].size,
                            ino: 0,
                            mtimeMs: 0
                        }
                    })
                    .with(pattern("Symlink"), res => {
                        return {
                            type: 'symlink' as 'symlink',
                            mode: res.value[1].mode,
                            size: res.value[1].size,
                            ino: 0,
                            mtimeMs: 0
                        }
                    })
                    .exhaustive()
            })
            .otherwise(() => {
                throw 'ENOENT';
            })
    }
    existsSync(filepath: string, opts?: any): boolean {
        return match(nullable(this.storage.get(filepath)))
            .with(pattern("some"), () => {
                return true
            })
            .otherwise(() => {
                return false
            });
    }
    readlinkSync(filepath: string, opts?: any): string {
        return match(nullable(this.storage.get(filepath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("Symlink"), res => {
                        return res.value[0]
                    })
                    .otherwise(() => {
                        throw 'ENOENT';
                    })
            })
            .otherwise(() => {
                throw 'ENOENT';
            })
    }
    symlinkSync(target: string, filepath: string, opts?: any): void {
        let metadata: Metadata = { mode: 0o777, size: 0 };
        let file = variant<File>("Symlink", [target, metadata]);
        this.storage.setSync(filepath, file)
        this.#addFileToDir(filepath)
    }

    chmodSync(filepath: string, mode: number): void {
        match(nullable(this.storage.get(filepath)))
            .with(pattern("some"), res => {
                let file = res.value;
                file.value[1].mode = mode
                this.storage.setSync(filepath, file)
            })
            .otherwise(() => {
                throw 'ENOENT';
            })
    }

    get promises(): PromisifiedFS {
        return new PromisifiedFS(this.storage)
    }

    #removeFileFromDir(filepath: string) {
        let dirpath = filepath.split("/").slice(0, -1).join("/");
        let dir = match(nullable(this.storage.get(dirpath === "" ? "/" : dirpath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("Directory"), res => {
                        return res.value[0]
                    })
                    .otherwise(() => {
                        throw 'ENOTDIR';
                    })
            })
            .otherwise(() => {
                throw 'ENOENT';
            })
        let newDir = dir.filter(x => { return !(x === filepath) })
        let metadata: Metadata = { mode: 0o777, size: 0 };
        let file = variant<File>("Directory", [newDir, metadata]);
        this.storage.setSync(dirpath, file)
    }

    #addFileToDir(filepath: string) {
        let dirpath = filepath.split("/").slice(0, -1).join("/");
        let dir = match(nullable(this.storage.get(dirpath === "" ? "/" : dirpath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("Directory"), res => {
                        return res.value[0]
                    })
                    .otherwise(() => {
                        throw 'ENOTDIR';
                    })
            })
            .otherwise(() => {
                throw 'ENOENT';
            })
        let metadata: Metadata = { mode: 0o777, size: 0 };
        let file = variant<File>("Directory", [[...dir, filepath], metadata]);
        this.storage.setSync(dirpath, file)
    }
}

export class PromisifiedFS {
    storage: Storage
    constructor(storage: Storage) {
        this.storage = storage;
    }
    async readFile(filepath: string, opts?: any): Promise<Uint8Array> {
        return match(nullable(this.storage.get(filepath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("File"), res => {
                        return res.value[0]
                    })
                    .with(pattern("Symlink"), res => {
                        return this.readFile(res.value[0], opts)
                    })
                    .otherwise(() => {
                        throw 'ENOENT';
                    })
            })
            .otherwise(() => {
                throw 'ENOENT';
            })

    }
    async writeFile(filepath: string, data: Uint8Array, opts?: any): Promise<void> {
        let metadata: Metadata = { mode: 0o777, size: data.byteLength }
        let file = variant<File>("File", [data, metadata]);
        await this.storage.set(filepath, file)
        this.#addFileToDir(filepath)
    }
    async unlink(filepath: string, opts?: any): Promise<void> {
        await this.storage.delete(filepath)
        this.#removeFileFromDir(filepath)
    }
    async readdir(filepath: string, opts?: any): Promise<string[]> {
        return match(nullable(this.storage.get(filepath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("Directory"), res => {
                        return res.value[0]
                    })
                    .otherwise(() => {
                        throw 'ENOTDIR';
                    })
            })
            .otherwise(() => {
                throw 'ENOENT';
            })
    }
    async mkdir(filepath: string, opts?: any): Promise<void> {
        let metadata: Metadata = { mode: 0o777, size: 0 }
        let file = variant<File>("Directory", [[], metadata]);
        await this.storage.set(filepath, file)
        this.#addFileToDir(filepath)
    }
    async rmdir(filepath: string, opts?: any): Promise<void> {
        await this.storage.delete(filepath)
        this.#removeFileFromDir(filepath)
    }
    async stat(filepath: string, opts?: any): Promise<StatLike> {
        return match(nullable(this.storage.get(filepath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("File"), res => {
                        return {
                            type: 'file' as 'file',
                            mode: res.value[1].mode,
                            size: res.value[1].size,
                            ino: 0,
                            mtimeMs: 0
                        }
                    })
                    .with(pattern("Directory"), res => {
                        return {
                            type: 'dir' as 'dir',
                            mode: res.value[1].mode,
                            size: res.value[1].size,
                            ino: 0,
                            mtimeMs: 0
                        }
                    })
                    .with(pattern("Symlink"), res => {
                        return this.stat(res.value[0], opts)
                    })
                    .exhaustive()
            })
            .otherwise(() => {
                throw 'ENOENT';
            })
    }
    async lstat(filepath: string, opts?: any): Promise<StatLike> {
        return match(nullable(this.storage.get(filepath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("File"), res => {
                        return {
                            type: 'file' as 'file',
                            mode: res.value[1].mode,
                            size: res.value[1].size,
                            ino: 0,
                            mtimeMs: 0
                        }
                    })
                    .with(pattern("Directory"), res => {
                        return {
                            type: 'dir' as 'dir',
                            mode: res.value[1].mode,
                            size: res.value[1].size,
                            ino: 0,
                            mtimeMs: 0
                        }
                    })
                    .with(pattern("Symlink"), res => {
                        return {
                            type: 'symlink' as 'symlink',
                            mode: res.value[1].mode,
                            size: res.value[1].size,
                            ino: 0,
                            mtimeMs: 0
                        }
                    })
                    .exhaustive()
            })
            .otherwise(() => {
                throw 'ENOENT';
            })
    }
    async exists(filepath: string, opts?: any): Promise<boolean> {
        return match(nullable(this.storage.get(filepath)))
            .with(pattern("some"), () => {
                return true
            })
            .otherwise(() => {
                return false
            });
    }
    async readlink(filepath: string, opts?: any): Promise<string> {
        return match(nullable(this.storage.get(filepath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("Symlink"), res => {
                        return res.value[0]
                    })
                    .otherwise(() => {
                        throw 'ENOENT';
                    })
            })
            .otherwise(() => {
                throw 'ENOENT';
            })
    }
    async symlink(target: string, filepath: string, opts?: any): Promise<void> {
        let metadata: Metadata = { mode: 0o777, size: 0 };
        let file = variant<File>("Symlink", [target, metadata]);
        await this.storage.set(filepath, file)
        this.#addFileToDir(filepath)
    }

    async chmod(filepath: string, mode: number): Promise<void> {
        await match(nullable(this.storage.get(filepath)))
            .with(pattern("some"), async res => {
                let file = res.value;
                file.value[1].mode = mode
                await this.storage.set(filepath, file)
            })
            .otherwise(() => {
                throw 'ENOENT';
            })
    }

    async #removeFileFromDir(filepath: string): Promise<void> {
        let dirpath = filepath.split("/").slice(0, -1).join("/");
        let dir = match(nullable(this.storage.get(dirpath === "" ? "/" : dirpath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("Directory"), res => {
                        return res.value[0]
                    })
                    .otherwise(() => {
                        throw 'ENOTDIR';
                    })
            })
            .otherwise(() => {
                throw 'ENOENT';
            })
        let newDir = dir.filter(x => { return !(x === filepath) })
        let metadata: Metadata = { mode: 0o777, size: 0 };
        let file = variant<File>("Directory", [newDir, metadata]);
        await this.storage.set(dirpath, file)
    }

    async #addFileToDir(filepath: string): Promise<void> {
        let dirpath = filepath.split("/").slice(0, -1).join("/");
        let dir = match(nullable(this.storage.get(dirpath === "" ? "/" : dirpath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("Directory"), res => {
                        return res.value[0]
                    })
                    .otherwise(() => {
                        throw 'ENOTDIR';
                    })
            })
            .otherwise(() => {
                throw 'ENOENT';
            })
        let metadata: Metadata = { mode: 0o777, size: 0 };
        let file = variant<File>("Directory", [[...dir, filepath], metadata]);
        await this.storage.set(dirpath, file)
    }
}
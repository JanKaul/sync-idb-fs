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
                        throw new Error(`EISDIR: Couldn't read file, ${filepath} is a directory`);
                    })
            })
            .otherwise(() => {
                throw new Error(`ENOENT: Couldn't read file, ${filepath} does not exist`);
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
                        return res.value[0].map(x => { return filepath + (filepath.endsWith("/") ? "" : "/") + x })
                    })
                    .otherwise(() => {
                        throw new Error(`ENOTDIR: Couldn't read directory, ${filepath} is not a directory`);
                    })
            })
            .otherwise(() => {
                throw new Error(`ENOENT: Couldn't read directory, ${filepath} does not exist`);
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
                throw new Error(`ENOENT: Couldn't read metadata, ${filepath} does not exist`);
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
                throw new Error(`ENOENT: Couldn't read metadata, ${filepath} does not exist`);
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
                        throw new Error(`ENOENT: Couldn't read symlink ${filepath} is not a symlink`);
                    })
            })
            .otherwise(() => {
                throw new Error(`ENOENT: Couldn't read symlink, ${filepath} does not exist`);
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
                throw new Error(`ENOENT: Couldn't change mode, ${filepath} does not exist`);
            })
    }

    get promises(): PromisifiedFS {
        return new PromisifiedFS(this.storage)
    }

    #removeFileFromDir(filepath: string) {
        let temp = filepath.split("/");
        let name = temp.pop()
        if (temp[0] === "") { temp.shift() };
        let dirpath = "/" + temp.join("/");
        let dir = match(nullable(this.storage.get(dirpath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("Directory"), res => {
                        return res.value[0]
                    })
                    .otherwise(() => {
                        throw new Error(`ENOTDIR: Couldn't remove file from dir, ${filepath} is not a directory`);
                    })
            })
            .otherwise(() => {
                throw new Error(`ENOENT: Couldn't remove file from dir, ${filepath} does not exist`);
            })
        let newDir = dir.filter(x => { return !(x === name) })
        let metadata: Metadata = { mode: 0o777, size: 0 };
        let file = variant<File>("Directory", [newDir, metadata]);
        this.storage.setSync(dirpath, file)
    }

    #addFileToDir(filepath: string) {
        let temp = filepath.split("/");
        let name = temp.pop()
        if (temp[0] === "") { temp.shift() };
        let dirpath = "/" + temp.join("/");
        let dir = match(nullable(this.storage.get(dirpath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("Directory"), res => {
                        return res.value[0]
                    })
                    .otherwise(() => {
                        throw new Error(`ENOTDIR: Couldn't add file to dir, ${filepath} is not a directory`);
                    })
            })
            .otherwise(() => {
                throw new Error(`ENOENT: Couldn't add file to dir, ${dirpath} does not exist`);
            })
        let newDir = dir.filter(x => { return !(x === name) })
        let metadata: Metadata = { mode: 0o777, size: 0 };
        let file = variant<File>("Directory", [[...newDir, name], metadata]);
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
                        throw new Error(`EISDIR: Couln't read file, ${filepath} is a directory`);
                    })
            })
            .otherwise(() => {
                throw new Error(`ENOENT: Couldn't read file, ${filepath} does not exist`);
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
    async rename(oldFilepath: string, newFilepath: string, opts?: any): Promise<void> {
        let temp = match(nullable(this.storage.get(oldFilepath))).with(pattern("some"), res => res.value).otherwise(() => { throw new Error(`ENOENT: Couldn't rename file, ${oldFilepath} does not exist`); })
        await this.storage.delete(oldFilepath);
        await this.storage.set(newFilepath, temp)
        await this.#removeFileFromDir(oldFilepath)
        await this.#addFileToDir(newFilepath)
    }
    async readdir(filepath: string, opts?: any): Promise<string[]> {
        return match(nullable(this.storage.get(filepath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("Directory"), res => {
                        return res.value[0].map(x => { return filepath + (filepath.endsWith("/") ? "" : "/") + x })
                    })
                    .otherwise(() => {
                        throw new Error(`ENOTDIR: Couldn't read directory, ${filepath} is not a directory`);
                    })
            })
            .otherwise(() => {
                throw new Error(`ENOENT: Couldn't read directory, ${filepath} does not exist`);
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
                throw new Error(`ENOENT: Couldn't read metadata, ${filepath} does not exist`);
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
                throw new Error(`ENOENT: Couldn't read metadata, ${filepath} does not exist`);
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
                        throw new Error(`ENOENT: Couldn't read symlink, ${filepath} is not a symlink`);
                    })
            })
            .otherwise(() => {
                throw new Error(`ENOENT: Couldn't read symlink, ${filepath} does not exist`);
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
                throw new Error(`ENOENT: Couldn't change mode, ${filepath} does not exist`);
            })
    }

    async #removeFileFromDir(filepath: string): Promise<void> {
        let temp = filepath.split("/");
        let name = temp.pop()
        if (temp[0] === "") { temp.shift() };
        let dirpath = "/" + temp.join("/");
        let dir = match(nullable(this.storage.get(dirpath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("Directory"), res => {
                        return res.value[0]
                    })
                    .otherwise(() => {
                        throw new Error(`ENOTDIR: Couldn't remove file from dir, ${dirpath} is not a directory`);
                    })
            })
            .otherwise(() => {
                throw new Error(`ENOENT: Couldn't remove file from dir, ${dirpath} does not exist`);
            })
        let newDir = dir.filter(x => { return !(x === name) })
        let metadata: Metadata = { mode: 0o777, size: 0 };
        let file = variant<File>("Directory", [newDir, metadata]);
        await this.storage.set(dirpath, file)
    }

    async #addFileToDir(filepath: string): Promise<void> {
        let temp = filepath.split("/");
        let name = temp.pop()
        if (temp[0] === "") { temp.shift() };
        let dirpath = "/" + temp.join("/");
        let dir = match(nullable(this.storage.get(dirpath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("Directory"), res => {
                        return res.value[0]
                    })
                    .otherwise(() => {
                        throw new Error(`ENOTDIR: Couldn't add file to dir, ${dirpath} is not a directory`);
                    })
            })
            .otherwise(() => {
                throw new Error(`ENOENT: Couldn't add file to dir, ${dirpath} does not exist`);
            })
        let newDir = dir.filter(x => { return !(x === name) })
        let metadata: Metadata = { mode: 0o777, size: 0 };
        let file = variant<File>("Directory", [[...newDir, name], metadata]);
        await this.storage.set(dirpath, file)
    }
}
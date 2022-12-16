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
        return match(nullable(this.storage.get(stringToPath(filepath))))
            .with(pattern("some"), res => {
                return match(res.val)
                    .with(pattern("File"), res => {
                        return res.val[0]
                    })
                    .with(pattern("Symlink"), res => {
                        return this.readFileSync(res.val[0], opts)
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
        this.storage.setSync(stringToPath(filepath), file)
    }
    unlinkSync(filepath: string, opts?: any): void {
        this.storage.deleteSync(stringToPath(filepath))
    }
    readdirSync(filepath: string, opts?: any): string[] {
        return match(nullable(this.storage.get(stringToPath(filepath))))
            .with(pattern("some"), res => {
                return match(res.val)
                    .with(pattern("Directory"), res => {
                        return [...res.val[0].keys()].map(x => { return filepath + (filepath.endsWith("/") ? "" : "/") + x })
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
        let file = variant<File>("Directory", [new Map(), metadata]);
        this.storage.setSync(stringToPath(filepath), file)
    }
    rmdirSync(filepath: string, opts?: any): void {
        this.storage.deleteSync(stringToPath(filepath))
    }
    statSync(filepath: string, opts?: any): StatLike {
        return match(nullable(this.storage.get(stringToPath(filepath))))
            .with(pattern("some"), res => {
                return match(res.val)
                    .with(pattern("File"), res => {
                        return {
                            type: 'file' as 'file',
                            mode: res.val[1].mode,
                            size: res.val[1].size,
                            ino: 0,
                            mtimeMs: 0
                        }
                    })
                    .with(pattern("Directory"), res => {
                        return {
                            type: 'dir' as 'dir',
                            mode: res.val[1].mode,
                            size: res.val[1].size,
                            ino: 0,
                            mtimeMs: 0
                        }
                    })
                    .with(pattern("Symlink"), res => {
                        return this.statSync(res.val[0], opts)
                    })
                    .exhaustive()
            })
            .otherwise(() => {
                throw new Error(`ENOENT: Couldn't read metadata, ${filepath} does not exist`);
            })
    }
    lstatSync(filepath: string, opts?: any): StatLike {
        return match(nullable(this.storage.get(stringToPath(filepath))))
            .with(pattern("some"), res => {
                return match(res.val)
                    .with(pattern("File"), res => {
                        return {
                            type: 'file' as 'file',
                            mode: res.val[1].mode,
                            size: res.val[1].size,
                            ino: 0,
                            mtimeMs: 0
                        }
                    })
                    .with(pattern("Directory"), res => {
                        return {
                            type: 'dir' as 'dir',
                            mode: res.val[1].mode,
                            size: res.val[1].size,
                            ino: 0,
                            mtimeMs: 0
                        }
                    })
                    .with(pattern("Symlink"), res => {
                        return {
                            type: 'symlink' as 'symlink',
                            mode: res.val[1].mode,
                            size: res.val[1].size,
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
        return match(nullable(this.storage.get(stringToPath(filepath))))
            .with(pattern("some"), () => {
                return true
            })
            .otherwise(() => {
                return false
            });
    }
    readlinkSync(filepath: string, opts?: any): string {
        return match(nullable(this.storage.get(stringToPath(filepath))))
            .with(pattern("some"), res => {
                return match(res.val)
                    .with(pattern("Symlink"), res => {
                        return res.val[0]
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
        this.storage.setSync(stringToPath(filepath), file)
    }

    chmodSync(filepath: string, mode: number): void {
        match(nullable(this.storage.get(stringToPath(filepath))))
            .with(pattern("some"), res => {
                let file = res.val;
                file.val[1].mode = mode
                this.storage.setSync(stringToPath(filepath), file)
            })
            .otherwise(() => {
                throw new Error(`ENOENT: Couldn't change mode, ${filepath} does not exist`);
            })
    }

    get promises(): PromisifiedFS {
        return new PromisifiedFS(this.storage)
    }
}

export class PromisifiedFS {
    storage: Storage
    constructor(storage: Storage) {
        this.storage = storage;
    }
    async readFile(filepath: string, opts?: any): Promise<Uint8Array> {
        return await match(nullable(this.storage.get(stringToPath(filepath))))
            .with(pattern("some"), res => {
                return match(res.val)
                    .with(pattern("File"), res => {
                        return Promise.resolve(res.val[0])
                    })
                    .with(pattern("Symlink"), async res => {
                        return await this.readFile(res.val[0], opts)
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
        await this.storage.set(stringToPath(filepath), file)
    }
    async unlink(filepath: string, opts?: any): Promise<void> {
        await this.storage.delete(stringToPath(filepath))
    }
    async rename(oldFilepath: string, newFilepath: string, opts?: any): Promise<void> {
        let temp = match(nullable(this.storage.get(stringToPath(oldFilepath)))).with(pattern("some"), res => res.val).otherwise(() => { throw new Error(`ENOENT: Couldn't rename file, ${oldFilepath} does not exist`); })
        await this.storage.delete(stringToPath(oldFilepath));
        await this.storage.set(stringToPath(newFilepath), temp)
    }
    async readdir(filepath: string, opts?: any): Promise<string[]> {
        return await match(nullable(this.storage.get(stringToPath(filepath))))
            .with(pattern("some"), res => {
                return match(res.val)
                    .with(pattern("Directory"), res => {
                        return Promise.resolve([...res.val[0].keys()].map(x => { return filepath + (filepath.endsWith("/") ? "" : "/") + x }))
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
        let file = variant<File>("Directory", [new Map(), metadata]);
        await this.storage.set(stringToPath(filepath), file)
    }
    async rmdir(filepath: string, opts?: any): Promise<void> {
        await this.storage.delete(stringToPath(filepath))
    }
    async stat(filepath: string, opts?: any): Promise<StatLike> {
        return await match(nullable(this.storage.get(stringToPath(filepath))))
            .with(pattern("some"), res => {
                return match(res.val)
                    .with(pattern("File"), res => {
                        return Promise.resolve({
                            type: 'file' as 'file',
                            mode: res.val[1].mode,
                            size: res.val[1].size,
                            ino: 0,
                            mtimeMs: 0
                        })
                    })
                    .with(pattern("Directory"), res => {
                        return Promise.resolve({
                            type: 'dir' as 'dir',
                            mode: res.val[1].mode,
                            size: res.val[1].size,
                            ino: 0,
                            mtimeMs: 0
                        })
                    })
                    .with(pattern("Symlink"), async res => {
                        return await this.stat(res.val[0], opts)
                    })
                    .exhaustive()
            })
            .otherwise(() => {
                throw new Error(`ENOENT: Couldn't read metadata, ${filepath} does not exist`);
            })
    }
    async lstat(filepath: string, opts?: any): Promise<StatLike> {
        return await match(nullable(this.storage.get(stringToPath(filepath))))
            .with(pattern("some"), res => {
                return match(res.val)
                    .with(pattern("File"), res => {
                        return Promise.resolve({
                            type: 'file' as 'file',
                            mode: res.val[1].mode,
                            size: res.val[1].size,
                            ino: 0,
                            mtimeMs: 0
                        })
                    })
                    .with(pattern("Directory"), res => {
                        return Promise.resolve({
                            type: 'dir' as 'dir',
                            mode: res.val[1].mode,
                            size: res.val[1].size,
                            ino: 0,
                            mtimeMs: 0
                        })
                    })
                    .with(pattern("Symlink"), res => {
                        return Promise.resolve({
                            type: 'symlink' as 'symlink',
                            mode: res.val[1].mode,
                            size: res.val[1].size,
                            ino: 0,
                            mtimeMs: 0
                        })
                    })
                    .exhaustive()
            })
            .otherwise(() => {
                throw new Error(`ENOENT: Couldn't read metadata, ${filepath} does not exist`);
            })
    }
    async exists(filepath: string, opts?: any): Promise<boolean> {
        return await match(nullable(this.storage.get(stringToPath(filepath))))
            .with(pattern("some"), () => {
                return Promise.resolve(true)
            })
            .otherwise(() => {
                return Promise.resolve(false)
            });
    }
    async readlink(filepath: string, opts?: any): Promise<string> {
        return await match(nullable(this.storage.get(stringToPath(filepath))))
            .with(pattern("some"), res => {
                return match(res.val)
                    .with(pattern("Symlink"), res => {
                        return Promise.resolve(res.val[0])
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
        await this.storage.set(stringToPath(filepath), file)
    }

    async chmod(filepath: string, mode: number): Promise<void> {
        await match(nullable(this.storage.get(stringToPath(filepath))))
            .with(pattern("some"), async res => {
                let file = res.val;
                file.val[1].mode = mode
                await this.storage.set(stringToPath(filepath), file)
            })
            .otherwise(() => {
                throw new Error(`ENOENT: Couldn't change mode, ${filepath} does not exist`);
            })
    }
}

export let pathToString = (path: string[]) => {
    return "/" + path.join("/")
}

export let stringToPath = (str: string) => {
    if (str === "/") {
        return []
    } else {
        let path = str.split("/");
        if (path[0] === "") { path.shift() }
        return path
    }
}
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
    readFileSync(filepath: string, opts: any): Uint8Array {
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
    writeFileSync(filepath: string, data: Uint8Array, opts: any): void {
        let metadata: Metadata = { mode: 0o777, size: data.byteLength }
        let file = variant<File>("File", [data, metadata]);
        this.storage.set(filepath, file)
        this.#addFileToDir(filepath)
    }
    unlinkSync(filepath: string, opts: any): void {
        this.storage.delete(filepath)
        this.#removeFileFromDir(filepath)
    }
    readdirSync(filepath: string, opts: any): string[] {
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
    mkdirSync(filepath: string, opts: any): void {
        let metadata: Metadata = { mode: 0o777, size: 0 }
        let file = variant<File>("Directory", [[], metadata]);
        this.storage.set(filepath, file)
        this.#addFileToDir(filepath)
    }
    rmdirSync(filepath: string, opts: any): void {
        this.storage.delete(filepath)
        this.#removeFileFromDir(filepath)
    }
    statSync(filepath: string, opts: any): StatLike {
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
    lstatSync(filepath: string, opts: any): StatLike {
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
    readlinkSync(filepath: string, opts: any): string {
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
    symlinkSync(target: string, filepath: string, opts: any): void {
        let metadata: Metadata = { mode: 0o777, size: 0 };
        let file = variant<File>("Symlink", [target, metadata]);
        this.storage.set(filepath, file)
        this.#addFileToDir(filepath)
    }

    chmodSync(filepath: string, mode: number): void {
        match(nullable(this.storage.get(filepath)))
            .with(pattern("some"), res => {
                let file = res.value;
                file.value[1].mode = mode
                this.storage.set(filepath, file)
            })
            .otherwise(() => {
                throw 'ENOENT';
            })
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
        this.storage.set(dirpath, file)
    }

    #addFileToDir(filepath: string) {
        let dirpath = filepath.split("/").slice(0, -1).join("/");
        let dir = match(nullable(this.storage.get(dirpath === "" ? "/" : dirpath)))
            .with(pattern("some"), res => {
                return match(res.value)
                    .with(pattern("Directory"), res => {
                        return res.value
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
        this.storage.set(dirpath, file)
    }
}
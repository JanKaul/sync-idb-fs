import { match } from "ts-pattern";
import { nullable, pattern, variant, Variant } from "variant-ts";

let encoder = new TextEncoder;
let decoder = new TextDecoder;

type File =
    Variant<"File", [string, Metadata]>
    | Variant<"Directory", [string[], Metadata]>
    | Variant<"Symlink", [string, Metadata]>

type Metadata = {
    mode: number,
    size: number
}

type StatLike = {
    type: 'file' | 'dir' | 'symlink';
    mode: number;
    size: number;
    ino: number | string | BigInt;
    mtimeMs: number;
    ctimeMs?: number;
}

export class FS {
    constructor() {
        if (!localStorage.getItem("/")) {
            this.mkdirSync("/", {})
        }
    }
    readFileSync(filepath: string, opts: any): Uint8Array {
        return match(nullable(localStorage.getItem(filepath)))
            .with(pattern("some"), res => {
                let file: File = JSON.parse(res.value)
                return match(file)
                    .with(pattern("File"), res => {
                        return encoder.encode(res.value[0])
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
        let file = variant<File>("File", [decoder.decode(data), metadata]);
        localStorage.setItem(filepath, JSON.stringify(file))
        addFileToDir(filepath)
    }
    unlinkSync(filepath: string, opts: any): void {
        localStorage.removeItem(filepath)
        removeFileFromDir(filepath)
    }
    readdirSync(filepath: string, opts: any): string[] {
        return match(nullable(localStorage.getItem(filepath)))
            .with(pattern("some"), res => {
                let file: File = JSON.parse(res.value)
                return match(file)
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
        localStorage.setItem(filepath, JSON.stringify(file))
        addFileToDir(filepath)
    }
    rmdirSync(filepath: string, opts: any): void {
        localStorage.removeItem(filepath)
        removeFileFromDir(filepath)
    }
    statSync(filepath: string, opts: any): StatLike {
        return match(nullable(localStorage.getItem(filepath)))
            .with(pattern("some"), res => {
                let file: File = JSON.parse(res.value)
                return match(file)
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
        return match(nullable(localStorage.getItem(filepath)))
            .with(pattern("some"), res => {
                let file: File = JSON.parse(res.value)
                return match(file)
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
        return match(nullable(localStorage.getItem(filepath)))
            .with(pattern("some"), res => {
                let file: File = JSON.parse(res.value)
                return match(file)
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
        localStorage.setItem(filepath, JSON.stringify(file))
        addFileToDir(filepath)
    }
}

let removeFileFromDir = (filepath: string) => {
    let dirpath = filepath.split("/").slice(0, -1).join("/");
    let dir = match(nullable(localStorage.getItem(dirpath)))
        .with(pattern("some"), res => {
            let file: File = JSON.parse(res.value)
            return match(file)
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
    localStorage.setItem(dirpath, JSON.stringify(file))
}

let addFileToDir = (filepath: string) => {
    let dirpath = filepath.split("/").slice(0, -1).join("/");
    let dir = match(nullable(localStorage.getItem(dirpath)))
        .with(pattern("some"), res => {
            let file: File = JSON.parse(res.value)
            return match(file)
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
    localStorage.setItem(dirpath, JSON.stringify(file))
}
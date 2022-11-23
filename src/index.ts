import { match } from "ts-pattern";
import { nullable, pattern, variant, Variant } from "variant-ts";

let encoder = new TextEncoder;
let decoder = new TextDecoder;

type File =
    Variant<"File", string>
    | Variant<"Directory", string[]>

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
                        return encoder.encode(res.value)
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
        let file = variant<File>("File", decoder.decode(data));
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
                        return res.value
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
        let file = variant<File>("Directory", []);
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
                    .with(pattern("File"), () => {
                        return {
                            type: 'file' as 'file',
                            mode: 0,
                            size: 0,
                            ino: 0,
                            mtimeMs: 0
                        }
                    })
                    .with(pattern("Directory"), () => {
                        return {
                            type: 'dir' as 'dir',
                            mode: 0,
                            size: 0,
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
}

let removeFileFromDir = (filepath: string) => {
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
    let newDir = dir.filter(x => { return !(x === filepath) })
    let file = variant<File>("Directory", newDir);
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
    let file = variant<File>("Directory", [...dir, filepath]);
    localStorage.setItem(dirpath, JSON.stringify(file))
}
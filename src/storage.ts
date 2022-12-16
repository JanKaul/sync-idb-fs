import { set, get, del, entries } from 'idb-keyval';
import { match } from 'ts-pattern';
import { none, nullable, pattern, some, variant, Variant, Option } from 'variant-ts';

let encoder = new TextEncoder();
let decoder = new TextDecoder();

export type File =
    Variant<"File", [Uint8Array, Metadata]>
    | Variant<"Directory", [Map<string, Uint8Array>, Metadata]>
    | Variant<"Symlink", [string, Metadata]>

export type Metadata = {
    mode: number,
    size: number
}

export class Storage {
    mirror: Map<string, File>;
    constructor() {
        this.mirror = new Map();
    }
    static async construct(): Promise<Storage> {
        let storage = new Storage();
        await storage.sync()
        return storage
    }
    async set(key: string[], value: File): Promise<void> {
        let identifier = this.#getIdentifier(key);

        if (identifier !== undefined) {
            this.mirror.set(decoder.decode(identifier), value)
            await set(decoder.decode(identifier), value);
        } else {
            let bytes = new Uint8Array(16)
            crypto.getRandomValues(bytes);
            let identifier = decoder.decode(bytes);
            this.mirror.set(identifier, value)
            await set(identifier, value);
            await this.#addFileToDir(key, encoder.encode(identifier))
        }
        return Promise.resolve()
    }
    setSync(key: string[], value: File): void {
        setTimeout(async () => {
            await this.set(key, value).catch(err => { console.log(err) });
        })
    }
    get(key: string[]): File | undefined {
        let identifier = nullable(this.#getIdentifier(key));
        return identifier.flatMap(x => {
            return nullable(this.mirror.get(decoder.decode(x)))
        }).toUndefined()
    }
    async delete(key: string[]): Promise<void> {
        let identifier = this.#getIdentifier(key);

        if (identifier !== undefined) {
            this.mirror.delete(decoder.decode(identifier))
            await del(decoder.decode(identifier));
            await this.#removeFileFromDir(key);
            return Promise.resolve()
        } else {
            return Promise.reject()
        }
    }
    deleteSync(key: string[]): void {
        setTimeout(async () => {
            await this.delete(key).catch(err => { console.log(err) });
        })
    }
    async sync(): Promise<void> {
        let map = new Map();
        if (!await get("/")) {
            let metadata = { mode: 0o777, size: 0 };
            let file = variant<File>("Directory", [new Map(), metadata])
            await set("/", file)
        }
        await entries().then(x => {
            x.forEach(y => {
                map.set(y[0], y[1])
            })
        })
        this.mirror = map;
    }
    #getIdentifier(key: string[], dir?: Uint8Array): Uint8Array | undefined {
        let newKey = [...key];
        if (newKey.length === 0) {
            return nullable(dir).getWithDefault(encoder.encode("/"))
        } else if (newKey.length === 1) {
            let base = nullable(dir).getWithDefault(encoder.encode("/"))
            let identifier = match(this.mirror.get(decoder.decode(base)))
                .with(pattern("Directory"), res => { return nullable(res.val[0].get(newKey[0])) })
                .otherwise(() => { return none<Uint8Array>() });
            return identifier.toUndefined()
        } else {
            let base = nullable(dir).getWithDefault(encoder.encode("/"))
            let newBase = nullable(newKey.shift()).okOr("Path is empty.").try<string>()
            let identifier = match(this.mirror.get(decoder.decode(base)))
                .with(pattern("Directory"), res => { return nullable(res.val[0].get(newBase)) })
                .otherwise(() => { return none<Uint8Array>() });
            return identifier.flatMap(x => {
                return nullable(this.#getIdentifier(newKey, x))
            }).toUndefined()
        }
    }

    async #removeFileFromDir(filepath: string[]) {
        let dirpath = [...filepath];
        let name = nullable(dirpath.pop()).okOr("Filepath is empty").try<string>();
        let dirIdentifier = nullable(this.#getIdentifier(dirpath)).okOr(new Error(`ENOENT: Couldn't add file to dir, ${dirpath} does not exist`)).try<Uint8Array>();
        let [dir, metadata] = match(nullable(this.mirror.get(decoder.decode(dirIdentifier))))
            .with(pattern("some"), res => {
                return match(res.val)
                    .with(pattern("Directory"), res => {
                        return res.val
                    })
                    .otherwise(() => {
                        throw new Error(`ENOTDIR: Couldn't add file to dir, ${filepath} is not a directory`);
                    })
            })
            .otherwise(() => {
                throw new Error(`ENOENT: Couldn't add file to dir, ${dirpath} does not exist`);
            })
        dir.delete(name)
        let file = variant<File>("Directory", [dir, metadata]);
        this.mirror.set(decoder.decode(dirIdentifier), file)
        await set(decoder.decode(dirIdentifier), file)
    }

    async #addFileToDir(filepath: string[], identifier: Uint8Array) {
        let dirpath = [...filepath];
        let name = nullable(dirpath.pop()).okOr("Filepath is empty").try<string>();
        let dirIdentifier = nullable(this.#getIdentifier(dirpath)).okOr(new Error(`ENOENT: Couldn't add file to dir, ${dirpath} does not exist`)).try<Uint8Array>();
        let [dir, metadata] = match(nullable(this.mirror.get(decoder.decode(dirIdentifier))))
            .with(pattern("some"), res => {
                return match(res.val)
                    .with(pattern("Directory"), res => {
                        return res.val
                    })
                    .otherwise(() => {
                        throw new Error(`ENOTDIR: Couldn't add file to dir, ${filepath} is not a directory`);
                    })
            })
            .otherwise(() => {
                throw new Error(`ENOENT: Couldn't add file to dir, ${dirpath} does not exist`);
            })
        dir.set(name, identifier)
        let file = variant<File>("Directory", [dir, metadata]);
        this.mirror.set(decoder.decode(dirIdentifier), file)
        await set(decoder.decode(dirIdentifier), file)
    }
}


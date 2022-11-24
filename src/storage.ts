import { set, get, del, entries } from 'idb-keyval';
import { variant, Variant } from 'variant-ts';

export type File =
    Variant<"File", [Uint8Array, Metadata]>
    | Variant<"Directory", [string[], Metadata]>
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
    async set(key: string, value: File): Promise<void> {
        await set(key, value);
        this.mirror.set(key, value)
    }
    setSync(key: string, value: File): void {
        setTimeout(async () => {
            await set(key, value);
            this.mirror.set(key, value)
        })
    }
    get(key: string): File | undefined {
        return this.mirror.get(key)
    }
    async delete(key: string): Promise<void> {
        await del(key);
        this.mirror.delete(key)
    }
    deleteSync(key: string): void {
        setTimeout(async () => {
            await del(key);
            this.mirror.delete(key)
        })
    }
    async sync(): Promise<void> {
        let map = new Map();
        if (!await get("/")) {
            let metadata = { mode: 0o777, size: 0 };
            let file = variant<File>("Directory", [[], metadata])
            await set("/", file)
        }
        await entries().then(x => {
            x.forEach(y => {
                map.set(y[0], y[1])
            })
        })
        this.mirror = map;
    }
}
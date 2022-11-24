import { set, get, del, entries } from 'idb-keyval';
import { match } from 'ts-pattern';
import { nullable, pattern, variant, Variant } from 'variant-ts';

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
        let previous = nullable(this.mirror.get(key))
        this.mirror.set(key, value)
        setTimeout(async () => {
            await set(key, value).catch(() => { match(previous).with(pattern("some"), res => { this.mirror.set(key, res.value) }).run() });
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
        let previous = nullable(this.mirror.get(key))
        this.mirror.delete(key)
        setTimeout(async () => {
            await del(key).catch(() => { match(previous).with(pattern("some"), res => { this.mirror.set(key, res.value) }).run() });
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
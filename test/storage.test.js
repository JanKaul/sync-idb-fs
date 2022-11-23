import { expect } from '@esm-bundle/chai';
import { Storage } from '../dist/storage';

it('test set get', async () => {

    let storage = new Storage()

    await timeout(100);

    let data = new Uint8Array([1,2,3,4,5,6,7]);

    let file = {tag: "File", value: [data, { mode: 0o777, size: data.byteLength}]}

    storage.set("/my_file",file);

    await timeout(100);

    let result = storage.get("/my_file")

    expect(result.value[0]).to.eq(data)
});

it('test root', async () => {

    let storage = new Storage()

    await timeout(100);

    let result = storage.get("/")

    expect(result.value[0][0]).to.eq(undefined)
});

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
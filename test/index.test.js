import { expect } from '@esm-bundle/chai';
import { FS } from '../dist/index';

it('test set get', async () => {

    let fs = new FS()

    await timeout(100);

    let data = new Uint8Array([1,2,3,4,5,6,7]);

    fs.writeFileSync("/my_file", data);

    await timeout(100);

    let result = fs.readFileSync("/my_file")

    expect(result).to.eq(data)
});

it('test root', async () => {

    let fs = new FS()

    await timeout(100);

    let result = fs.readdirSync("/")

    expect(result[0]).to.eq(undefined)
});

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
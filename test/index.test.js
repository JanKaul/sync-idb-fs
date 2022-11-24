import { expect } from '@esm-bundle/chai';
import { FS } from '../dist/index';

it('test set get', async () => {
    let fs = await FS.construct()

    fs.mkdirSync("/src")

    await timeout(100);

    fs.mkdirSync("/src/components")

    await timeout(100);

    let dir = fs.statSync("/src").type

    expect(dir).to.equal('dir');

    let data = new Uint8Array([1,2,3,4,5,6,7]);

    fs.writeFileSync("/src/index.js", data);

    await timeout(100);

    let exists = fs.existsSync("/src/index.js")

    expect(exists).to.equal(true)

    let file = fs.statSync("/src/index.js").type

    expect(file).to.equal('file')

    let result = fs.readFileSync("/src/index.js")

    expect(result).to.eq(data)

    let files = fs.readdirSync("/src")

    expect(files).to.contains("/src/components")

    fs.unlinkSync("/src/index.js")

    await timeout(100);

    let not_exists = fs.existsSync("/src/index.js")

    expect(not_exists).to.equal(false)
});

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
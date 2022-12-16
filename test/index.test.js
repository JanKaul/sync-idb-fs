import { expect } from '@esm-bundle/chai';
import { FS } from '../dist/index';

it('test set get', async () => {
    let fs = await FS.construct()

    fs.mkdirSync("/src")

    await timeout(100);

    let root = fs.readdirSync("/")

    expect(root).to.contains("/src")

    fs.mkdirSync("/src/components")

    await timeout(100);

    let dir = fs.statSync("/src").type

    expect(dir).to.equal('dir');

    let data = new Uint8Array([1,2,3,4,5,6,7]);

    fs.writeFileSync("/src/index.js", data);

    await timeout(100);

    let exists = fs.existsSync("/src/index.js")

    expect(exists).to.equal(true)

    let file1 = fs.statSync("/src/index.js").type

    expect(file1).to.equal('file')

    let result = fs.readFileSync("/src/index.js")

    expect(result).to.eq(data)

    let files1 = fs.readdirSync("/src")

    expect(files1).to.contains("/src/components")

    await fs.promises.rename("/src","/base")

    let files2 = fs.readdirSync("/base")

    expect(files2).to.contains("/base/components")

    let file2 = fs.statSync("/base/index.js").type

    expect(file2).to.equal('file')

    fs.unlinkSync("/base/index.js")

    await timeout(100);

    let not_exists = fs.existsSync("/base/index.js")

    expect(not_exists).to.equal(false)
});

it('test async set get', async () => {
    let fs = (await FS.construct()).promises

    await fs.mkdir("/asrc")

    let root = await fs.readdir("/")

    expect(root).to.contains("/asrc")

    await fs.mkdir("/asrc/components")

    let dir = (await fs.stat("/asrc")).type

    expect(dir).to.equal('dir');

    let data = new Uint8Array([1,2,3,4,5,6,7]);

    await fs.writeFile("/asrc/index.js", data);

    let exists = await fs.exists("/asrc/index.js")

    expect(exists).to.equal(true)

    let file1 = (await fs.stat("/asrc/index.js")).type

    expect(file1).to.equal('file')

    let result = await fs.readFile("/asrc/index.js")

    expect(result).to.eq(data)

    let files1 = await fs.readdir("/asrc")

    expect(files1).to.contains("/asrc/components")

    await fs.rename("/asrc","/abase")

    let files2 = await fs.readdir("/abase")

    expect(files2).to.contains("/abase/components")

    let file2 = (await fs.stat("/abase/index.js")).type

    expect(file2).to.equal('file')

    await fs.unlink("/abase/index.js")

    let not_exists = await fs.exists("/abase/index.js")

    expect(not_exists).to.equal(false)
});

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
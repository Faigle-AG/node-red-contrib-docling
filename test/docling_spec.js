const assert = require('assert/strict');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const helper = require('node-red-node-test-helper');
const doclingNode = require('../src/docling.js');
const packageJson = require('../package.json');
const { trigger, lastStatusText, delay } = require('./helpers/harness');

helper.init(require.resolve('node-red'));

const isWin = process.platform === 'win32';
const doclingBin = (venv) =>
    path.join(__dirname, '..', venv, isWin ? 'Scripts' : 'bin', isWin ? 'docling.exe' : 'docling');
const DOCLING_BIN = doclingBin('.venv-docling');
const DOCLING_SURYA_BIN = doclingBin('.venv-docling-surya');
const HOSTILE = 'in $(touch pwned) `id` "q" \'s\' ; | & > x\nnext.pdf';

// Stands in for the ChildProcess returned by execFile; records kill() calls.
function fakeChild() {
    const child = { kills: 0, throwOnKill: false };
    child.kill = () => {
        child.kills += 1;
        if (child.throwOnKill) throw new Error('kill failed');
        return true;
    };
    return child;
}

// The error execFile reports for a process that was stopped with SIGTERM.
function killedError() {
    return Object.assign(new Error('Command failed'), {
        killed: true,
        signal: 'SIGTERM',
        code: null,
    });
}

// The docling launch boundary (S1). child_process.exec/execFile and the venv existence check
// are stubbed, so no shell, converter, Python environment or network is ever used, and the real
// .venv-docling directory is not touched.
describe('docling node launch', function () {
    let calls;
    let reply;
    let venvPresent;
    let saved;

    function load(nodeConfig) {
        const flow = [
            { id: 'f1', type: 'tab' },
            {
                id: 'n1',
                z: 'f1',
                type: 'docling',
                dynamic: false,
                source: '/data/in.pdf',
                sourceType: 'str',
                wires: [['out']],
                ...nodeConfig,
            },
            { id: 'out', z: 'f1', type: 'helper' },
        ];
        return helper.load(doclingNode, flow);
    }

    before(function () {
        saved = {
            exec: childProcess.exec,
            execFile: childProcess.execFile,
            existsSync: fs.existsSync,
            surya: process.env.DOCLING_WITH_SURYA,
        };
        delete process.env.DOCLING_WITH_SURYA;
        childProcess.execFile = (file, args, options, callback) => {
            const child = fakeChild();
            calls.push({ api: 'execFile', file, args, options, child, callback });
            const { error = null, stdout = '', stderr = '', hold = false } = reply();
            // A held run finishes only when the test calls `callback` itself.
            if (!hold) process.nextTick(callback, error, stdout, stderr);
            return child;
        };
        childProcess.exec = (command, options, callback) => {
            calls.push({ api: 'exec', command, options });
            process.nextTick(callback, new Error('exec must not be used'), '', '');
            return {};
        };
        fs.existsSync = (target) =>
            target === DOCLING_BIN || target === DOCLING_SURYA_BIN
                ? venvPresent
                : saved.existsSync(target);
    });

    after(function () {
        childProcess.exec = saved.exec;
        childProcess.execFile = saved.execFile;
        fs.existsSync = saved.existsSync;
        if (saved.surya === undefined) delete process.env.DOCLING_WITH_SURYA;
        else process.env.DOCLING_WITH_SURYA = saved.surya;
    });

    beforeEach(function (done) {
        calls = [];
        venvPresent = true;
        reply = () => ({ stdout: 'converted', stderr: '' });
        helper.startServer(done);
    });

    afterEach(function (done) {
        helper.unload();
        helper.stopServer(done);
    });

    it('launches the docling binary directly, without a shell, with the source after --', async function () {
        await load({ source: HOSTILE });

        const result = await trigger(helper, 'n1', 'out', { topic: 't' }, { settleMs: 50 });

        assert.equal(calls.length, 1);
        assert.equal(calls[0].api, 'execFile');
        assert.equal(calls[0].file, DOCLING_BIN);
        assert.ok(!calls[0].options.shell, 'shell must not be enabled');
        assert.deepEqual(calls[0].args, ['--allow-external-plugins', '--', HOSTILE]);
        assert.equal(result.msg.payload, 'converted');
        assert.equal(result.msg.topic, 't');
        assert.equal(result.msg.docling.source, HOSTILE);
        assert.equal(result.msg.docling.action, 'docling');
        assert.equal(Object.hasOwn(result.msg.docling, 'command'), false);
        assert.equal(lastStatusText(result), 'Success');
        assert.deepEqual(result.extra, { outputs: 0, errors: 0 });
    });

    it('keeps a source that starts with - after the end-of-options marker', async function () {
        await load({ source: '--output=/etc/x' });

        await trigger(helper, 'n1', 'out', {});

        assert.deepEqual(calls[0].args.slice(-2), ['--', '--output=/etc/x']);
    });

    it('passes dynamic msg.file options as single literal string arguments in legacy order', async function () {
        await load({ dynamic: true });

        await trigger(helper, 'n1', 'out', {
            file: {
                source: 'a.pdf',
                fromFormat: ['pdf'],
                toFormat: 'md, json',
                output: '/out dir/"x"; rm -rf ~',
                imageExportMode: 'embedded',
                ocrEngine: 'tesseract',
                ocrLang: 'DE',
                tableMode: 'fast',
                device: 'cpu',
                pipeline: 'vlm',
                vlmModel: 'smol; id',
                artifactsPath: '/art $(id)',
                documentTimeout: 30,
                abortOnError: true,
            },
        });

        assert.deepEqual(calls[0].args, [
            '--allow-external-plugins',
            '--from',
            'pdf',
            '--to',
            'md',
            '--to',
            'json',
            '--output',
            '/out dir/"x"; rm -rf ~',
            '--image-export-mode',
            'embedded',
            '--ocr-engine',
            'tesseract',
            '--ocr-lang',
            'deu',
            '--table-mode',
            'fast',
            '--device',
            'cpu',
            '--pipeline',
            'vlm',
            '--vlm-model',
            'smol; id',
            '--artifacts-path',
            '/art $(id)',
            '--document-timeout',
            '30',
            '--abort-on-error',
            '--',
            'a.pdf',
        ]);
        assert.ok(calls[0].args.every((arg) => typeof arg === 'string'));
    });

    it('keeps static flag and timeout options', async function () {
        await load({
            ocr: false,
            tables: false,
            documentTimeout: '45',
            profiling: true,
            saveProfiling: 'true',
            output: '/out',
            outputType: 'str',
        });

        await trigger(helper, 'n1', 'out', {});

        assert.deepEqual(calls[0].args, [
            '--allow-external-plugins',
            '--output',
            '/out',
            '--no-ocr',
            '--no-tables',
            '--document-timeout',
            '45',
            '--profiling',
            '--save-profiling',
            '--',
            '/data/in.pdf',
        ]);
    });

    it('reports a failed run with stdout, stderr and the error, and sends nothing', async function () {
        const failure = Object.assign(new Error('Command failed'), { code: 2 });
        reply = () => ({ error: failure, stdout: 'partial', stderr: 'boom' });
        await load({});

        const result = await trigger(helper, 'n1', 'out', {}, { settleMs: 50 });

        assert.equal(result.err, failure);
        assert.equal(result.errMsg.payload, 'partial');
        assert.equal(result.errMsg.error, 'boom');
        assert.equal(lastStatusText(result), 'Command failed');
        assert.deepEqual(result.extra, { outputs: 0, errors: 0 });
    });

    it('adds stderr as a warning on success', async function () {
        reply = () => ({ stdout: 'ok', stderr: 'deprecated option' });
        await load({});

        const result = await trigger(helper, 'n1', 'out', {});

        assert.equal(result.msg.payload, 'ok');
        assert.equal(result.msg.warning, 'deprecated option');
    });

    it('reports a missing environment without launching anything', async function () {
        venvPresent = false;
        await load({});

        const result = await trigger(helper, 'n1', 'out', {});

        assert.match(result.err.message, /^Local Docling environment not found: \.venv-docling\./);
        assert.equal(lastStatusText(result), 'Missing Environment');
        assert.deepEqual(calls, []);
    });

    for (const surya of [false, true]) {
        it(`names an existing install script when the ${surya ? 'Surya ' : ''}environment is missing`, async function () {
            venvPresent = false;
            if (surya) process.env.DOCLING_WITH_SURYA = '1';
            try {
                await load({});
                const result = await trigger(helper, 'n1', 'out', {});

                const venv = surya ? '.venv-docling-surya' : '.venv-docling';
                const named = result.err.message.match(/Run 'npm run ([^']+)'/);
                assert.ok(
                    result.err.message.startsWith(`Local Docling environment not found: ${venv}.`),
                );
                assert.ok(named, 'the message names an npm script');
                assert.ok(
                    Object.hasOwn(packageJson.scripts, named[1]),
                    `package.json defines "${named[1]}"`,
                );
                assert.equal(named[1], surya ? 'install:docling:surya' : 'install:docling');
                assert.equal(lastStatusText(result), 'Missing Environment');
                assert.deepEqual(calls, []);
            } finally {
                delete process.env.DOCLING_WITH_SURYA;
            }
        });
    }

    it('reports a missing source as a configuration error without launching anything', async function () {
        await load({ source: '' });

        const result = await trigger(helper, 'n1', 'out', {});

        assert.equal(result.err.message, 'Source is missing');
        assert.equal(lastStatusText(result), 'Configuration error');
        assert.deepEqual(calls, []);
    });

    it('never calls child_process.exec', async function () {
        await load({});

        await trigger(helper, 'n1', 'out', {});

        assert.deepEqual(
            calls.filter((call) => call.api === 'exec'),
            [],
        );
    });

    describe('close', function () {
        // Records what the node does: sends, errors, statuses and done() completions.
        // send, error and _complete are wrapped directly, so calls made after close are
        // still seen.
        function watch(node) {
            const seen = { sends: [], errors: [], statuses: [], completions: [] };
            node.on('call:status', (call) => seen.statuses.push(call.args[0]));
            const record = (name, list) => {
                const original = node[name];
                node[name] = function (...args) {
                    list.push(name === '_complete' ? args[1] : args[0]);
                    return original.apply(this, args);
                };
            };
            record('send', seen.sends);
            record('error', seen.errors);
            record('_complete', seen.completions);
            return seen;
        }

        async function launched(count) {
            for (let i = 0; i < 100 && calls.length < count; i++) await delay(10);
            assert.equal(calls.length, count);
        }

        it('stops a running conversion on close and reports nothing for it', async function () {
            reply = () => ({ hold: true });
            await load({});
            const node = helper.getNode('n1');
            const seen = watch(node);

            node.receive({});
            await launched(1);
            await helper.unload();
            await delay(0); // call:status events arrive on the next tick
            const statusesAtClose = seen.statuses.length;

            assert.equal(calls[0].child.kills, 1);
            calls[0].callback(killedError(), 'partial', 'terminated');
            await delay(20);

            assert.deepEqual(seen.sends, []);
            assert.deepEqual(seen.errors, []);
            assert.deepEqual(seen.statuses.slice(statusesAtClose), []);
            assert.deepEqual(seen.completions, [undefined]);
        });

        it('stops every conversion still running on close', async function () {
            reply = () => ({ hold: true });
            await load({});
            const node = helper.getNode('n1');
            const seen = watch(node);

            node.receive({});
            node.receive({});
            await launched(2);
            await helper.unload();

            assert.deepEqual(
                calls.map((call) => call.child.kills),
                [1, 1],
            );
            for (const call of calls) call.callback(killedError(), '', '');
            await delay(20);

            assert.deepEqual(seen.sends, []);
            assert.deepEqual(seen.errors, []);
            assert.deepEqual(seen.completions, [undefined, undefined]);
        });

        it('does not stop a conversion that finished before close', async function () {
            await load({});

            const result = await trigger(helper, 'n1', 'out', {});
            await helper.unload();

            assert.equal(result.msg.payload, 'converted');
            assert.equal(calls[0].child.kills, 0);
        });

        // Holds the source lookup of the next input until `release(error)` is called.
        function holdSourceLookup(node) {
            const resolve = node.getTypedProperty;
            const lookup = { started: false };
            const gate = new Promise((done) => (lookup.release = done));
            node.getTypedProperty = async (...args) => {
                lookup.started = true;
                const error = await gate;
                if (error) throw error;
                return resolve.apply(node, args);
            };
            return lookup;
        }

        it('does not launch docling when close happens while options are resolved', async function () {
            await load({});
            const node = helper.getNode('n1');
            const seen = watch(node);
            const lookup = holdSourceLookup(node);

            node.receive({});
            for (let i = 0; i < 100 && !lookup.started; i++) await delay(10);
            assert.equal(lookup.started, true);
            await helper.unload();
            await delay(0); // call:status events arrive on the next tick
            const statusesAtClose = seen.statuses.length;
            lookup.release();
            await delay(20);

            assert.deepEqual(calls, []);
            assert.deepEqual(seen.sends, []);
            assert.deepEqual(seen.errors, []);
            assert.deepEqual(seen.statuses.slice(statusesAtClose), []);
            assert.deepEqual(seen.completions, [undefined]);
        });

        it('does not report an option error that surfaces after close', async function () {
            await load({});
            const node = helper.getNode('n1');
            const seen = watch(node);
            const lookup = holdSourceLookup(node);

            node.receive({});
            for (let i = 0; i < 100 && !lookup.started; i++) await delay(10);
            await helper.unload();
            await delay(0); // call:status events arrive on the next tick
            const statusesAtClose = seen.statuses.length;
            lookup.release(new Error('context is gone'));
            await delay(20);

            assert.deepEqual(calls, []);
            assert.deepEqual(seen.errors, []);
            assert.deepEqual(seen.statuses.slice(statusesAtClose), []);
            assert.deepEqual(seen.completions, [undefined]);
        });

        it('keeps stopping the other conversions when one cannot be stopped', async function () {
            reply = () => ({ hold: true });
            await load({});
            const node = helper.getNode('n1');
            const seen = watch(node);

            node.receive({});
            node.receive({});
            await launched(2);
            calls[0].child.throwOnKill = true;
            await helper.unload();

            assert.deepEqual(
                calls.map((call) => call.child.kills),
                [1, 1],
            );
            for (const call of calls) call.callback(killedError(), '', '');
            await delay(20);

            assert.deepEqual(seen.sends, []);
            assert.deepEqual(seen.errors, []);
            assert.deepEqual(seen.completions, [undefined, undefined]);
        });
    });
});

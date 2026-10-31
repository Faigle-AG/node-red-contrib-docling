'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Topic colour from the shared palette: Document Processing, local (Dusty Plum).
const EDITORS = [{ file: 'docling.html', type: 'docling', color: '#CE93D8' }];

// Evaluates the editor's registration scripts against a minimal RED stub and returns
// the registered definitions by type.
function loadDefinitions(html) {
    const registered = new Map();
    const anything = () =>
        new Proxy(function () {}, { get: () => anything(), apply: () => anything() });
    const RED = {
        nodes: { registerType: (type, definition) => registered.set(type, definition) },
        validators: anything(),
        _: (key) => key,
    };
    const scripts = [...html.matchAll(/<script type="text\/javascript">([\s\S]*?)<\/script>/g)];
    for (const [, source] of scripts) vm.runInNewContext(source, { RED, $: anything() });
    return registered;
}

describe('docling editor', function () {
    for (const editor of EDITORS) {
        describe(editor.file, function () {
            const html = fs.readFileSync(path.join(__dirname, '../src', editor.file), 'utf8');

            it(`registers ${editor.type} with the local document processing colour`, function () {
                const definition = loadDefinitions(html).get(editor.type);
                assert.ok(definition, `${editor.type} is registered`);
                assert.equal(definition.color, editor.color);
                assert.equal(definition.category, 'document processing');
            });
        });
    }
});

// Every editor input of docling.html at 2.4b (b9ffb1f); the shared styling keeps them all.
const INPUT_IDS = [
    'name',
    'dynamic',
    'fromFormat',
    'source',
    'sourceType',
    'toFormat',
    'output',
    'outputType',
    'imageExportMode',
    'ocr',
    'forceOcr',
    'ocrEngine',
    'ocrLang',
    'tables',
    'tableMode',
    'enrichChartExtraction',
    'enrichCode',
    'enrichFormula',
    'enrichPictureClasses',
    'device',
    'pdfBackend',
    'pipeline',
    'vlmModel',
    'artifactsPath',
    'documentTimeout',
    'profiling',
    'saveProfiling',
    'abortOnError',
].map((id) => `node-input-${id}`);

describe('docling editor styling', function () {
    const html = fs.readFileSync(path.join(__dirname, '../src/docling.html'), 'utf8');
    const template = html.match(
        /<script type="text\/html" data-template-name="docling">([\s\S]*?)<\/script>/,
    )[1];

    it('uses the shared editor.css', function () {
        assert.match(html, /href="resources\/@faigle\/node-red-runtime-utils\/editor\.css"/);
    });

    it('wraps the whole template in .faigle-node-editor', function () {
        assert.match(template.trim(), /^<div class="faigle-node-editor">[\s\S]*<\/div>$/);
    });

    it('has no inline style block', function () {
        assert.doesNotMatch(html, /<style/);
    });

    it('has no input-width-70 class', function () {
        assert.doesNotMatch(html, /input-width-70/);
    });

    it('keeps every editor input', function () {
        const ids = [...template.matchAll(/id="(node-input-[A-Za-z]+)"/g)].map(([, id]) => id);
        assert.deepEqual(ids, INPUT_IDS);
    });
});

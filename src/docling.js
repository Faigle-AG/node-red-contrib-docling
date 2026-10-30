module.exports = function (RED) {
    const fs = require('fs');
    const path = require('path');
    const { execFile } = require('child_process');
    const { extendNode } = require('@faigle/node-red-runtime-utils')(RED);

    function DoclingNode(config) {
        RED.nodes.createNode(this, config);

        this.dynamic = config.dynamic;
        this.source = config.source;
        this.sourceType = config.sourceType || 'str';
        this.output = config.output;
        this.outputType = config.outputType || 'str';

        this.toFormat = config.toFormat;
        this.fromFormat = config.fromFormat;
        this.imageExportMode = config.imageExportMode;

        this.ocr = config.ocr;
        this.forceOcr = config.forceOcr;
        this.ocrEngine = config.ocrEngine;
        this.ocrLang = config.ocrLang;

        this.tables = config.tables;
        this.tableMode = config.tableMode;
        this.enrichCode = config.enrichCode;
        this.enrichFormula = config.enrichFormula;
        this.enrichPictureClasses = config.enrichPictureClasses;
        this.enrichChartExtraction = config.enrichChartExtraction;

        this.device = config.device;
        this.pdfBackend = config.pdfBackend;
        this.pipeline = config.pipeline;
        this.vlmModel = config.vlmModel;
        this.artifactsPath = config.artifactsPath;
        this.documentTimeout = config.documentTimeout;
        this.abortOnError = config.abortOnError;
        this.profiling = config.profiling;
        this.saveProfiling = config.saveProfiling;

        var node = this;

        extendNode(node);

        // On close, each running conversion's docling process is sent SIGTERM (best effort:
        // only the direct child, which may ignore it), and its late result is neither sent
        // nor reported.
        const pending = new Set();
        let closing = false;

        node.on('close', function () {
            closing = true;
            for (const child of pending) {
                try {
                    child.kill();
                } catch (err) {
                    node.warn(`Could not stop a running docling process: ${err.message}`);
                }
            }
            node.status.clear();
        });

        node.on('input', async function (msg, send, done) {
            try {
                const getVal = async (key, staticVal, isProp = false) => {
                    if (node.dynamic) {
                        if (msg.file && msg.file[key] !== undefined) return msg.file[key];
                        return undefined;
                    }
                    if (isProp) {
                        return await node.getTypedProperty(
                            staticVal,
                            config[`${key}Type`] || 'str',
                            msg,
                        );
                    }
                    return staticVal;
                };

                const src = await getVal('source', node.source, true);
                if (!src) throw new Error('Source is missing');

                let args = [];

                args.push('--allow-external-plugins');

                const fromFmt = await getVal('fromFormat', node.fromFormat);
                if (fromFmt) {
                    const fromFmtArray = Array.isArray(fromFmt) ? fromFmt : fromFmt.split(',');
                    fromFmtArray.forEach((f) => {
                        if (f.trim()) args.push('--from', f.trim());
                    });
                }

                const toFmt = await getVal('toFormat', node.toFormat);
                if (toFmt) {
                    const toFmtArray = Array.isArray(toFmt) ? toFmt : toFmt.split(',');
                    toFmtArray.forEach((f) => {
                        if (f.trim()) args.push('--to', f.trim());
                    });
                }

                const outDir = await getVal('output', node.output, true);
                if (outDir) args.push('--output', outDir);

                const imgExpMode = await getVal('imageExportMode', node.imageExportMode);
                if (imgExpMode) args.push('--image-export-mode', imgExpMode);

                const enableOcr = await getVal('ocr', node.ocr);
                if (enableOcr === false || enableOcr === 'false') {
                    args.push('--no-ocr');
                } else {
                    const fOcr = await getVal('forceOcr', node.forceOcr);
                    if (fOcr === true || fOcr === 'true') args.push('--force-ocr');

                    const engine = await getVal('ocrEngine', node.ocrEngine);
                    if (engine && engine !== 'auto') {
                        args.push('--ocr-engine', engine);
                    }

                    const rawLang = await getVal('ocrLang', node.ocrLang);
                    if (rawLang) {
                        const baseLang = rawLang.toLowerCase();

                        const engineLangMap = {
                            tesseract: {
                                en: 'eng',
                                de: 'deu',
                                fr: 'fra',
                                es: 'spa',
                                it: 'ita',
                                pt: 'por',
                                nl: 'nld',
                                ru: 'rus',
                                zh: 'chi_sim',
                                ja: 'jpn',
                                ko: 'kor',
                                ar: 'ara',
                                hi: 'hin',
                                tr: 'tur',
                                pl: 'pol',
                            },
                            mac_ocr: {
                                en: 'en-US',
                                de: 'de-DE',
                                fr: 'fr-FR',
                                es: 'es-ES',
                                it: 'it-IT',
                                pt: 'pt-BR',
                                nl: 'nl-NL',
                                ru: 'ru-RU',
                                zh: 'zh-CN',
                                ja: 'ja-JP',
                                ko: 'ko-KR',
                                ar: 'ar-SA',
                                hi: 'hi-IN',
                                tr: 'tr-TR',
                                pl: 'pl-PL',
                            },
                        };

                        let finalLang = baseLang;
                        if (engineLangMap[engine] && engineLangMap[engine][baseLang])
                            finalLang = engineLangMap[engine][baseLang];

                        args.push('--ocr-lang', finalLang);
                    }
                }

                const enableTables = await getVal('tables', node.tables);
                if (enableTables === false || enableTables === 'false') args.push('--no-tables');
                else {
                    const tMode = await getVal('tableMode', node.tableMode);
                    if (tMode && tMode !== 'accurate') args.push('--table-mode', tMode);
                }

                const eChart = await getVal('enrichChartExtraction', node.enrichChartExtraction);
                if (eChart === true || eChart === 'true') args.push('--enrich-chart-extraction');

                const eCode = await getVal('enrichCode', node.enrichCode);
                if (eCode === true || eCode === 'true') args.push('--enrich-code');

                const eForm = await getVal('enrichFormula', node.enrichFormula);
                if (eForm === true || eForm === 'true') args.push('--enrich-formula');

                const ePic = await getVal('enrichPictureClasses', node.enrichPictureClasses);
                if (ePic === true || ePic === 'true') args.push('--enrich-picture-classes');

                const dev = await getVal('device', node.device);
                if (dev && dev !== 'auto') args.push('--device', dev);

                const pdfB = await getVal('pdfBackend', node.pdfBackend);
                if (pdfB && pdfB !== 'docling_parse') args.push('--pdf-backend', pdfB);

                const pipe = await getVal('pipeline', node.pipeline);
                if (pipe) {
                    args.push('--pipeline', pipe);
                    if (pipe === 'vlm') {
                        const vlmM = await getVal('vlmModel', node.vlmModel);
                        if (vlmM) args.push('--vlm-model', vlmM);
                    }
                }

                const artPath = await getVal('artifactsPath', node.artifactsPath);
                if (artPath) args.push('--artifacts-path', artPath);

                const dTimeout = await getVal('documentTimeout', node.documentTimeout);
                if (dTimeout) args.push('--document-timeout', dTimeout);

                const abortErr = await getVal('abortOnError', node.abortOnError);
                if (abortErr === true || abortErr === 'true') args.push('--abort-on-error');

                const prof = await getVal('profiling', node.profiling);
                if (prof === true || prof === 'true') {
                    args.push('--profiling');
                    const sProf = await getVal('saveProfiling', node.saveProfiling);
                    if (sProf === true || sProf === 'true') args.push('--save-profiling');
                }

                // '--' ends option parsing, so a source starting with '-' stays a source.
                args.push('--', src);
                args = args.map(String);

                // The node may have closed while the options above were resolved.
                if (closing) {
                    if (done) done();
                    return;
                }

                const isWin = process.platform === 'win32';
                const useSurya =
                    process.env.DOCLING_WITH_SURYA === '1' ||
                    process.env.DOCLING_WITH_SURYA === 'true';

                const venvName = useSurya ? '.venv-docling-surya' : '.venv-docling';
                const venvPath = path.join(__dirname, '..', venvName);
                const venvBinPath = path.join(venvPath, isWin ? 'Scripts' : 'bin');
                const doclingBin = path.join(venvBinPath, isWin ? 'docling.exe' : 'docling');

                if (!fs.existsSync(doclingBin)) {
                    const errMsg =
                        `Local Docling environment not found: ${venvName}. ` +
                        `Run '${useSurya ? 'npm run install:docling:surya' : 'npm run install:docling'}'.`;

                    node.status.failed('Missing Environment');

                    if (done) done(new Error(errMsg));
                    else node.error(errMsg, msg);

                    return;
                }

                const customEnv = Object.assign({}, process.env);
                const pathKey = isWin && customEnv.Path ? 'Path' : 'PATH';
                customEnv[pathKey] = `${venvBinPath}${path.delimiter}${customEnv[pathKey] || ''}`;

                if (!isWin) customEnv.SHELL = '/bin/bash';
                customEnv.VIRTUAL_ENV = venvPath;

                node.status.processing('Processing...');

                const child = execFile(
                    doclingBin,
                    args,
                    {
                        maxBuffer: 1024 * 1024 * 10,
                        env: customEnv,
                        windowsHide: true,
                    },
                    (error, stdout, stderr) => {
                        pending.delete(child);
                        if (closing) {
                            if (done) done();
                            return;
                        }

                        msg.docling = {
                            source: src,
                            action: 'docling',
                        };

                        if (error) {
                            node.status.failed('Command failed');
                            msg.payload = stdout;
                            msg.error = stderr || error.message;

                            if (done) done(error);
                            else node.error(error, msg);
                        } else {
                            node.status.succeeded('Success');
                            msg.payload = stdout;
                            if (stderr) msg.warning = stderr;

                            send(msg);
                            if (done) done();
                        }
                    },
                );
                pending.add(child);
            } catch (err) {
                if (closing) {
                    if (done) done();
                    return;
                }

                node.status.failed('Configuration error');

                if (done) done(err);
                else node.error(err, msg);
            }
        });
    }

    RED.nodes.registerType('docling', DoclingNode);
};

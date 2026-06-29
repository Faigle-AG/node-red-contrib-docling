module.exports = function (RED) {
    const fs = require('fs');
    const path = require('path');
    const { exec } = require('child_process');

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

        node.on('input', function (msg, send, done) {
            try {
                const getVal = (key, staticVal, isProp = false) => {
                    if (node.dynamic) {
                        if (msg.file && msg.file[key] !== undefined) return msg.file[key];
                        return undefined;
                    }
                    if (isProp) {
                        return RED.util.evaluateNodeProperty(
                            staticVal,
                            config[`${key}Type`] || 'str',
                            node,
                            msg,
                        );
                    }
                    return staticVal;
                };

                const src = getVal('source', node.source, true);
                if (!src) throw new Error('Source is missing');

                let args = [];

                args.push('--allow-external-plugins');

                const fromFmt = getVal('fromFormat', node.fromFormat);
                if (fromFmt) {
                    const fromFmtArray = Array.isArray(fromFmt) ? fromFmt : fromFmt.split(',');
                    fromFmtArray.forEach((f) => {
                        if (f.trim()) args.push('--from', f.trim());
                    });
                }

                const toFmt = getVal('toFormat', node.toFormat);
                if (toFmt) {
                    const toFmtArray = Array.isArray(toFmt) ? toFmt : toFmt.split(',');
                    toFmtArray.forEach((f) => {
                        if (f.trim()) args.push('--to', f.trim());
                    });
                }

                const outDir = getVal('output', node.output, true);
                if (outDir) args.push('--output', `"${outDir}"`);

                const imgExpMode = getVal('imageExportMode', node.imageExportMode);
                if (imgExpMode) args.push('--image-export-mode', imgExpMode);

                const enableOcr = getVal('ocr', node.ocr);
                if (enableOcr === false || enableOcr === 'false') {
                    args.push('--no-ocr');
                } else {
                    const fOcr = getVal('forceOcr', node.forceOcr);
                    if (fOcr === true || fOcr === 'true') args.push('--force-ocr');

                    const engine = getVal('ocrEngine', node.ocrEngine);
                    if (engine && engine !== 'auto') {
                        args.push('--ocr-engine', engine);
                    }

                    const rawLang = getVal('ocrLang', node.ocrLang);
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

                const enableTables = getVal('tables', node.tables);
                if (enableTables === false || enableTables === 'false') args.push('--no-tables');
                else {
                    const tMode = getVal('tableMode', node.tableMode);
                    if (tMode && tMode !== 'accurate') args.push('--table-mode', tMode);
                }

                const eChart = getVal('enrichChartExtraction', node.enrichChartExtraction);
                if (eChart === true || eChart === 'true') args.push('--enrich-chart-extraction');

                const eCode = getVal('enrichCode', node.enrichCode);
                if (eCode === true || eCode === 'true') args.push('--enrich-code');

                const eForm = getVal('enrichFormula', node.enrichFormula);
                if (eForm === true || eForm === 'true') args.push('--enrich-formula');

                const ePic = getVal('enrichPictureClasses', node.enrichPictureClasses);
                if (ePic === true || ePic === 'true') args.push('--enrich-picture-classes');

                const dev = getVal('device', node.device);
                if (dev && dev !== 'auto') args.push('--device', dev);

                const pdfB = getVal('pdfBackend', node.pdfBackend);
                if (pdfB && pdfB !== 'docling_parse') args.push('--pdf-backend', pdfB);

                const pipe = getVal('pipeline', node.pipeline);
                if (pipe) {
                    args.push('--pipeline', pipe);
                    if (pipe === 'vlm') {
                        const vlmM = getVal('vlmModel', node.vlmModel);
                        if (vlmM) args.push('--vlm-model', vlmM);
                    }
                }

                const artPath = getVal('artifactsPath', node.artifactsPath);
                if (artPath) args.push('--artifacts-path', `"${artPath}"`);

                const dTimeout = getVal('documentTimeout', node.documentTimeout);
                if (dTimeout) args.push('--document-timeout', dTimeout);

                const abortErr = getVal('abortOnError', node.abortOnError);
                if (abortErr === true || abortErr === 'true') args.push('--abort-on-error');

                const prof = getVal('profiling', node.profiling);
                if (prof === true || prof === 'true') {
                    args.push('--profiling');
                    const sProf = getVal('saveProfiling', node.saveProfiling);
                    if (sProf === true || sProf === 'true') args.push('--save-profiling');
                }

                args.push(`"${src}"`);

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
                        `Run '${useSurya ? 'npm run install:python:surya' : 'npm run install:python'}'.`;

                    node.status({ fill: 'red', shape: 'dot', text: 'Missing Environment' });

                    if (done) done(new Error(errMsg));
                    else node.error(errMsg, msg);

                    return;
                }

                const customEnv = Object.assign({}, process.env);
                const pathKey = isWin && customEnv.Path ? 'Path' : 'PATH';
                customEnv[pathKey] = `${venvBinPath}${path.delimiter}${customEnv[pathKey] || ''}`;

                if (!isWin) customEnv.SHELL = '/bin/bash';
                customEnv.VIRTUAL_ENV = venvPath;

                const command = `"${doclingBin}" ${args.join(' ')}`;

                node.status({ fill: 'blue', shape: 'dot', text: 'Processing...' });

                exec(
                    command,
                    {
                        maxBuffer: 1024 * 1024 * 10,
                        env: customEnv,
                    },
                    (error, stdout, stderr) => {
                        msg.docling = {
                            command: command,
                            source: src,
                            action: 'docling',
                        };

                        if (error) {
                            node.status({ fill: 'red', shape: 'dot', text: 'Command failed' });
                            msg.payload = stdout;
                            msg.error = stderr || error.message;

                            if (done) done(error);
                            else node.error(error, msg);
                        } else {
                            node.status({ fill: 'green', shape: 'dot', text: 'Success' });
                            msg.payload = stdout;
                            if (stderr) msg.warning = stderr;

                            send(msg);
                            if (done) done();
                        }
                        setTimeout(() => node.status({}), 5000);
                    },
                );
            } catch (err) {
                node.status({ fill: 'red', shape: 'dot', text: 'Configuration error' });

                if (done) done(err);
                else node.error(err, msg);
            }
        });
    }

    RED.nodes.registerType('docling', DoclingNode);
};

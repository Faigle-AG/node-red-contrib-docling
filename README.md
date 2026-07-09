# @faigle/node-red-contrib-docling

Node-RED node for converting documents with Docling.

This node runs the `docling` CLI from a local Python virtual environment and converts documents such as PDFs, Office files, HTML, images, Markdown, CSV, XLSX, and Docling JSON into structured output formats such as Markdown, JSON, YAML, HTML, plain text, DocTags, and VTT.

This package was generated from [node-red-contrib-template](https://github.com/Faigle-AG/node-red-contrib-_template_).

## Features

- Convert documents using Docling from Node-RED
- Supports local file paths and URLs as input sources
- Export to one or more output formats
- Optional OCR with configurable OCR engine and language
- Table extraction with accurate or fast mode
- Optional enrichments for code, formulas, charts, and picture classes
- Optional VLM pipeline support
- Local isolated Python environments to avoid global dependency conflicts
- Dynamic runtime configuration via `msg.file`

## Installation

Install the Node-RED package, then initialize the Python backend from inside the installed package directory:

```bash
cd ~/.node-red/node_modules/@faigle/node-red-contrib-docling
npm run install:docling
```

This creates the default local environment:

```text
.venv-docling
```

### Surya OCR support

To install Docling with Surya OCR support, run:

```bash
npm run install:docling:surya
```

This creates:

```text
.venv-docling-surya
```

To use the Surya environment at runtime, start Node-RED with:

```bash
DOCLING_WITH_SURYA=1 node-red
```

## Requirements

- Node-RED
- Python 3.12
- `pyenv` or an available `python3.12` binary
- Sufficient disk space for Python, Docling, OCR engines, and model dependencies

The install scripts create a local Python virtual environment and install the required Python packages.

## Node

### docling

Runs Docling against a configured document source.

The node has one input and one output.

## Basic Options

### Load from `msg.file`

When enabled, the node ignores the static editor configuration and reads all supported options from `msg.file`.

### From Formats

Input formats accepted by Docling.

Examples:

- `pdf`
- `docx`
- `pptx`
- `xlsx`
- `html`
- `image`
- `md`
- `csv`
- `json_docling`
- `asciidoc`

Multiple formats can be selected.

### Source

The document source to process.

This can be:

- a local file path
- a URL

Example:

```text
/path/to/document.pdf
```

### To Formats

Output formats to export.

Supported values include:

- `md`
- `json`
- `yaml`
- `html`
- `html_split_page`
- `text`
- `doctags`
- `vtt`

Multiple output formats can be selected.

### Output Dir

Optional output directory for generated files.

If omitted, Docling uses its default output behavior.

### Image Export Mode

Controls how images are exported.

Supported values:

- `embedded` — embed images as Base64
- `referenced` — export images as referenced PNG files
- `placeholder` — use placeholders only

## OCR Settings

### Enable OCR

Enables OCR processing.

If disabled, the node passes `--no-ocr` to Docling.

### Force OCR

Forces full-page OCR.

### OCR Engine

Supported values:

- `auto`
- `easyocr`
- `tesseract`
- `rapidocr`
- `ocrmac`
- `suryaocr`

`suryaocr` requires the Surya environment to be installed and enabled.

### OCR Lang

OCR language hint.

Common values:

- `en`
- `de`
- `fr`
- `es`
- `it`
- `pt`
- `nl`
- `ru`
- `zh`
- `ja`
- `ko`
- `ar`
- `hi`
- `tr`
- `pl`

For Tesseract and macOS OCR, the node maps these short language codes to the language format expected by the selected OCR engine.

## Extraction & Enrichments

### Extract Tables

Enables table extraction.

### Table Mode

Supported values:

- `accurate`
- `fast`

### Extract Chart Data

Enables chart data extraction.

### Enrich Code

Enables code block enrichment.

### Enrich Formula

Enables formula enrichment.

### Picture Classes

Enables picture classification enrichment.

## Advanced Pipeline

### Device

Selects the processing device.

Supported values:

- `auto`
- `cpu`
- `cuda`
- `mps`
- `xpu`

### PDF Backend

Supported values:

- `docling_parse`
- `threaded_docling_parse`
- `pypdfium2`
- `dlparse_v1`
- `dlparse_v2`
- `dlparse_v4`

### Pipeline

Supported values:

- empty/default — standard Docling pipeline
- `vlm` — Vision-Language Model pipeline

### VLM Model

Used when the pipeline is set to `vlm`.

Available options include:

- `smoldocling`
- `granite_docling`
- `deepseek_ocr`
- `granite_vision`
- `pixtral`
- `got_ocr`
- `phi4`
- `qwen`
- `nanonets_ocr2`
- `gemma_12b`
- `gemma_27b`
- `dolphin`
- `glm_ocr`
- `lightonocr`
- `falcon_ocr`

### Artifacts Path

Optional local path for model artifacts.

### Timeout

Optional document timeout in seconds.

### Abort on Error

Stops processing when Docling reports an error.

### Profiling

Enables Docling profiling.

### Save Profiling

Saves profiling output to JSON when profiling is enabled.

## Dynamic Configuration

Enable **Load from `msg.file`** to configure the node at runtime.

Example:

```js
msg.file = {
    source: '/path/to/invoice.pdf',
    fromFormat: 'pdf',
    toFormat: 'md,json',
    output: '/path/to/output',
    imageExportMode: 'embedded',

    ocr: true,
    forceOcr: false,
    ocrEngine: 'auto',
    ocrLang: 'en',

    tables: true,
    tableMode: 'accurate',
    enrichCode: false,
    enrichFormula: false,
    enrichPictureClasses: false,
    enrichChartExtraction: false,

    device: 'auto',
    pdfBackend: 'docling_parse',
    pipeline: '',
    artifactsPath: '',
    documentTimeout: '',
    abortOnError: false,
    profiling: false,
    saveProfiling: false,
};

return msg;
```

### Dynamic VLM example

```js
msg.file = {
    source: '/path/to/document.pdf',
    fromFormat: 'pdf',
    toFormat: 'md',
    output: '/path/to/output',
    pipeline: 'vlm',
    vlmModel: 'granite_docling',
};

return msg;
```

### Dynamic Surya OCR example

Start Node-RED with Surya enabled:

```bash
DOCLING_WITH_SURYA=1 node-red
```

Then send:

```js
msg.file = {
    source: '/path/to/scan.pdf',
    fromFormat: 'pdf',
    toFormat: 'md',
    ocr: true,
    ocrEngine: 'suryaocr',
    ocrLang: 'en',
};

return msg;
```

## Output

On success, the node forwards the incoming message and sets:

```js
msg.payload;
```

The stdout output from the Docling CLI.

```js
msg.docling;
```

Execution metadata:

```js
msg.docling = {
    command: '...',
    source: '/path/to/document.pdf',
    action: 'docling',
};
```

If Docling writes to stderr without failing, the node sets:

```js
msg.warning;
```

On command failure, the node sets:

```js
msg.payload;
msg.error;
msg.docling;
```

Where:

- `msg.payload` contains stdout
- `msg.error` contains stderr or the error message
- `msg.docling` contains command metadata

## Status Indicators

The node displays runtime status in the Node-RED editor:

- `Processing...` — Docling command is running
- `Success` — conversion completed successfully
- `Missing Environment` — required local Python environment was not found
- `Command failed` — Docling returned an error
- `Configuration error` — required configuration is missing or invalid

## Troubleshooting

### Missing Environment

If the node reports a missing environment, run one of:

```bash
npm run install:python
```

or:

```bash
npm run install:python:surya
```

### Python version error

The installer requires Python 3.12.

Install Python 3.12 directly or install it through `pyenv`.

### Surya OCR is not available

Install the Surya environment:

```bash
npm run install:python:surya
```

Then start Node-RED with:

```bash
DOCLING_WITH_SURYA=1 node-red
```

### Large documents fail

The node allows up to 10 MB of process output buffer. For large documents, prefer writing output files to an output directory instead of relying only on stdout.

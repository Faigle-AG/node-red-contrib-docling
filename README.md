# @faigle/node-red-contrib-docling

A powerful Node-RED node that leverages the `docling` CLI to convert complex documents (PDF, DOCX, PPTX, HTML, Images, etc.) into structured, machine-readable formats like Markdown and JSON.

This node was generated from [node-red-contrib-template](https://github.com/Faigle-AG/node-red-contrib-_template_).

## Architecture & Virtual Environments

To avoid system-wide Python dependency conflicts, this node does not rely on a globally installed Docling CLI. Instead, it builds and manages its own isolated Python virtual environments locally.

After installing the node, you must initialize the backend environment by running one of the provided NPM scripts from within the node's directory (typically inside `~/.node-red/node_modules/@faigle/node-red-contrib-docling`):

- **Default Installation:** Installs standard Docling with default OCR engines (EasyOCR, Tesseract, RapidOCR).

    ```bash
    npm run install:python
    ```

    _(Creates `.venv-docling`)_

- **Surya OCR Installation:** Installs Docling along with `docling-surya` for advanced, high-accuracy OCR capabilities.
    ```bash
    npm run install:python:surya
    ```
    _(Creates `.venv-docling-surya`)_

The node automatically detects which environment is active and securely executes the `docling` CLI binary from the corresponding virtual environment.

---

## Node Properties

### Basic Options

- **Load from msg.file**: If enabled, ignores static UI configurations and drives the node dynamically via the incoming `msg.file` object.
- **From Formats**: Define the input types to process (e.g., `pdf`, `docx`, `image`).
- **Source**: The absolute local file path or URL to the document.
- **To Formats**: Define the output formats (e.g., `md`, `json`, `html`, `doctags`).
- **Output Dir**: The destination folder for generated files.
- **Image Export Mode**: Specify how extracted images are handled (`Embedded (Base64)`, `Referenced (PNGs)`, or `Placeholder Only`).

### OCR Settings

- **Enable / Force OCR**: Toggle Optical Character Recognition and force full-page scanning if necessary.
- **OCR Engine**: Choose between `Auto`, `EasyOCR`, `Tesseract`, `RapidOCR`, `OCR Mac`, or `SuryaOCR`. _(Note: `SuryaOCR` is only available if you initialized the Surya virtual environment)._
- **OCR Lang**: Map the document language to improve text recognition accuracy.

### Extraction & Enrichments

- **Extract Tables**: Toggle table parsing and select the mode (`Accurate` or `Fast`).
- **Enrichments**: Optionally extract chart data, code blocks, mathematical formulas, and classify pictures.

### Advanced Pipeline

- **Device**: Force computation on `auto`, `cpu`, `cuda`, `mps`, or `xpu`.
- **Pipeline**: Use the standard pipeline or switch to Vision-Language Models (`VLM`) for complex extractions.
- **VLM Model**: Select from supported models (e.g., `granite_docling`, `smoldocling`, `deepseek_ocr`, `phi4`) when using the VLM pipeline.

---

## Inputs (Dynamic Configuration)

If **Load from msg.file** is checked, you can pass parameters dynamically to override the node's static settings:

```json
{
    "file": {
        "source": "/path/to/invoice.pdf",
        "toFormat": "json,md",
        "output": "/path/to/destination",
        "ocr": true,
        "ocrEngine": "suryaocr"
    }
}
```

## Outputs

- `msg.payload` _(string)_: The standard output (stdout) stream from the `docling` CLI.
- `msg.error` _(string)_: The standard error (stderr) stream if the command fails.
- `msg.docling` _(object)_: Metadata detailing the execution context (contains `command`, `source`, and `action`).

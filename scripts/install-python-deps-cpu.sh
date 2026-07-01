#!/usr/bin/env bash

set -euo pipefail

PYTHON_VERSION="3.12.13"
PYTHON_VERSION_REQUIRED="3.12"
PYTORCH_CPU_INDEX="https://download.pytorch.org/whl/cpu"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

WITH_SURYA="${DOCLING_WITH_SURYA:-0}"

if [ "$WITH_SURYA" = "1" ]; then
  VENV_DIR="${PROJECT_ROOT}/.venv-docling-surya"
  LOCK_FILE="${PROJECT_ROOT}/requirements/docling-surya.lock"
else
  VENV_DIR="${PROJECT_ROOT}/.venv-docling"
  LOCK_FILE="${PROJECT_ROOT}/requirements/docling.lock"
fi

if [ ! -f "$LOCK_FILE" ]; then
  echo "Error: missing lockfile: ${LOCK_FILE}" >&2
  exit 1
fi

echo "Preparing Python ${PYTHON_VERSION_REQUIRED}..."

if command -v pyenv >/dev/null 2>&1; then
  pyenv install -s "$PYTHON_VERSION"
  PYTHON="$(pyenv root)/versions/${PYTHON_VERSION}/bin/python"
elif command -v python3.12 >/dev/null 2>&1; then
  PYTHON="python3.12"
else
  echo "Error: Python ${PYTHON_VERSION_REQUIRED} required." >&2
  echo "Install Python 3.12 or install pyenv." >&2
  exit 1
fi

DETECTED_VERSION="$("$PYTHON" - <<'PY'
import sys
print(f"{sys.version_info.major}.{sys.version_info.minor}")
PY
)"

if [ "$DETECTED_VERSION" != "$PYTHON_VERSION_REQUIRED" ]; then
  echo "Error: Python ${PYTHON_VERSION_REQUIRED} required, found ${DETECTED_VERSION}." >&2
  exit 1
fi

echo "Using Python: $("$PYTHON" --version)"
echo "Using lockfile: ${LOCK_FILE}"

rm -rf "$VENV_DIR"
"$PYTHON" -m venv "$VENV_DIR"

PYTHON_BIN="${VENV_DIR}/bin/python"

"$PYTHON_BIN" -m pip install --upgrade pip wheel setuptools packaging

"$PYTHON_BIN" -m pip install \
  -r "$LOCK_FILE" \
  --extra-index-url "$PYTORCH_CPU_INDEX"

"$PYTHON_BIN" - <<'PY'
import sys
import importlib

print("python:", sys.version)

for name in ["docling", "torch", "torchvision", "transformers"]:
    module = importlib.import_module(name)
    print(f"{name}: {getattr(module, '__version__', 'unknown')}")

try:
    import docling_surya
    print("docling_surya: available")
except ModuleNotFoundError:
    print("docling_surya: not installed")

import torch
print("CUDA available:", torch.cuda.is_available())
PY

echo "Python dependencies installed."

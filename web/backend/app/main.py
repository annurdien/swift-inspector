from __future__ import annotations

import shlex
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="SIL Inspector Web", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DIST_DIR = Path(__file__).parent / "static"
ASSETS_DIR = DIST_DIR / "assets"
if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")


class CompileRequest(BaseModel):
    source: str
    demangle: bool = False
    optimize: bool = False
    moduleOptimize: bool = False
    parseAsLibrary: bool = False


@dataclass
class CommandResult:
    label: str
    command: str
    exitCode: int
    output: str


ProgramMap = Dict[str, CommandResult]


def _build_args(base: List[str], payload: CompileRequest) -> List[str]:
    args = list(base)
    if payload.parseAsLibrary:
        args.extend(["-parse-as-library", "-module-name", "SILInspectorWeb"])
    if payload.optimize:
        args.append("-O")
    if payload.moduleOptimize:
        args.append("-whole-module-optimization")
    return args


def _maybe_demangle(content: str, payload: CompileRequest) -> str:
    if not payload.demangle:
        return content
    if not content.strip():
        return content
    process = subprocess.run(
        ["swift-demangle"],
        input=content.encode("utf-8"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if process.returncode == 0:
        decoded = process.stdout.decode("utf-8", errors="replace")
        return decoded if decoded else content
    # Fall back to original output plus error details when demangling fails.
    stderr = process.stderr.decode("utf-8", errors="replace")
    return f"{content}\n\n[swift-demangle error]\n{stderr.strip()}" if stderr else content


def _run_program(label: str, base_args: List[str], payload: CompileRequest) -> CommandResult:
    args = _build_args(base_args, payload)
    process = subprocess.run(
        args,
        input=payload.source.encode("utf-8"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    stdout = process.stdout.decode("utf-8", errors="replace")
    stderr = process.stderr.decode("utf-8", errors="replace")
    output = stdout if process.returncode == 0 else stderr or stdout
    output = _maybe_demangle(output, payload)
    command_str = " ".join(shlex.quote(part) for part in args)
    return CommandResult(label=label, command=command_str, exitCode=process.returncode, output=output)


PROGRAMS: Dict[str, Dict[str, List[str]]] = {
    "silRaw": {"label": "SIL Raw", "args": ["swiftc", "-", "-emit-silgen"]},
    "silCanonical": {"label": "SIL Canonical", "args": ["swiftc", "-", "-emit-sil"]},
    "ast": {"label": "AST", "args": ["swiftc", "-", "-dump-ast"]},
    "parse": {"label": "Parse", "args": ["swiftc", "-", "-dump-parse"]},
    "ir": {"label": "IR", "args": ["swiftc", "-", "-emit-ir"]},
    "assembly": {"label": "Assembly", "args": ["swiftc", "-", "-emit-assembly"]},
}


@app.post("/api/compile")
def compile_source(payload: CompileRequest) -> JSONResponse:
    if not payload.source.strip():
        raise HTTPException(status_code=400, detail="Source is required")

    results: Dict[str, Dict[str, str]] = {}
    for key, data in PROGRAMS.items():
        outcome = _run_program(data["label"], data["args"], payload)
        results[key] = asdict(outcome)

    return JSONResponse({"results": results})


@app.get("/api/health")
def health_check() -> Dict[str, str]:
    return {"status": "ok"}


def _locate_index() -> Path:
    index = DIST_DIR / "index.html"
    if index.exists():
        return index
    raise HTTPException(status_code=404, detail="Frontend build not found")


@app.get("/")
async def serve_root() -> FileResponse:
    return FileResponse(_locate_index())


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str) -> FileResponse:
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found")
    return FileResponse(_locate_index())

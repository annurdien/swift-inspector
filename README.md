The Swift Inspector is inspired by [SILInspector](https://github.com/alblue/SILInspector) by Alex Blewitt

## Swift Inspector Web

This repository now contains a Dockerized web edition that mirrors the native macOS app. Paste Swift code into the browser, toggle compiler options, and inspect every stage the compiler produces: raw and canonical SIL, the AST, parser output, LLVM IR, and generated assembly.

### Highlights

- Modern React interface with an embedded Monaco editor, quick tab switching, and dark glassmorphism styling.
- FastAPI backend that shells out to `swiftc` inside the container, applies demangling and optimization switches, and returns structured output for each compiler stage.
- Single container build powered by a multi-stage Dockerfile (Node builds the frontend, Swift image serves the API via Uvicorn and hosts the static assets).

### Quick start (Docker)

```bash
docker compose up --build
```

After the build completes, open [`http://localhost:8000`](http://localhost:8000) to launch the web app. The API lives under `/api`, with health checks at `/api/health` and compilation handled by `POST /api/compile`.

### Local development

Using the Makefile:

```bash
make install          # install npm deps + create backend venv
make frontend         # run Vite dev server
make backend          # run FastAPI backend with reload
```

Frontend (`web/frontend`):

```bash
npm install
npm run dev
```

Backend (`web/backend`):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The Vite dev server proxies API calls to `localhost:8000`. To analyze Swift outputs outside Docker, ensure you have the Swift toolchain (including `swift-demangle`) installed locally.

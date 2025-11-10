SHELL := /bin/bash
FRONTEND_DIR := web/frontend
BACKEND_DIR := web/backend
VENV_DIR := $(BACKEND_DIR)/.venv

.PHONY: install frontend-install backend-install frontend backend clean clean-frontend clean-backend

install: frontend-install backend-install

frontend-install:
	cd $(FRONTEND_DIR) && npm install

backend-install:
	if [ ! -d "$(VENV_DIR)" ]; then python3 -m venv $(VENV_DIR); fi
	source $(VENV_DIR)/bin/activate && pip install -r $(BACKEND_DIR)/requirements.txt

frontend:
	cd $(FRONTEND_DIR) && npm run dev

backend: backend-install
	source $(VENV_DIR)/bin/activate && cd $(BACKEND_DIR) && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

clean-frontend:
	rm -rf $(FRONTEND_DIR)/node_modules

clean-backend:
	rm -rf $(VENV_DIR)

clean: clean-frontend clean-backend

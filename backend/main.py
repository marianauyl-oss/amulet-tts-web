import io
import zipfile
from typing import Optional, List, Dict, Any

import requests
from fastapi import FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

API_URL = "https://voiceapi.csv666.ru"

app = FastAPI(title="Amulet TTS Proxy")

# Allow all origins for simplicity.
# You can restrict this in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CreateTaskBody(BaseModel):
    text: str
    template_uuid: Optional[str] = None

class BatchZipItem(BaseModel):
    task_id: str
    filename: Optional[str] = None

class BatchZipBody(BaseModel):
    items: List[BatchZipItem]

def _headers(api_key: str):
    return {"X-API-Key": api_key}

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/api/templates")
def get_templates(x_api_key: str = Header(...)):
    r = requests.get(f"{API_URL}/templates", headers=_headers(x_api_key), timeout=30)
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json()

@app.post("/api/tasks")
def create_task(body: CreateTaskBody, x_api_key: str = Header(...)):
    headers = {"X-API-Key": x_api_key, "Content-Type": "application/json"}
    payload = {"text": body.text}
    if body.template_uuid:
        payload["template_uuid"] = body.template_uuid

    r = requests.post(f"{API_URL}/tasks", json=payload, headers=headers, timeout=60)
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json()

@app.get("/api/tasks/{task_id}/status")
def task_status(task_id: str, x_api_key: str = Header(...)):
    r = requests.get(f"{API_URL}/tasks/{task_id}/status", headers=_headers(x_api_key), timeout=30)
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json()

@app.get("/api/tasks/{task_id}/result")
def task_result(task_id: str, x_api_key: str = Header(...)):
    r = requests.get(f"{API_URL}/tasks/{task_id}/result", headers=_headers(x_api_key), timeout=120)
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)

    return Response(
        content=r.content,
        media_type="audio/mpeg",
        headers={"Content-Disposition": f'attachment; filename="{task_id}.mp3"'},
    )

@app.post("/api/batch/zip")
def batch_zip(body: BatchZipBody, x_api_key: str = Header(...)):
    mem = io.BytesIO()
    with zipfile.ZipFile(mem, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for item in body.items:
            task_id = item.task_id
            filename = item.filename or f"{task_id}.mp3"
            r = requests.get(f"{API_URL}/tasks/{task_id}/result", headers=_headers(x_api_key), timeout=120)
            if r.status_code == 200:
                zf.writestr(filename, r.content)

    mem.seek(0)
    return Response(
        content=mem.read(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="amulet_results.zip"'},
    )

# Amulet TTS Web

Web version of your batch .txt → mp3 tool.
Includes:
- FastAPI proxy backend
- React + Vite + Tailwind frontend
- Batch queue, templates, status polling, mp3 download, ZIP download

## Local run

### Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Check:
- http://localhost:8000/health

### Frontend
```bash
cd ../frontend
npm install
```

Create `.env.local`:
```env
VITE_API_BASE=http://localhost:8000
```

Run:
```bash
npm run dev
```

Open:
- http://localhost:5173

## Render

A sample `render.yaml` is included. 
You can use Render Blueprint or create services manually.

Frontend env var:
- VITE_API_BASE = https://<your-backend-service>.onrender.com

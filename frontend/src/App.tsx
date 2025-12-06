import React, { useMemo, useRef, useState } from "react";
import {
  FileText,
  Play,
  Trash2,
  Download,
  RefreshCw,
  Mic2,
  KeyRound,
  FolderUp,
  Loader2,
  Package
} from "lucide-react";

const API_BASE = (import.meta as any).env.VITE_API_BASE || "";

type Template = { name: string; uuid: string };

type RowItem = {
  id: string;
  file?: File;
  filename: string;
  text: string;
  taskId?: string;
  status: string;
  done: boolean;
  error?: string;
};

const FINAL_STATES = new Set([
  "ending",
  "ending_processed",
  "error",
  "error_handled"
]);

function cx(...s: (string | false | null | undefined)[]) {
  return s.filter(Boolean).join(" ");
}

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateUuid, setTemplateUuid] = useState<string>("");
  const [rows, setRows] = useState<RowItem[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [running, setRunning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const readyForZip = useMemo(
    () => rows.filter(r => r.taskId && r.done && !r.error),
    [rows]
  );

  function updateRow(id: string, patch: Partial<RowItem>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function loadTemplates() {
    if (!apiKey.trim()) {
      alert("Введіть API-ключ");
      return;
    }
    setLoadingTemplates(true);
    try {
      const r = await fetch(`${API_BASE}/api/templates`, {
        headers: { "X-API-Key": apiKey.trim() }
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setTemplates(data);
      setTemplateUuid(data?.[0]?.uuid || "");
    } catch (e: any) {
      alert(`Не вдалося завантажити шаблони:\n${e?.message || e}`);
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files).filter(f => f.name.toLowerCase().endsWith(".txt"));
    if (!list.length) return;

    const newRows: RowItem[] = [];
    for (const f of list) {
      const text = await f.text();
      newRows.push({
        id: crypto.randomUUID(),
        file: f,
        filename: f.name,
        text: text.trim(),
        status: "🕗 В черзі",
        done: false
      });
    }
    setRows(prev => [...prev, ...newRows]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function clearAll() {
    setRows([]);
  }

  async function createTask(text: string) {
    const r = await fetch(`${API_BASE}/api/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey.trim()
      },
      body: JSON.stringify({
        text,
        template_uuid: templateUuid || undefined
      })
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json() as Promise<{ task_id: string }>;
  }

  async function fetchStatus(taskId: string) {
    const r = await fetch(`${API_BASE}/api/tasks/${taskId}/status`, {
      headers: { "X-API-Key": apiKey.trim() }
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json() as Promise<{ status: string }>;
  }

  async function pollRow(rowId: string, taskId: string) {
    let status = "waiting";
    updateRow(rowId, { status: "⏳ waiting" });

    while (!FINAL_STATES.has(status)) {
      await sleep(1500);
      const s = await fetchStatus(taskId);
      status = s.status || "waiting";
      updateRow(rowId, { status: `⏳ ${status}` });
    }

    if (status === "ending" || status === "ending_processed") {
      updateRow(rowId, { status: "✅ Готово", done: true });
    } else {
      updateRow(rowId, {
        status: "❌ Помилка обробки",
        done: true,
        error: status
      });
    }
  }

  async function startSynthesis() {
    if (!apiKey.trim()) {
      alert("Введіть API-ключ");
      return;
    }
    if (!rows.length) {
      alert("Додайте хоча б один .txt файл");
      return;
    }

    setRunning(true)
    try {
      for (const r of rows) {
        if (!r.text) {
          updateRow(r.id, { status: "⚠️ Порожній текст", done: true });
          continue;
        }
        try {
          updateRow(r.id, { status: "▶️ Створення задачі..." });
          const created = await createTask(r.text);
          const taskId = created.task_id;
          updateRow(r.id, { taskId, status: `▶️ Задача ${taskId}` });
          await pollRow(r.id, taskId);
        } catch (e: any) {
          updateRow(r.id, {
            status: `❌ Помилка: ${e?.message || e}`,
            done: true,
            error: e?.message || String(e)
          });
        }
      }
    } finally {
      setRunning(false);
    }
  }

  function downloadMp3(row: RowItem) {
    if (!row.taskId) return;
    const safeName = row.filename.replace(/\.txt$/i, ".mp3");
    const url = `${API_BASE}/api/tasks/${row.taskId}/result`;

    fetch(url, { headers: { "X-API-Key": apiKey.trim() } })
      .then(res => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .then(blob => {
        const obj = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = obj;
        a.download = safeName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(obj);
      })
      .catch(() => alert("Не вдалося завантажити аудіо"));
  }

  async function downloadAllZip() {
    if (!readyForZip.length) {
      alert("Немає готових файлів");
      return;
    }
    try {
      const payload = {
        items: readyForZip.map(r => ({
          task_id: r.taskId,
          filename: r.filename.replace(/\.txt$/i, ".mp3")
        }))
      };
      const r = await fetch(`${API_BASE}/api/batch/zip`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey.trim()
        },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "amulet_results.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`ZIP помилка:\n${e?.message || e}`);
    }
  }

  return (
    <div className="min-h-screen text-neutral-100">
      <div className="sticky top-0 z-20 border-b border-white/5 bg-neutral-950/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-violet-500/10 accent-border flex items-center justify-center shadow-soft">
              <Mic2 className="h-5 w-5 text-fuchsia-200" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">
                Amulet TTS Web
              </div>
              <div className="text-xs text-neutral-400">
                Batch TXT → MP3 • API proxy
              </div>
            </div>
          </div>
          <div className="text-xs text-neutral-500">
            {API_BASE ? "API base set" : "API base not set"}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="glass rounded-2xl p-5 shadow-soft">
            <label className="flex items-center gap-2 text-sm text-neutral-300 mb-2">
              <KeyRound className="h-4 w-4" />
              API Key
            </label>
            <input
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Введіть API-ключ"
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-fuchsia-400/50"
            />

            <div className="mt-4 flex gap-2">
              <button
                onClick={loadTemplates}
                disabled={loadingTemplates}
                className={cx(
                  "flex-1 rounded-xl px-3 py-2 text-sm font-medium border border-white/10 bg-white/5 hover:bg-white/10 transition",
                  loadingTemplates && "opacity-60 cursor-not-allowed"
                )}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {loadingTemplates ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Завантажити шаблони
                </span>
              </button>
            </div>

            <div className="mt-4">
              <label className="text-xs text-neutral-400">
                🎙️ Вибір шаблону
              </label>
              <select
                value={templateUuid}
                onChange={e => setTemplateUuid(e.target.value)}
                className="mt-2 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-fuchsia-400/50"
              >
                {templates.length === 0 && (
                  <option value="">
                    Спочатку завантаж шаблони
                  </option>
                )}
                {templates.map(t => (
                  <option key={t.uuid} value={t.uuid}>
                    {t.name} ({t.uuid})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="glass rounded-2xl p-5 shadow-soft">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-neutral-200">
                📑 Черга файлів
              </div>
              <div className="text-xs text-neutral-500">
                {rows.length} items
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,text/plain"
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />

            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 rounded-xl px-3 py-2 text-sm font-medium border border-white/10 bg-white/5 hover:bg-white/10 transition"
              >
                <span className="inline-flex items-center gap-2">
                  <FolderUp className="h-4 w-4" />
                  Додати .txt
                </span>
              </button>
              <button
                onClick={clearAll}
                className="rounded-xl px-3 py-2 text-sm border border-white/10 bg-white/5 hover:bg-white/10 transition"
                title="Очистити чергу"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={startSynthesis}
              disabled={running}
              className={cx(
                "mt-3 w-full rounded-xl px-3 py-2 text-sm font-semibold",
                "bg-gradient-to-r from-fuchsia-500/80 to-violet-500/80",
                "hover:from-fuchsia-500 hover:to-violet-500 transition shadow-soft",
                running && "opacity-60 cursor-not-allowed"
              )}
            >
              <span className="inline-flex items-center justify-center gap-2">
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Запустити озвучення
              </span>
            </button>

            <button
              onClick={downloadAllZip}
              disabled={!readyForZip.length}
              className={cx(
                "mt-2 w-full rounded-xl px-3 py-2 text-sm font-medium border",
                "border-white/10 bg-white/5 hover:bg-white/10 transition",
                !readyForZip.length && "opacity-50 cursor-not-allowed"
              )}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <Package className="h-4 w-4" />
                Download all ready (ZIP)
              </span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="glass rounded-2xl p-5 shadow-soft">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-medium text-neutral-200">
                🔊 Batch Synthesis
              </div>
              <div className="text-xs text-neutral-500">
                Статуси оновлюються автоматично
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-neutral-400 border-b border-white/5">
                    <th className="text-left py-2 pr-2 w-[45%]">
                      <span className="inline-flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Файл
                      </span>
                    </th>
                    <th className="text-left py-2 pr-2 w-[35%]">Статус</th>
                    <th className="text-right py-2 w-[20%]">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="py-10 text-center text-neutral-500"
                      >
                        Додай .txt файли зліва 👈
                      </td>
                    </tr>
                  )}

                  {rows.map(r => (
                    <tr
                      key={r.id}
                      className="border-b border-white/5 hover:bg-white/[0.02] transition"
                    >
                      <td className="py-3 pr-2 align-top">
                        <div className="font-medium text-neutral-200">
                          {r.filename}
                        </div>
                        <div className="text-xs text-neutral-500 mt-1">
                          {r.text ? `${r.text.slice(0, 140)}${r.text.length > 140 ? "..." : ""}` : "—"}
                        </div>
                      </td>
                      <td className="py-3 pr-2 align-top">
                        <div className="inline-flex items-center gap-2 rounded-lg px-2 py-1 bg-white/5 border border-white/10">
                          {r.status}
                        </div>
                        {r.taskId && (
                          <div className="mt-1 text-xs text-neutral-500">
                            id: {r.taskId}
                          </div>
                        )}
                      </td>
                      <td className="py-3 align-top">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => downloadMp3(r)}
                            disabled={!r.taskId || !r.done || !!r.error}
                            className={cx(
                              "rounded-lg px-2.5 py-1.5 border text-xs font-medium",
                              "border-white/10 bg-white/5 hover:bg-white/10 transition",
                              (!r.taskId || !r.done || !!r.error) &&
                                "opacity-50 cursor-not-allowed"
                            )}
                            title="Завантажити mp3"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Download className="h-3.5 w-3.5" />
                              MP3
                            </span>
                          </button>
                          <button
                            onClick={() => removeRow(r.id)}
                            className="rounded-lg px-2 py-1.5 border border-white/10 bg-white/5 hover:bg-white/10 transition"
                            title="Видалити"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 text-xs text-neutral-500">
              Результати завантажуються через браузер.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

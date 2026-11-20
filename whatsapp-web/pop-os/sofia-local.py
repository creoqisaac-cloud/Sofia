#!/usr/bin/python3
import base64
import fcntl
import os
import queue
import re
import secrets
import signal
import subprocess
import threading
import tkinter as tk
import webbrowser
from pathlib import Path
from tkinter import ttk, messagebox
from urllib.request import Request, urlopen

ROOT = Path("/opt/sofia-local")
DATA = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local/share") / "sofia-local"
PORT = 18741
URL = f"http://127.0.0.1:{PORT}"
os.umask(0o077)
DATA.mkdir(parents=True, exist_ok=True)
window = tk.Tk()
window.title("Sofía · Prueba de WhatsApp")
lock = (DATA / "app.lock").open("a")
try:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    messagebox.showinfo("Sofía", "Sofía ya está abierta.")
    raise SystemExit(0)

key_file = DATA / "clave"
if not key_file.exists():
    key_file.write_text(secrets.token_urlsafe(32))
key = key_file.read_text().strip()
peer_file = DATA / "remitente"
peer = tk.StringVar(value=peer_file.read_text().strip() if peer_file.exists() else "")
status = tk.StringVar(value="Escribe el número del otro celular desde el que enviarás la prueba.")
process = None
events = queue.Queue()
authenticated = False
last_image = ""


def monitor(child):
    with (DATA / "servidor.log").open("w") as log:
        for line in child.stdout:
            log.write(line)
            log.flush()
            if f"En esta computadora: http://localhost:{PORT}" in line:
                events.put(child)


def start():
    global process, authenticated
    number = re.sub(r"[\s()+-]", "", peer.get())
    if not re.fullmatch(r"[0-9]{6,15}", number):
        messagebox.showinfo("Número de prueba", "Escribe el número con código de país. Por ejemplo, 52 y los 10 dígitos de un celular mexicano.")
        return
    peer_file.write_text(number)
    env = dict(os.environ, SOFIA_TOKEN=key, SOFIA_DATA_DIR=str(DATA / "datos"),
               SOFIA_BIND="127.0.0.1", PORT=str(PORT), SOFIA_WHATSAPP_WEB="1",
               SOFIA_PRUEBA_NUMERO=number, PUPPETEER_CACHE_DIR=str(DATA / "navegador"))
    try:
        process = subprocess.Popen(["/bin/bash", ROOT / "iniciar.sh"], start_new_session=True,
                                   cwd=DATA, env=env, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, text=True, errors="replace")
    except OSError as error:
        messagebox.showerror("No se pudo abrir Sofía", str(error))
        return
    authenticated = False
    start_button.state(["disabled"])
    entry.state(["disabled"])
    status.set("Preparando WhatsApp Web… La primera vez se descarga el navegador y puede tardar unos minutos.")
    threading.Thread(target=monitor, args=(process,), daemon=True).start()


def poll():
    global process, authenticated, last_image
    while not events.empty():
        if events.get() is process:
            authenticated = True
    if process and process.poll() is not None:
        process = None
        authenticated = False
        qr.configure(image="")
        last_image = ""
        status.set(f"El conector se cerró. Vuelve a iniciarlo. Detalles en {DATA / 'servidor.log'}")
        start_button.state(["!disabled"])
        entry.state(["!disabled"])
    if process and authenticated:
        auth = base64.b64encode(("sofia:" + key).encode()).decode()
        request = Request(URL + "/vincular", headers={"Authorization": "Basic " + auth})
        try:
            with urlopen(request, timeout=1) as response:
                page = response.read().decode()
            img = re.search(r"data:image/png;base64,([A-Za-z0-9+/=]+)", page)
            if img:
                if img[1] != last_image:
                    qr.photo = tk.PhotoImage(data=img[1])
                    qr.configure(image=qr.photo)
                    last_image = img[1]
                status.set("En el celular de prueba abre WhatsApp Business → Dispositivos vinculados → Vincular un dispositivo.")
            elif "WhatsApp vinculado." in page:
                qr.configure(image="")
                last_image = ""
                status.set("WhatsApp vinculado. Desde el otro celular, envía «Hola, ¿qué autos tienen?» al número vinculado.")
        except (OSError, tk.TclError):
            status.set("Esperando al conector local…")
    window.after(1200, poll)


def close():
    if process and process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=7)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
    window.destroy()


def open_panel():
    window.clipboard_clear()
    window.clipboard_append(key)
    webbrowser.open(URL)
    messagebox.showinfo("Panel de Sofía", f"En Más → Conexiones → Servidor usa {URL}. La clave del servidor está copiada para pegarla ahí.")


frame = ttk.Frame(window, padding=16)
frame.pack(fill="both", expand=True)
ttk.Label(frame, text="Celular autorizado para escribirle a Sofía").pack(anchor="w")
entry = ttk.Entry(frame, textvariable=peer, width=36)
entry.pack(anchor="w", pady=5)
start_button = ttk.Button(frame, text="Iniciar prueba", command=start)
start_button.pack(anchor="w")
ttk.Label(frame, textvariable=status, wraplength=460).pack(pady=10)
qr = ttk.Label(frame)
qr.pack()
ttk.Button(frame, text="Abrir panel de Sofía y copiar clave", command=lambda: open_panel() if authenticated else messagebox.showinfo("Sofía", "Inicia la prueba primero.")).pack(pady=5)
ttk.Label(frame, text="Al cerrar esta ventana se detiene Sofía. El vínculo y los chats de la prueba se guardan en esta computadora.", wraplength=460).pack(pady=4)
window.protocol("WM_DELETE_WINDOW", close)
window.after(200, poll)
if __name__ == "__main__":
    window.mainloop()

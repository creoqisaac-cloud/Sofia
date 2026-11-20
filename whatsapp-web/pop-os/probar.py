"""Prueba el .deb instalado con una pantalla virtual y un perfil nuevo sin vincular."""
import os
import runpy
import tempfile
import time
from pathlib import Path
from urllib.request import urlopen
from urllib.error import HTTPError

with tempfile.TemporaryDirectory() as workspace:
    os.environ["XDG_DATA_HOME"] = workspace
    saved_key = None
    for intento in range(2):
        app = runpy.run_path("/usr/bin/sofia-local")
        state = app["start"].__globals__
        try:
            if intento == 0:
                app["peer"].set("528100000000")
                saved_key = app["key"]
            else:
                assert app["key"] == saved_key
                assert app["peer"].get() == "528100000000"
            app["start"]()
            deadline = time.monotonic() + 180
            while time.monotonic() < deadline:
                app["window"].update()
                if state["authenticated"] and (app["DATA"] / "datos/sesion-whatsapp/session").is_dir():
                    break
                if state["process"] is None or state["process"].poll() is not None:
                    raise RuntimeError("El conector local terminó. " + (app["DATA"] / "servidor.log").read_text()[-2000:])
                time.sleep(.2)
            else:
                raise RuntimeError("El servidor local no inició a tiempo")
            try:
                urlopen(app["URL"] + "/vincular")
            except HTTPError as error:
                assert error.code == 401
            else:
                raise AssertionError("El QR debe requerir autenticación")
            if intento == 0:
                deadline = time.monotonic() + 45
                while time.monotonic() < deadline and not state["last_image"]:
                    app["window"].update()
                    time.sleep(.3)
                print("QR real dibujado en Linux:", bool(state["last_image"]), flush=True)
        finally:
            app["close"]()
            app["lock"].close()
    print("Inicio, cierre y reapertura con la misma carpeta y clave: OK")

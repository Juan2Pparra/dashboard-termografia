import os
import re
import time
import socket
import struct
import sqlite3
import threading
from datetime import datetime
import numpy as np
import cv2
from flask import Flask, Response, request, jsonify, send_from_directory

from preprocesamiento import generar_frame_simulado, procesar_trama

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "termografia.db")
CAPTURAS_DIR = os.path.join(BASE_DIR, "capturas")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

os.makedirs(CAPTURAS_DIR, exist_ok=True)
os.makedirs(FRONTEND_DIR, exist_ok=True)

# Configuración de la cámara Waveshare Thermal-90 (SenXor)
CAM_IP = "192.168.4.1"
CAM_PUERTO = 3333
FILAS, COLS = 62, 80
N_PIXELS = FILAS * COLS
FRAME_BYTES = N_PIXELS * 2  # 9920 bytes por frame

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")

lock_frame = threading.Lock()
ultimo_raw_temp = None
camara_conectada = False
inicio_sim = time.time()


def armar_comando(cuerpo: str) -> bytes:
    longitud = f"{len(cuerpo) + 4:04X}"
    crc = sum(cuerpo.encode("ascii")) & 0xFFFF
    return f"   #{longitud}{cuerpo}{crc:04X}".encode("ascii")


def hilo_captura_camara():
    """
    Lee continuamente el stream TCP de la Waveshare Thermal-90 manteniendo
    un buffer sincronizado por cabecera 'GFRA' para evitar desfase de bytes.
    """
    global ultimo_raw_temp, camara_conectada

    while True:
        sock = None
        buffer = bytearray()
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2.0)
            sock.connect((CAM_IP, CAM_PUERTO))
            sock.sendall(armar_comando("WREGB103"))
            camara_conectada = True

            while True:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                buffer.extend(chunk)

                while True:
                    idx = buffer.find(b"GFRA")
                    if idx == -1:
                        if len(buffer) > 3:
                            del buffer[:-3]
                        break

                    if idx > 0:
                        del buffer[:idx]

                    if len(buffer) < 4 + FRAME_BYTES:
                        break

                    payload = bytes(buffer[4 : 4 + FRAME_BYTES])
                    del buffer[: 4 + FRAME_BYTES]

                    vals = struct.unpack(f"<{N_PIXELS}H", payload)
                    matriz = np.array(vals, dtype=np.float32).reshape((FILAS, COLS)) / 100.0
                    limpia = np.clip(matriz, 10.0, 50.0)

                    with lock_frame:
                        ultimo_raw_temp = limpia

        except Exception:
            camara_conectada = False
            with lock_frame:
                ultimo_raw_temp = None
            time.sleep(1.5)
        finally:
            if sock is not None:
                try:
                    sock.close()
                except Exception:
                    pass


def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS capturas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sujeto_id TEXT NOT NULL,
            edad TEXT,
            sexo TEXT,
            fecha_hora TEXT NOT NULL,
            etiqueta TEXT NOT NULL,
            t_min REAL NOT NULL,
            t_max REAL NOT NULL,
            archivo_imagen TEXT NOT NULL,
            archivo_matriz TEXT NOT NULL
        )
    """)
    columnas = [row[1] for row in cursor.execute("PRAGMA table_info(capturas)").fetchall()]
    for col, tipo in [("sujeto_id", "TEXT DEFAULT 'Sujeto_001'"), ("edad", "TEXT DEFAULT ''"), ("sexo", "TEXT DEFAULT ''")]:
        if col not in columnas:
            cursor.execute(f"ALTER TABLE capturas ADD COLUMN {col} {tipo}")
    conn.commit()
    conn.close()


def limpiar_nombre_carpeta(texto: str) -> str:
    limpio = re.sub(r"[^a-zA-Z0-9_-]", "_", texto.strip())
    return limpio or "Sujeto_001"


def obtener_trama_actual():
    with lock_frame:
        frame = None if ultimo_raw_temp is None else ultimo_raw_temp.copy()

    if frame is None:
        frame = generar_frame_simulado(time.time() - inicio_sim)

    p_min = float(np.percentile(frame, 5))
    p_max = float(np.percentile(frame, 95))
    if p_max - p_min < 1.5:
        p_max = p_min + 2.0

    return procesar_trama(frame, t_min=p_min, t_max=p_max)


def generar_mjpeg():
    while True:
        _, img_limpia, _, _ = obtener_trama_actual()
        vista = cv2.resize(img_limpia, (400, 310), interpolation=cv2.INTER_NEAREST)
        ok, buffer = cv2.imencode(".jpg", vista, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        if ok:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
            )
        time.sleep(0.06)


@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/video_feed")
def video_feed():
    return Response(generar_mjpeg(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/capturas/<path:filename>")
def servir_captura(filename):
    return send_from_directory(CAPTURAS_DIR, filename)


@app.route("/api/estado", methods=["GET"])
def estado():
    return jsonify({
        "camara_conectada": camara_conectada,
        "ip_camara": CAM_IP
    })


@app.route("/api/capturar", methods=["POST"])
def capturar():
    datos = request.get_json(silent=True) or {}
    etiqueta = str(datos.get("etiqueta", "Sin etiqueta")).strip()
    sujeto_id = limpiar_nombre_carpeta(str(datos.get("sujeto_id", "Sujeto_001")))
    edad = str(datos.get("edad", "")).strip()
    sexo = str(datos.get("sexo", "")).strip()

    carpeta_sujeto = os.path.join(CAPTURAS_DIR, sujeto_id)
    os.makedirs(carpeta_sujeto, exist_ok=True)

    matriz_norm, img_limpia, t_min, t_max = obtener_trama_actual()

    marca = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    nombre_img = f"cap_{marca}.png"
    nombre_npy = f"cap_{marca}.npy"

    cv2.imwrite(os.path.join(carpeta_sujeto, nombre_img), img_limpia)
    np.save(os.path.join(carpeta_sujeto, nombre_npy), matriz_norm)

    ruta_rel_img = f"{sujeto_id}/{nombre_img}"
    ruta_rel_npy = f"{sujeto_id}/{nombre_npy}"
    fecha_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO capturas (sujeto_id, edad, sexo, fecha_hora, etiqueta, t_min, t_max, archivo_imagen, archivo_matriz)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (sujeto_id, edad, sexo, fecha_iso, etiqueta, round(t_min, 2), round(t_max, 2), ruta_rel_img, ruta_rel_npy),
    )
    nuevo_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({
        "ok": True,
        "id": nuevo_id,
        "sujeto_id": sujeto_id,
        "fecha_hora": fecha_iso,
        "etiqueta": etiqueta,
        "t_min": round(t_min, 2),
        "t_max": round(t_max, 2),
        "imagen_url": f"/capturas/{ruta_rel_img}",
    })


@app.route("/api/capturas", methods=["GET"])
def listar_capturas():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM capturas ORDER BY id DESC LIMIT 120")
    filas = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(filas)


if __name__ == "__main__":
    init_db()
    t = threading.Thread(target=hilo_captura_camara, daemon=True)
    t.start()
    app.run(host="0.0.0.0", port=5000, threaded=True)
import numpy as np
import cv2

HEIGHT = 62
WIDTH = 80


def normalizar_matriz(matriz_temp: np.ndarray, t_min: float = None, t_max: float = None) -> np.ndarray:
    """
    Aplica T_norm = (T - T_min) / (T_max - T_min) devolviendo float32 en [0.0, 1.0].
    """
    matriz = np.asarray(matriz_temp, dtype=np.float32)

    min_val = float(np.min(matriz)) if t_min is None else float(t_min)
    max_val = float(np.max(matriz)) if t_max is None else float(t_max)

    rango = max_val - min_val
    if rango <= 1e-6:
        return np.zeros_like(matriz, dtype=np.float32)

    norm = (matriz - min_val) / rango
    return np.clip(norm, 0.0, 1.0).astype(np.float32)


def matriz_a_imagen_limpia(matriz_norm: np.ndarray, colormap: int = cv2.COLORMAP_INFERNO) -> np.ndarray:
    """
    Convierte matriz normalizada [0.0, 1.0] (80x62) en imagen BGR limpia
    sin ejes, sin bordes ni textos.
    """
    u8 = np.clip(matriz_norm * 255.0, 0, 255).astype(np.uint8)
    return cv2.applyColorMap(u8, colormap)


def generar_frame_simulado(t_seg: float) -> np.ndarray:
    """
    Genera una matriz térmica de prueba 80x62 (en °C) cuando la cámara está desconectada.
    """
    y, x = np.mgrid[0:HEIGHT, 0:WIDTH].astype(np.float32)
    base = 29.0 + 0.15 * np.sin(t_seg * 0.8)
    temperatura = np.full((HEIGHT, WIDTH), base, dtype=np.float32)

    cx = 40.0 + 3.0 * np.sin(t_seg * 0.6)
    cy = 34.0 + 2.0 * np.cos(t_seg * 0.5)

    palma = np.exp(-(((x - cx) ** 2) / (2 * 12.0 ** 2) + ((y - (cy + 8)) ** 2) / (2 * 9.0 ** 2)))
    temperatura += 2.3 * palma

    for offset_x, alto in [(-8, 14), (-2, 17), (4, 16), (10, 12)]:
        dedo = np.exp(-(((x - (cx + offset_x)) ** 2) / (2 * 2.3 ** 2) + ((y - (cy - 4)) ** 2) / (2 * (alto * 0.5) ** 2)))
        temperatura += 2.0 * dedo

    ruido = np.random.normal(0.0, 0.05, size=(HEIGHT, WIDTH)).astype(np.float32)
    return temperatura + ruido


def procesar_trama(matriz_temp: np.ndarray, t_min: float = None, t_max: float = None):
    """
    Recibe una matriz 80x62 en °C y devuelve:
    (matriz_norm [float32], imagen_bgr_limpia [uint8], t_min_usado, t_max_usado).
    """
    min_usado = float(np.min(matriz_temp)) if t_min is None else float(t_min)
    max_usado = float(np.max(matriz_temp)) if t_max is None else float(t_max)

    matriz_norm = normalizar_matriz(matriz_temp, min_usado, max_usado)
    imagen_limpia = matriz_a_imagen_limpia(matriz_norm)
    return matriz_norm, imagen_limpia, min_usado, max_usado
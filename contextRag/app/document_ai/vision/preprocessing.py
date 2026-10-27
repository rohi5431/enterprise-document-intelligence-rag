import cv2
import numpy as np
from typing import Tuple, Optional

def load_image(image_path_or_bytes) -> np.ndarray:
    """Load an image from a file path or bytes buffer into a NumPy BGR array."""
    if isinstance(image_path_or_bytes, bytes):
        nparr = np.frombuffer(image_path_or_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode image from bytes.")
        return img
    elif isinstance(image_path_or_bytes, str):
        img = cv2.imread(image_path_or_bytes)
        if img is None:
            raise ValueError(f"Failed to load image from path: {image_path_or_bytes}")
        return img
    elif isinstance(image_path_or_bytes, np.ndarray):
        return image_path_or_bytes
    else:
        raise TypeError("Unsupported image input type.")

def convert_to_grayscale(img: np.ndarray) -> np.ndarray:
    """Convert BGR image to single-channel Grayscale."""
    if len(img.shape) == 2:
        return img
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

def resize_image(img: np.ndarray, max_dim: int = 2000) -> np.ndarray:
    """Resize image maintaining aspect ratio if larger than max_dim."""
    h, w = img.shape[:2]
    if max(h, w) <= max_dim:
        return img
    scale = max_dim / float(max(h, w))
    new_w, new_h = int(w * scale), int(h * scale)
    return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

def denoise_image(gray: np.ndarray) -> np.ndarray:
    """Apply Fast N-Means Denoising or Gaussian Blur to clean noise."""
    if len(gray.shape) == 3:
        gray = convert_to_grayscale(gray)
    return cv2.fastNlMeansDenoising(gray, h=10, templateWindowSize=7, searchWindowSize=21)

def enhance_contrast(gray: np.ndarray) -> np.ndarray:
    """Apply CLAHE (Contrast Limited Adaptive Histogram Equalization) to improve readability."""
    if len(gray.shape) == 3:
        gray = convert_to_grayscale(gray)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(gray)

def threshold_image(gray: np.ndarray) -> np.ndarray:
    """Apply Otsu's adaptive binarization thresholding for document images."""
    if len(gray.shape) == 3:
        gray = convert_to_grayscale(gray)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh

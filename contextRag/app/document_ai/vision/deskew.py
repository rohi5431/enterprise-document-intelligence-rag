import cv2
import numpy as np

def compute_skew_angle(gray: np.ndarray) -> float:
    """Compute skew angle of document text using Minimum Area Rectangle on thresholded contours."""
    if len(gray.shape) == 3:
        gray = cv2.cvtColor(gray, cv2.COLOR_BGR2GRAY)
    
    # Invert image: text becomes white, background black
    inv = cv2.bitwise_not(gray)
    thresh = cv2.threshold(inv, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]

    # Find non-zero coordinates
    coords = np.column_stack(np.where(thresh > 0))
    if coords.shape[0] == 0:
        return 0.0

    angle = cv2.minAreaRect(coords)[-1]
    
    # Adjust angle range to [-45, 45]
    if angle < -45:
        angle = -(90 + angle)
    elif angle > 45:
        angle = 90 - angle
    else:
        angle = -angle
        
    return float(angle)

def rotate_image(image: np.ndarray, angle: float) -> np.ndarray:
    """Rotate image by given angle in degrees, expanding borders to avoid clipping."""
    if abs(angle) < 0.5:
        return image  # Negligible skew
        
    h, w = image.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    
    # Calculate new bounding dimensions
    cos = np.abs(M[0, 0])
    sin = np.abs(M[0, 1])
    new_w = int((h * sin) + (w * cos))
    new_h = int((h * cos) + (w * sin))
    
    M[0, 2] += (new_w / 2) - center[0]
    M[1, 2] += (new_h / 2) - center[1]
    
    border_color = (255, 255, 255) if len(image.shape) == 3 else 255
    return cv2.warpAffine(image, M, (new_w, new_h), flags=cv2.INTER_CUBIC, borderValue=border_color)

def deskew_document(image: np.ndarray) -> Tuple[np.ndarray, float]:
    """Deskew document and return corrected image and detected angle."""
    angle = compute_skew_angle(image)
    corrected = rotate_image(image, angle)
    return corrected, angle

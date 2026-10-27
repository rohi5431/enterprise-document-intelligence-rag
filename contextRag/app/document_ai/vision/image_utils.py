import cv2
import numpy as np

def preprocess_document_image(image_input) -> np.ndarray:
    """Full OpenCV document preprocessing pipeline:
    Load -> Resize -> Grayscale -> Denoise -> Enhance Contrast -> Deskew -> Threshold
    """
    from app.document_ai.vision.preprocessing import (
        load_image, resize_image, convert_to_grayscale,
        denoise_image, enhance_contrast, threshold_image
    )
    from app.document_ai.vision.deskew import deskew_document

    img = load_image(image_input)
    img = resize_image(img, max_dim=2000)
    gray = convert_to_grayscale(img)
    denoised = denoise_image(gray)
    enhanced = enhance_contrast(denoised)
    corrected, _ = deskew_document(enhanced)
    thresh = threshold_image(corrected)
    return thresh

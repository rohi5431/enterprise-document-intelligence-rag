from pydantic import BaseModel, Field
from typing import List, Optional

class OCRItem(BaseModel):
    text: str
    bbox: List[int] = Field(description="[ymin, xmin, ymax, xmax]")
    confidence: float
    page: int = 1
    source: Optional[str] = None

class PageOCRResult(BaseModel):
    page: int
    items: List[OCRItem]
    full_text: str
    average_confidence: float

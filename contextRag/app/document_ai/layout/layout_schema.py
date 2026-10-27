from pydantic import BaseModel, Field
from typing import List, Optional

class LayoutBlock(BaseModel):
    block_id: str
    page: int = 1
    block_type: str = Field(description="title, paragraph, table, figure, header, footer, list")
    bbox: List[int] = Field(description="[ymin, xmin, ymax, xmax]")
    text: str = ""
    confidence: float = 1.0
    section: Optional[str] = None

class PageLayoutResult(BaseModel):
    page: int
    blocks: List[LayoutBlock]

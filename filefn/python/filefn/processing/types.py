from typing import Any, Callable, Dict, List, Optional, Protocol, Union

from pydantic import BaseModel


class ProcessorInput(BaseModel):
    fileId: str
    versionId: str
    storageKey: str
    mimeType: str
    size: int
    fileName: str
    tenantId: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class ProcessorOutputArtifact(BaseModel):
    kind: str
    data: bytes
    mimeType: str
    storageKey: str
    metadata: Optional[Dict[str, Any]] = None

class ProcessorResult(BaseModel):
    success: bool
    artifacts: List[ProcessorOutputArtifact]
    error: Optional[str] = None

class Processor(Protocol):
    name: str
    supportedMimeTypes: List[str]
    async def process(self, input: ProcessorInput, get_data: Callable[[], Any]) -> ProcessorResult: ...

class ThumbnailSize(BaseModel):
    name: str
    width: int
    height: int

class ThumbnailConfig(BaseModel):
    sizes: Optional[List[ThumbnailSize]] = None
    quality: Optional[int] = 80
    format: Optional[str] = 'jpeg' # 'jpeg' | 'png' | 'webp'

class PdfPreviewConfig(BaseModel):
    sizes: Optional[List[ThumbnailSize]] = None
    density: Optional[int] = 144
    quality: Optional[int] = 85
    format: Optional[str] = 'png'

class CompressionConfig(BaseModel):
    algorithm: Optional[str] = 'gzip'
    level: Optional[int] = 6

class OCRConfig(BaseModel):
    language: Optional[str] = 'eng'
    outputFormat: Optional[str] = 'text'

class ResizeOptions(BaseModel):
    width: Optional[int] = None
    height: Optional[int] = None
    fit: Optional[str] = 'cover' # 'cover' | 'contain' | 'fill' | 'inside' | 'outside'
    withoutEnlargement: Optional[bool] = False

class CropOptions(BaseModel):
    left: int
    top: int
    width: int
    height: int

class RotateOptions(BaseModel):
    angle: int
    background: Optional[Dict[str, int]] = None # { r, g, b, alpha }

class ImageTransformOperation(BaseModel):
    operation: str # 'resize' | 'crop' | 'rotate'
    options: Union[ResizeOptions, CropOptions, RotateOptions]
    suffix: Optional[str] = None

class ImageTransformConfig(BaseModel):
    operations: List[ImageTransformOperation]
    outputFormat: Optional[str] = None
    outputQuality: Optional[int] = None

from typing import Any, Awaitable, Callable, List, Optional

from .types import (
    CompressionConfig,
    CropOptions,
    ImageTransformConfig,
    ImageTransformOperation,
    OCRConfig,
    PdfPreviewConfig,
    Processor,
    ProcessorInput,
    ProcessorOutputArtifact,
    ProcessorResult,
    ResizeOptions,
    RotateOptions,
    ThumbnailConfig,
    ThumbnailSize,
)

THUMBNAIL_SUPPORTED_MIME_TYPES = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/tiff",
]
COMPRESSION_SUPPORTED_MIME_TYPES = ["*/*"]
OCR_SUPPORTED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/tiff"]
IMAGE_TRANSFORM_SUPPORTED_MIME_TYPES = THUMBNAIL_SUPPORTED_MIME_TYPES
VIDEO_SUPPORTED_MIME_TYPES = ["video/*"]
AUDIO_SUPPORTED_MIME_TYPES = ["audio/*"]
PDF_PREVIEW_SUPPORTED_MIME_TYPES = ["application/pdf"]


class _UnavailableProcessor:
    def __init__(
        self,
        *,
        name: str,
        supported_mime_types: List[str],
        error_code: str,
    ):
        self.name = name
        self.supportedMimeTypes = supported_mime_types
        self.error_code = error_code

    async def process(self, input: ProcessorInput, get_data: Callable[[], Awaitable[bytes]]) -> ProcessorResult:
        return ProcessorResult(success=False, artifacts=[], error=self.error_code)


def create_thumbnail_processor(config: Optional[ThumbnailConfig] = None) -> Processor:
    from .processors.thumbnail import create_thumbnail_processor as _create_thumbnail_processor

    return _create_thumbnail_processor(config)


def create_pdf_preview_processor(config: Optional[PdfPreviewConfig] = None) -> Processor:
    from .processors.pdf_preview import create_pdf_preview_processor as _create_pdf_preview_processor

    return _create_pdf_preview_processor(config)


def create_compression_processor(config: Optional[CompressionConfig] = None) -> Processor:
    from .processors.compression import create_compression_processor as _create_compression_processor

    return _create_compression_processor(config)


def create_ocr_processor(config: Optional[OCRConfig] = None) -> Processor:
    _ = config or OCRConfig()
    return _UnavailableProcessor(
        name="ocr",
        supported_mime_types=OCR_SUPPORTED_MIME_TYPES,
        error_code="FILEFN_PROCESSING_OCR_PROVIDER_REQUIRED",
    )


def create_image_transform_processor(config: ImageTransformConfig) -> Processor:
    from .processors.image_transform import create_image_transform_processor as _create_image_transform_processor

    return _create_image_transform_processor(config)


def create_video_processor(config: Optional[dict[str, Any]] = None) -> Processor:
    _ = config or {}
    return _UnavailableProcessor(
        name="video",
        supported_mime_types=VIDEO_SUPPORTED_MIME_TYPES,
        error_code="FILEFN_PROCESSING_VIDEO_PROVIDER_REQUIRED",
    )


def create_audio_processor(config: Optional[dict[str, Any]] = None) -> Processor:
    _ = config or {}
    return _UnavailableProcessor(
        name="audio",
        supported_mime_types=AUDIO_SUPPORTED_MIME_TYPES,
        error_code="FILEFN_PROCESSING_AUDIO_PROVIDER_REQUIRED",
    )


__all__ = [
    "Processor",
    "ProcessorInput",
    "ProcessorOutputArtifact",
    "ProcessorResult",
    "ThumbnailConfig",
    "PdfPreviewConfig",
    "ThumbnailSize",
    "CompressionConfig",
    "OCRConfig",
    "ImageTransformOperation",
    "ImageTransformConfig",
    "ResizeOptions",
    "CropOptions",
    "RotateOptions",
    "create_thumbnail_processor",
    "create_pdf_preview_processor",
    "create_compression_processor",
    "create_ocr_processor",
    "create_image_transform_processor",
    "create_video_processor",
    "create_audio_processor",
    "THUMBNAIL_SUPPORTED_MIME_TYPES",
    "COMPRESSION_SUPPORTED_MIME_TYPES",
    "OCR_SUPPORTED_MIME_TYPES",
    "IMAGE_TRANSFORM_SUPPORTED_MIME_TYPES",
    "VIDEO_SUPPORTED_MIME_TYPES",
    "AUDIO_SUPPORTED_MIME_TYPES",
    "PDF_PREVIEW_SUPPORTED_MIME_TYPES",
]

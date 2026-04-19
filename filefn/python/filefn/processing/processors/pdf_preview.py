import io
import struct
import zlib
from typing import Any, Callable, Optional, Tuple

from ..types import (
    PdfPreviewConfig,
    Processor,
    ProcessorInput,
    ProcessorOutputArtifact,
    ProcessorResult,
    ThumbnailSize,
)

DEFAULT_SIZES = [
    ThumbnailSize(name='small', width=150, height=150),
    ThumbnailSize(name='medium', width=300, height=300),
    ThumbnailSize(name='large', width=600, height=600),
]

SUPPORTED_MIME_TYPES = ['application/pdf']
UNSUPPORTED_MIME_TYPE_ERROR = 'FILEFN_PROCESSING_UNSUPPORTED_MIME_TYPE'
PDF_PREVIEW_FAILED_ERROR = 'FILEFN_PROCESSING_PDF_PREVIEW_FAILED'


class PdfPreviewProcessor:
    def __init__(self, config: Optional[PdfPreviewConfig] = None):
        config = config or PdfPreviewConfig()
        self.sizes = config.sizes or DEFAULT_SIZES
        self.density = config.density or 144
        self.quality = config.quality or 85
        self.format = config.format or 'png'
        self.name = 'pdf-preview'
        self.supportedMimeTypes = SUPPORTED_MIME_TYPES

    async def process(self, input: ProcessorInput, get_data: Callable[[], Any]) -> ProcessorResult:
        if input.mimeType not in self.supportedMimeTypes:
            return ProcessorResult(success=False, artifacts=[], error=UNSUPPORTED_MIME_TYPE_ERROR)

        try:
            pdf_data = await get_data()
            artifacts = []
            for size in self.sizes:
                preview_data, render_mode = self._render_preview(pdf_data, size)
                base_key = input.storageKey.rsplit('.', 1)[0]
                output_data, output_mime_type, extension = self._format_output(preview_data)
                artifacts.append(
                    ProcessorOutputArtifact(
                        kind=f'pdf-preview-page-1-{size.name}',
                        data=output_data,
                        mimeType=output_mime_type,
                        storageKey=f'{base_key}-pdf-preview-page-1-{size.name}.{extension}',
                        metadata={
                            'width': size.width,
                            'height': size.height,
                            'density': self.density,
                            'pageNumber': 1,
                            'format': extension,
                            'renderMode': render_mode,
                            'sourceFileId': input.fileId,
                            'sourceVersionId': input.versionId,
                            'originalSize': len(pdf_data),
                            'previewSize': len(output_data),
                        },
                    )
                )

            return ProcessorResult(success=True, artifacts=artifacts)
        except Exception:
            return ProcessorResult(success=False, artifacts=[], error=PDF_PREVIEW_FAILED_ERROR)

    def _render_preview(self, pdf_data: bytes, size: ThumbnailSize) -> Tuple[bytes, str]:
        try:
            from PIL import Image

            with io.BytesIO(pdf_data) as f:
                with Image.open(f) as opened_image:
                    img = opened_image.copy()
                    img.thumbnail((size.width, size.height), Image.Resampling.LANCZOS)
                    out_buffer = io.BytesIO()
                    img.save(out_buffer, format='PNG')
                    return out_buffer.getvalue(), 'page-rasterized'
        except Exception:
            return self._generate_placeholder_preview(pdf_data, size), 'placeholder'

    def _generate_placeholder_preview(self, pdf_data: bytes, size: ThumbnailSize) -> bytes:
        width = max(1, size.width)
        height = max(1, size.height)
        accent = sum((index + 17) * byte for index, byte in enumerate(pdf_data[:96])) % 256
        header_height = max(12, height // 6)
        margin_x = max(8, width // 8)
        margin_y = max(8, height // 10)
        line_gap = max(10, height // 8)
        line_height = max(2, height // 35)
        pixels = bytearray()

        for y in range(height):
            pixels.append(0)
            for x in range(width):
                if y < header_height:
                    r, g, b = accent, (accent * 3) % 256, (accent * 5) % 256
                elif margin_x <= x <= width - margin_x and margin_y <= y <= height - margin_y:
                    r, g, b = 255, 255, 255
                    for offset, length_scale in enumerate((0.78, 0.66, 0.72)):
                        line_y = margin_y + header_height + offset * line_gap
                        line_end = margin_x + int(width * length_scale)
                        if line_y <= y < line_y + line_height and margin_x <= x <= min(width - margin_x, line_end):
                            r, g, b = 214, 220, 228
                            break
                else:
                    r, g, b = 242, 244, 247
                pixels.extend((r, g, b))

        compressor = zlib.compressobj()
        compressed = compressor.compress(bytes(pixels)) + compressor.flush()
        return b''.join([
            b'\x89PNG\r\n\x1a\n',
            self._png_chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)),
            self._png_chunk(b'IDAT', compressed),
            self._png_chunk(b'IEND', b''),
        ])

    def _format_output(self, preview_png: bytes) -> Tuple[bytes, str, str]:
        if self.format == 'png':
            return preview_png, 'image/png', 'png'

        try:
            from PIL import Image

            with Image.open(io.BytesIO(preview_png)) as opened_image:
                img = opened_image.copy()
                out_buffer = io.BytesIO()
                fmt = self.format.upper()
                if fmt == 'JPG':
                    fmt = 'JPEG'
                if fmt == 'JPEG' and img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
                img.save(out_buffer, format=fmt, quality=self.quality)
                mime_type = 'image/webp' if fmt == 'WEBP' else 'image/jpeg'
                extension = 'webp' if fmt == 'WEBP' else 'jpg'
                return out_buffer.getvalue(), mime_type, extension
        except Exception:
            return preview_png, 'image/png', 'png'

    def _png_chunk(self, chunk_type: bytes, data: bytes) -> bytes:
        checksum = zlib.crc32(chunk_type)
        checksum = zlib.crc32(data, checksum) & 0xffffffff
        return struct.pack('>I', len(data)) + chunk_type + data + struct.pack('>I', checksum)


def create_pdf_preview_processor(config: Optional[PdfPreviewConfig] = None) -> Processor:
    return PdfPreviewProcessor(config)


PDF_PREVIEW_SUPPORTED_MIME_TYPES = SUPPORTED_MIME_TYPES

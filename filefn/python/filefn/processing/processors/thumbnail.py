import io
import struct
import zlib
from typing import Any, Dict, Optional, Tuple

from ..types import (
    Processor,
    ProcessorInput,
    ProcessorOutputArtifact,
    ProcessorResult,
    ThumbnailConfig,
    ThumbnailSize,
)

DEFAULT_SIZES = [
    ThumbnailSize(name='small', width=150, height=150),
    ThumbnailSize(name='medium', width=300, height=300),
    ThumbnailSize(name='large', width=600, height=600),
]

SUPPORTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/tiff']
UNSUPPORTED_MIME_TYPE_ERROR = 'FILEFN_PROCESSING_UNSUPPORTED_MIME_TYPE'
THUMBNAIL_FAILED_ERROR = 'FILEFN_PROCESSING_THUMBNAIL_FAILED'

class ThumbnailProcessor:
    def __init__(self, config: Optional[ThumbnailConfig] = None):
        config = config or ThumbnailConfig()
        self.sizes = config.sizes or DEFAULT_SIZES
        self.quality = config.quality or 80
        self.format = config.format or 'jpeg'
        self.name = 'thumbnail'
        self.supportedMimeTypes = SUPPORTED_MIME_TYPES

    async def process(self, input: ProcessorInput, get_data: Any) -> ProcessorResult:
        if input.mimeType not in self.supportedMimeTypes:
             return ProcessorResult(success=False, artifacts=[], error=UNSUPPORTED_MIME_TYPE_ERROR)

        try:
            image_data = await get_data()
            artifacts = []

            for size in self.sizes:
                thumbnail_data, render_mode = self._generate_thumbnail(image_data, size)
                if render_mode == 'placeholder':
                    thumbnail_data, output_mime_type, extension = self._placeholder_format_output(thumbnail_data)
                else:
                    output_mime_type = 'image/jpeg'
                    extension = 'jpg'
                    if self.format == 'png':
                        output_mime_type = 'image/png'
                        extension = 'png'
                    elif self.format == 'webp':
                        output_mime_type = 'image/webp'
                        extension = 'webp'

                base_key = input.storageKey.rsplit('.', 1)[0]
                storage_key = f"{base_key}-thumb-{size.name}.{extension}"

                artifacts.append(ProcessorOutputArtifact(
                    kind=f"thumbnail-{size.name}",
                    data=thumbnail_data,
                    mimeType=output_mime_type,
                    storageKey=storage_key,
                    metadata={
                        'width': size.width,
                        'height': size.height,
                        'quality': self.quality,
                        'format': self.format,
                        'renderMode': render_mode,
                        'sourceFileId': input.fileId,
                        'sourceVersionId': input.versionId,
                        'originalSize': len(image_data),
                        'thumbnailSize': len(thumbnail_data)
                    }
                ))

            return ProcessorResult(success=True, artifacts=artifacts)

        except Exception:
            return ProcessorResult(success=False, artifacts=[], error=THUMBNAIL_FAILED_ERROR)

    def _generate_thumbnail(self, image_data: bytes, size: ThumbnailSize) -> Tuple[bytes, str]:
        try:
            from PIL import Image

            with io.BytesIO(image_data) as f:
                with Image.open(f) as opened_image:
                    img = opened_image.copy()

                    if self.format == 'jpeg' and img.mode in ('RGBA', 'P'):
                        img = img.convert('RGB')

                    img.thumbnail((size.width, size.height), Image.Resampling.LANCZOS)

                    out_buffer = io.BytesIO()
                    fmt = self.format.upper()
                    if fmt == 'JPG':
                        fmt = 'JPEG'

                    save_args: Dict[str, Any] = {'format': fmt, 'quality': self.quality}
                    if fmt == 'PNG':
                        save_args['optimize'] = True
                        del save_args['quality']

                    img.save(out_buffer, **save_args)
                    return out_buffer.getvalue(), 'image-rasterized'
        except Exception:
            return self._generate_placeholder_thumbnail(image_data, size), 'placeholder'

    def _generate_placeholder_thumbnail(self, image_data: bytes, size: ThumbnailSize) -> bytes:
        seed = sum((index + 1) * byte for index, byte in enumerate(image_data[:128])) % 256
        pixels = bytearray()
        width = max(1, size.width)
        height = max(1, size.height)
        for y in range(height):
            pixels.append(0)
            for x in range(width):
                r = (seed + (x * 97 // width)) % 256
                g = (seed + (y * 131 // height)) % 256
                b = (seed + ((x + y) * 53 // max(1, width + height))) % 256
                pixels.extend((r, g, b))

        compressor = zlib.compressobj()
        compressed = compressor.compress(bytes(pixels)) + compressor.flush()
        return b''.join([
            b'\x89PNG\r\n\x1a\n',
            self._png_chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)),
            self._png_chunk(b'IDAT', compressed),
            self._png_chunk(b'IEND', b''),
        ])

    def _placeholder_format_output(self, placeholder_png: bytes) -> Tuple[bytes, str, str]:
        if self.format == 'png':
            return placeholder_png, 'image/png', 'png'

        try:
            from PIL import Image

            with Image.open(io.BytesIO(placeholder_png)) as opened_image:
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
            return placeholder_png, 'image/png', 'png'

    def _png_chunk(self, chunk_type: bytes, data: bytes) -> bytes:
        checksum = zlib.crc32(chunk_type)
        checksum = zlib.crc32(data, checksum) & 0xffffffff
        return struct.pack('>I', len(data)) + chunk_type + data + struct.pack('>I', checksum)

def create_thumbnail_processor(config: Optional[ThumbnailConfig] = None) -> Processor:
    return ThumbnailProcessor(config)

THUMBNAIL_SUPPORTED_MIME_TYPES = SUPPORTED_MIME_TYPES

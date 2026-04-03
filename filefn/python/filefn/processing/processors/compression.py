import gzip
import io
from typing import Any, Optional, List
from ..types import Processor, ProcessorInput, ProcessorResult, ProcessorOutputArtifact, CompressionConfig

SUPPORTED_MIME_TYPES = ['*/*']
UNSUPPORTED_ALGORITHM_ERROR = 'FILEFN_PROCESSING_UNSUPPORTED_COMPRESSION_ALGORITHM'
COMPRESSION_FAILED_ERROR = 'FILEFN_PROCESSING_COMPRESSION_FAILED'

class CompressionProcessor:
    def __init__(self, config: Optional[CompressionConfig] = None):
        config = config or CompressionConfig()
        self.algorithm = config.algorithm or 'gzip'
        self.level = config.level or 6
        self.name = 'compression'
        self.supportedMimeTypes = SUPPORTED_MIME_TYPES

    async def process(self, input: ProcessorInput, get_data: Any) -> ProcessorResult:
        if self.algorithm != 'gzip':
             return ProcessorResult(success=False, artifacts=[], error=UNSUPPORTED_ALGORITHM_ERROR)

        try:
            data = await get_data()
            
            out_buffer = io.BytesIO()
            with gzip.GzipFile(fileobj=out_buffer, mode='wb', compresslevel=self.level) as f:
                f.write(data)
            
            compressed_data = out_buffer.getvalue()
            
            artifacts = [ProcessorOutputArtifact(
                kind='compressed',
                data=compressed_data,
                mimeType='application/gzip',
                storageKey=f"{input.storageKey}.gz",
                metadata={
                    'algorithm': self.algorithm,
                    'level': self.level,
                    'originalSize': len(data),
                    'compressedSize': len(compressed_data),
                    'ratio': len(compressed_data) / len(data) if len(data) > 0 else 0
                }
            )]

            return ProcessorResult(success=True, artifacts=artifacts)

        except Exception:
            return ProcessorResult(success=False, artifacts=[], error=COMPRESSION_FAILED_ERROR)

def create_compression_processor(config: Optional[CompressionConfig] = None) -> Processor:
    return CompressionProcessor(config)

COMPRESSION_SUPPORTED_MIME_TYPES = SUPPORTED_MIME_TYPES

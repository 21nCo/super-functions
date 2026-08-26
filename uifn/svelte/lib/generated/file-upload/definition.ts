import { createFileUploadController, type FileUploadProps } from '@uifn/core/primitives/file-upload';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const FileUploadDefinition: SveltePrimitiveDefinition<FileUploadProps> = {
  name: 'FileUpload',
  family: 'forms-input',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["files","defaultFiles","accept","multiple","maxFiles","maxSize","name","disabled","required"],
  contextKey: Symbol('uifn.FileUpload'),
  createController: createFileUploadController as never,
};

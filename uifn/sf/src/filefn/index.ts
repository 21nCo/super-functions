import {
  FileListPanel,
  FileDropzonePanel,
  QuotaUsagePanel,
  UploadProgressList,
  type FileRecord,
  type PatternStatus,
  type QuotaUsageData,
  type UploadProgressRecord,
} from '@uifn/patterns';
import { resolveBackedData, withSuperfunctionBacking, type SfPatternModel } from '../shared';

export interface FileFnClient {
  listFiles: () => Promise<FileRecord[]>;
  listUploads: () => Promise<UploadProgressRecord[]>;
  getQuotaUsage: () => Promise<QuotaUsageData>;
  uploadFiles?: (files: File[]) => Promise<FileRecord[]>;
  cancelUpload?: (uploadId: string) => Promise<void>;
  openFile?: (fileId: string) => Promise<void>;
  removeFile?: (fileId: string) => Promise<void>;
  upgradeQuota?: () => Promise<void>;
}

export interface FileFnFileDropzonePanelProps {
  fileClient: FileFnClient;
  status?: PatternStatus;
  files?: FileRecord[];
}

export interface FileFnUploadProgressListProps {
  fileClient: FileFnClient;
  status?: PatternStatus;
  uploads?: UploadProgressRecord[];
}

export interface FileFnFileListPanelProps {
  fileClient: FileFnClient;
  status?: PatternStatus;
  files?: FileRecord[];
}

export interface FileFnQuotaUsagePanelProps {
  fileClient: FileFnClient;
  status?: PatternStatus;
  data?: QuotaUsageData;
}

export async function FileFnFileDropzonePanel(
  props: FileFnFileDropzonePanelProps
): Promise<SfPatternModel<FileRecord[]>> {
  const resolved = await resolveBackedData(props.status, props.files, () => props.fileClient.listFiles());
  return withSuperfunctionBacking(
    FileDropzonePanel({
      status: resolved.status,
      files: resolved.data,
      error: resolved.error,
      onDrop: (files) => void props.fileClient.uploadFiles?.(files),
      onRemove: (fileId) => void props.fileClient.removeFile?.(fileId),
    }),
    {
      superfunction: 'filefn',
      controlledCounterpart: 'FileDropzonePanel',
      clientContract: 'FileFnClient',
    }
  );
}

export async function FileFnUploadProgressList(
  props: FileFnUploadProgressListProps
): Promise<SfPatternModel<UploadProgressRecord[]>> {
  const resolved = await resolveBackedData(props.status, props.uploads, () => props.fileClient.listUploads());
  return withSuperfunctionBacking(
    UploadProgressList({
      status: resolved.status,
      uploads: resolved.data,
      error: resolved.error,
      onCancel: (uploadId) => void props.fileClient.cancelUpload?.(uploadId),
    }),
    {
      superfunction: 'filefn',
      controlledCounterpart: 'UploadProgressList',
      clientContract: 'FileFnClient',
    }
  );
}

export async function FileFnFileListPanel(props: FileFnFileListPanelProps): Promise<SfPatternModel<FileRecord[]>> {
  const resolved = await resolveBackedData(props.status, props.files, () => props.fileClient.listFiles());
  return withSuperfunctionBacking(
    FileListPanel({
      status: resolved.status,
      files: resolved.data,
      error: resolved.error,
      onOpen: (fileId) => void props.fileClient.openFile?.(fileId),
      onDelete: (fileId) => void props.fileClient.removeFile?.(fileId),
    }),
    {
      superfunction: 'filefn',
      controlledCounterpart: 'FileListPanel',
      clientContract: 'FileFnClient',
    }
  );
}

export async function FileFnQuotaUsagePanel(
  props: FileFnQuotaUsagePanelProps
): Promise<SfPatternModel<QuotaUsageData>> {
  const resolved = await resolveBackedData(props.status, props.data, () => props.fileClient.getQuotaUsage());
  return withSuperfunctionBacking(
    QuotaUsagePanel({
      status: resolved.status,
      data: resolved.data,
      error: resolved.error,
      onUpgrade: () => void props.fileClient.upgradeQuota?.(),
    }),
    {
      superfunction: 'filefn',
      controlledCounterpart: 'QuotaUsagePanel',
      clientContract: 'FileFnClient',
    }
  );
}

'use client';

import { useState, useRef, useCallback } from 'react';
import { MAX_FILE_SIZE } from '@/lib/constants';

interface FileDropzoneProps {
  token: string;
  documentType: string;
  label: string;
  required?: boolean;
  existingFile?: { id: string; originalName: string; fileSize: number };
  onUploaded: (file: { id: string; originalName: string; fileSize: number; documentType: string }) => void;
  multiple?: boolean;
}

export function FileDropzone({
  token,
  documentType,
  label,
  required,
  existingFile,
  onUploaded,
  multiple = false,
}: FileDropzoneProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      setError('File too large (max 20MB)');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('token', token);
      formData.append('documentType', documentType);
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      onUploaded({
        id: data.fileId,
        originalName: data.originalName,
        fileSize: data.fileSize,
        documentType: data.documentType,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [token, documentType, onUploaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) uploadFile(files[0]);
  }, [uploadFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) uploadFile(files[0]);
    e.target.value = '';
  }, [uploadFile]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {required && <span className="text-xs text-red-500">*</span>}
        {multiple && <span className="text-xs text-gray-400">(支持多个 / Multiple)</span>}
      </div>

      {existingFile && (
        <div className="flex items-center gap-2 mb-2 p-2 bg-green-50 border border-green-200 rounded-lg text-sm">
          <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-green-700 truncate">{existingFile.originalName}</span>
          <span className="text-green-500 text-xs">({formatSize(existingFile.fileSize)})</span>
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
        />
        {uploading ? (
          <p className="text-sm text-gray-500">上传中... / Uploading...</p>
        ) : (
          <p className="text-sm text-gray-500">
            {existingFile ? '点击重新上传 / Click to re-upload' : '拖放文件或点击浏览 / Drag & drop or click'}
          </p>
        )}
      </div>

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

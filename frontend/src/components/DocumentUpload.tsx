import React, { useState, useCallback } from 'react';

interface DocumentUploadProps {
  onUpload: (files: FileList) => Promise<void>;
  apiEndpoint: string;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({ onUpload }) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [, setUploadProgress] = useState<Record<string, number>>({});

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setUploading(true);
      try {
        await onUpload(e.dataTransfer.files);
      } catch (error) {
        console.error('Upload failed:', error);
      } finally {
        setUploading(false);
        setUploadProgress({});
      }
    }
  }, [onUpload]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setUploading(true);
      try {
        await onUpload(e.target.files);
      } catch (error) {
        console.error('Upload failed:', error);
      } finally {
        setUploading(false);
        setUploadProgress({});
        e.target.value = '';
      }
    }
  }, [onUpload]);

  const getUploadZoneClasses = () => {
    const baseClasses = "relative border-2 border-dashed rounded-lg p-12 text-center transition-colors";
    if (dragActive) return `${baseClasses} upload-zone-active`;
    if (uploading) return `${baseClasses} upload-zone-uploading`;
    return `${baseClasses} upload-zone-default`;
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <div
        className={getUploadZoneClasses()}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt,.md"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={uploading}
          aria-label="Upload documents"
        />
        
        <div className="space-y-4">
          <div className="text-6xl">
            {uploading ? '⏳' : dragActive ? '📁' : '📤'}
          </div>
          
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              {uploading ? 'Uploading Documents...' : 'Upload Documents'}
            </h3>
            <p className="text-gray-500 mt-2">
              {uploading
                ? 'Please wait while your documents are being processed'
                : dragActive
                ? 'Drop your files here'
                : 'Drag and drop files here, or click to browse'
              }
            </p>
          </div>

          {!uploading && (
            <div className="text-sm text-gray-400">
              Supported formats: PDF, DOC, DOCX, TXT, MD (Max 10MB per file)
            </div>
          )}
        </div>

        {uploading && (
          <div className="mt-6">
            <div className="progress-container-large">
              <div className="progress-bar-upload"></div>
            </div>
            <p className="text-sm text-gray-600 mt-2">Processing documents...</p>
          </div>
        )}
      </div>

      {/* Upload Guidelines */}
      <div className="bg-gray-50 p-6 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-3">📋 Upload Guidelines</h4>
        <ul className="text-sm text-gray-600 space-y-2">
          <li className="flex items-start">
            <span className="text-green-600 mr-2">✓</span>
            Documents will be automatically processed and summarized
          </li>
          <li className="flex items-start">
            <span className="text-green-600 mr-2">✓</span>
            AI clustering will organize similar documents together
          </li>
          <li className="flex items-start">
            <span className="text-green-600 mr-2">✓</span>
            Content will be indexed for intelligent search
          </li>
          <li className="flex items-start">
            <span className="text-blue-600 mr-2">ℹ</span>
            Processing time depends on document size and complexity
          </li>
        </ul>
      </div>

      {/* Recent Uploads */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h4 className="font-medium text-gray-900 mb-3">📊 Upload Tips</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <h5 className="font-medium text-gray-700">Best Practices:</h5>
            <ul className="text-gray-600 space-y-1">
              <li>• Use descriptive filenames</li>
              <li>• Group related documents</li>
              <li>• Upload in PDF format when possible</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h5 className="font-medium text-gray-700">What Happens Next:</h5>
            <ul className="text-gray-600 space-y-1">
              <li>• Text extraction and analysis</li>
              <li>• Automatic summarization</li>
              <li>• Intelligent clustering</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentUpload;

'use client';

import React, { useState, useCallback, useRef } from 'react';
import styles from './FileUpload.module.css';

interface UploadedFile {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

export default function FileUpload() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    const pdfFiles = droppedFiles.filter(file => file.type === 'application/pdf');
    
    console.log('Files dropped:', pdfFiles);
    
    if (pdfFiles.length !== droppedFiles.length) {
      alert('Only PDF files are allowed!');
    }
    
    const newFiles: UploadedFile[] = pdfFiles.map(file => ({
      file,
      status: 'pending',
      progress: 0
    }));
    
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const pdfFiles = selectedFiles.filter(file => file.type === 'application/pdf');
    
    if (pdfFiles.length !== selectedFiles.length) {
      alert('Only PDF files are allowed!');
    }
    
    const newFiles: UploadedFile[] = pdfFiles.map(file => ({
      file,
      status: 'pending',
      progress: 0
    }));
    
    setFiles(prev => [...prev, ...newFiles]);
    
    // Clear the input
    e.target.value = '';
  }, []);

  const handleDropZoneClick = () => {
    fileInputRef.current?.click();
  };

  const handleDropZoneKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const uploadFiles = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    
    if (pendingFiles.length === 0) {
      alert('No files to upload!');
      return;
    }

    // Update status to uploading
    setFiles(prev => prev.map(f => 
      f.status === 'pending' ? { ...f, status: 'uploading', progress: 0 } : f
    ));

    try {
      const formData = new FormData();
      pendingFiles.forEach(({ file }) => {
        formData.append('files', file);
      });

      console.log('Sending request to backend...');
      
      const response = await fetch('/ingest', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      console.log('Backend response:', result);

      if (response.ok && result.success) {
        // Update status to success
        setFiles(prev => prev.map(f => 
          f.status === 'uploading' 
            ? { ...f, status: 'success', progress: 100 }
            : f
        ));
        
        alert(`Successfully uploaded ${result.data.filesProcessed} files and created ${result.data.totalChunks} document chunks!`);
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      
      // Update status to error
      setFiles(prev => prev.map(f => 
        f.status === 'uploading' 
          ? { 
              ...f, 
              status: 'error', 
              progress: 0,
              error: error instanceof Error ? error.message : 'Upload failed'
            }
          : f
      ));
      
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setFiles([]);
  };

  return (
    <div className={styles.uploadContainer}>
      <div className={styles.uploadWrapper}>
        {/* Header */}
        <div className={styles.uploadHeader}>
          <h2 className={styles.uploadTitle}>📄 Upload PDF Documents</h2>
          <p className={styles.uploadSubtitle}>Drag & drop PDF files or click to select</p>
        </div>

        {/* Upload Area - Fixed: Removed nested interactive controls */}
        <div
          className={`${styles.dropZone} ${isDragOver ? styles.dragOver : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleDropZoneClick}
          role="button"
          tabIndex={0}
          onKeyDown={handleDropZoneKeyDown}
          title="Click to select PDF files or drag and drop them here"
        >
          <div className={styles.dropIcon}>📁</div>
          <p className={styles.dropTitle}>Drop PDF files here or click to browse</p>
          <p className={styles.dropSubtitle}>Maximum file size: 10MB per file</p>
        </div>

        {/* Hidden File Input - Moved outside of clickable area */}
        <input
          ref={fileInputRef}
          id="file-input"
          type="file"
          multiple
          accept=".pdf"
          onChange={handleFileSelect}
          className={styles.hiddenInput}
          name="files"
          aria-label="Select PDF files to upload"
        />

        {/* File List */}
        {files.length > 0 && (
          <div className={styles.fileListContainer}>
            <div className={styles.fileListHeader}>
              <h3 className={styles.fileListTitle}>Files to Upload ({files.length})</h3>
              <div className={styles.actionButtons}>
                <button
                  onClick={uploadFiles}
                  disabled={files.some(f => f.status === 'uploading')}
                  className={styles.uploadButton}
                  title={files.some(f => f.status === 'uploading') ? 'Upload in progress...' : 'Upload all selected files'}
                >
                  {files.some(f => f.status === 'uploading') ? 'Uploading...' : 'Upload All'}
                </button>
                <button
                  onClick={clearAll}
                  className={styles.clearButton}
                  title="Remove all files from the list"
                >
                  Clear All
                </button>
              </div>
            </div>
            
            <div className={styles.fileList}>
              {files.map((uploadedFile, index) => (
                <div key={index} className={styles.fileItem}>
                  <div className={styles.fileInfo}>
                    <div className={styles.fileStatus}>
                      <div className={styles.statusIcon}>
                        {uploadedFile.status === 'success' && '✅'}
                        {uploadedFile.status === 'error' && '❌'}
                        {uploadedFile.status === 'uploading' && '⏳'}
                        {uploadedFile.status === 'pending' && '📄'}
                      </div>
                      <div className={styles.fileDetails}>
                        <p className={styles.fileName}>{uploadedFile.file.name}</p>
                        <p className={styles.fileSize}>
                          {(uploadedFile.file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        {uploadedFile.error && (
                          <p className={styles.fileError}>{uploadedFile.error}</p>
                        )}
                      </div>
                    </div>
                    
                    {uploadedFile.status === 'uploading' && (
                      <div className={styles.progressContainer}>
                        <div className={styles.progressBar}>
                          <div 
                            className={styles.progressFill}
                            data-progress={uploadedFile.progress}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <button
                    onClick={() => removeFile(index)}
                    className={styles.removeButton}
                    disabled={uploadedFile.status === 'uploading'}
                    title={`Remove ${uploadedFile.file.name} from upload list`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

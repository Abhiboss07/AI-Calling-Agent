'use client';
import { useState, useRef } from 'react';
import { API_BASE } from '../lib/api';

export default function UploadModal({ isOpen, onClose, type, onUploadComplete }) {
    const [status, setStatus] = useState('idle'); // idle | uploading | error
    const [errorMsg, setErrorMsg] = useState('');
    const [urlInput, setUrlInput] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const fileInputRef = useRef(null);

    if (!isOpen) return null;

    const reset = () => {
        setStatus('idle');
        setErrorMsg('');
        setUrlInput('');
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            setSelectedFile(e.target.files[0]);
            setErrorMsg('');
        }
    };

    const handleUploadPdf = async (e) => {
        e.preventDefault();
        if (!selectedFile) {
            setErrorMsg('Please select a PDF file.');
            return;
        }

        if (selectedFile.type !== 'application/pdf') {
            setErrorMsg('Only PDF files are supported.');
            return;
        }

        setStatus('uploading');
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('category', 'All Documents');

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE}/documents/upload`, {
                method: 'POST',
                headers: {
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    // Do NOT set Content-Type here, browser sets it with boundary for FormData
                },
                body: formData
            });

            const data = await res.json();
            if (data.ok) {
                onUploadComplete(data.data);
                handleClose();
            } else {
                setStatus('error');
                setErrorMsg(data.error || 'Upload failed');
            }
        } catch (err) {
            setStatus('error');
            setErrorMsg(err.message);
        }
    };

    const handleSyncUrl = async (e) => {
        e.preventDefault();
        if (!urlInput.trim()) {
            setErrorMsg('Please enter a valid URL.');
            return;
        }

        try {
            new URL(urlInput);
        } catch (_) {
            setErrorMsg('Please enter a valid absolute URL (e.g., https://example.com).');
            return;
        }

        setStatus('uploading');

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE}/documents/url`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ url: urlInput, category: 'All Documents' })
            });

            const data = await res.json();
            if (data.ok) {
                onUploadComplete(data.data);
                handleClose();
            } else {
                setStatus('error');
                setErrorMsg(data.error || 'Sync failed');
            }
        } catch (err) {
            setStatus('error');
            setErrorMsg(err.message);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-background-light dark:bg-background-dark border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${type === 'url' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'}`}>
                            <span className="material-symbols-outlined">{type === 'url' ? 'link' : 'upload_file'}</span>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                                {type === 'url' ? 'Sync Website URL' : 'Upload PDF'}
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Add knowledge to your AI agent.</p>
                        </div>
                    </div>
                    <button onClick={handleClose} disabled={status === 'uploading'} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800">
                        <span className="material-symbols-outlined block">close</span>
                    </button>
                </div>

                <div className="p-6 bg-slate-50/50 dark:bg-slate-900/50 flex-1">
                    {type === 'pdf' ? (
                        <form onSubmit={handleUploadPdf}>
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select PDF Document</label>
                                <div
                                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${selectedFile ? 'border-primary bg-primary/5' : 'border-slate-300 dark:border-slate-700 hover:border-primary/50 bg-background-light dark:bg-background-dark'}`}
                                >
                                    <input
                                        type="file"
                                        accept="application/pdf"
                                        className="hidden"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        disabled={status === 'uploading'}
                                    />
                                    {selectedFile ? (
                                        <div className="flex flex-col items-center">
                                            <span className="material-symbols-outlined text-4xl text-primary mb-2 block">task</span>
                                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">{selectedFile.name}</p>
                                            <p className="text-xs text-slate-500 mt-1">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.preventDefault(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                                                className="text-xs text-red-500 mt-3 font-medium hover:underline"
                                                disabled={status === 'uploading'}
                                            >
                                                Remove File
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                            <span className="material-symbols-outlined text-4xl text-slate-400 dark:text-slate-500 mb-2 block">upload</span>
                                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Click to browse or drag and drop</p>
                                            <p className="text-xs text-slate-500 mt-1">PDF max size 10MB</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {errorMsg && <p className="text-xs text-red-500 mb-4 bg-red-50 dark:bg-red-900/20 p-2 rounded block">{errorMsg}</p>}

                            <button
                                type="submit"
                                disabled={!selectedFile || status === 'uploading'}
                                className="w-full py-3 px-4 rounded-xl bg-primary text-white font-semibold text-sm transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {status === 'uploading' ? (
                                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Uploading...</>
                                ) : 'Upload Document'}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleSyncUrl}>
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Website URL</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-[18px]">public</span>
                                    <input
                                        type="url"
                                        value={urlInput}
                                        onChange={(e) => { setUrlInput(e.target.value); setErrorMsg(''); }}
                                        placeholder="https://example.com/faq"
                                        className="w-full bg-background-light dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-xl text-sm py-3 pl-10 pr-4 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                                        disabled={status === 'uploading'}
                                    />
                                </div>
                                <p className="text-[10px] text-slate-500 mt-2 ml-1">The AI will scrape the URL and learn its text content.</p>
                            </div>

                            {errorMsg && <p className="text-xs text-red-500 mb-4 bg-red-50 dark:bg-red-900/20 p-2 rounded block">{errorMsg}</p>}

                            <button
                                type="submit"
                                disabled={!urlInput || status === 'uploading'}
                                className="w-full py-3 px-4 rounded-xl bg-primary text-white font-semibold text-sm transition-all hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {status === 'uploading' ? (
                                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Syncing...</>
                                ) : 'Start Sync Process'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}

// Curevo AI — User Data & Privacy Sovereignty Modal (Phase 9P)
//
// 100% Client-Side. Export all career records, restore from backup,
// or purge local data with one click.

import { useState, useRef, type ChangeEvent } from 'react';
import {
  downloadAllCurevoDataJson,
  importAllCurevoData,
  clearAllCurevoData,
} from '../lib/userDataExport';

export interface DataPrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
}

export default function DataPrivacyModal({
  isOpen,
  onClose,
  onDataChanged,
}: DataPrivacyModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  if (!isOpen) return null;

  const handleDownload = () => {
    try {
      downloadAllCurevoDataJson();
      setStatusMessage({ text: 'Backup downloaded successfully!', kind: 'ok' });
    } catch {
      setStatusMessage({ text: 'Failed to download backup.', kind: 'err' });
    }
  };

  const handleFileSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res = importAllCurevoData(content);
      if (res.ok) {
        setStatusMessage({ text: res.message, kind: 'ok' });
        onDataChanged?.();
      } else {
        setStatusMessage({ text: res.message, kind: 'err' });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClear = () => {
    clearAllCurevoData();
    setConfirmClear(false);
    setStatusMessage({ text: 'All local Curevo data has been completely erased.', kind: 'ok' });
    onDataChanged?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛡️</span>
            <h3 className="text-base font-bold text-slate-900">Your Privacy & Data Portability</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer p-1"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed mb-5">
          Curevo AI is 100% public and private. Your resumes, applications, interview answers, and search history reside exclusively in your browser’s localStorage.
        </p>

        {statusMessage && (
          <div
            className={`mb-4 rounded-xl p-3 text-xs border ${
              statusMessage.kind === 'ok'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        <div className="space-y-4">
          {/* Action 1: Export */}
          <div className="rounded-xl border border-slate-200 p-4 bg-slate-50 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900">Export All Data (JSON)</h4>
              <p className="text-2xs text-slate-500">
                Downloads a unified file containing your resume drafts, saved jobs, applications, and interview records.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-lg bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition cursor-pointer whitespace-nowrap"
            >
              Export JSON
            </button>
          </div>

          {/* Action 2: Import */}
          <div className="rounded-xl border border-slate-200 p-4 bg-slate-50 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900">Restore from Backup</h4>
              <p className="text-2xs text-slate-500">
                Restore previously exported Curevo JSON backup files into your current browser.
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelected}
                className="hidden"
                id="restore-file-input"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer whitespace-nowrap"
              >
                Import JSON
              </button>
            </div>
          </div>

          {/* Action 3: Clear */}
          <div className="rounded-xl border border-rose-100 p-4 bg-rose-50/40">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-rose-950">Erase All Local Data</h4>
                <p className="text-2xs text-rose-700">
                  Permanently deletes all stored drafts, jobs, applications, and interview histories.
                </p>
              </div>
              {!confirmClear ? (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="rounded-lg border border-rose-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition cursor-pointer whitespace-nowrap"
                >
                  Clear Data...
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-2xs text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-2xs font-bold text-white hover:bg-rose-700 cursor-pointer"
                  >
                    Confirm Erase
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useRef } from 'react';
import {
  Menu,
  Sparkles,
  ImagePlus,
  Shirt,
  X,
  ArrowRight,
  Download,
  Heart,
  Grid,
  Sparkle,
  User,
  Loader2,
  FileText,
  AlertCircle,
  Image as ImageIcon
} from 'lucide-react';
import { editPhoto, fileToPart } from './lib/api.js';

export default function App() {
  // State management for uploads, prompts, and inference
  const [basePhoto, setBasePhoto] = useState(null);
  const [basePhotoPreview, setBasePhotoPreview] = useState(null);

  const [outfitPhoto, setOutfitPhoto] = useState(null);
  const [outfitPhotoPreview, setOutfitPhotoPreview] = useState(null);

  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resultImage, setResultImage] = useState(null);
  const [resultText, setResultText] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Tab & navigation state
  const [activeTab, setActiveTab] = useState('create');
  const [activeNav, setActiveNav] = useState('create');
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showGalleryModal, setShowGalleryModal] = useState(false);

  // File input refs
  const baseInputRef = useRef(null);
  const outfitInputRef = useRef(null);

  // Handle Base Photo Upload
  const handleBasePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setBasePhoto(file);
      const url = URL.createObjectURL(file);
      setBasePhotoPreview(url);
      // Clear previous error on new input
      setErrorMessage(null);
    }
  };

  // Handle Outfit Reference Photo Upload
  const handleOutfitPhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setOutfitPhoto(file);
      const url = URL.createObjectURL(file);
      setOutfitPhotoPreview(url);
      setErrorMessage(null);
    }
  };

  // Clear Uploads
  const clearBasePhoto = (e) => {
    e.stopPropagation();
    setBasePhoto(null);
    setBasePhotoPreview(null);
    if (baseInputRef.current) baseInputRef.current.value = '';
  };

  const clearOutfitPhoto = (e) => {
    e.stopPropagation();
    setOutfitPhoto(null);
    setOutfitPhotoPreview(null);
    if (outfitInputRef.current) outfitInputRef.current.value = '';
  };

  // Main Generation Pipeline Handler
  const handleGenerate = async () => {
    if (!basePhoto) {
      baseInputRef.current?.click();
      return;
    }

    setIsLoading(true);
    setResultImage(null);
    setResultText(null);
    setErrorMessage(null);

    try {
      // 1. Convert photo inputs to parts
      const photoPart = await fileToPart(basePhoto);
      const garmentPart = outfitPhoto ? await fileToPart(outfitPhoto) : null;

      // 2. Call editPhoto from api.js (proxied to /api/gemini)
      const response = await editPhoto(photoPart, garmentPart, prompt);

      if (!response) {
        setResultText('Generation complete. No visual output was returned.');
      } else if (typeof response === 'string') {
        const isImageUrl =
          response.startsWith('data:image/') ||
          response.startsWith('http://') ||
          response.startsWith('https://') ||
          response.startsWith('blob:');

        if (isImageUrl) {
          setResultImage(response);
        } else {
          // Display returned text response
          setResultText(response);
        }
      } else if (typeof response === 'object') {
        const img = response.image || response.url || response.src || response.dataUrl;
        const txt = response.text || response.message || response.description;

        if (img) {
          setResultImage(img);
        } else if (txt) {
          setResultText(txt);
        } else {
          setResultText(JSON.stringify(response, null, 2));
        }
      }
    } catch (err) {
      console.error('Error during photo edit generation:', err);
      setErrorMessage(err?.message || 'Failed to generate style. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger download of generated output
  const handleDownload = () => {
    if (resultImage) {
      const a = document.createElement('a');
      a.href = resultImage;
      a.download = `dressing-room-look-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (resultText) {
      const blob = new Blob([resultText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dressing-room-style-${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // Mock recent looks list
  const recentLooks = [1, 2, 3, 4, 5, 6];

  return (
    <div id="dressing-room-app" className="app-container">
      {/* Header */}
      <header className="app-header" id="app-header">
        <button
          type="button"
          id="btn-menu"
          className="header-btn"
          onClick={() => setShowMenuModal(true)}
          aria-label="Open navigation menu"
        >
          <Menu size={22} strokeWidth={2.2} />
        </button>

        <div className="header-title-wrap">
          <div className="header-brand">
            <span className="brand-sparkle">✦</span>
            <h1 className="brand-name">Dressing Room</h1>
            <span className="brand-sparkle">✦</span>
          </div>
          <span className="brand-subtitle">AI STYLE STUDIO</span>
        </div>

        <button
          type="button"
          id="btn-quick-sparkle"
          className="header-btn header-btn-gold"
          onClick={() => setPrompt('pink satin mini dress, same pose, softer glam, warm ambient lighting...')}
          aria-label="Surprise prompt template"
        >
          <Sparkles size={22} strokeWidth={2.2} />
        </button>
      </header>

      {/* Main Studio Interaction Card */}
      <section className="studio-card" id="studio-interaction-card">
        {/* Upload Grid */}
        <div className="upload-grid">
          {/* Base Photo Upload Card (Left column) */}
          <div
            id="base-photo-card"
            className={`upload-card upload-card-tall ${basePhotoPreview ? 'has-file' : ''}`}
            onClick={() => baseInputRef.current?.click()}
          >
            <input
              type="file"
              ref={baseInputRef}
              accept="image/png, image/jpeg, image/webp"
              className="hidden-file-input"
              onChange={handleBasePhotoChange}
            />

            {basePhotoPreview ? (
              <div className="preview-image-wrap">
                <img src={basePhotoPreview} alt="Base model preview" className="preview-image" />
                <button
                  type="button"
                  id="btn-remove-base"
                  className="remove-upload-btn"
                  onClick={clearBasePhoto}
                  aria-label="Remove base photo"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="upload-icon-bubble">
                  <ImageIcon size={26} strokeWidth={1.8} />
                  <div className="upload-plus-badge">+</div>
                </div>
                <span className="upload-label">Add base photo</span>
                <span className="upload-format">jpg, png</span>
              </>
            )}
          </div>

          {/* Right Column: Outfit Reference & Prompt */}
          <div className="prompt-column">
            {/* Outfit Reference Card */}
            <div
              id="outfit-photo-card"
              className={`upload-card upload-card-compact ${outfitPhotoPreview ? 'has-file' : ''}`}
              onClick={() => outfitInputRef.current?.click()}
            >
              <input
                type="file"
                ref={outfitInputRef}
                accept="image/png, image/jpeg, image/webp"
                className="hidden-file-input"
                onChange={handleOutfitPhotoChange}
              />

              {outfitPhotoPreview ? (
                <div className="preview-image-wrap">
                  <img src={outfitPhotoPreview} alt="Outfit reference preview" className="preview-image" />
                  <button
                    type="button"
                    id="btn-remove-outfit"
                    className="remove-upload-btn"
                    onClick={clearOutfitPhoto}
                    aria-label="Remove outfit reference"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="upload-icon-bubble" style={{ width: 40, height: 40, marginBottom: 6 }}>
                    <Shirt size={22} strokeWidth={1.8} />
                    <div className="upload-plus-badge">+</div>
                  </div>
                  <span className="upload-label" style={{ fontSize: 12.5 }}>Add outfit reference</span>
                  <span className="upload-format" style={{ fontSize: 11 }}>jpg, png</span>
                </>
              )}
            </div>

            {/* Prompt Description Textarea */}
            <div className="prompt-block">
              <div className="prompt-label-row">
                <span className="prompt-label">Describe your look</span>
                <Sparkles size={14} className="prompt-sparkle" />
              </div>
              <div className="prompt-textarea-wrap">
                <textarea
                  id="prompt-input"
                  className="prompt-textarea"
                  value={prompt}
                  maxLength={500}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="e.g. pink satin mini dress, same pose, softer glam, same room..."
                />
                <span className="prompt-char-count">{prompt.length} / 500</span>
              </div>
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <div className="generate-btn-wrap">
          <button
            type="button"
            id="btn-generate"
            className="generate-btn"
            disabled={isLoading || !basePhoto}
            onClick={handleGenerate}
            style={{
              opacity: isLoading || !basePhoto ? 0.7 : 1,
              cursor: isLoading ? 'wait' : !basePhoto ? 'pointer' : 'pointer',
            }}
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="spinner-icon" />
                <span>Styling look...</span>
              </>
            ) : (
              <>
                <span>Generate</span>
                <Sparkles size={18} />
              </>
            )}
          </button>
        </div>
      </section>

      {/* Result Section Card */}
      <section className="result-card" id="result-comparison-card">
        <div className="result-header">
          <ImagePlus size={18} className="result-icon" />
          <h2 className="result-title">Result</h2>
          <Sparkles size={14} className="result-sparkle" />
        </div>

        {/* Comparison Before / After */}
        <div className="comparison-container">
          {/* Left: Original / Before */}
          <div className={`comparison-box ${basePhotoPreview ? 'filled' : ''}`}>
            {basePhotoPreview ? (
              <img src={basePhotoPreview} alt="Before preview" className="preview-image" />
            ) : (
              <>
                <span className="comparison-box-label">Before</span>
                <ImageIcon size={30} className="comparison-placeholder-icon" />
              </>
            )}
          </div>

          <div className="comparison-arrow-badge">
            <ArrowRight size={18} strokeWidth={2.4} />
          </div>

          {/* Right: Result / After */}
          <div
            className={`comparison-box ${
              isLoading
                ? 'is-loading'
                : errorMessage
                ? 'has-error'
                : resultImage || resultText
                ? 'filled'
                : ''
            }`}
          >
            {isLoading ? (
              <div className="comparison-loading-content">
                <Loader2 size={24} className="spinner-icon" />
                <span className="loading-text">Generating look...</span>
              </div>
            ) : errorMessage ? (
              <div className="result-error-card">
                <AlertCircle size={22} className="result-error-icon" />
                <span className="result-error-title">Generation Error</span>
                <p className="result-error-body">{errorMessage}</p>
              </div>
            ) : resultImage ? (
              <img src={resultImage} alt="After styled look" className="preview-image" />
            ) : resultText ? (
              <div className="result-text-card">
                <FileText size={20} style={{ color: 'var(--accent-pink)', marginBottom: 4 }} />
                <p className="result-text-body">{resultText}</p>
              </div>
            ) : (
              <>
                <span className="comparison-box-label">After</span>
                <ImageIcon size={30} className="comparison-placeholder-icon" />
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="result-actions-grid">
          <button
            type="button"
            id="btn-download"
            className="result-action-btn"
            onClick={handleDownload}
            disabled={!resultImage && !resultText}
            style={{ opacity: resultImage || resultText ? 1 : 0.45 }}
          >
            <span>Download</span>
            <Download size={14} />
          </button>
          <button
            type="button"
            id="btn-save-gallery"
            className="result-action-btn"
            onClick={() => setShowGalleryModal(true)}
          >
            <span>Save to Gallery</span>
            <Heart size={14} />
          </button>
        </div>
      </section>

      {/* Segmented Control Bar */}
      <div className="tab-toggle-bar" id="mode-tab-toggle">
        <button
          type="button"
          id="tab-create"
          className={`tab-toggle-item ${activeTab === 'create' ? 'active' : ''}`}
          onClick={() => setActiveTab('create')}
        >
          <Sparkles size={15} />
          <span>Create</span>
        </button>
        <button
          type="button"
          id="tab-gallery"
          className={`tab-toggle-item ${activeTab === 'gallery' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('gallery');
            setShowGalleryModal(true);
          }}
        >
          <Grid size={15} />
          <span>Gallery</span>
        </button>
      </div>

      {/* Recent Looks Section */}
      <section className="recent-looks-section" id="recent-looks-section">
        <div className="recent-looks-header">
          <div className="recent-looks-title-wrap">
            <h3 className="recent-looks-title">Recent Looks</h3>
            <span className="recent-looks-badge">12</span>
          </div>
          <button
            type="button"
            id="btn-view-all-looks"
            className="recent-looks-view-all"
            onClick={() => setShowGalleryModal(true)}
          >
            <span>View all</span>
            <span>&gt;</span>
          </button>
        </div>

        <div className="recent-looks-scroll">
          {recentLooks.map((item) => (
            <div key={item} className="recent-look-thumb">
              <ImageIcon size={22} />
            </div>
          ))}
        </div>
      </section>

      {/* Bottom Floating Navigation Bar */}
      <nav className="bottom-nav-bar" id="main-bottom-navigation">
        <button
          type="button"
          id="nav-create"
          className={`nav-item ${activeNav === 'create' ? 'active' : ''}`}
          onClick={() => setActiveNav('create')}
        >
          <Sparkles size={20} />
          <span className="nav-label">Create</span>
        </button>

        <button
          type="button"
          id="nav-favorites"
          className={`nav-item ${activeNav === 'favorites' ? 'active' : ''}`}
          onClick={() => setActiveNav('favorites')}
        >
          <Heart size={20} />
          <span className="nav-label">Favorites</span>
        </button>

        <button
          type="button"
          id="nav-looks"
          className={`nav-item ${activeNav === 'looks' ? 'active' : ''}`}
          onClick={() => setActiveNav('looks')}
        >
          <Sparkle size={20} />
          <span className="nav-label">Looks</span>
        </button>

        <button
          type="button"
          id="nav-outfits"
          className={`nav-item ${activeNav === 'outfits' ? 'active' : ''}`}
          onClick={() => setActiveNav('outfits')}
        >
          <Shirt size={20} />
          <span className="nav-label">Outfits</span>
        </button>

        <button
          type="button"
          id="nav-profile"
          className={`nav-item ${activeNav === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveNav('profile')}
        >
          <User size={20} />
          <span className="nav-label">Profile</span>
        </button>
      </nav>

      {/* Menu / Studio Settings Sheet Modal */}
      {showMenuModal && (
        <div className="modal-overlay" onClick={() => setShowMenuModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-sheet-header">
              <h4 className="modal-sheet-title">Dressing Room Settings</h4>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowMenuModal(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Studio mode ready. You can supply your pipeline models and custom image processing stubs directly.
            </p>
          </div>
        </div>
      )}

      {/* Gallery Sheet Modal */}
      {showGalleryModal && (
        <div className="modal-overlay" onClick={() => setShowGalleryModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-sheet-header">
              <h4 className="modal-sheet-title">Saved Looks Gallery</h4>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowGalleryModal(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Your generated looks will be organized here once created.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

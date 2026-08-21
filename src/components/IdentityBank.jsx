import React, { useState, useRef } from 'react';
import {
  UserCheck,
  Sparkles,
  ImagePlus,
  Trash2,
  Heart,
  Check,
  Plus,
  X,
  ShieldCheck,
  Tag,
  Info,
  Edit2
} from 'lucide-react';
import { DEFAULT_IDENTITY_TAGS, saveIdentityReference } from '../lib/identity.js';

export default function IdentityBank({
  identityReferences = [],
  selectedIdentityIds = [],
  identityContract,
  onSaveReference,
  onDeleteReference,
  onToggleSelect,
  onToggleFavorite,
  onGoToCreate,
}) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showContractDetails, setShowContractDetails] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'favorites'

  // Upload Form State
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [label, setLabel] = useState('');
  const [selectedTags, setSelectedTags] = useState(['face', 'bright lighting']);
  const [notes, setNotes] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setUploadPreview(reader.result);
        if (!label) {
          const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
          setLabel(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleTag = (tag) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadPreview) return;

    setIsSubmitting(true);
    try {
      const newItem = {
        dataUrl: uploadPreview,
        imageUrl: uploadPreview,
        fileName: uploadFile?.name || 'identity-reference.jpg',
        label: label.trim() || 'My Identity Photo',
        tags: selectedTags.length > 0 ? selectedTags : ['face'],
        notes: notes.trim(),
        favorite: isFavorite,
      };

      const saved = await saveIdentityReference(newItem);
      onSaveReference?.(saved);

      // Reset modal form
      setUploadFile(null);
      setUploadPreview(null);
      setLabel('');
      setSelectedTags(['face', 'bright lighting']);
      setNotes('');
      setIsFavorite(false);
      setShowUploadModal(false);
    } catch (err) {
      console.error('Failed to save identity reference:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSelected = (id) => selectedIdentityIds.includes(id);

  const filteredReferences = identityReferences.filter((item) => {
    if (activeFilter === 'favorites') return item.favorite;
    return true;
  });

  return (
    <div className="identity-section-card" id="identity-references-screen">
      {/* Top Header */}
      <div className="identity-header-wrap">
        <div className="identity-title-row">
          <div className="identity-icon-badge">
            <UserCheck size={20} />
          </div>
          <div>
            <h2 className="identity-title">Identity References</h2>
            <p className="identity-subtitle">
              Save your best identity photos for more consistent virtual dressing room edits.
            </p>
          </div>
        </div>

        {/* Action button */}
        <button
          type="button"
          id="btn-upload-identity-trigger"
          className="identity-primary-add-btn"
          onClick={() => setShowUploadModal(true)}
        >
          <Plus size={16} />
          <span>Add Photo</span>
        </button>
      </div>

      {/* Identity Contract Bar / Banner */}
      <div className="identity-contract-banner">
        <div className="identity-contract-header" onClick={() => setShowContractDetails(!showContractDetails)}>
          <div className="identity-contract-title-wrap">
            <ShieldCheck size={16} className="identity-shield-icon" />
            <span className="identity-contract-title">Identity Fidelity Contract</span>
            <span className="identity-contract-status-pill">Active</span>
          </div>
          <button type="button" className="identity-contract-toggle-btn">
            {showContractDetails ? 'Hide details' : 'View rules'}
          </button>
        </div>

        {showContractDetails && (
          <div className="identity-contract-details-grid">
            <div className="contract-rule-chip active">
              <Check size={12} />
              <span>Face Shape Preserved</span>
            </div>
            <div className="contract-rule-chip active">
              <Check size={12} />
              <span>Eye Shape & Distance</span>
            </div>
            <div className="contract-rule-chip active">
              <Check size={12} />
              <span>Nose & Lips Contour</span>
            </div>
            <div className="contract-rule-chip active">
              <Check size={12} />
              <span>Complexion & Skin Tone</span>
            </div>
            <div className="contract-rule-chip active">
              <Check size={12} />
              <span>Natural Body Proportions</span>
            </div>
            <div className="contract-rule-chip active">
              <Check size={12} />
              <span>Hairline & Unique Features</span>
            </div>
          </div>
        )}
      </div>

      {/* Active Selection Summary Bar & Filters */}
      <div className="identity-selection-bar">
        <div className="identity-selection-stats">
          <span className="identity-selection-count">
            {selectedIdentityIds.length} / 4 Selected for Create
          </span>
          <span className="identity-selection-hint">
            {selectedIdentityIds.length === 0
              ? 'Tap cards below to choose references for generation'
              : 'Selected references will guide facial & body consistency'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {identityReferences.length > 0 && (
            <div className="identity-filter-pills">
              <button
                type="button"
                className={`identity-filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setActiveFilter('all')}
              >
                All ({identityReferences.length})
              </button>
              <button
                type="button"
                className={`identity-filter-btn ${activeFilter === 'favorites' ? 'active' : ''}`}
                onClick={() => setActiveFilter('favorites')}
              >
                <Heart size={12} fill={activeFilter === 'favorites' ? 'currentColor' : 'none'} />
                <span>Favorites</span>
              </button>
            </div>
          )}

          {selectedIdentityIds.length > 0 && (
            <button
              type="button"
              className="identity-use-create-btn"
              onClick={onGoToCreate}
            >
              <span>Use in Create</span>
              <Sparkles size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Identity References Grid */}
      {filteredReferences.length === 0 ? (
        <div className="identity-empty-state">
          <div className="identity-empty-icon">
            <ImagePlus size={28} />
          </div>
          <h3 className="identity-empty-title">
            {activeFilter === 'favorites' ? 'No Favorite References Yet' : 'No Identity Photos Saved Yet'}
          </h3>
          <p className="identity-empty-desc">
            {activeFilter === 'favorites'
              ? 'Tap the heart icon on any identity photo card to mark it as a favorite for quick styling selection.'
              : 'Upload 2 to 4 clear photos of yourself (face close-up, mirror selfie, full body, different lighting) to anchor your look across all virtual dressing room styles.'}
          </p>
          <button
            type="button"
            className="identity-upload-empty-btn"
            onClick={() => {
              setActiveFilter('all');
              setShowUploadModal(true);
            }}
          >
            <Plus size={16} />
            <span>Upload Reference Photo</span>
          </button>
        </div>
      ) : (
        <div className="identity-grid">
          {filteredReferences.map((item) => {
            const selected = isSelected(item.id);
            return (
              <div
                key={item.id}
                id={`identity-card-${item.id}`}
                className={`identity-card ${selected ? 'is-selected' : ''}`}
                onClick={() => onToggleSelect?.(item.id)}
              >
                {/* Image Wrapper */}
                <div className="identity-card-thumb-wrap">
                  <img
                    src={item.imageUrl || item.dataUrl}
                    alt={item.label}
                    className="identity-card-thumb"
                  />
                  
                  {/* Selection Checkmark Badge */}
                  <div className={`identity-select-badge ${selected ? 'selected' : ''}`}>
                    {selected ? <Check size={13} strokeWidth={3} /> : <Plus size={12} />}
                  </div>

                  {/* Favorite Heart Button */}
                  <button
                    type="button"
                    className={`identity-card-fav-btn ${item.favorite ? 'favorited' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite?.(item.id);
                    }}
                    aria-label={item.favorite ? 'Unmark favorite' : 'Mark as favorite'}
                  >
                    <Heart size={13} fill={item.favorite ? '#ff4081' : 'none'} />
                  </button>

                  {/* Delete Button */}
                  <button
                    type="button"
                    className="identity-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteReference?.(item.id);
                    }}
                    aria-label={`Delete ${item.label}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Metadata */}
                <div className="identity-card-info">
                  <div className="identity-card-header-row">
                    <span className="identity-card-label" title={item.label}>
                      {item.label || 'Identity Reference'}
                    </span>
                  </div>

                  {/* Tags */}
                  {item.tags && item.tags.length > 0 && (
                    <div className="identity-card-tags">
                      {item.tags.slice(0, 2).map((t) => (
                        <span key={t} className="identity-tag-chip">
                          #{t}
                        </span>
                      ))}
                      {item.tags.length > 2 && (
                        <span className="identity-tag-chip count">
                          +{item.tags.length - 2}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Notes snippet if present */}
                  {item.notes && (
                    <p className="identity-card-notes" title={item.notes}>
                      {item.notes}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Reference Modal Sheet */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="modal-sheet identity-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-sheet-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserCheck size={18} style={{ color: 'var(--accent-pink-dark)' }} />
                <h4 className="modal-sheet-title">Add Identity Reference</h4>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowUploadModal(false)}
                aria-label="Close upload dialog"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="identity-upload-form">
              {/* Photo Upload Zone */}
              <div
                className={`identity-drop-zone ${uploadPreview ? 'has-preview' : ''}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png, image/jpeg, image/webp"
                  className="hidden-file-input"
                  onChange={handleFileSelect}
                />

                {uploadPreview ? (
                  <div className="identity-preview-wrap">
                    <img src={uploadPreview} alt="Selected preview" className="identity-modal-preview-img" />
                    <button
                      type="button"
                      className="remove-upload-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadPreview(null);
                        setUploadFile(null);
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="identity-drop-content">
                    <div className="identity-drop-icon">
                      <ImagePlus size={24} />
                    </div>
                    <span className="identity-drop-title">Select a clear identity photo</span>
                    <span className="identity-drop-hint">Face close-up, mirror selfie, or full body</span>
                  </div>
                )}
              </div>

              {/* Label Field */}
              <div className="identity-form-group">
                <label className="identity-form-label">Photo Label / Title</label>
                <input
                  type="text"
                  className="identity-form-input"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Main Headshot, Mirror Selfie, Golden Hour..."
                  maxLength={40}
                />
              </div>

              {/* Tag Presets Selector */}
              <div className="identity-form-group">
                <div className="identity-form-label-row">
                  <label className="identity-form-label">Tags (Select all that apply)</label>
                  <Tag size={13} style={{ color: 'var(--text-muted)' }} />
                </div>
                <div className="identity-tag-selector-grid">
                  {DEFAULT_IDENTITY_TAGS.map((tag) => {
                    const active = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`identity-tag-toggle-pill ${active ? 'active' : ''}`}
                        onClick={() => toggleTag(tag)}
                      >
                        {active && <Check size={11} strokeWidth={2.5} />}
                        <span>{tag}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional Notes */}
              <div className="identity-form-group">
                <label className="identity-form-label">Optional Notes</label>
                <input
                  type="text"
                  className="identity-form-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Natural lighting, best capture of smile & eye color"
                  maxLength={100}
                />
              </div>

              {/* Mark as Favorite */}
              <div className="identity-form-fav-row" onClick={() => setIsFavorite(!isFavorite)}>
                <button
                  type="button"
                  className={`identity-fav-checkbox ${isFavorite ? 'active' : ''}`}
                  aria-label="Toggle favorite"
                >
                  <Heart size={14} fill={isFavorite ? '#ff4081' : 'none'} color={isFavorite ? '#ff4081' : 'var(--text-muted)'} />
                </button>
                <span className="identity-fav-label">Mark as favorite reference</span>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="identity-form-submit-btn"
                disabled={!uploadPreview || isSubmitting}
              >
                <Sparkles size={16} />
                <span>Save to Identity Bank</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

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
  Edit2,
  Smile,
  Search,
  Clock,
  ArrowRight,
  Frown,
  AlertTriangle
} from 'lucide-react';
import { DEFAULT_IDENTITY_TAGS, IDENTITY_QUALITY_LABELS, detectPhotoQualityLabels, saveIdentityReference } from '../lib/identity.js';
import {
  getAllReferenceSuccessStats,
  getAllReferenceFailureStats,
  FINE_GRAINED_SEGMENTS,
  FAILURE_REASONS
} from '../lib/memory.js';

export default function IdentityBank({
  identityReferences = [],
  selectedIdentityIds = [],
  identityContract,
  successfulEdits = [],
  failedEdits = [],
  onSaveReference,
  onDeleteReference,
  onToggleSelect,
  onToggleFavorite,
  onDeleteMemory,
  onDeleteFailedMemory,
  onApplyMemoryRecipe,
  onGoToCreate,
}) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showContractDetails, setShowContractDetails] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'favorites' | 'memory'
  const [qualityFilter, setQualityFilter] = useState('all'); // 'all' | 'face' | 'body' | 'angle' | 'lighting'
  const [memorySubTab, setMemorySubTab] = useState('success'); // 'success' | 'failures'
  const [recipeSearch, setRecipeSearch] = useState('');

  // Upload Form State
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [label, setLabel] = useState('');
  const [selectedTags, setSelectedTags] = useState(['face', 'bright lighting']);
  const [selectedQualityLabels, setSelectedQualityLabels] = useState(['face', 'overall identity']);
  const [notes, setNotes] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingQualityRefId, setEditingQualityRefId] = useState(null);

  const refStats = getAllReferenceSuccessStats();
  const refFailureStats = getAllReferenceFailureStats();

  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        setUploadPreview(dataUrl);

        // Auto-detect image dimensions for smart quality signals
        const img = new Image();
        img.onload = () => {
          const detected = detectPhotoQualityLabels({
            width: img.width,
            height: img.height,
            tags: selectedTags,
            fileName: file.name,
          });
          setSelectedQualityLabels(detected);
        };
        img.src = dataUrl;

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

  const toggleQualityLabel = (qualityId) => {
    if (selectedQualityLabels.includes(qualityId)) {
      setSelectedQualityLabels(selectedQualityLabels.filter((q) => q !== qualityId));
    } else {
      setSelectedQualityLabels([...selectedQualityLabels, qualityId]);
    }
  };

  const handleToggleCardQuality = async (e, item, qualityId) => {
    e.stopPropagation();
    const current = Array.isArray(item.qualityLabels) ? item.qualityLabels : [];
    const updated = current.includes(qualityId)
      ? current.filter((q) => q !== qualityId)
      : [...current, qualityId];
    
    const updatedItem = {
      ...item,
      qualityLabels: updated,
    };
    const saved = await saveIdentityReference(updatedItem);
    onSaveReference?.(saved);
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
        qualityLabels: selectedQualityLabels.length > 0 ? selectedQualityLabels : ['face'],
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
      setSelectedQualityLabels(['face', 'overall identity']);
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
    if (activeFilter === 'favorites' && !item.favorite) return false;
    if (qualityFilter !== 'all') {
      const qLabels = Array.isArray(item.qualityLabels) ? item.qualityLabels : [];
      if (!qLabels.includes(qualityFilter)) return false;
    }
    return true;
  });

  // Filter recipes for memory tab
  const filteredRecipes = successfulEdits.filter((recipe) => {
    if (!recipeSearch) return true;
    const q = recipeSearch.toLowerCase();
    const promptMatch = recipe.prompt && recipe.prompt.toLowerCase().includes(q);
    const kwMatch = recipe.keywords && recipe.keywords.some((k) => k.toLowerCase().includes(q));
    return promptMatch || kwMatch;
  });

  // Calculate segment breakdown across memory
  const segmentStats = {
    face: 0,
    hair: 0,
    body: 0,
    complexion: 0,
  };
  successfulEdits.forEach((recipe) => {
    (recipe.approvedSegments || []).forEach((seg) => {
      if (segmentStats[seg] !== undefined) {
        segmentStats[seg] += 1;
      }
    });
  });

  // Calculate failure reasons breakdown across negative feedback memory
  const failureStats = {};
  FAILURE_REASONS.forEach((r) => { failureStats[r.id] = 0; });
  failedEdits.forEach((fail) => {
    (fail.failureReasons || []).forEach((rId) => {
      if (failureStats[rId] !== undefined) {
        failureStats[rId] += 1;
      }
    });
  });

  // Filter failures for memory tab
  const filteredFailures = failedEdits.filter((fail) => {
    if (!recipeSearch) return true;
    const q = recipeSearch.toLowerCase();
    const promptMatch = fail.prompt && fail.prompt.toLowerCase().includes(q);
    const noteMatch = fail.userNote && fail.userNote.toLowerCase().includes(q);
    const reasonMatch = fail.failureReasons && fail.failureReasons.some((r) => r.toLowerCase().includes(q));
    return promptMatch || noteMatch || reasonMatch;
  });

  const refMap = new Map(identityReferences.map((r) => [r.id, r]));

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    try {
      const date = new Date(ts);
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="identity-section-card" id="identity-references-screen">
      {/* Top Header */}
      <div className="identity-header-wrap">
        <div className="identity-title-row">
          <div className="identity-icon-badge">
            <UserCheck size={20} />
          </div>
          <div>
            <h2 className="identity-title">Identity References & Memory</h2>
            <p className="identity-subtitle">
              Save your best identity photos and review recipes learned from your approved results.
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
          {activeFilter === 'memory' ? (
            <>
              <span className="identity-selection-count">
                {successfulEdits.length} Approved Style Recipes in Memory
              </span>
              <span className="identity-selection-hint">
                Learned combinations from edits marked with "Looks like me"
              </span>
            </>
          ) : (
            <>
              <span className="identity-selection-count">
                {selectedIdentityIds.length} / 4 Selected for Create
              </span>
              <span className="identity-selection-hint">
                {selectedIdentityIds.length === 0
                  ? 'Tap cards below to choose references for generation'
                  : 'Selected references will guide facial & body consistency'}
              </span>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
            <button
              type="button"
              className={`identity-filter-btn memory-filter-btn ${activeFilter === 'memory' ? 'active' : ''}`}
              onClick={() => setActiveFilter('memory')}
              title="View approved combinations and learned feedback"
            >
              <Smile size={12} />
              <span>Memory ({successfulEdits.length} / {failedEdits.length})</span>
            </button>
          </div>

          {activeFilter !== 'memory' && selectedIdentityIds.length > 0 && (
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

      {/* MEMORY BANK TAB VIEW */}
      {activeFilter === 'memory' ? (
        <div className="memory-inspection-container" id="memory-inspection-panel">
          {/* Sub-tab switcher: Approved vs Failures */}
          <div className="memory-subtab-header">
            <button
              type="button"
              className={`memory-subtab-btn ${memorySubTab === 'success' ? 'active' : ''}`}
              onClick={() => setMemorySubTab('success')}
            >
              <Smile size={13} />
              <span>Approved Recipes ({successfulEdits.length})</span>
            </button>
            <button
              type="button"
              className={`memory-subtab-btn failure-subtab ${memorySubTab === 'failures' ? 'active' : ''}`}
              onClick={() => setMemorySubTab('failures')}
            >
              <Frown size={13} />
              <span>Avoided Issues & Feedback ({failedEdits.length})</span>
            </button>
          </div>

          {memorySubTab === 'success' ? (
            <>
              {/* Overview Stats Bar */}
              <div className="memory-overview-bar">
                <div className="memory-overview-item">
                  <span className="memory-overview-label">Total Approved</span>
                  <span className="memory-overview-val">{successfulEdits.length}</span>
                </div>
                <div className="memory-overview-divider" />
                <div className="memory-overview-item">
                  <span className="memory-overview-label">Face Features</span>
                  <span className="memory-overview-val">{segmentStats.face}</span>
                </div>
                <div className="memory-overview-divider" />
                <div className="memory-overview-item">
                  <span className="memory-overview-label">Hair & Hairstyle</span>
                  <span className="memory-overview-val">{segmentStats.hair}</span>
                </div>
                <div className="memory-overview-divider" />
                <div className="memory-overview-item">
                  <span className="memory-overview-label">Body Silhouette</span>
                  <span className="memory-overview-val">{segmentStats.body}</span>
                </div>
                <div className="memory-overview-divider" />
                <div className="memory-overview-item">
                  <span className="memory-overview-label">Skin & Complexion</span>
                  <span className="memory-overview-val">{segmentStats.complexion}</span>
                </div>
              </div>

              {/* Search bar for recipes */}
              {successfulEdits.length > 2 && (
                <div className="memory-search-row">
                  <Search size={14} style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="memory-search-input"
                    placeholder="Search approved recipes by prompt or keyword..."
                    value={recipeSearch}
                    onChange={(e) => setRecipeSearch(e.target.value)}
                  />
                  {recipeSearch && (
                    <button
                      type="button"
                      className="memory-search-clear"
                      onClick={() => setRecipeSearch('')}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}

              {/* Recipes List */}
              {filteredRecipes.length === 0 ? (
                <div className="identity-empty-state" style={{ padding: '36px 20px' }}>
                  <div className="identity-empty-icon">
                    <Smile size={28} style={{ color: 'var(--accent-pink-dark)' }} />
                  </div>
                  <h3 className="identity-empty-title">
                    {recipeSearch ? 'No Matching Recipes Found' : 'No Approved Edits in Memory Yet'}
                  </h3>
                  <p className="identity-empty-desc">
                    {recipeSearch
                      ? 'Try a different keyword or clear your search query.'
                      : 'When you generate a look in Create and click "Looks like me", the system captures the reference combination and segment settings here so you can inspect and reuse what works.'}
                  </p>
                  {!recipeSearch && (
                    <button
                      type="button"
                      className="identity-upload-empty-btn"
                      onClick={onGoToCreate}
                    >
                      <Sparkles size={16} />
                      <span>Go to Create Studio</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="memory-recipes-grid">
                  {filteredRecipes.map((recipe) => {
                    const recipeRefIds = Array.isArray(recipe.identityRefIds) ? recipe.identityRefIds : [];
                    const weights = recipe.segmentWeights || {};
                    const approvedSegs = Array.isArray(recipe.approvedSegments) ? recipe.approvedSegments : [];

                    return (
                      <div key={recipe.id || recipe.generationId} className="memory-recipe-card">
                        {/* Header */}
                        <div className="memory-recipe-header">
                          <div className="memory-recipe-title-wrap">
                            <span className="memory-recipe-prompt">
                              {recipe.prompt ? `"${recipe.prompt}"` : 'Outfit styling edit'}
                            </span>
                            {recipe.timestamp && (
                              <span className="memory-recipe-date">
                                <Clock size={10} />
                                <span>{formatTimestamp(recipe.timestamp)}</span>
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="memory-recipe-delete-btn"
                            onClick={() => onDeleteMemory?.(recipe.id || recipe.generationId)}
                            title="Remove this recipe from memory"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Active References Thumbnails & Roles */}
                        <div className="memory-recipe-refs-row">
                          <span className="memory-recipe-sub-label">References:</span>
                          <div className="memory-recipe-thumbs">
                            {recipeRefIds.map((refId) => {
                              const refObj = refMap.get(refId);
                              const role = weights[refId] || 'auto';
                              return (
                                <div key={refId} className="memory-ref-thumb-box" title={refObj?.label || 'Identity Reference'}>
                                  {refObj ? (
                                    <img
                                      src={refObj.imageUrl || refObj.dataUrl}
                                      alt={refObj.label || 'Ref'}
                                      className="memory-ref-thumb-img"
                                    />
                                  ) : (
                                    <div className="memory-ref-thumb-fallback">
                                      <UserCheck size={12} />
                                    </div>
                                  )}
                                  <span className="memory-ref-role-tag">{role}</span>
                                </div>
                              );
                            })}
                            {recipeRefIds.length === 0 && (
                              <span className="memory-no-refs-tag">Base photo only</span>
                            )}
                          </div>
                        </div>

                        {/* Endorsed Segments Chips */}
                        {approvedSegs.length > 0 && (
                          <div className="memory-recipe-segments-row">
                            <span className="memory-recipe-sub-label">Endorsed:</span>
                            <div className="memory-recipe-seg-pills">
                              {approvedSegs.map((segId) => {
                                const segDef = FINE_GRAINED_SEGMENTS.find((s) => s.id === segId);
                                return (
                                  <span key={segId} className="memory-seg-pill">
                                    <Check size={10} strokeWidth={2.6} />
                                    <span>{segDef ? segDef.label : segId}</span>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Footer Actions */}
                        <div className="memory-recipe-footer">
                          <button
                            type="button"
                            className="memory-apply-btn"
                            onClick={() => onApplyMemoryRecipe?.(recipe)}
                          >
                            <span>Apply this Recipe</span>
                            <ArrowRight size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* NEGATIVE FEEDBACK / FAILURES SUB-TAB */
            <>
              {/* Overview Stats Bar for Failures */}
              <div className="memory-overview-bar failure-bar">
                <div className="memory-overview-item">
                  <span className="memory-overview-label">Reported Issues</span>
                  <span className="memory-overview-val" style={{ color: '#d32f2f' }}>{failedEdits.length}</span>
                </div>
                <div className="memory-overview-divider" />
                <div className="memory-overview-item">
                  <span className="memory-overview-label">Face Changed</span>
                  <span className="memory-overview-val">{failureStats.face_changed || 0}</span>
                </div>
                <div className="memory-overview-divider" />
                <div className="memory-overview-item">
                  <span className="memory-overview-label">Body Altered</span>
                  <span className="memory-overview-val">{failureStats.body_proportions_changed || 0}</span>
                </div>
                <div className="memory-overview-divider" />
                <div className="memory-overview-item">
                  <span className="memory-overview-label">Hair Altered</span>
                  <span className="memory-overview-val">{failureStats.hair_changed || 0}</span>
                </div>
                <div className="memory-overview-divider" />
                <div className="memory-overview-item">
                  <span className="memory-overview-label">Background Drift</span>
                  <span className="memory-overview-val">{failureStats.background_changed || 0}</span>
                </div>
              </div>

              {/* Failures List */}
              {filteredFailures.length === 0 ? (
                <div className="identity-empty-state" style={{ padding: '36px 20px' }}>
                  <div className="identity-empty-icon" style={{ background: 'rgba(255, 235, 238, 0.8)' }}>
                    <ShieldCheck size={28} style={{ color: '#c62828' }} />
                  </div>
                  <h3 className="identity-empty-title">
                    {recipeSearch ? 'No Matching Feedback Found' : 'No Negative Feedback Recorded'}
                  </h3>
                  <p className="identity-empty-desc">
                    {recipeSearch
                      ? 'Try a different search keyword.'
                      : 'When a generated look drifts or doesn’t preserve your identity, click "Doesn’t look like me" in Create. The app will log the issue to avoid repeating it in future reference selection and prompt planning.'}
                  </p>
                </div>
              ) : (
                <div className="memory-recipes-grid">
                  {filteredFailures.map((fail) => {
                    const failRefIds = Array.isArray(fail.identityRefIds) ? fail.identityRefIds : [];
                    const reasons = Array.isArray(fail.failureReasons) ? fail.failureReasons : [];

                    return (
                      <div key={fail.id || fail.generationId} className="memory-recipe-card failure-recipe-card">
                        {/* Header */}
                        <div className="memory-recipe-header">
                          <div className="memory-recipe-title-wrap">
                            <span className="memory-recipe-prompt">
                              {fail.prompt ? `"${fail.prompt}"` : 'Outfit styling edit'}
                            </span>
                            {fail.timestamp && (
                              <span className="memory-recipe-date">
                                <Clock size={10} />
                                <span>{formatTimestamp(fail.timestamp)}</span>
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="memory-recipe-delete-btn"
                            onClick={() => onDeleteFailedMemory?.(fail.id || fail.generationId)}
                            title="Remove this negative feedback report from memory"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Reported Reasons Chips */}
                        {reasons.length > 0 && (
                          <div className="memory-recipe-segments-row">
                            <span className="memory-recipe-sub-label">Issues:</span>
                            <div className="memory-recipe-seg-pills">
                              {reasons.map((rId) => {
                                const rDef = FAILURE_REASONS.find((f) => f.id === rId);
                                return (
                                  <span key={rId} className="memory-fail-pill">
                                    <AlertTriangle size={10} strokeWidth={2.4} />
                                    <span>{rDef ? rDef.label : rId}</span>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* User custom note if present */}
                        {fail.userNote && (
                          <p className="memory-failure-user-note">
                            <strong>Note:</strong> {fail.userNote}
                          </p>
                        )}

                        {/* References that were active */}
                        {failRefIds.length > 0 && (
                          <div className="memory-recipe-refs-row" style={{ marginTop: 8 }}>
                            <span className="memory-recipe-sub-label">Active Refs:</span>
                            <div className="memory-recipe-thumbs">
                              {failRefIds.map((refId) => {
                                const refObj = refMap.get(refId);
                                return (
                                  <div key={refId} className="memory-ref-thumb-box" title={refObj?.label || 'Reference'}>
                                    {refObj ? (
                                      <img
                                        src={refObj.imageUrl || refObj.dataUrl}
                                        alt={refObj.label || 'Ref'}
                                        className="memory-ref-thumb-img"
                                      />
                                    ) : (
                                      <div className="memory-ref-thumb-fallback">
                                        <UserCheck size={12} />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* STANDARD IDENTITY REFERENCES GRID */
        <>
          {/* Quality Signal Filter Strip */}
          {identityReferences.length > 0 && (
            <div className="identity-quality-filter-bar">
              <span className="identity-quality-filter-label">Filter Evidence:</span>
              <div className="identity-quality-filter-pills">
                <button
                  type="button"
                  className={`identity-qfilter-btn ${qualityFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setQualityFilter('all')}
                >
                  All Signals
                </button>
                {IDENTITY_QUALITY_LABELS.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    className={`identity-qfilter-btn ${qualityFilter === q.id ? 'active' : ''}`}
                    onClick={() => setQualityFilter(qualityFilter === q.id ? 'all' : q.id)}
                    title={q.description}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          )}

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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {refStats[item.id]?.approvedCount > 0 && (
                            <span
                              className="identity-approved-pill"
                              title={`User approved in ${refStats[item.id].approvedCount} edit(s)`}
                            >
                              <Smile size={10} />
                              <span>{refStats[item.id].approvedCount}</span>
                            </span>
                          )}
                          {refFailureStats[item.id]?.failureCount > 0 && (
                            <span
                              className="identity-failure-pill"
                              title={`Reported issue in ${refFailureStats[item.id].failureCount} edit(s)`}
                            >
                              <Frown size={10} />
                              <span>{refFailureStats[item.id].failureCount}</span>
                            </span>
                          )}
                        </div>
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

                      {/* Quality / Evidence Signals */}
                      <div className="identity-card-qualities">
                        {IDENTITY_QUALITY_LABELS.map((q) => {
                          const itemQualities = Array.isArray(item.qualityLabels) ? item.qualityLabels : [];
                          const hasQuality = itemQualities.includes(q.id);
                          return (
                            <button
                              key={q.id}
                              type="button"
                              className={`identity-quality-chip ${hasQuality ? 'active' : 'inactive'}`}
                              onClick={(e) => handleToggleCardQuality(e, item, q.id)}
                              title={`${q.label}: ${q.description} (Tap to toggle)`}
                            >
                              {hasQuality && <Check size={8} strokeWidth={3} />}
                              <span>{q.label}</span>
                            </button>
                          );
                        })}
                      </div>

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
        </>
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

              {/* Quality & Evidence Signals Selector */}
              <div className="identity-form-group">
                <div className="identity-form-label-row">
                  <label className="identity-form-label">Evidence & Quality Signals</label>
                  <span className="identity-form-sub-hint">Signals for automatic selector</span>
                </div>
                <div className="identity-quality-selector-grid">
                  {IDENTITY_QUALITY_LABELS.map((q) => {
                    const active = selectedQualityLabels.includes(q.id);
                    return (
                      <button
                        key={q.id}
                        type="button"
                        className={`identity-quality-pill ${active ? 'active' : ''}`}
                        onClick={() => toggleQualityLabel(q.id)}
                        title={q.description}
                      >
                        {active && <Check size={11} strokeWidth={2.5} />}
                        <span>{q.label}</span>
                      </button>
                    );
                  })}
                </div>
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

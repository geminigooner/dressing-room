import React, { useState } from 'react';
import {
  UserCheck,
  Plus,
  X,
  Sparkles,
  ShieldCheck,
  Check,
  ChevronRight,
  Sliders,
  Sparkle,
  Smile,
  Scissors,
  Layers,
  ArrowRight,
  Flame
} from 'lucide-react';
import { IDENTITY_SEGMENT_ROLES, scoreReferenceRelevance } from '../lib/identity.js';

export default function IdentityReferenceSelector({
  identityReferences = [],
  selectedIdentityIds = [],
  segmentWeights = {}, // { [refId]: 'auto' | 'face' | 'hair' | 'body' }
  prompt = '',
  onToggleSelect,
  onSetSegmentWeight,
  onSelectRecommendedForSegment,
  onOpenIdentityTab,
}) {
  const [showQuickPicker, setShowQuickPicker] = useState(false);
  const [activeFilterSegment, setActiveFilterSegment] = useState('all'); // 'all' | 'face' | 'hair' | 'body'
  const [showSegmentAssigner, setShowSegmentAssigner] = useState(null); // refId or null

  const selectedItems = identityReferences.filter((item) =>
    selectedIdentityIds.includes(item.id)
  );

  // Segment icons mapping
  const getSegmentIcon = (roleId) => {
    switch (roleId) {
      case 'face':
        return <Smile size={11} />;
      case 'hair':
        return <Scissors size={11} />;
      case 'body':
        return <Layers size={11} />;
      default:
        return <Sparkles size={11} />;
    }
  };

  const getSegmentLabel = (roleId) => {
    const role = IDENTITY_SEGMENT_ROLES.find((r) => r.id === roleId);
    return role ? role.label.split(' / ')[0] : 'Balanced';
  };

  // Sort references in quick picker with relevance cues
  const scoredReferences = [...identityReferences].map((item) => ({
    ...item,
    relevanceScore: scoreReferenceRelevance(item, prompt, activeFilterSegment),
  })).sort((a, b) => {
    // Selected first, then highest score
    const aSel = selectedIdentityIds.includes(a.id);
    const bSel = selectedIdentityIds.includes(b.id);
    if (aSel && !bSel) return -1;
    if (!aSel && bSel) return 1;
    return b.relevanceScore - a.relevanceScore;
  });

  const filteredReferences = scoredReferences.filter((item) => {
    if (activeFilterSegment === 'all' || activeFilterSegment === 'auto') return true;
    const tags = item.tags || [];
    if (activeFilterSegment === 'face') return tags.includes('face') || tags.includes('close-up') || tags.includes('neutral') || tags.includes('bright lighting');
    if (activeFilterSegment === 'hair') return tags.includes('face') || tags.includes('close-up') || tags.includes('profile') || tags.includes('3/4 angle');
    if (activeFilterSegment === 'body') return tags.includes('full body') || tags.includes('mirror selfie') || tags.includes('outdoor') || tags.includes('indoor');
    return true;
  });

  return (
    <div className="create-identity-block" id="create-identity-reference-section">
      {/* Header Row */}
      <div className="create-identity-header">
        <div className="create-identity-title-wrap">
          <div className="create-identity-icon-pill">
            <UserCheck size={14} />
          </div>
          <span className="create-identity-label">Identity References</span>
          {selectedItems.length > 0 ? (
            <span className="create-identity-badge active">
              {selectedItems.length} active
            </span>
          ) : (
            <span className="create-identity-badge">0 / 4</span>
          )}
        </div>

        <button
          type="button"
          className="create-identity-manage-btn"
          onClick={onOpenIdentityTab}
          aria-label="Manage Identity Bank"
        >
          <span>Identity Bank</span>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Selected Items Horizontal Row or Empty Hint */}
      {selectedItems.length === 0 ? (
        <div className="create-identity-empty-bar">
          <div className="create-identity-empty-text">
            <ShieldCheck size={15} className="create-identity-shield-icon" />
            <span>Select up to 4 identity references to preserve your features</span>
          </div>
          <button
            type="button"
            className="create-identity-add-pill"
            onClick={() => {
              if (identityReferences.length === 0) {
                onOpenIdentityTab();
              } else {
                setShowQuickPicker(!showQuickPicker);
              }
            }}
          >
            <Plus size={13} />
            <span>{identityReferences.length === 0 ? 'Upload Photo' : 'Select'}</span>
          </button>
        </div>
      ) : (
        <div className="create-identity-selected-row">
          {selectedItems.map((item) => {
            const role = segmentWeights[item.id] || 'auto';
            return (
              <div key={item.id} className="create-identity-chip">
                <img
                  src={item.imageUrl || item.dataUrl}
                  alt={item.label}
                  className="create-identity-chip-img"
                />
                <div className="create-identity-chip-info">
                  <span className="create-identity-chip-name">{item.label}</span>
                  {/* Segment Weight Indicator / Selector Button */}
                  <button
                    type="button"
                    className={`create-identity-role-pill role-${role}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSegmentAssigner(showSegmentAssigner === item.id ? null : item.id);
                    }}
                    title={`Focus: ${getSegmentLabel(role)} (Tap to switch focus)`}
                  >
                    {getSegmentIcon(role)}
                    <span>{getSegmentLabel(role)}</span>
                  </button>
                </div>

                <button
                  type="button"
                  className="create-identity-chip-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect(item.id);
                  }}
                  aria-label={`Deselect ${item.label}`}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}

          {selectedItems.length < 4 && identityReferences.length > selectedItems.length && (
            <button
              type="button"
              className="create-identity-add-more-chip"
              onClick={() => setShowQuickPicker(!showQuickPicker)}
            >
              <Plus size={13} />
              <span>Add ({selectedItems.length}/4)</span>
            </button>
          )}
        </div>
      )}

      {/* In-place Role Assignment Popover */}
      {showSegmentAssigner && (
        <div className="segment-assigner-popover">
          <div className="segment-assigner-header">
            <span className="segment-assigner-title">Select Focus Role for this Photo</span>
            <button
              type="button"
              className="quick-picker-close"
              onClick={() => setShowSegmentAssigner(null)}
            >
              <X size={13} />
            </button>
          </div>
          <div className="segment-assigner-options">
            {IDENTITY_SEGMENT_ROLES.map((role) => {
              const active = (segmentWeights[showSegmentAssigner] || 'auto') === role.id;
              return (
                <button
                  key={role.id}
                  type="button"
                  className={`segment-role-btn ${active ? 'active' : ''}`}
                  onClick={() => {
                    onSetSegmentWeight?.(showSegmentAssigner, role.id);
                    setShowSegmentAssigner(null);
                  }}
                >
                  <div className="role-btn-icon">{getSegmentIcon(role.id)}</div>
                  <div className="role-btn-text">
                    <span className="role-btn-label">{role.label}</span>
                    <span className="role-btn-desc">{role.description}</span>
                  </div>
                  {active && <Check size={14} className="role-btn-check" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Dropdown Picker with Segment Filter & Relevance Ranking */}
      {showQuickPicker && identityReferences.length > 0 && (
        <div className="create-identity-quick-picker">
          <div className="quick-picker-header">
            <div className="quick-picker-title-group">
              <span className="quick-picker-title">Choose from your Identity Bank</span>
              <span className="quick-picker-sub">Tap photo to select (max 4)</span>
            </div>
            <button
              type="button"
              className="quick-picker-close"
              onClick={() => setShowQuickPicker(false)}
            >
              <X size={13} />
            </button>
          </div>

          {/* Segment Filter Pills inside Quick Picker */}
          <div className="quick-picker-segment-tabs">
            <button
              type="button"
              className={`quick-segment-tab ${activeFilterSegment === 'all' ? 'active' : ''}`}
              onClick={() => setActiveFilterSegment('all')}
            >
              All Photos ({identityReferences.length})
            </button>
            <button
              type="button"
              className={`quick-segment-tab ${activeFilterSegment === 'face' ? 'active' : ''}`}
              onClick={() => setActiveFilterSegment('face')}
            >
              <Smile size={11} />
              <span>Face / Close-up</span>
            </button>
            <button
              type="button"
              className={`quick-segment-tab ${activeFilterSegment === 'body' ? 'active' : ''}`}
              onClick={() => setActiveFilterSegment('body')}
            >
              <Layers size={11} />
              <span>Full Body</span>
            </button>
          </div>

          {/* Quick-Match Action Button */}
          {filteredReferences.length > 0 && (
            <div className="quick-match-bar">
              <span className="quick-match-hint">
                Showing {filteredReferences.length} matching photos ranked by edit relevance
              </span>
              {selectedItems.length === 0 && (
                <button
                  type="button"
                  className="quick-match-apply-btn"
                  onClick={() => {
                    const topMatch = filteredReferences[0];
                    if (topMatch && !selectedIdentityIds.includes(topMatch.id)) {
                      onToggleSelect(topMatch.id);
                    }
                  }}
                >
                  <Sparkle size={11} />
                  <span>Select Top Match</span>
                </button>
              )}
            </div>
          )}

          <div className="quick-picker-grid">
            {filteredReferences.map((item) => {
              const isSelected = selectedIdentityIds.includes(item.id);
              const role = segmentWeights[item.id] || 'auto';
              return (
                <div
                  key={item.id}
                  className={`quick-picker-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => onToggleSelect(item.id)}
                >
                  <img src={item.imageUrl || item.dataUrl} alt={item.label} className="quick-picker-img" />
                  <div className="quick-picker-meta">
                    <span className="quick-picker-name">{item.label}</span>
                    <div className="quick-picker-tag-row">
                      {item.tags && item.tags.length > 0 && (
                        <span className="quick-picker-tag">#{item.tags[0]}</span>
                      )}
                      {item.favorite && <span className="quick-picker-fav-dot" title="Favorite">★</span>}
                    </div>
                  </div>
                  <div className={`quick-picker-check ${isSelected ? 'checked' : ''}`}>
                    {isSelected ? <Check size={11} strokeWidth={2.5} /> : <Plus size={11} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

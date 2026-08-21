import React, { useState, useEffect, useRef } from 'react';
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
  Image as ImageIcon,
  Trash2,
  Check,
  Calendar,
  ExternalLink,
  UserCheck,
  Smile,
  Frown,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { editPhoto, fileToPart, imageSourceToPart, fetchGallery, saveToGallery, deleteFromGallery } from './lib/api.js';
import {
  planEditPrompt,
  executeSearchGrounding,
  evaluateSearchGroundingNeed,
} from './lib/promptPlanner.js';
import {
  getIdentityReferences,
  saveIdentityReference,
  deleteIdentityReference,
  getSelectedIdentityIds,
  saveSelectedIdentityIds,
  getSegmentWeights,
  saveSegmentWeights,
  DEFAULT_IDENTITY_CONTRACT,
} from './lib/identity.js';
import {
  getSuccessfulEditsMemory,
  recordSuccessfulEdit,
  unrecordSuccessfulEdit,
  updateApprovedSegments,
  deleteSuccessfulEdit,
  getFailedEditsMemory,
  recordFailedEdit,
  unrecordFailedEdit,
  updateFailedEditReasons,
  deleteFailedEdit,
  generateMemoryInsightsSummary,
  FINE_GRAINED_SEGMENTS,
  FAILURE_REASONS,
} from './lib/memory.js';
import GeminiAssistantSheet from './components/GeminiAssistantSheet.jsx';
import IdentityBank from './components/IdentityBank.jsx';
import IdentityReferenceSelector from './components/IdentityReferenceSelector.jsx';

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

  // Identity Reference Bank State
  const [identityReferences, setIdentityReferences] = useState([]);
  const [selectedIdentityIds, setSelectedIdentityIds] = useState([]);
  const [segmentWeights, setSegmentWeights] = useState({}); // { [refId]: 'auto' | 'face' | 'hair' | 'body' }
  const [identityContract] = useState(DEFAULT_IDENTITY_CONTRACT);

  // Successful Edit Memory State
  const [successfulEdits, setSuccessfulEdits] = useState([]);
  const [currentGenerationData, setCurrentGenerationData] = useState(null);
  const [isCurrentApproved, setIsCurrentApproved] = useState(false);
  const [currentApprovedSegments, setCurrentApprovedSegments] = useState([]);
  const [approvalToast, setApprovalToast] = useState(false);

  // Failed Edit Memory / Negative Feedback State
  const [failedEdits, setFailedEdits] = useState([]);
  const [isCurrentRejected, setIsCurrentRejected] = useState(false);
  const [currentFailureReasons, setCurrentFailureReasons] = useState([]);
  const [currentFailureNote, setCurrentFailureNote] = useState('');
  const [failureToast, setFailureToast] = useState(false);
  const [showFailureReasonDrawer, setShowFailureReasonDrawer] = useState(false);

  // Gallery state
  const [galleryItems, setGalleryItems] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedLook, setSelectedLook] = useState(null); // For Lightbox detail view

  // Gemini Assistant Drawer state
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  // Tab & navigation state
  const [activeTab, setActiveTab] = useState('create'); // 'create' | 'identity' | 'gallery'
  const [activeNav, setActiveNav] = useState('create'); // 'create' | 'identity' | 'looks' | 'outfits' | 'profile'
  const [showMenuModal, setShowMenuModal] = useState(false);

  // File input refs
  const baseInputRef = useRef(null);
  const outfitInputRef = useRef(null);

  // Live Workspace Context Snapshot for Gemini Assistant
  const workspaceContext = {
    hasBasePhoto: Boolean(basePhoto),
    basePhotoName: basePhoto?.name || (basePhotoPreview ? 'Uploaded photo' : null),
    basePhotoSource: basePhoto || basePhotoPreview,
    hasOutfitReference: Boolean(outfitPhoto),
    outfitPhotoName: outfitPhoto?.name || (outfitPhotoPreview ? 'Outfit reference' : null),
    outfitPhotoSource: outfitPhoto || outfitPhotoPreview,
    identityReferencesCount: identityReferences.length,
    selectedIdentityReferences: identityReferences
      .filter((r) => selectedIdentityIds.includes(r.id))
      .map((r) => ({
        id: r.id,
        label: r.label,
        tags: r.tags,
        notes: r.notes,
        segmentRole: segmentWeights[r.id] || 'auto',
      })),
    segmentWeights,
    identityContract,
    successMemoryCount: successfulEdits.length,
    failedMemoryCount: failedEdits.length,
    isCurrentResultApproved: isCurrentApproved,
    isCurrentResultRejected: isCurrentRejected,
    currentFailureReasons,
    memoryInsights: generateMemoryInsightsSummary(successfulEdits, failedEdits, identityReferences, prompt),
    prompt: prompt || '',
    isGenerating: isLoading,
    hasResultImage: Boolean(resultImage),
    resultImageSource: resultImage,
    hasResultText: Boolean(resultText),
    activeTab,
    galleryCount: galleryItems.length,
    galleryItems: galleryItems.map((item) => ({ id: item.id, prompt: item.prompt, createdAt: item.created_at || item.createdAt })),
    selectedLook: selectedLook
      ? {
          id: selectedLook.id,
          prompt: selectedLook.prompt,
          imageUrl: selectedLook.imageUrl || selectedLook.dataUrl,
        }
      : null,
    lastGenerationPlan: currentGenerationData?.plan || null,
    usedSearchGrounding: Boolean(currentGenerationData?.usedSearch || currentGenerationData?.plan?.searchGrounding?.used),
    searchDetails: currentGenerationData?.searchDetails || currentGenerationData?.plan?.searchGrounding || null,
    lastErrorMessage: errorMessage,
  };

  // Load saved gallery looks, identity references, and edit memory on mount (survives refresh)
  useEffect(() => {
    async function loadInitialData() {
      try {
        const [items, idRefs, memories, failures] = await Promise.all([
          fetchGallery(),
          getIdentityReferences(),
          getSuccessfulEditsMemory(),
          getFailedEditsMemory(),
        ]);
        setGalleryItems(items || []);
        setIdentityReferences(idRefs || []);
        setSuccessfulEdits(memories || []);
        setFailedEdits(failures || []);

        const savedSelectedIds = getSelectedIdentityIds();
        if (savedSelectedIds && savedSelectedIds.length > 0) {
          // Verify selected IDs still exist in references
          const existingIds = (idRefs || []).map((r) => r.id);
          const validSelected = savedSelectedIds.filter((id) => existingIds.includes(id));
          setSelectedIdentityIds(validSelected);
        } else if (idRefs && idRefs.length > 0) {
          // Default select up to 2 initial references
          const autoSelect = idRefs.slice(0, 2).map((r) => r.id);
          setSelectedIdentityIds(autoSelect);
          saveSelectedIdentityIds(autoSelect);
        }

        const savedWeights = getSegmentWeights();
        if (savedWeights && typeof savedWeights === 'object') {
          setSegmentWeights(savedWeights);
        }
      } catch (err) {
        console.error('Failed to load initial data:', err);
      }
    }
    loadInitialData();
  }, []);

  // Handle Identity Reference Operations
  const handleSaveIdentityReference = (savedItem) => {
    setIdentityReferences((prev) => {
      const filtered = prev.filter((r) => r.id !== savedItem.id);
      return [savedItem, ...filtered];
    });
    // Auto select if under limit
    if (selectedIdentityIds.length < 4 && !selectedIdentityIds.includes(savedItem.id)) {
      const updated = [...selectedIdentityIds, savedItem.id];
      setSelectedIdentityIds(updated);
      saveSelectedIdentityIds(updated);
    }
  };

  const handleDeleteIdentityReference = async (id) => {
    await deleteIdentityReference(id);
    setIdentityReferences((prev) => prev.filter((r) => r.id !== id));
    setSelectedIdentityIds((prev) => {
      const updated = prev.filter((sid) => sid !== id);
      saveSelectedIdentityIds(updated);
      return updated;
    });
    setSegmentWeights((prev) => {
      const next = { ...prev };
      delete next[id];
      saveSegmentWeights(next);
      return next;
    });
  };

  const handleToggleFavoriteIdentity = async (id) => {
    const target = identityReferences.find((r) => r.id === id);
    if (!target) return;
    const updatedItem = { ...target, favorite: !target.favorite };
    await saveIdentityReference(updatedItem);
    setIdentityReferences((prev) =>
      prev.map((r) => (r.id === id ? updatedItem : r))
    );
  };

  const handleToggleSelectIdentity = (id) => {
    setSelectedIdentityIds((prev) => {
      let updated;
      if (prev.includes(id)) {
        updated = prev.filter((sid) => sid !== id);
      } else {
        if (prev.length >= 4) {
          // Replace last one or ignore
          updated = [...prev.slice(1), id];
        } else {
          updated = [...prev, id];
        }
      }
      saveSelectedIdentityIds(updated);
      return updated;
    });
  };

  const handleSetSegmentWeight = (id, role) => {
    setSegmentWeights((prev) => {
      const updated = { ...prev, [id]: role };
      saveSegmentWeights(updated);
      return updated;
    });
  };

  // Handle Base Photo Upload
  const handleBasePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setBasePhoto(file);
      const url = URL.createObjectURL(file);
      setBasePhotoPreview(url);
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
  const handleGenerate = async (customPrompt) => {
    if (!basePhoto) {
      baseInputRef.current?.click();
      return { success: false, reason: 'No base photo uploaded.' };
    }

    const effectivePrompt = typeof customPrompt === 'string' ? customPrompt : prompt;
    if (typeof customPrompt === 'string') {
      setPrompt(customPrompt);
    }

    setIsLoading(true);
    setResultImage(null);
    setResultText(null);
    setErrorMessage(null);
    setSaveSuccess(false);
    setIsCurrentApproved(false);
    setIsCurrentRejected(false);
    setCurrentApprovedSegments([]);
    setCurrentFailureReasons([]);
    setCurrentFailureNote('');
    setShowFailureReasonDrawer(false);

    try {
      // 1. Convert photo inputs to parts
      const photoPart = await fileToPart(basePhoto);
      const garmentPart = outfitPhoto ? await fileToPart(outfitPhoto) : null;

      // 2. Resolve selected identity references as image parts with segment role guidance
      const activeIdentityRefs = identityReferences.filter((r) =>
        selectedIdentityIds.includes(r.id)
      );
      const identityParts = [];
      for (const idRef of activeIdentityRefs) {
        const part = await imageSourceToPart(idRef.imageUrl || idRef.dataUrl);
        if (part) {
          part.role = segmentWeights[idRef.id] || 'auto';
          part.label = idRef.label || 'Identity Reference';
          part.tags = idRef.tags || [];
          identityParts.push(part);
        }
      }

      // 3. Synthesize Prompt Intelligence structured plan before dispatching edit
      const { plan, finalInstruction, usedSearch, searchDetails } = await planEditPrompt({
        userPrompt: effectivePrompt,
        basePhotoContext: basePhoto?.name || (basePhotoPreview ? 'Uploaded photo' : 'Base photo'),
        hasOutfitReference: Boolean(outfitPhoto),
        selectedIdentityRefs: activeIdentityRefs,
        segmentWeights,
        identityContract,
        successfulMemories: successfulEdits,
        failedMemories: failedEdits,
        allowSearch: true,
      });

      // Generate a tracking ID for this run
      const genId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const genMeta = {
        generationId: genId,
        prompt: effectivePrompt,
        finalInstruction,
        plan,
        usedSearch,
        searchDetails,
        basePhotoContext: basePhoto?.name || (basePhotoPreview ? 'Uploaded photo' : 'Base photo'),
        identityRefIds: activeIdentityRefs.map((r) => r.id),
        segmentWeights: { ...segmentWeights },
        manualOverrides: selectedIdentityIds.length > 0,
        hasOutfitReference: Boolean(outfitPhoto),
        identityTags: activeIdentityRefs.flatMap((r) => r.tags || []),
      };
      setCurrentGenerationData(genMeta);

      // 4. Call editPhoto with the refined instruction and identity references
      const response = await editPhoto(photoPart, garmentPart, finalInstruction, identityParts);

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
      return { success: true };
    } catch (err) {
      console.error('Error during photo edit generation:', err);
      setErrorMessage(err?.message || 'Failed to generate style. Please try again.');
      return { success: false, error: err?.message };
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle "Looks like me" User Approval for Successful Edit Memory
  const handleToggleLooksLikeMe = async () => {
    if (!currentGenerationData || !resultImage) return;

    try {
      if (isCurrentApproved) {
        await unrecordSuccessfulEdit(currentGenerationData.generationId);
        setIsCurrentApproved(false);
        setCurrentApprovedSegments([]);
        const updated = await getSuccessfulEditsMemory();
        setSuccessfulEdits(updated);
      } else {
        // If previously marked as failure, clear failure record
        if (isCurrentRejected) {
          await unrecordFailedEdit(currentGenerationData.generationId);
          setIsCurrentRejected(false);
          setCurrentFailureReasons([]);
          setCurrentFailureNote('');
          setShowFailureReasonDrawer(false);
          const updatedFailures = await getFailedEditsMemory();
          setFailedEdits(updatedFailures);
        }

        await recordSuccessfulEdit({
          ...currentGenerationData,
          approvedSegments: currentApprovedSegments,
        });
        setIsCurrentApproved(true);
        setApprovalToast(true);
        setTimeout(() => setApprovalToast(false), 3000);
        const updated = await getSuccessfulEditsMemory();
        setSuccessfulEdits(updated);
      }
    } catch (err) {
      console.error('Failed to toggle approval memory:', err);
    }
  };

  // Toggle fine-grained segment feedback on an approved result
  const handleToggleSegmentFeedback = async (segmentId) => {
    if (!currentGenerationData || !isCurrentApproved) return;
    const nextSegments = currentApprovedSegments.includes(segmentId)
      ? currentApprovedSegments.filter((s) => s !== segmentId)
      : [...currentApprovedSegments, segmentId];

    setCurrentApprovedSegments(nextSegments);
    try {
      await updateApprovedSegments(currentGenerationData.generationId, nextSegments);
      const updated = await getSuccessfulEditsMemory();
      setSuccessfulEdits(updated);
    } catch (err) {
      console.error('Failed to update segment feedback:', err);
    }
  };

  // Toggle "Doesn't look like me" User Negative Feedback
  const handleToggleDoesntLookLikeMe = async () => {
    if (!currentGenerationData || !resultImage) return;

    try {
      if (isCurrentRejected) {
        await unrecordFailedEdit(currentGenerationData.generationId);
        setIsCurrentRejected(false);
        setCurrentFailureReasons([]);
        setCurrentFailureNote('');
        setShowFailureReasonDrawer(false);
        const updated = await getFailedEditsMemory();
        setFailedEdits(updated);
      } else {
        // If previously approved, unrecord approval first
        if (isCurrentApproved) {
          await unrecordSuccessfulEdit(currentGenerationData.generationId);
          setIsCurrentApproved(false);
          setCurrentApprovedSegments([]);
          const updatedSuccess = await getSuccessfulEditsMemory();
          setSuccessfulEdits(updatedSuccess);
        }

        await recordFailedEdit({
          ...currentGenerationData,
          failureReasons: currentFailureReasons,
          userNote: currentFailureNote,
        });
        setIsCurrentRejected(true);
        setShowFailureReasonDrawer(true);
        setFailureToast(true);
        setTimeout(() => setFailureToast(false), 3500);
        const updated = await getFailedEditsMemory();
        setFailedEdits(updated);
      }
    } catch (err) {
      console.error('Failed to toggle negative feedback:', err);
    }
  };

  // Toggle specific failure reason chip
  const handleToggleFailureReason = async (reasonId) => {
    if (!currentGenerationData) return;
    const nextReasons = currentFailureReasons.includes(reasonId)
      ? currentFailureReasons.filter((r) => r !== reasonId)
      : [...currentFailureReasons, reasonId];

    setCurrentFailureReasons(nextReasons);
    try {
      await updateFailedEditReasons(currentGenerationData.generationId, nextReasons, currentFailureNote);
      const updated = await getFailedEditsMemory();
      setFailedEdits(updated);
    } catch (err) {
      console.error('Failed to update failure reasons:', err);
    }
  };

  // Update failure custom note
  const handleUpdateFailureNote = async (noteText) => {
    if (!currentGenerationData) return;
    setCurrentFailureNote(noteText);
    try {
      await updateFailedEditReasons(currentGenerationData.generationId, currentFailureReasons, noteText);
      const updated = await getFailedEditsMemory();
      setFailedEdits(updated);
    } catch (err) {
      console.error('Failed to update failure note:', err);
    }
  };

  // Delete an approved memory record
  const handleDeleteMemory = async (memoryOrGenId) => {
    try {
      await deleteSuccessfulEdit(memoryOrGenId);
      if (currentGenerationData && (currentGenerationData.generationId === memoryOrGenId)) {
        setIsCurrentApproved(false);
        setCurrentApprovedSegments([]);
      }
      const updated = await getSuccessfulEditsMemory();
      setSuccessfulEdits(updated);
    } catch (err) {
      console.error('Failed to delete memory record:', err);
    }
  };

  // Delete a failed memory record
  const handleDeleteFailedMemory = async (memoryOrGenId) => {
    try {
      await deleteFailedEdit(memoryOrGenId);
      if (currentGenerationData && (currentGenerationData.generationId === memoryOrGenId)) {
        setIsCurrentRejected(false);
        setCurrentFailureReasons([]);
        setCurrentFailureNote('');
        setShowFailureReasonDrawer(false);
      }
      const updated = await getFailedEditsMemory();
      setFailedEdits(updated);
    } catch (err) {
      console.error('Failed to delete failed edit record:', err);
    }
  };

  // Apply recipe from memory bank to active Create setup
  const handleApplyMemoryRecipe = (recipe) => {
    if (!recipe || !Array.isArray(recipe.identityRefIds)) return;

    // Filter valid reference IDs that currently exist in the bank
    const validIds = recipe.identityRefIds.filter((id) =>
      identityReferences.some((r) => r.id === id)
    );

    if (validIds.length > 0) {
      setSelectedIdentityIds(validIds);
      saveSelectedIdentityIds(validIds);
    }

    if (recipe.segmentWeights && typeof recipe.segmentWeights === 'object') {
      const mergedWeights = { ...segmentWeights, ...recipe.segmentWeights };
      setSegmentWeights(mergedWeights);
      saveSegmentWeights(mergedWeights);
    }

    if (recipe.prompt && !prompt) {
      setPrompt(recipe.prompt);
    }

    setActiveTab('create');
    setActiveNav('create');
  };

  // Save generated look to Gallery (R2 for image + D1 for metadata)
  const handleSaveToGallery = async () => {
    if (!resultImage || isSaving) return null;

    setIsSaving(true);
    try {
      const savedItem = await saveToGallery(resultImage, prompt);
      if (savedItem) {
        setGalleryItems((prev) => [savedItem, ...prev.filter((i) => i.id !== savedItem.id)]);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        return savedItem;
      }
    } catch (err) {
      console.error('Failed to save look to gallery:', err);
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  // Delete look from Gallery
  const handleDeleteLook = async (id, e) => {
    if (e) e.stopPropagation();
    if (!id) return;

    try {
      await deleteFromGallery(id);
      setGalleryItems((prev) => prev.filter((item) => item.id !== id));
      if (selectedLook?.id === id) {
        setSelectedLook(null);
      }
    } catch (err) {
      console.error('Failed to delete look:', err);
    }
  };

  // Download / Export helper
  const handleDownloadImage = (imgSrc, customName) => {
    if (!imgSrc) return;
    const a = document.createElement('a');
    a.href = imgSrc;
    a.download = customName || `dressing-room-look-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Trigger download of current generated output
  const handleDownloadCurrent = () => {
    if (resultImage) {
      handleDownloadImage(resultImage, `dressing-room-look-${Date.now()}.png`);
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

  // Tool Execution Dispatcher for Gemini Assistant
  const handleExecuteTool = async (toolName, params = {}) => {
    switch (toolName) {
      case 'generate_image_edit': {
        if (!basePhoto) {
          baseInputRef.current?.click();
          return { success: false, message: 'Please upload a base photo first to generate your look.' };
        }
        if (params.prompt && typeof params.prompt === 'string') {
          setPrompt(params.prompt);
        }
        setActiveTab('create');
        setActiveNav('create');
        const res = await handleGenerate(params.prompt);
        return res?.success
          ? { success: true, message: 'Look generated successfully.' }
          : { success: false, message: res?.error || 'Generation failed.' };
      }
      case 'save_current_result': {
        if (!resultImage) {
          return { success: false, message: 'No generated image on canvas to save right now.' };
        }
        const saved = await handleSaveToGallery();
        return saved
          ? { success: true, message: 'Saved look to gallery.' }
          : { success: false, message: 'Failed to save look.' };
      }
      case 'download_current_result': {
        if (!resultImage && !resultText) {
          return { success: false, message: 'No generated result available to download.' };
        }
        handleDownloadCurrent();
        return { success: true, message: 'Download initiated.' };
      }
      case 'open_gallery': {
        setActiveTab('gallery');
        setActiveNav('looks');
        return { success: true, message: 'Opened saved looks gallery.' };
      }
      case 'open_selected_look': {
        const lookId = params.lookId;
        const found = galleryItems.find((item) => String(item.id) === String(lookId));
        if (found) {
          setSelectedLook(found);
          setActiveTab('gallery');
          setActiveNav('looks');
          return { success: true, message: `Opened look #${found.id} in lightbox.` };
        } else if (galleryItems.length > 0) {
          const fallback = galleryItems[0];
          setSelectedLook(fallback);
          setActiveTab('gallery');
          setActiveNav('looks');
          return { success: true, message: `Opened latest look #${fallback.id} in lightbox.` };
        }
        return { success: false, message: `Look #${lookId} not found in gallery.` };
      }
      case 'delete_gallery_item': {
        const lookId = params.lookId || selectedLook?.id;
        if (!lookId) {
          return { success: false, message: 'No look specified to delete.' };
        }
        await handleDeleteLook(lookId);
        return { success: true, message: `Deleted look #${lookId} from gallery.` };
      }
      case 'update_styling_prompt': {
        if (params.text) {
          setPrompt(params.text);
          return { success: true, message: `Updated prompt to "${params.text}".` };
        }
        return { success: false, message: 'Missing prompt text.' };
      }
      case 'optimize_edit_prompt': {
        const targetPrompt = params.prompt || prompt || '';
        const activeIdentityRefs = identityReferences.filter((r) =>
          selectedIdentityIds.includes(r.id)
        );
        const { plan, finalInstruction, usedSearch, searchDetails } = await planEditPrompt({
          userPrompt: targetPrompt,
          basePhotoContext: basePhoto?.name || (basePhotoPreview ? 'Uploaded photo' : 'Base photo'),
          hasOutfitReference: Boolean(outfitPhoto),
          selectedIdentityRefs: activeIdentityRefs,
          segmentWeights,
          identityContract,
          successfulMemories: successfulEdits,
          allowSearch: false,
        });

        return {
          success: true,
          message: `Synthesized Prompt Intelligence plan: "${finalInstruction}"`,
          plan,
        };
      }
      case 'research_prompt_strategy': {
        const topic = params.topic || prompt || '';
        if (!topic) {
          return { success: false, message: 'No topic provided for research.' };
        }
        const searchResult = await executeSearchGrounding(topic, 'Assistant prompt research request');
        return {
          success: true,
          message: searchResult.used
            ? `Grounding research for "${topic}": ${searchResult.summary}`
            : `Search completed. No additional external styling data found.`,
          searchDetails: searchResult,
        };
      }
      case 'open_identity_bank': {
        setActiveTab('identity');
        setActiveNav('identity');
        return { success: true, message: 'Opened Identity Reference Bank.' };
      }
      default:
        return { success: false, message: `Unsupported tool "${toolName}".` };
    }
  };

  // Date formatter for look cards
  const formatLookDate = (timestamp) => {
    if (!timestamp) return 'Just now';
    try {
      const d = new Date(timestamp);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return 'Recently';
    }
  };

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

      {/* Segmented Control Bar (Create vs Identity vs Gallery) */}
      <div className="tab-toggle-bar" id="mode-tab-toggle">
        <button
          type="button"
          id="tab-create"
          className={`tab-toggle-item ${activeTab === 'create' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('create');
            setActiveNav('create');
          }}
        >
          <Sparkles size={15} />
          <span>Create</span>
        </button>
        <button
          type="button"
          id="tab-identity"
          className={`tab-toggle-item ${activeTab === 'identity' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('identity');
            setActiveNav('identity');
          }}
        >
          <UserCheck size={15} />
          <span>Identity ({identityReferences.length})</span>
        </button>
        <button
          type="button"
          id="tab-gallery"
          className={`tab-toggle-item ${activeTab === 'gallery' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('gallery');
            setActiveNav('looks');
          }}
        >
          <Grid size={15} />
          <span>Gallery ({galleryItems.length})</span>
        </button>
      </div>

      {/* CREATE TAB CONTENT */}
      {activeTab === 'create' && (
        <>
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

            {/* Identity References Selection Strip with Segment-Specific Focus */}
            <IdentityReferenceSelector
              identityReferences={identityReferences}
              selectedIdentityIds={selectedIdentityIds}
              segmentWeights={segmentWeights}
              prompt={prompt}
              onToggleSelect={handleToggleSelectIdentity}
              onSetSegmentWeight={handleSetSegmentWeight}
              onOpenIdentityTab={() => {
                setActiveTab('identity');
                setActiveNav('identity');
              }}
            />

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
                  <img
                    src={resultImage}
                    alt="After styled look"
                    className="preview-image"
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      setSelectedLook({
                        id: 'current_result',
                        imageUrl: resultImage,
                        dataUrl: resultImage,
                        prompt: prompt || 'Generated style look',
                        createdAt: Date.now(),
                      })
                    }
                  />
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

            {/* Action Buttons & Feedback */}
            {resultImage && (
              <div className="result-approval-row">
                <div className="result-feedback-group">
                  {/* Positive Feedback: Looks like me */}
                  <button
                    type="button"
                    id="btn-looks-like-me"
                    className={`result-looks-like-me-btn ${isCurrentApproved ? 'approved' : ''}`}
                    onClick={handleToggleLooksLikeMe}
                    title={
                      isCurrentApproved
                        ? 'Approved! Explicitly remembered as a high-fidelity result.'
                        : 'Explicitly mark this result as accurately preserving your identity'
                    }
                  >
                    {isCurrentApproved ? (
                      <>
                        <Check size={14} strokeWidth={2.6} className="approval-icon" />
                        <span className="approval-title">Looks like me</span>
                        <span className="approval-status-pill">Saved</span>
                      </>
                    ) : (
                      <>
                        <Smile size={14} className="approval-icon" />
                        <span className="approval-title">Looks like me</span>
                      </>
                    )}
                  </button>

                  {/* Negative Feedback: Doesn't look like me */}
                  <button
                    type="button"
                    id="btn-doesnt-look-like-me"
                    className={`result-doesnt-look-btn ${isCurrentRejected ? 'rejected' : ''}`}
                    onClick={handleToggleDoesntLookLikeMe}
                    title={
                      isCurrentRejected
                        ? 'Negative feedback logged. The system will avoid this pattern.'
                        : 'Flag that this result drifted or failed to preserve your look'
                    }
                  >
                    {isCurrentRejected ? (
                      <>
                        <AlertTriangle size={13} className="approval-icon" />
                        <span className="approval-title">Doesn’t look like me</span>
                        <span className="approval-status-pill" style={{ background: 'rgba(0,0,0,0.2)' }}>Logged</span>
                      </>
                    ) : (
                      <>
                        <Frown size={13} className="approval-icon" />
                        <span className="approval-title">Doesn’t look like me</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Positive segment feedback chips */}
                {isCurrentApproved && (
                  <div className="approval-segment-feedback-wrap">
                    <span className="approval-segment-title">What preserved your look best? (Optional)</span>
                    <div className="approval-segment-chips-grid">
                      {FINE_GRAINED_SEGMENTS.map((seg) => {
                        const isSelected = currentApprovedSegments.includes(seg.id);
                        return (
                          <button
                            key={seg.id}
                            type="button"
                            className={`approval-segment-chip ${isSelected ? 'active' : ''}`}
                            onClick={() => handleToggleSegmentFeedback(seg.id)}
                            title={seg.description}
                          >
                            {isSelected && <Check size={10} strokeWidth={2.6} />}
                            <span>{seg.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Negative failure reasons drawer */}
                {isCurrentRejected && (
                  <div className="failure-reason-drawer" id="failure-reason-drawer">
                    <div className="failure-reason-header">
                      <span className="failure-reason-title">
                        <AlertTriangle size={13} />
                        <span>What didn’t look right?</span>
                      </span>
                      <span className="failure-reason-subtitle">Helps guide future edits</span>
                    </div>

                    <div className="failure-reasons-grid">
                      {FAILURE_REASONS.map((r) => {
                        const isSelected = currentFailureReasons.includes(r.id);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            className={`failure-reason-chip ${isSelected ? 'active' : ''}`}
                            onClick={() => handleToggleFailureReason(r.id)}
                            title={r.description}
                          >
                            {isSelected && <Check size={10} strokeWidth={2.6} />}
                            <span>{r.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="failure-note-row">
                      <input
                        type="text"
                        className="failure-note-input"
                        placeholder="Add quick note (e.g. skin tone too light, jawline changed)..."
                        value={currentFailureNote}
                        onChange={(e) => handleUpdateFailureNote(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {approvalToast && (
                  <div className="approval-toast-banner" role="status">
                    <CheckCircle2 size={12} />
                    <span>Saved to Edit Memory! References will learn what worked.</span>
                  </div>
                )}

                {failureToast && (
                  <div className="failure-toast-banner" role="status">
                    <AlertTriangle size={12} />
                    <span>Feedback saved! Prompt intelligence will avoid these issues on next runs.</span>
                  </div>
                )}
              </div>
            )}

            <div className="result-actions-grid">
              <button
                type="button"
                id="btn-download"
                className="result-action-btn"
                onClick={handleDownloadCurrent}
                disabled={!resultImage && !resultText}
                style={{ opacity: resultImage || resultText ? 1 : 0.45 }}
              >
                <span>Download</span>
                <Download size={14} />
              </button>
              <button
                type="button"
                id="btn-save-gallery"
                className={`result-action-btn ${saveSuccess ? 'btn-saved-success' : ''}`}
                onClick={handleSaveToGallery}
                disabled={!resultImage || isSaving}
                style={{ opacity: !resultImage ? 0.45 : 1 }}
              >
                {isSaving ? (
                  <>
                    <span>Saving...</span>
                    <Loader2 size={14} className="spinner-icon" />
                  </>
                ) : saveSuccess ? (
                  <>
                    <span>Saved!</span>
                    <Check size={14} />
                  </>
                ) : (
                  <>
                    <span>Save to Gallery</span>
                    <Heart size={14} />
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Recent Looks Section */}
          <section className="recent-looks-section" id="recent-looks-section">
            <div className="recent-looks-header">
              <div className="recent-looks-title-wrap">
                <h3 className="recent-looks-title">Recent Looks</h3>
                <span className="recent-looks-badge">{galleryItems.length}</span>
              </div>
              <button
                type="button"
                id="btn-view-all-looks"
                className="recent-looks-view-all"
                onClick={() => {
                  setActiveTab('gallery');
                  setActiveNav('looks');
                }}
              >
                <span>View all</span>
                <span>&gt;</span>
              </button>
            </div>

            {galleryItems.length === 0 ? (
              <div
                style={{
                  padding: '16px 0',
                  textAlign: 'center',
                  fontSize: 12.5,
                  color: 'var(--text-muted)',
                }}
              >
                No saved looks yet. Generate a look and tap "Save to Gallery".
              </div>
            ) : (
              <div className="recent-looks-scroll">
                {galleryItems.map((item) => (
                  <div
                    key={item.id}
                    className="recent-look-thumb"
                    onClick={() => setSelectedLook(item)}
                    style={{ padding: 0, overflow: 'hidden' }}
                  >
                    <img
                      src={item.dataUrl || item.imageUrl}
                      alt={item.prompt || 'Saved look'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* IDENTITY TAB CONTENT */}
      {activeTab === 'identity' && (
        <IdentityBank
          identityReferences={identityReferences}
          selectedIdentityIds={selectedIdentityIds}
          identityContract={identityContract}
          successfulEdits={successfulEdits}
          failedEdits={failedEdits}
          onSaveReference={handleSaveIdentityReference}
          onDeleteReference={handleDeleteIdentityReference}
          onToggleSelect={handleToggleSelectIdentity}
          onToggleFavorite={handleToggleFavoriteIdentity}
          onDeleteMemory={handleDeleteMemory}
          onDeleteFailedMemory={handleDeleteFailedMemory}
          onApplyMemoryRecipe={handleApplyMemoryRecipe}
          onGoToCreate={() => {
            setActiveTab('create');
            setActiveNav('create');
          }}
        />
      )}

      {/* GALLERY TAB CONTENT */}
      {activeTab === 'gallery' && (
        <section className="gallery-section-card" id="gallery-view-section">
          <div className="gallery-header-row">
            <div className="gallery-title-wrap">
              <Sparkles size={18} style={{ color: 'var(--accent-pink)' }} />
              <h2 className="recent-looks-title" style={{ fontSize: 17 }}>Saved Looks Gallery</h2>
              <span className="recent-looks-badge">{galleryItems.length}</span>
            </div>
          </div>

          {galleryItems.length === 0 ? (
            <div className="gallery-empty-state">
              <div className="gallery-empty-icon">
                <ImageIcon size={26} />
              </div>
              <h3 className="gallery-empty-title">Your Gallery is Empty</h3>
              <p className="gallery-empty-desc">
                When you generate a look and tap <strong>Save to Gallery</strong>, your styled images and prompts will appear here.
              </p>
              <button
                type="button"
                className="result-action-btn"
                style={{ padding: '0 20px', marginTop: 6 }}
                onClick={() => {
                  setActiveTab('create');
                  setActiveNav('create');
                }}
              >
                <Sparkles size={14} />
                <span>Create New Look</span>
              </button>
            </div>
          ) : (
            <div className="gallery-grid" id="gallery-items-grid">
              {galleryItems.map((item) => {
                const imgSrc = item.dataUrl || item.imageUrl;
                return (
                  <div
                    key={item.id}
                    className="gallery-card"
                    onClick={() => setSelectedLook(item)}
                  >
                    <div className="gallery-card-img-wrap">
                      <img
                        src={imgSrc}
                        alt={item.prompt || 'Saved look'}
                        className="gallery-card-img"
                        loading="lazy"
                      />
                      <div className="gallery-card-actions">
                        <button
                          type="button"
                          className="gallery-icon-btn"
                          title="Download"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadImage(imgSrc, `look-${item.id}.png`);
                          }}
                        >
                          <Download size={13} />
                        </button>
                        <button
                          type="button"
                          className="gallery-icon-btn delete-btn"
                          title="Delete"
                          onClick={(e) => handleDeleteLook(item.id, e)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div className="gallery-card-info">
                      <span className="gallery-card-prompt">
                        {item.prompt && item.prompt.trim() ? item.prompt : 'Untitled style'}
                      </span>
                      <span className="gallery-card-date">
                        {formatLookDate(item.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Bottom Floating Navigation Bar */}
      <nav className="bottom-nav-bar" id="main-bottom-navigation">
        <button
          type="button"
          id="nav-create"
          className={`nav-item ${activeNav === 'create' && activeTab === 'create' ? 'active' : ''}`}
          onClick={() => {
            setActiveNav('create');
            setActiveTab('create');
          }}
        >
          <Sparkles size={20} />
          <span className="nav-label">Create</span>
        </button>

        <button
          type="button"
          id="nav-identity"
          className={`nav-item ${activeNav === 'identity' && activeTab === 'identity' ? 'active' : ''}`}
          onClick={() => {
            setActiveNav('identity');
            setActiveTab('identity');
          }}
        >
          <UserCheck size={20} />
          <span className="nav-label">Identity</span>
        </button>

        <button
          type="button"
          id="nav-looks"
          className={`nav-item ${activeNav === 'looks' || activeTab === 'gallery' ? 'active' : ''}`}
          onClick={() => {
            setActiveNav('looks');
            setActiveTab('gallery');
          }}
        >
          <Sparkle size={20} />
          <span className="nav-label">Looks</span>
        </button>

        <button
          type="button"
          id="nav-outfits"
          className={`nav-item ${activeNav === 'outfits' ? 'active' : ''}`}
          onClick={() => {
            setActiveNav('outfits');
            outfitInputRef.current?.click();
          }}
        >
          <Shirt size={20} />
          <span className="nav-label">Outfits</span>
        </button>

        <button
          type="button"
          id="nav-profile"
          className={`nav-item ${activeNav === 'profile' ? 'active' : ''}`}
          onClick={() => setShowMenuModal(true)}
        >
          <User size={20} />
          <span className="nav-label">Profile</span>
        </button>
      </nav>

      {/* Lightbox / Detail Modal */}
      {selectedLook && (
        <div className="modal-overlay" onClick={() => setSelectedLook(null)}>
          <div className="lightbox-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-sheet-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={16} style={{ color: 'var(--accent-pink)' }} />
                <h4 className="modal-sheet-title" style={{ fontSize: 16 }}>Look Details</h4>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSelectedLook(null)}
                aria-label="Close details"
              >
                <X size={18} />
              </button>
            </div>

            {/* Large Image Preview */}
            <div className="lightbox-image-wrap">
              <img
                src={selectedLook.dataUrl || selectedLook.imageUrl}
                alt={selectedLook.prompt || 'Styled look'}
                className="lightbox-image"
              />
            </div>

            {/* Metadata (Prompt & Date) */}
            <div className="lightbox-meta-block">
              <div className="lightbox-prompt-label">Styling Prompt</div>
              <div className="lightbox-prompt-text">
                {selectedLook.prompt && selectedLook.prompt.trim()
                  ? selectedLook.prompt
                  : 'Default virtual dressing room style instruction.'}
              </div>
              <div className="lightbox-date-text" style={{ marginTop: 4 }}>
                Created: {formatLookDate(selectedLook.createdAt)}
              </div>
            </div>

            {/* Action buttons */}
            <div className="lightbox-actions-row">
              <button
                type="button"
                className="result-action-btn"
                onClick={() =>
                  handleDownloadImage(
                    selectedLook.dataUrl || selectedLook.imageUrl,
                    `dressing-room-look-${selectedLook.id || Date.now()}.png`
                  )
                }
              >
                <Download size={14} />
                <span>Download</span>
              </button>
              <button
                type="button"
                className="result-action-btn"
                style={{ color: '#E6346A', borderColor: '#F8B4C4' }}
                onClick={(e) => handleDeleteLook(selectedLook.id, e)}
              >
                <Trash2 size={14} />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Gemini Assistant Floating Button */}
      <button
        type="button"
        id="btn-gemini-assistant"
        className="gemini-persistent-pill"
        onClick={() => setIsAssistantOpen(true)}
        aria-label="Open Gemini Assistant"
      >
        <span className="gemini-pill-sparkle">✦</span>
        <span className="gemini-pill-text">Gemini</span>
      </button>

      {/* Persistent Gemini Assistant Panel / Sheet */}
      <GeminiAssistantSheet
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
        workspaceContext={workspaceContext}
        onExecuteTool={handleExecuteTool}
        onApplyPromptSuggestion={(newPrompt) => {
          setPrompt(newPrompt);
        }}
      />

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
              Studio mode ready. Your looks are securely saved with Cloudflare R2 object storage and D1 metadata database.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

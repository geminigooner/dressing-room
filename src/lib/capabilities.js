/**
 * Capability / Tool Registry for Dressing Room
 * 
 * Dynamic registry of available app capabilities that can be exposed to Gemini.
 * Represents what actions are implemented and operational right now.
 */

export const CAPABILITY_REGISTRY = [
  {
    id: 'generate_image_edit',
    name: 'Generate Image Edit',
    description: 'Runs the AI virtual dressing room styling model to edit or transfer clothing on the base photo according to prompt and optional outfit reference. Can accept refined retry instructions that enforce strict face, body, or background preservation.',
    status: 'available',
    parameters: {
      prompt: {
        type: 'string',
        required: false,
        description: 'Styling prompt or refined retry instruction with targeted preservation clauses (e.g. face, body, background, or outfit reference fidelity constraints).',
      },
    },
    preconditions: ['hasBasePhoto'],
  },
  {
    id: 'save_current_result',
    name: 'Save Current Result',
    description: 'Saves the currently generated styled look into the Gallery (R2 image storage and D1 metadata).',
    status: 'available',
    parameters: {},
    preconditions: ['hasResultImage'],
  },
  {
    id: 'download_current_result',
    name: 'Download Current Result',
    description: 'Downloads the active generated image or styling instructions to the user device.',
    status: 'available',
    parameters: {},
    preconditions: ['hasResult'],
  },
  {
    id: 'open_gallery',
    name: 'Open Gallery',
    description: 'Switches view to the Saved Looks Gallery showing all stored outfit generations.',
    status: 'available',
    parameters: {},
  },
  {
    id: 'open_selected_look',
    name: 'Open Selected Look in Lightbox',
    description: 'Opens a specific look in the high-res Lightbox modal with details and actions.',
    status: 'available',
    parameters: {
      lookId: {
        type: 'string',
        required: true,
        description: 'The unique ID or index of the saved look in the gallery.',
      },
    },
  },
  {
    id: 'delete_gallery_item',
    name: 'Delete Gallery Item',
    description: 'Removes a saved look permanently from Cloudflare R2 and D1 database.',
    status: 'available',
    parameters: {
      lookId: {
        type: 'string',
        required: true,
        description: 'The unique ID of the saved look to delete.',
      },
    },
  },
  {
    id: 'update_styling_prompt',
    name: 'Update Styling Prompt',
    description: 'Sets or refines the text description in the look styling input box without immediately generating.',
    status: 'available',
    parameters: {
      text: {
        type: 'string',
        required: true,
        description: 'The exact new prompt text to insert into the input box.',
      },
    },
  },
  {
    id: 'open_identity_bank',
    name: 'Open Identity Reference Bank',
    description: 'Switches view to the Identity Reference Bank where user identity photos, tags, and identity fidelity contract are managed.',
    status: 'available',
    parameters: {},
  },
];

/**
 * Returns the dynamic active capability list
 */
export function getAvailableCapabilities() {
  return CAPABILITY_REGISTRY.filter((cap) => cap.status === 'available');
}

/**
 * Validates an incoming tool execution request against the registry and current workspace state.
 * @param {string} toolName - Tool identifier requested by Gemini
 * @param {object} params - Parameters provided with the request
 * @param {object} workspaceContext - Live workspace state snapshot
 * @returns {{ isValid: boolean, error?: string, sanitizedParams?: object }}
 */
export function validateToolRequest(toolName, params = {}, workspaceContext = {}) {
  const tool = CAPABILITY_REGISTRY.find((c) => c.id === toolName && c.status === 'available');

  if (!tool) {
    return {
      isValid: false,
      error: `Unknown or unsupported tool "${toolName}". Only existing registered capabilities can be executed.`,
    };
  }

  const sanitizedParams = { ...params };

  // Validate tool-specific preconditions against live workspace state
  if (tool.id === 'generate_image_edit') {
    if (!workspaceContext.hasBasePhoto) {
      return {
        isValid: false,
        error: 'Cannot generate image edit: No base photo has been uploaded yet. Please upload a photo first.',
      };
    }
    if (sanitizedParams.prompt && typeof sanitizedParams.prompt !== 'string') {
      sanitizedParams.prompt = String(sanitizedParams.prompt);
    }
  }

  if (tool.id === 'save_current_result') {
    if (!workspaceContext.hasResultImage) {
      return {
        isValid: false,
        error: 'Cannot save to gallery: There is no generated look currently on the canvas to save.',
      };
    }
  }

  if (tool.id === 'download_current_result') {
    if (!workspaceContext.hasResultImage && !workspaceContext.hasResultText) {
      return {
        isValid: false,
        error: 'Cannot download: No generated look image or style advice exists to export.',
      };
    }
  }

  if (tool.id === 'open_selected_look') {
    if (!sanitizedParams.lookId) {
      // If there's only one look or a selected look, fallback, otherwise error
      if (workspaceContext.selectedLook?.id) {
        sanitizedParams.lookId = workspaceContext.selectedLook.id;
      } else if (workspaceContext.galleryItems && workspaceContext.galleryItems.length > 0) {
        sanitizedParams.lookId = workspaceContext.galleryItems[0].id;
      } else {
        return {
          isValid: false,
          error: 'Cannot open look: No lookId was specified and the gallery is empty.',
        };
      }
    }
  }

  if (tool.id === 'delete_gallery_item') {
    if (!sanitizedParams.lookId) {
      if (workspaceContext.selectedLook?.id) {
        sanitizedParams.lookId = workspaceContext.selectedLook.id;
      } else {
        return {
          isValid: false,
          error: 'Cannot delete look: No specific look ID was identified. Please specify which look to delete.',
        };
      }
    }
  }

  if (tool.id === 'update_styling_prompt') {
    if (!sanitizedParams.text || typeof sanitizedParams.text !== 'string') {
      return {
        isValid: false,
        error: 'Cannot update prompt: Missing required "text" string parameter.',
      };
    }
    sanitizedParams.text = sanitizedParams.text.trim();
  }

  return {
    isValid: true,
    tool,
    sanitizedParams,
  };
}


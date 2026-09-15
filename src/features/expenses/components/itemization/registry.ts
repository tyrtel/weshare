import type { ComponentType } from 'react';
import { ClassicItemizedSplitEditor } from './ClassicItemizedSplitEditor';
import type { ItemizedSplitEditorProps } from './types';

export type ItemizedSplitEditorKey = 'classic';

// Add a new key + component here to offer another itemized-split editor —
// nothing outside this module needs to know it exists.
export const ITEMIZED_SPLIT_EDITORS: Record<ItemizedSplitEditorKey, ComponentType<ItemizedSplitEditorProps>> = {
  classic: ClassicItemizedSplitEditor,
};

export const DEFAULT_ITEMIZED_SPLIT_EDITOR: ItemizedSplitEditorKey = 'classic';

// Shared types for click-to-edit WYSIWYG on the real-preview canvas
// (RealPreview.tsx + blocks.tsx). No JSX here on purpose — this file is
// imported by both the client-component block renderers and by
// VisualBuilder.tsx, which builds the concrete EditBag per block.
export type Path = (string | number)[];

export type EditBag = {
  index: number;
  active: boolean;
  onSelect: () => void;
  onFieldChange: (path: Path, value: any) => void;
  onImagePick: (path: Path, file: File) => void;
  onArrayAdd: (path: Path, item: any) => void;
  onArrayRemove: (path: Path, i: number) => void;
  /** True for a block just applied from a WebX Agent proposal (Phase 8) —
   * read by cls()/editRoot() in blocks.tsx to add .pvb-agent-draft to every
   * block's root element without touching each block component. */
  agentDraft?: boolean;
};

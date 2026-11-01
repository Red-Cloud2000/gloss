/// <reference types="vite/client" />

interface GlossDesktop {
  isDesktop: boolean;
  pickDataRoot: () => Promise<string>;
  openLogin: (platform: string) => Promise<{ ok: boolean }>;
  openExternal: (url: string) => Promise<void>;
}

interface Window {
  glossDesktop?: GlossDesktop;
}

interface CSS {
  highlights?: {
    set: (name: string, highlight: Highlight) => void;
    delete: (name: string) => void;
  };
}

interface HighlightConstructor {
  new (...ranges: Range[]): Highlight;
}

declare class Highlight {
  constructor(...ranges: Range[]);
}

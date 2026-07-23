"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const CompositionEditorCanvas = dynamic(() => import("@/components/composition-editor-canvas"), {
  ssr: false,
  loading: () => (
    <div className="composition-editor-loading">
      <Loader2 className="spin" size={24} />
      <span>Preparing the design editor…</span>
    </div>
  ),
});

export default function CompositionEditor(props) {
  return <CompositionEditorCanvas {...props} />;
}

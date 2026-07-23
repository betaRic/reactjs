"use client";

import { useState } from "react";
import CompositionEditor from "@/components/composition-editor";

export default function EditorPreviewPage() {
  const [title, setTitle] = useState("Regional Local Governance Summit");
  const [eventFields, setEventFields] = useState({ date: "2026-07-23", venue: "General Santos City", subtitle: "Working together for stronger communities" });
  const [layers, setLayers] = useState([]);
  const [edit, setEdit] = useState({ zoom: 1, positionX: 50, positionY: 50, rotation: 0 });
  const [duotone, setDuotone] = useState("auto");
  return (
    <CompositionEditor
      media={{ id: "preview-cover", name: "Preview cover", src: "/demo/sample-landscape.jpg", edit }}
      template={null}
      layers={layers}
      campaignTitle={title}
      eventFields={eventFields}
      target="cover"
      duotone={duotone}
      onCampaignTitleChange={setTitle}
      onEventFieldsChange={setEventFields}
      onDuotoneChange={setDuotone}
      onMediaEdit={setEdit}
      onLayersChange={setLayers}
      onClose={() => {}}
    />
  );
}
